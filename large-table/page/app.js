const arrays = { uint32: Uint32Array, int32: Int32Array, single: Float32Array, uint8: Uint8Array };
const epoch = Date.UTC(2025, 0, 1);
const status = document.getElementById("status");
const bar = document.getElementById("progress");
const sizes = document.getElementById("size");
const tests = document.getElementById("test");
const flags = document.getElementById("flag");
const columns = [
  { title: "Row" },
  { title: "Patient", key: "patient" },
  { title: "Age", key: "age" },
  { title: "Sex", key: "sex" },
  { title: "Time", key: "time" },
  { title: "Test", key: "test" },
  { title: "Value", key: "value" },
  { title: "Unit" },
  { title: "Range" },
  { title: "Flag", key: "flag", mark: true }
];
const request = { rows: Number(sizes.value), test: 0, flag: "all", sort: "", direction: "ascend" };
let host = null;
let table = null;
let cache = new Map();
let loading = new Set();
let asked = 0;
let arrived = 0;
let reported = false;

const since = start => ((performance.now() - start) / 1000).toFixed(2);

function views(buffer, count) {
  const out = {};
  let offset = 0;
  for (const { name, type } of table.columns) {
    out[name] = new arrays[type](buffer, offset, count);
    offset += count * arrays[type].BYTES_PER_ELEMENT;
  }
  return out;
}

async function load(block) {
  const prefix = table.prefix;
  if (cache.has(block) || loading.has(block)) return;
  loading.add(block);
  try {
    const response = await fetch(`${prefix}-${block}.bin`);
    if (!response.ok || prefix !== table.prefix) return;
    const buffer = await response.arrayBuffer();
    if (prefix !== table.prefix) return;
    cache.set(block, views(buffer, Math.min(table.blockRows, table.rows - block * table.blockRows)));
    while (cache.size > 64) cache.delete(cache.keys().next().value);
    grid.refresh();
  } finally {
    if (prefix === table.prefix) loading.delete(block);
  }
}

function text(index) {
  const block = Math.floor(index / table.blockRows);
  const data = cache.get(block);
  if (!data) {
    load(block);
    return null;
  }
  const i = index - block * table.blockRows;
  const test = table.tests[data.test[i] - 1];
  return [
    (index + 1).toLocaleString("en"),
    `P${String(data.patient[i]).padStart(7, "0")}`,
    String(data.age[i]),
    data.sex[i] === 1 ? "F" : "M",
    new Date(epoch + data.time[i] * 60000).toISOString().slice(0, 16).replace("T", " "),
    test.name,
    data.value[i].toFixed(test.decimals),
    test.unit,
    `${test.low} to ${test.high}`,
    ["", "L", "H"][data.flag[i]]
  ];
}

function range(first, last) {
  if (!table || table.rows === 0) return;
  const margin = table.blockRows / 4;
  const from = Math.floor(Math.max(0, first - margin) / table.blockRows);
  const to = Math.floor(Math.min(table.rows - 1, last + margin) / table.blockRows);
  for (let block = from; block <= to; block++) load(block);
  if (!reported && cache.has(Math.floor(first / table.blockRows))) {
    reported = true;
    finish();
  }
}

function finish() {
  const s = table.seconds;
  const line = `${table.rows.toLocaleString("en")} of ${table.total.toLocaleString("en")} rows. ` +
    `Data ${s.prepared.toFixed(2)} s, filter and sort ${s.selected.toFixed(2)} s, write ${s.written.toFixed(2)} s, ` +
    `first rows ${since(arrived)} s later.`;
  status.textContent = line;
  bar.classList.remove("busy");
  host?.sendEventToMATLAB("shown", `${line} From the request: ${since(asked)} s.`);
}

function show(manifest) {
  table = manifest;
  table.tests = [].concat(table.tests);
  table.columns = [].concat(table.columns);
  cache = new Map();
  loading = new Set();
  arrived = performance.now();
  reported = false;
  if (tests.options.length === 1) tests.append(...table.tests.map((test, k) => new Option(test.name, k + 1)));
  grid.mark(request.sort, request.direction);
  grid.show(table.rows);
  if (table.rows === 0) {
    status.textContent = "No rows match.";
    bar.classList.remove("busy");
  }
}

function ask() {
  if (!host) return;
  asked = performance.now();
  status.textContent = "MATLAB is preparing the rows";
  bar.classList.add("busy");
  host.sendEventToMATLAB("query", request);
}

function sort(key) {
  request.direction = request.sort === key && request.direction === "ascend" ? "descend" : "ascend";
  request.sort = key;
  ask();
}

const grid = createGrid(document.getElementById("grid"), columns, 24, { text, range, sort });

sizes.addEventListener("change", () => {
  request.rows = Number(sizes.value);
  ask();
});
tests.addEventListener("change", () => {
  request.test = Number(tests.value);
  ask();
});
flags.addEventListener("change", () => {
  request.flag = flags.value;
  ask();
});

fetch("table.json").then(response => response.ok ? response.json() : null).then(manifest => manifest && !host && show(manifest), () => {});

function setup(htmlComponent) {
  host = htmlComponent;
  host.addEventListener("table", event => show(event.Data));
  host.addEventListener("failed", event => {
    status.textContent = event.Data;
    bar.classList.remove("busy");
  });
  ask();
}
