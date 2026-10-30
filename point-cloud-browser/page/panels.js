const obstacles = panel => [...document.querySelectorAll(".panel, #tools")].filter(other => other !== panel && !other.hidden);

function overlaps(panel, left, top) {
  return obstacles(panel).some(other =>
    left < other.offsetLeft + other.offsetWidth && left + panel.offsetWidth > other.offsetLeft &&
    top < other.offsetTop + other.offsetHeight && top + panel.offsetHeight > other.offsetTop);
}

function move(panel, left, top) {
  const area = panel.parentElement;
  left = Math.max(0, Math.min(left, area.clientWidth - panel.offsetWidth));
  top = Math.max(0, Math.min(top, area.clientHeight - panel.offsetHeight));
  if (!overlaps(panel, left, panel.offsetTop)) panel.style.left = `${left}px`;
  if (!overlaps(panel, panel.offsetLeft, top)) panel.style.top = `${top}px`;
}

function home(panel) {
  const area = panel.parentElement;
  const tools = document.getElementById("tools");
  const left = panel.dataset.side === "right" ? area.clientWidth - panel.offsetWidth - 12 : 12;
  const top = panel.dataset.side === "right" ? tools.offsetTop + tools.offsetHeight + 8 : 12;
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function show(panel, visible) {
  panel.hidden = !visible;
  document.querySelector(`#tools [data-panel="${panel.id}"]`).classList.toggle("active", visible);
  if (visible && overlaps(panel, panel.offsetLeft, panel.offsetTop)) home(panel);
}

for (const panel of document.querySelectorAll(".panel")) {
  const header = panel.querySelector("header");
  let start = null;
  header.addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    start = { x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener("pointermove", event => {
    if (start) move(panel, start.left + event.clientX - start.x, start.top + event.clientY - start.y);
  });
  header.addEventListener("lostpointercapture", () => start = null);
  header.querySelector("button").addEventListener("click", () => show(panel, false));
  document.querySelector(`#tools [data-panel="${panel.id}"]`).addEventListener("click", () => show(panel, panel.hidden));
  home(panel);
  show(panel, true);
}

function settle(panel) {
  if (panel.hidden) return;
  move(panel, panel.offsetLeft, panel.offsetTop);
  if (overlaps(panel, panel.offsetLeft, panel.offsetTop)) home(panel);
}

const watcher = new ResizeObserver(() => document.querySelectorAll(".panel").forEach(settle));
watcher.observe(document.querySelector("main"));
document.querySelectorAll(".panel").forEach(panel => watcher.observe(panel));
