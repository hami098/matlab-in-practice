function createGrid(root, columns, rowHeight, hooks) {
  const head = root.querySelector(".head");
  const viewport = root.querySelector(".viewport");
  const body = root.querySelector(".body");
  const track = root.querySelector(".track");
  const thumb = root.querySelector(".thumb");
  const pool = [];
  let rows = 0;
  let top = 0;
  let pending = 0;
  let thumbTop = 0;

  head.append(...columns.map(column => {
    const cell = document.createElement("span");
    cell.textContent = column.title;
    if (column.key) {
      cell.dataset.key = column.key;
      cell.addEventListener("click", () => hooks.sort(column.key));
    }
    return cell;
  }));

  const visible = () => viewport.clientHeight / rowHeight;
  const limit = () => Math.max(0, rows - visible());

  function render() {
    pending = 0;
    while (pool.length < Math.ceil(visible()) + 1) {
      const row = document.createElement("div");
      row.append(...columns.map(() => document.createElement("span")));
      body.append(row);
      pool.push(row);
    }
    const first = Math.floor(top);
    body.style.transform = `translateY(${(first - top) * rowHeight}px)`;
    pool.forEach((row, i) => {
      const index = first + i;
      row.hidden = index >= rows;
      if (row.hidden) return;
      const texts = hooks.text(index);
      row.className = `${index % 2 ? "odd" : ""} ${texts ? "" : "waiting"}`;
      [...row.children].forEach((cell, k) => {
        const text = texts ? texts[k] : "";
        if (cell.textContent !== text) cell.textContent = text;
        if (columns[k].mark) cell.dataset.mark = text;
      });
    });
    const size = Math.max(24, track.clientHeight * Math.min(1, visible() / Math.max(rows, 1)));
    thumbTop = limit() > 0 ? top / limit() * (track.clientHeight - size) : 0;
    thumb.style.height = `${size}px`;
    thumb.style.transform = `translateY(${thumbTop}px)`;
    hooks.range(first, Math.min(rows, first + pool.length));
  }

  function schedule() {
    pending ||= requestAnimationFrame(render);
  }

  function scrollTo(value) {
    top = Math.max(0, Math.min(limit(), value));
    schedule();
  }

  root.addEventListener("wheel", event => {
    event.preventDefault();
    scrollTo(top + (event.deltaMode === 1 ? event.deltaY : event.deltaY / rowHeight));
  }, { passive: false });

  root.addEventListener("keydown", event => {
    const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: visible(), PageUp: -visible(), Home: -Infinity, End: Infinity };
    if (!(event.key in moves)) return;
    event.preventDefault();
    scrollTo(top + moves[event.key]);
  });

  let drag = null;
  thumb.addEventListener("pointerdown", event => {
    event.stopPropagation();
    drag = { y: event.clientY, top };
    thumb.setPointerCapture(event.pointerId);
  });
  thumb.addEventListener("pointermove", event => {
    if (drag) scrollTo(drag.top + (event.clientY - drag.y) / Math.max(1, track.clientHeight - thumb.offsetHeight) * limit());
  });
  thumb.addEventListener("lostpointercapture", () => drag = null);
  track.addEventListener("pointerdown", event => {
    scrollTo(top + (event.offsetY < thumbTop ? -visible() : visible()));
  });

  new ResizeObserver(schedule).observe(viewport);

  return {
    show(count) {
      rows = count;
      top = 0;
      schedule();
    },
    refresh: schedule,
    mark(key, direction) {
      for (const cell of head.children) cell.dataset.sort = cell.dataset.key === key ? direction : "";
    }
  };
}
