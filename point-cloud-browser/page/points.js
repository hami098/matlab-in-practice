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

const subtract = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = a => a.map(v => v / Math.hypot(...a));

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1, 0, 0, near * far / (near - far), 0];
}

function lookAt(eye, center) {
  const z = normalize(subtract(eye, center));
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
  return out;
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

async function createViewer(canvas) {
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
  const camera = { yaw: 0.6, pitch: 0.4, distance: 3, center: [0, 0, 0], radius: 1, range: [0, 1] };
  let points = null;
  let count = 0;
  let depth = null;
  let pending = false;

  function draw() {
    const width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
    if (canvas.width !== width || canvas.height !== height || !depth) {
      canvas.width = width;
      canvas.height = height;
      depth?.destroy();
      depth = device.createTexture({ size: [width, height], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    }
    const eye = [
      camera.center[0] + camera.distance * Math.cos(camera.pitch) * Math.sin(camera.yaw),
      camera.center[1] + camera.distance * Math.sin(camera.pitch),
      camera.center[2] + camera.distance * Math.cos(camera.pitch) * Math.cos(camera.yaw)
    ];
    const near = camera.radius * 0.01;
    const far = camera.distance + camera.radius * 2;
    const matrix = multiply(perspective(Math.PI / 4, width / height, near, far), lookAt(eye, camera.center));
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
    device.queue.submit([encoder.finish()]);
  }

  function redraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      draw();
    });
  }

  canvas.addEventListener("pointerdown", event => canvas.setPointerCapture(event.pointerId));
  canvas.addEventListener("pointermove", event => {
    if (event.buttons !== 1) return;
    camera.yaw -= event.movementX * 0.01;
    camera.pitch = Math.max(-1.5, Math.min(1.5, camera.pitch + event.movementY * 0.01));
    redraw();
  });
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    camera.distance *= Math.exp(event.deltaY * 0.001);
    redraw();
  }, { passive: false });
  new ResizeObserver(redraw).observe(canvas);

  async function show(xyz) {
    const { low, high } = bounds(xyz);
    camera.center = low.map((v, i) => (v + high[i]) / 2);
    camera.radius = Math.hypot(...subtract(high, low)) / 2 || 1;
    camera.distance = camera.radius * 2.5;
    camera.range = [low[2], high[2]];
    points?.destroy();
    points = device.createBuffer({ size: Math.max(xyz.byteLength, 12), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(points, 0, xyz);
    count = xyz.length / 3;
    draw();
    await device.queue.onSubmittedWorkDone();
  }

  return { show };
}
