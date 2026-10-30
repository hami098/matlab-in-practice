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

async function fetchBytes(url, size, signal, onProgress) {
  const reader = (await fetch(url, { signal })).body.getReader();
  const bytes = new Uint8Array(size);
  let received = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    if (received + part.value.length > size) throw new Error("The file is larger than announced.");
    bytes.set(part.value, received);
    received += part.value.length;
    onProgress(received);
  }
  return bytes.buffer;
}

async function show(name, xyz, prepared, transferred) {
  status.textContent = `${name}: drawing`;
  const started = performance.now();
  const view = await viewer;
  const { low, high, frame: first } = await view.show(xyz);
  const drawn = (performance.now() - started) / 1000;
  const count = xyz.length / 3;
  const megabytes = xyz.byteLength / 1e6;
  describe([
    ["Name", name],
    ["Points", count.toLocaleString("en")],
    ["Data", `${megabytes.toFixed(1)} MB`],
    ["Extent", high.map((v, i) => (v - low[i]).toPrecision(3)).join(" x ")],
    ["Prepared", `${prepared.toFixed(2)} s`],
    ["Transferred", transferred > 0 ? `${transferred.toFixed(2)} s, ${(megabytes / transferred).toFixed(0)} MB/s` : "none"],
    ["First frame", `${drawn.toFixed(2)} s`],
    ["Frame", `${first.toFixed(1)} ms`],
    ["GPU", view.gpu]
  ]);
  done(hint);
  host?.sendEventToMATLAB("shown", `${name}: ${count.toLocaleString("en")} points, prepared in ${prepared.toFixed(2)} s, transferred in ${transferred.toFixed(2)} s, drawn in ${drawn.toFixed(2)} s`);
}

async function showPoints(info) {
  download?.abort();
  download = new AbortController();
  const size = info.count * 12;
  const total = (size / 1e6).toFixed(1);
  const started = performance.now();
  try {
    const buffer = await fetchBytes(info.url, size, download.signal, received =>
      fill(received / size, `${info.name}: transferring ${(received / 1e6).toFixed(1)} of ${total} MB`));
    await show(info.name, new Float32Array(buffer), info.seconds, (performance.now() - started) / 1000);
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

document.body.addEventListener("dragover", event => event.preventDefault());
document.body.addEventListener("drop", async event => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  busy(`${file.name}: reading`);
  const started = performance.now();
  try {
    const xyz = parsePly(await file.arrayBuffer());
    await show(file.name, xyz, (performance.now() - started) / 1000, 0);
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
