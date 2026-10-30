const rows = document.querySelector("tbody");
const status = document.getElementById("status");
const viewer = createViewer(document.querySelector("canvas"));
viewer.catch(error => status.textContent = error.message);
let host = null;
let current = null;

const seconds = (from, to) => ((to - from) / 1000).toFixed(2);

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
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
  rows.querySelector(".selected")?.classList.remove("selected");
  row.classList.add("selected");
  current = sample.name;
  status.textContent = `${current}: preparing`;
  host.sendEventToMATLAB("select", sample.id);
}

async function show(name, xyz, prepared, transferred) {
  const started = performance.now();
  await (await viewer).show(xyz);
  status.textContent = `${name}: ${(xyz.length / 3).toLocaleString("en")} points, prepared in ${prepared} s, transferred in ${transferred} s, drawn in ${seconds(started, performance.now())} s`;
  host?.sendEventToMATLAB("shown", status.textContent);
}

async function showPoints(info) {
  const started = performance.now();
  const bytes = await (await fetch(info.url)).arrayBuffer();
  await show(info.name, new Float32Array(bytes), info.seconds.toFixed(2), seconds(started, performance.now()));
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
  const started = performance.now();
  try {
    const xyz = parsePly(await file.arrayBuffer());
    await show(file.name, xyz, seconds(started, performance.now()), "0.00");
  } catch (error) {
    status.textContent = error.message;
  }
});

function setup(htmlComponent) {
  host = htmlComponent;
  host.addEventListener("samples", event => showSamples([].concat(event.Data)));
  host.addEventListener("points", event => showPoints(event.Data));
  host.addEventListener("failed", event => status.textContent = `${current}: ${event.Data}`);
  host.sendEventToMATLAB("ready");
}
