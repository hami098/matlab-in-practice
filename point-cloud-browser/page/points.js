const shader = `
struct View { matrix: mat4x4f, low: vec4f, size: vec4f, pick: vec4f, span: vec4f, light: vec4f, splat: vec4f }
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> words: array<u32>;
@group(0) @binding(2) var<storage, read> colors: array<vec4f, 256>;
struct Varying { @builtin(position) position: vec4f, @location(0) color: vec3f, @location(1) corner: vec2f }

fn unit(base: u32, odd: bool) -> vec3f {
  if (!odd) {
    return vec3f(unpack2x16unorm(words[base]), unpack2x16unorm(words[base + 1u]).x);
  }
  return vec3f(unpack2x16unorm(words[base + 1u]).y, unpack2x16unorm(words[base + 2u]));
}

fn point(i: u32) -> Varying {
  let stride = u32(view.low.w);
  let base = i / 2u * stride;
  let position = view.low.xyz + unit(base, i % 2u == 1u) * view.size.xyz;
  var normal = vec3f(0.0);
  var density = 0.0;
  if (stride == 5u) {
    let attributes = words[base + 3u + i % 2u];
    normal = unpack4x8snorm(attributes).xyz;
    density = mix(view.span.z, view.span.w, unpack4x8unorm(attributes).w);
  }
  let t = clamp((dot(vec4f(position, density), view.pick) - view.span.x) / (view.span.y - view.span.x), 0.0, 1.0);
  var color = colors[u32(round(t * 255.0))].rgb;
  if (view.light.w > 0.0) {
    let facing = abs(dot(normal / max(length(normal), 1e-6), view.light.xyz));
    color = color * (0.2 + 0.8 * facing) + vec3f(0.2 * pow(facing, 24.0));
  }
  return Varying(view.matrix * vec4f(position, 1.0), color, vec2f(0.0));
}

@vertex fn vertexMain(@builtin(vertex_index) i: u32) -> Varying {
  return point(i);
}

@fragment fn fragmentMain(input: Varying) -> @location(0) vec4f {
  return vec4f(input.color, 1.0);
}

@vertex fn splatVertex(@builtin(vertex_index) v: u32) -> Varying {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  var result = point(v / 6u);
  result.corner = corners[v % 6u];
  result.position = vec4f(result.position.xy + result.corner * max(view.splat.xy, view.splat.zw * result.position.w), result.position.zw);
  return result;
}

@fragment fn splatFragment(input: Varying) -> @location(0) vec4f {
  if (dot(input.corner, input.corner) > 1.0) {
    discard;
  }
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

const lamp = (([x, y, z]) => [x, y, z].map(v => v / Math.hypot(x, y, z)))([-0.35, 0.45, 1]);

async function createViewer(canvas, axes, onFrame) {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error("WebGPU is not available in this browser.");
  const device = await adapter.requestDevice({
    requiredLimits: { maxBufferSize: adapter.limits.maxBufferSize, maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize }
  });
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const module = device.createShaderModule({ code: shader });
  const bindings = device.createBindGroupLayout({
    entries: [0, 1, 2].map(binding => ({ binding, visibility: GPUShaderStage.VERTEX, buffer: { type: binding === 0 ? "uniform" : "read-only-storage" } }))
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bindings] });
  const pipeline = (vertex, fragment, topology) => device.createRenderPipeline({
    layout,
    vertex: { module, entryPoint: vertex },
    fragment: { module, entryPoint: fragment, targets: [{ format }] },
    primitive: { topology },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" }
  });
  const dots = pipeline("vertexMain", "fragmentMain", "point-list");
  const splats = pipeline("splatVertex", "splatFragment", "triangle-list");
  const uniform = device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const colors = device.createBuffer({ size: 256 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const start = combine(turn([1, 0, 0], 0.4), turn([0, 1, 0], -0.6));
  const anterior = combine(turn([1, 0, 0], 0.15), combine(turn([0, 1, 0], 0.5), [0, Math.SQRT1_2, Math.SQRT1_2, 0]));
  const camera = { home: start, rotation: start, distance: 3, center: [0, 0, 0], radius: 1, low: [0, 0, 0], size: [1, 1, 1], stride: 3, values: [0, 1], pick: [0, 0, 1, 0], span: [0, 1], light: false, splat: 0 };
  let points = null;
  let bindGroup = null;
  let firsts = [];
  let filled = [];
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
    const rotation = rotationMatrix(camera.rotation);
    const projection = perspective(Math.PI / 4, width / height, near, far);
    const matrix = multiply(
      projection,
      translation([0, 0, -camera.distance]),
      rotation,
      translation(camera.center.map(v => -v))
    );
    const light = [0, 1, 2].map(k => lamp.reduce((sum, v, row) => sum + v * rotation[k * 4 + row], 0));
    device.queue.writeBuffer(uniform, 0, new Float32Array([
      ...matrix, ...camera.low, camera.stride, ...camera.size, 0, ...camera.pick, ...camera.span, ...camera.values, ...light, camera.light && camera.stride === 5 ? 1 : 0,
      projection[0] * camera.splat, projection[5] * camera.splat, 1.5 / width, 1.5 / height
    ]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" }
    });
    if (bindGroup) {
      const corners = camera.splat > 0 ? 6 : 1;
      pass.setPipeline(corners === 6 ? splats : dots);
      pass.setBindGroup(0, bindGroup);
      filled.forEach((count, part) => count > 0 && pass.draw(count * corners, 1, firsts[part] * corners));
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
    camera.rotation = camera.home;
    camera.distance = camera.radius * 2.5;
  }

  let dragging = false;
  canvas.addEventListener("pointerdown", event => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("lostpointercapture", () => dragging = false);
  canvas.addEventListener("pointermove", event => {
    if (!dragging) return;
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

  function begin(counts, low, high, { stride = 3, values = [0, 1], space = "", splat = 0 } = {}) {
    firsts = counts.map((_, part) => counts.slice(0, part).reduce((a, b) => a + b, 0));
    filled = counts.map(() => 0);
    const total = counts.reduce((a, b) => a + b, 0);
    const same = low.every((v, i) => v === camera.low[i] && high[i] - v === camera.size[i]);
    camera.low = low;
    camera.size = high.map((v, i) => v - low[i]);
    camera.center = low.map((v, i) => (v + high[i]) / 2);
    camera.radius = Math.hypot(...camera.size) / 2 || 1;
    camera.stride = stride;
    camera.values = values;
    camera.splat = splat;
    const home = space === "RAS" ? anterior : start;
    if (!same || home !== camera.home) {
      camera.home = home;
      reset();
    }
    points?.destroy();
    points = device.createBuffer({ size: Math.max(Math.ceil(total * stride * 2 / 4) * 4, 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    bindGroup = device.createBindGroup({
      layout: bindings,
      entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: points } }, { binding: 2, resource: { buffer: colors } }]
    });
    return redraw();
  }

  function append(part, bytes, offset) {
    device.queue.writeBuffer(points, firsts[part] * camera.stride * 2 + offset, bytes);
    const end = offset + bytes.byteLength;
    filled[part] = camera.stride === 3 ? Math.floor(end / 6) : Math.floor(end / 20) * 2;
    return redraw();
  }

  const loaded = () => filled.reduce((a, b) => a + b, 0);

  function paint(axis, rgba, span) {
    camera.pick = [0, 1, 2, 3].map(k => k === axis ? 1 : 0);
    camera.span = span;
    device.queue.writeBuffer(colors, 0, rgba);
    return redraw();
  }

  function shade(on) {
    camera.light = on;
    return redraw();
  }

  return { begin, append, loaded, paint, shade, finish: draw, gpu: `${adapter.info?.vendor ?? ""} ${adapter.info?.architecture ?? ""}`.trim() };
}
