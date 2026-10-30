const shader = `
struct View { matrix: mat4x4f, range: vec4f }
@group(0) @binding(0) var<uniform> view: View;
struct Varying { @builtin(position) position: vec4f, @location(0) color: vec3f }

@vertex fn vertexMain(@location(0) point: vec3f) -> Varying {
  let t = clamp((point.z - view.range.x) / (view.range.y - view.range.x), 0.0, 1.0);
  return Varying(view.matrix * vec4f(point, 1.0), mix(vec3f(0.15, 0.45, 0.95), vec3f(0.98, 0.62, 0.2), t));
}

@fragment fn fragmentMain(input: Varying) -> @location(0) vec4f {
  return vec4f(input.color, 1.0);
}`;

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1, 0, 0, near * far / (near - far), 0];
}

function translation([x, y, z]) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function rotationMatrix([x, y, z, w]) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1
  ];
}

function multiply(...matrices) {
  return matrices.reduce((a, b) => {
    const out = new Array(16).fill(0);
    for (let column = 0; column < 4; column++)
      for (let row = 0; row < 4; row++)
        for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    return out;
  });
}

function turn(axis, angle) {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

function combine([ax, ay, az, aw], [bx, by, bz, bw]) {
  const q = [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
  const length = Math.hypot(...q);
  return q.map(v => v / length);
}

function bounds(xyz) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < xyz.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = xyz[i + k];
      if (v < low[k]) low[k] = v;
      if (v > high[k]) high[k] = v;
    }
  return { low, high };
}

function drawAxes(svg, rotation) {
  const m = rotationMatrix(rotation);
  [...svg.querySelectorAll("g")]
    .map(group => [group, Number(group.dataset.axis) * 4])
    .map(([group, k]) => ({ group, x: m[k], y: -m[k + 1], z: m[k + 2] }))
    .sort((a, b) => a.z - b.z)
    .forEach(({ group, x, y }) => {
      const [line, label] = group.children;
      line.setAttribute("x2", x);
      line.setAttribute("y2", y);
      label.setAttribute("x", x * 1.25);
      label.setAttribute("y", y * 1.25);
      svg.appendChild(group);
    });
}

async function createViewer(canvas, axes, onFrame) {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error("WebGPU is not available in this browser.");
  const device = await adapter.requestDevice({ requiredLimits: { maxBufferSize: adapter.limits.maxBufferSize } });
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vertexMain", buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }] },
    fragment: { module, entryPoint: "fragmentMain", targets: [{ format }] },
    primitive: { topology: "point-list" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" }
  });
  const uniform = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
  const start = combine(turn([1, 0, 0], 0.4), turn([0, 1, 0], -0.6));
  const camera = { rotation: start, distance: 3, center: [0, 0, 0], radius: 1, range: [0, 1] };
  let points = null;
  let count = 0;
  let depth = null;
  let pending = null;

  function draw() {
    const width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
    if (canvas.width !== width || canvas.height !== height || !depth) {
      canvas.width = width;
      canvas.height = height;
      depth?.destroy();
      depth = device.createTexture({ size: [width, height], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    }
    const near = camera.radius * 0.01;
    const far = camera.distance + camera.radius * 2;
    const matrix = multiply(
      perspective(Math.PI / 4, width / height, near, far),
      translation([0, 0, -camera.distance]),
      rotationMatrix(camera.rotation),
      translation(camera.center.map(v => -v))
    );
    device.queue.writeBuffer(uniform, 0, new Float32Array([...matrix, ...camera.range, 0, 0]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: [0.08, 0.09, 0.11, 1], loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" }
    });
    if (count > 0) {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, points);
      pass.draw(count);
    }
    pass.end();
    const submitted = performance.now();
    device.queue.submit([encoder.finish()]);
    drawAxes(axes, camera.rotation);
    return device.queue.onSubmittedWorkDone().then(() => {
      const milliseconds = performance.now() - submitted;
      onFrame(milliseconds);
      return milliseconds;
    });
  }

  function redraw() {
    pending ??= new Promise(resolve => requestAnimationFrame(() => {
      pending = null;
      draw().then(resolve);
    }));
    return pending;
  }

  function reset() {
    camera.rotation = start;
    camera.distance = camera.radius * 2.5;
  }

  canvas.addEventListener("pointerdown", event => canvas.setPointerCapture(event.pointerId));
  canvas.addEventListener("pointermove", event => {
    if (event.buttons !== 1) return;
    camera.rotation = combine(turn([0, 1, 0], event.movementX * 0.01), combine(turn([1, 0, 0], event.movementY * 0.01), camera.rotation));
    redraw();
  });
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    camera.distance *= Math.exp(event.deltaY * 0.001);
    redraw();
  }, { passive: false });
  canvas.addEventListener("dblclick", () => {
    reset();
    redraw();
  });
  new ResizeObserver(redraw).observe(canvas);

  function begin(total, low, high) {
    camera.center = low.map((v, i) => (v + high[i]) / 2);
    camera.radius = Math.hypot(...high.map((v, i) => v - low[i])) / 2 || 1;
    camera.range = [low[2], high[2]];
    reset();
    points?.destroy();
    points = device.createBuffer({ size: Math.max(total * 12, 12), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    count = 0;
    return redraw();
  }

  function append(bytes, offset) {
    device.queue.writeBuffer(points, offset, bytes);
    count = Math.floor((offset + bytes.byteLength) / 12);
    return redraw();
  }

  return { begin, append, finish: draw, gpu: `${adapter.info?.vendor ?? ""} ${adapter.info?.architecture ?? ""}`.trim() };
}
