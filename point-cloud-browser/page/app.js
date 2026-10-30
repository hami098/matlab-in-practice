const rows = document.querySelector("tbody");
const status = document.getElementById("status");
const bar = document.getElementById("progress");
const details = document.getElementById("details");
const hint = "Drag to rotate, scroll to zoom, double-click to reset.";
let frame = null;
const viewer = createViewer(document.querySelector("canvas"), document.getElementById("axes"), milliseconds => {
  if (frame) frame.textContent = `${milliseconds.toFixed(1)} ms`;
});
viewer.catch(error => status.textContent = error.message);
let host = null;
let download = null;

const since = start => (performance.now() - start) / 1000;

function busy(text) {
  status.textContent = text;
  bar.hidden = false;
  bar.classList.add("busy");
}

function fill(fraction, text) {
  status.textContent = text;
  bar.classList.remove("busy");
  bar.firstElementChild.style.width = `${fraction * 100}%`;
}

function done(text) {
  status.textContent = text;
  bar.hidden = true;
  bar.classList.remove("busy");
  bar.firstElementChild.style.width = "0";
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function describe(entries) {
  details.replaceChildren(...entries.flatMap(([term, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    if (term === "Frame") frame = dd;
    return [dt, dd];
  }));
}

function report(name, count, low, high, times) {
  const megabytes = count * 6 / 1e6;
  const extent = high.map((v, i) => v - low[i]);
  describe([
    ["Name", name],
    ["Points", count.toLocaleString("en")],
    ["Data", `${megabytes.toFixed(1)} MB`],
    ["Extent", extent.map(v => v.toPrecision(3)).join(" x ")],
    ["Precision", (Math.max(...extent) / 65535).toPrecision(2)],
    ["Prepared", `${times.prepared.toFixed(2)} s`],
    ["First picture", `${times.first.toFixed(2)} s`],
    ["Transferred", times.transferred > 0 ? `${times.transferred.toFixed(2)} s, ${(megabytes / times.transferred).toFixed(0)} MB/s` : "none"],
    ["Complete", `${times.complete.toFixed(2)} s`],
    ["Frame", `${times.frame.toFixed(1)} ms`],
    ["GPU", times.gpu]
  ]);
  done(hint);
  host?.sendEventToMATLAB("shown", `${name}: ${count.toLocaleString("en")} points, prepared ${times.prepared.toFixed(2)} s, first picture ${times.first.toFixed(2)} s, transferred ${times.transferred.toFixed(2)} s, complete ${times.complete.toFixed(2)} s`);
}

function showSamples(samples) {
  rows.replaceChildren(...samples.map(sample => {
    const row = document.createElement("tr");
    row.append(cell(sample.name), cell(sample.kind), cell(sample.source), cell(sample.megabytes.toFixed(1)));
    row.addEventListener("click", () => select(sample, row));
    return row;
  }));
}

function select(sample, row) {
  download?.abort();
  rows.querySelector(".selected")?.classList.remove("selected");
  row.classList.add("selected");
  busy(`${sample.name}: preparing in MATLAB`);
  host.sendEventToMATLAB("select", sample.id);
}

async function stream(url, size, signal, onBytes) {
  const reader = (await fetch(url, { signal })).body.getReader();
  let offset = 0;
  let carry = new Uint8Array(0);
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    signal.throwIfAborted();
    let bytes = part.value;
    if (carry.length > 0) {
      bytes = new Uint8Array(carry.length + part.value.length);
      bytes.set(carry);
      bytes.set(part.value, carry.length);
    }
    const usable = bytes.length - bytes.length % 4;
    if (offset + usable > size) throw new Error("The file is larger than announced.");
    onBytes(bytes.subarray(0, usable), offset);
    offset += usable;
    carry = bytes.slice(usable);
  }
  if (carry.length > 0) {
    const padded = new Uint8Array(4);
    padded.set(carry);
    onBytes(padded, offset);
    offset += carry.length;
  }
  if (offset !== size) throw new Error("The file is shorter than announced.");
}

async function showPoints(info) {
  download?.abort();
  download = new AbortController();
  const view = await viewer;
  const counts = [].concat(info.counts);
  const size = info.count * 6;
  const total = (size / 1e6).toFixed(1);
  const started = performance.now();
  let received = 0;
  let first = null;
  try {
    view.begin(counts, info.low, info.high);
    await Promise.all([].concat(info.urls).map((url, part) => stream(url, counts[part] * 6, download.signal, (bytes, offset) => {
      const drawn = view.append(part, bytes, offset);
      first ??= drawn.then(() => since(started));
      received = Math.min(received + bytes.length, size);
      fill(received / size, `${info.name}: ${(received / 1e6).toFixed(1)} of ${total} MB`);
    })));
    const transferred = since(started);
    const milliseconds = await view.finish();
    report(info.name, info.count, info.low, info.high, {
      prepared: info.seconds,
      first: info.seconds + await first,
      transferred,
      complete: info.seconds + since(started),
      frame: milliseconds,
      gpu: view.gpu
    });
  } catch (error) {
    if (error.name !== "AbortError") done(`${info.name}: ${error.message}`);
  }
}

function parsePly(buffer) {
  const text = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4096)));
  const end = text.indexOf("end_header\n");
  const lines = text.slice(0, end).split("\n").map(line => line.trim().split(/\s+/));
  if (!lines.some(words => words[0] === "format" && words[1] === "binary_little_endian")) throw new Error("Only binary little endian PLY is read.");
  const first = lines.findIndex(words => words[0] === "element");
  if (lines[first][1] !== "vertex") throw new Error("The vertex element must come first.");
  const sizes = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  const offsets = {};
  let stride = 0;
  for (const words of lines.slice(first + 1)) {
    if (words[0] !== "property") break;
    offsets[words[2]] = stride;
    stride += sizes[words[1]];
  }
  const count = Number(lines[first][2]);
  const data = new DataView(buffer, end + "end_header\n".length);
  if (count * stride > data.byteLength) throw new Error("The header declares more vertices than the file holds.");
  const xyz = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    xyz[i * 3] = data.getFloat32(i * stride + offsets.x, true);
    xyz[i * 3 + 1] = data.getFloat32(i * stride + offsets.y, true);
    xyz[i * 3 + 2] = data.getFloat32(i * stride + offsets.z, true);
  }
  return xyz;
}

function quantize(xyz, low, high) {
  const scale = high.map((v, i) => 65535 / Math.max(v - low[i], 1e-30));
  const out = new Uint16Array(xyz.length + xyz.length % 2);
  for (let i = 0; i < xyz.length; i++) out[i] = Math.round((xyz[i] - low[i % 3]) * scale[i % 3]);
  return out;
}

document.body.addEventListener("dragover", event => event.preventDefault());
document.body.addEventListener("drop", async event => {
  event.preventDefault();
  download?.abort();
  const file = event.dataTransfer.files[0];
  busy(`${file.name}: reading`);
  const started = performance.now();
  try {
    const view = await viewer;
    const xyz = parsePly(await file.arrayBuffer());
    const { low, high } = bounds(xyz);
    const prepared = since(started);
    view.begin([xyz.length / 3], low, high);
    view.append(0, new Uint8Array(quantize(xyz, low, high).buffer), 0);
    const milliseconds = await view.finish();
    const complete = since(started);
    report(file.name, xyz.length / 3, low, high, { prepared, first: complete, transferred: 0, complete, frame: milliseconds, gpu: view.gpu });
  } catch (error) {
    done(error.message);
  }
});

function setup(htmlComponent) {
  host = htmlComponent;
  host.addEventListener("samples", event => showSamples([].concat(event.Data)));
  host.addEventListener("points", event => showPoints(event.Data));
  host.addEventListener("failed", event => done(event.Data));
  host.sendEventToMATLAB("ready");
}
