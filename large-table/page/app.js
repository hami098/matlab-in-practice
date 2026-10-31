const arrays = { uint32: Uint32Array, int32: Int32Array, single: Float32Array, uint16: Uint16Array, uint8: Uint8Array };
const epoch = Date.UTC(2025, 0, 1);
const status = document.getElementById("status");
const bar = document.getElementById("progress");
const sizes = document.getElementById("size");
const liveButton = document.getElementById("live");
const news = document.getElementById("news");
const filterRow = document.querySelector("#grid .filters");
const two = value => String(value).padStart(2, "0");
const time = minutes => {
  const d = new Date(epoch + minutes * 60000);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};
const named = key => (data, i) => table.categories[key][data[key][i] - 1];
const columns = [
  { title: "Row" },
  { title: "Patient", key: "patient", filter: "patient", text: (data, i) => `P${String(data.patient[i]).padStart(7, "0")}` },
  { title: "Age", key: "age", filter: "number", text: (data, i) => String(data.age[i]) },
  { title: "Sex", key: "sex", filter: "codes", text: named("sex") },
  { title: "Department", key: "department", filter: "codes", text: named("department") },
  { title: "Priority", key: "priority", filter: "codes", text: named("priority") },
  { title: "Collected", key: "collected", filter: "time", text: (data, i) => time(data.collected[i]) },
  { title: "TAT min", key: "turnaround", filter: "number", text: (data, i) => String(data.turnaround[i]) },
  { title: "Test", key: "test", filter: "codes", text: named("test") },
  { title: "Specimen", key: "specimen", filter: "codes", text: named("specimen") },
  { title: "Value", key: "value", filter: "number", text: (data, i) => {
    const test = table.tests[data.test[i] - 1];
    return `${data.value[i].toFixed(test.decimals)} ${test.unit}`;
  } },
  { title: "Range", text: (data, i) => {
    const test = table.tests[data.test[i] - 1];
    return `${test.low} to ${test.high}`;
  } },
  { title: "Flag", key: "flag", filter: "codes", mark: true, text: (data, i) => ["", "L", "H"][data.flag[i] - 1] },
  { title: "Status", key: "status", filter: "codes", text: named("status") },
  { title: "Analyzer", key: "analyzer", filter: "codes", text: named("analyzer") }
];
const hints = { patient: "P01", number: "> 5", time: "2026-10", codes: "" };
const request = { rows: Number(sizes.value), filters: [], sort: "", direction: "descend" };
let host = null;
let table = null;
let cache = new Map();
let loading = new Map();
let appending = Promise.resolve();
let chunks = [];
let ends = [];
let fresh = 0;
let unseen = 0;
let asked = 0;
let arrived = 0;
let reported = false;
let live = true;
let pending = 0;

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
  const control = new AbortController();
  loading.set(block, control);
  const response = await fetch(`${prefix}-${block}.bin`, { signal: control.signal }).catch(() => null);
  if (prefix !== table.prefix || control.signal.aborted) return;
  if (!response?.ok) {
    if (!table.complete) setTimeout(() => retry(prefix, block), 100);
    return;
  }
  const buffer = await response.arrayBuffer();
  if (prefix !== table.prefix) return;
  cache.set(block, views(buffer, Math.min(table.blockRows, table.rows - block * table.blockRows)));
  while (cache.size > 64) cache.delete(cache.keys().next().value);
  loading.delete(block);
  grid.refresh();
}

function retry(prefix, block) {
  if (prefix !== table.prefix) return;
  loading.delete(block);
  grid.refresh();
}

function locate(index) {
  if (index < fresh) {
    const position = fresh - 1 - index;
    let low = 0;
    let high = ends.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (ends[middle] > position) high = middle;
      else low = middle + 1;
    }
    const chunk = chunks[low];
    return [chunk.data, chunk.count - 1 - (position - (low ? ends[low - 1] : 0))];
  }
  const row = index - fresh;
  const block = Math.floor(row / table.blockRows);
  const data = cache.get(block);
  if (!data) {
    load(block);
    return null;
  }
  return [data, row - block * table.blockRows];
}

function text(index) {
  const found = locate(index);
  if (!found) return null;
  const [data, i] = found;
  return columns.map(column => column.text ? column.text(data, i) : (index + 1).toLocaleString("en"));
}

function range(first, last) {
  if (!table) return;
  if (first === 0 && unseen) {
    unseen = 0;
    news.hidden = true;
  }
  if (table.rows > 0) {
    const margin = table.blockRows / 4;
    const from = Math.floor(Math.max(0, first - fresh - margin) / table.blockRows);
    const to = Math.floor(Math.min(table.rows - 1, last - fresh + margin) / table.blockRows);
    for (const [block, control] of loading) {
      if (block < from || block > to) {
        control.abort();
        loading.delete(block);
      }
    }
    for (let block = Math.max(0, from); block <= to; block++) load(block);
  }
  if (!reported && (table.rows === 0 || cache.has(0))) {
    reported = true;
    finish();
  }
}

function say(text) {
  status.textContent = text;
}

function finish() {
  const line = `${table.rows.toLocaleString("en")} of ${table.total.toLocaleString("en")} rows, first rows after ${since(host ? asked : arrived)} s`;
  say(table.complete ? `${line}.` : `${line}, writing the other blocks.`);
  bar.classList.remove("busy");
  host?.sendEventToMATLAB("shown", `${line}. Announced by MATLAB ${since(arrived)} s before.`);
}

function complete(manifest) {
  if (!table || manifest.prefix !== table.prefix) return;
  const s = manifest.seconds;
  table.complete = true;
  loading = new Map();
  grid.refresh();
  const line = `Read ${s.prepared.toFixed(2)} s, filter and sort ${s.selected.toFixed(2)} s, first block ${s.first.toFixed(2)} s, all ${table.blocks} blocks ${s.written.toFixed(2)} s`;
  if (reported) say(`${table.rows.toLocaleString("en")} of ${table.total.toLocaleString("en")} rows. ${line}.`);
  host?.sendEventToMATLAB("done", `${table.rows.toLocaleString("en")} rows: ${line}.`);
}

function show(manifest) {
  table = manifest;
  for (const key of ["tests", "columns"]) table[key] = [].concat(table[key]);
  for (const key of Object.keys(table.categories)) table.categories[key] = [].concat(table.categories[key]);
  cache = new Map();
  loading = new Map();
  chunks = [];
  ends = [];
  fresh = 0;
  unseen = 0;
  pending = 0;
  news.hidden = true;
  arrived = performance.now();
  reported = false;
  grid.mark(request.sort || "collected", request.direction);
  grid.show(table.rows);
}

function addChunk(file, count) {
  const prefix = table.prefix;
  const fetched = fetch(file).then(response => response.ok ? response.arrayBuffer() : null).catch(() => null);
  appending = appending.then(async () => {
    const buffer = await fetched;
    if (!buffer || prefix !== table.prefix) return;
    chunks.push({ count, data: views(buffer, count) });
    fresh += count;
    ends.push(fresh);
    table.total += count;
    if (!grid.grow(count)) {
      unseen += count;
      news.textContent = `${unseen.toLocaleString("en")} new rows`;
      news.hidden = false;
    }
  });
}

function wait(count) {
  pending = count;
  news.textContent = `${count.toLocaleString("en")} new rows, refresh`;
  news.hidden = false;
}

function ask() {
  if (!host) return;
  asked = performance.now();
  say("MATLAB is preparing the rows");
  bar.classList.add("busy");
  host.sendEventToMATLAB("query", request);
}

function sort(key) {
  request.direction = request.sort === key && request.direction === "ascend" ? "descend" : "ascend";
  request.sort = key;
  ask();
}

function parseNumber(text) {
  const span = text.match(/^(-?\d*\.?\d+)\s*\.\.\s*(-?\d*\.?\d+)$/);
  if (span) return { low: Number(span[1]), high: Number(span[2]) };
  const match = text.match(/^(<=|>=|<|>|=)?\s*(-?\d*\.?\d+)$/);
  if (!match) return null;
  const value = Number(match[2]);
  const step = 10 ** -((match[2].split(".")[1] || "").length) / 2;
  const tiny = 1e-9 * Math.max(1, Math.abs(value));
  return {
    "<": { low: -1e30, high: value - tiny },
    "<=": { low: -1e30, high: value },
    ">": { low: value + tiny, high: 1e30 },
    ">=": { low: value, high: 1e30 },
    "=": { low: value - step, high: value + step - tiny }
  }[match[1] || "="];
}

function parseTime(text) {
  const moment = part => {
    const m = part.trim().match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?)?)?)?$/);
    if (!m) return null;
    const fields = m.slice(1).map(v => v === undefined ? undefined : Number(v));
    const [year, month = 1, day = 1, hour = 0, minute = 0] = fields;
    const depth = fields.filter(v => v !== undefined).length;
    const start = new Date(year, month - 1, day, hour, minute).getTime();
    const next = [new Date(year + 1, 0), new Date(year, month), new Date(year, month - 1, day + 1), new Date(year, month - 1, day, hour + 1), new Date(start + 60000)][depth - 1].getTime();
    return [(start - epoch) / 60000, (next - epoch) / 60000 - 1];
  };
  const parts = text.split("..");
  if (parts.length > 2) return null;
  const first = moment(parts[0]);
  const last = moment(parts[parts.length - 1]);
  return first && last ? { low: first[0], high: last[1] } : null;
}

function parsePatient(text) {
  const match = text.match(/^p?(\d{1,7})$/i);
  if (!match) return null;
  const scale = 10 ** (7 - match[1].length);
  return { low: Number(match[1]) * scale, high: (Number(match[1]) + 1) * scale - 1 };
}

function filtersFromInputs() {
  const filters = [];
  for (const input of filterRow.querySelectorAll("input")) {
    const column = columns[Number(input.dataset.column)];
    const text = input.value.trim();
    input.classList.remove("invalid");
    if (!text) continue;
    if (column.filter === "codes") {
      const names = table.categories[column.key];
      const codes = names.map((name, k) => name.toLowerCase().includes(text.toLowerCase()) ? k + 1 : 0).filter(Boolean);
      filters.push({ column: column.key, kind: "codes", low: 0, high: 0, codes: codes.length ? codes : [0] });
      continue;
    }
    const bounds = { number: parseNumber, time: parseTime, patient: parsePatient }[column.filter](text);
    if (!bounds) {
      input.classList.add("invalid");
      continue;
    }
    filters.push({ column: column.key, kind: "range", low: bounds.low, high: bounds.high, codes: [0] });
  }
  return filters;
}

let typing = 0;
filterRow.append(...columns.map((column, k) => {
  if (!column.filter) return document.createElement("span");
  const input = document.createElement("input");
  input.dataset.column = k;
  input.placeholder = hints[column.filter];
  input.spellcheck = false;
  input.addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      request.filters = filtersFromInputs();
      ask();
    }, 250);
  });
  return input;
}));

const grid = createGrid(document.getElementById("grid"), columns, 24, { text, range, sort });

news.addEventListener("click", () => {
  if (pending) ask();
  else grid.home();
});
sizes.addEventListener("change", () => {
  request.rows = Number(sizes.value);
  ask();
});
liveButton.addEventListener("click", () => {
  live = !live;
  liveButton.classList.toggle("on", live);
  host?.sendEventToMATLAB("live", live);
});
document.getElementById("reset").addEventListener("click", () => {
  for (const input of filterRow.querySelectorAll("input")) {
    input.value = "";
    input.classList.remove("invalid");
  }
  Object.assign(request, { filters: [], sort: "", direction: "descend" });
  ask();
});

fetch("table.json").then(response => response.ok ? response.json() : null).then(manifest => manifest && !host && show(manifest), () => {});

function setup(htmlComponent) {
  host = htmlComponent;
  host.addEventListener("table", event => show(event.Data));
  host.addEventListener("complete", event => complete(event.Data));
  host.addEventListener("head", event => addChunk(event.Data.file, event.Data.count));
  host.addEventListener("waiting", event => wait(event.Data));
  host.addEventListener("failed", event => {
    say(event.Data);
    bar.classList.remove("busy");
  });
  ask();
}
