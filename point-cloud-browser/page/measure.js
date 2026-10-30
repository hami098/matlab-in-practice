function decimals(value) {
  return Math.min(6, Math.max(0, 1 - Math.floor(Math.log10(value))));
}

function margin(a, b, cloud) {
  const difference = b.map((v, k) => v - a[k]);
  const length = Math.hypot(...difference);
  const direction = difference.map(v => Math.abs(v) / (length || 1));
  const along = sizes => direction.reduce((sum, v, k) => sum + v * sizes[k], 0);
  return {
    length,
    voxel: cloud.voxel ? along(cloud.voxel) : 0,
    storage: along(cloud.high.map((v, k) => (v - cloud.low[k]) / 65535))
  };
}

function createRuler(viewer, canvas, panel, overlay, list) {
  const [line, first, second, label] = overlay.children;
  let cloud = { low: [0, 0, 0], high: [1, 1, 1], voxel: null, unit: "" };
  let ends = [];
  let down = null;

  function write(entries) {
    list.replaceChildren(...entries.flatMap(([term, value]) => {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value;
      return [dt, dd];
    }));
  }

  function describe() {
    if (ends.length < 2) {
      write([["Length", ends.length === 0 ? "click a point" : "click a second point"]]);
      return "";
    }
    const { length, voxel, storage } = margin(ends[0], ends[1], cloud);
    const total = voxel + storage;
    const n = decimals(total);
    const unit = cloud.unit ? ` ${cloud.unit}` : "";
    write([
      ["Length", `${length.toFixed(n)} ± ${total.toFixed(n)}${unit}`],
      ["Sampling", cloud.voxel ? `± ${voxel.toFixed(n)}` : "not in the file"],
      ["16 bits", `± ${storage.toFixed(decimals(storage))}`]
    ]);
    return `${length.toFixed(n)} ± ${total.toFixed(n)}${unit}`;
  }

  function place(view) {
    const spots = ends.map(end => view.project(end));
    const hidden = panel.hidden || ends.length === 0 || spots.some(spot => !spot);
    overlay.style.display = hidden ? "none" : "";
    if (hidden) return;
    const [a, b = a] = spots;
    first.setAttribute("cx", a[0]);
    first.setAttribute("cy", a[1]);
    second.setAttribute("cx", b[0]);
    second.setAttribute("cy", b[1]);
    line.setAttribute("x1", a[0]);
    line.setAttribute("y1", a[1]);
    line.setAttribute("x2", b[0]);
    line.setAttribute("y2", b[1]);
    label.setAttribute("x", (a[0] + b[0]) / 2 + 8);
    label.setAttribute("y", (a[1] + b[1]) / 2 - 8);
  }

  function update() {
    label.textContent = describe();
    second.style.display = ends.length === 2 ? "" : "none";
    viewer.then(place);
  }

  canvas.addEventListener("pointerdown", event => down = [event.offsetX, event.offsetY]);
  canvas.addEventListener("pointerup", async event => {
    if (panel.hidden || !down || Math.hypot(event.offsetX - down[0], event.offsetY - down[1]) > 3) return;
    const view = await viewer;
    const point = await view.pick(event.offsetX * devicePixelRatio, event.offsetY * devicePixelRatio);
    if (!point) return;
    ends = ends.length === 1 ? [ends[0], point] : [point];
    update();
  });
  new MutationObserver(() => {
    canvas.style.cursor = panel.hidden ? "" : "crosshair";
    ends = [];
    update();
  }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  viewer.then(view => view.watch(() => place(view)));

  function reset(next) {
    cloud = { voxel: null, unit: "", ...next };
    ends = [];
    update();
  }

  update();
  return { reset };
}
