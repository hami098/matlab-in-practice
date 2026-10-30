const shader = `
struct View { matrix: mat4x4f, low: vec4f, size: vec4f, channel: vec4f, span: vec4f, light: vec4f, splat: vec4f }
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> words: array<u32>;
@group(0) @binding(2) var<storage, read> colors: array<vec4f, 256>;
struct Varying { @builtin(position) position: vec4f, @location(0) color: vec3f, @location(1) corner: vec2f, @location(2) @interpolate(flat) world: vec3f }

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
  let t = clamp((dot(vec4f(position, density), view.channel) - view.span.x) / (view.span.y - view.span.x), 0.0, 1.0);
  var color = colors[u32(round(t * 255.0))].rgb;
  if (view.light.w > 0.0) {
    let facing = abs(dot(normal / max(length(normal), 1e-6), view.light.xyz));
    color = color * (0.2 + 0.8 * facing) + vec3f(0.2 * pow(facing, 24.0));
  }
  return Varying(view.matrix * vec4f(position, 1.0), color, vec2f(0.0), position);
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
}

@fragment fn pickFragment(input: Varying) -> @location(0) vec4f {
  return vec4f(input.world, 1.0);
}

@fragment fn pickSplatFragment(input: Varying) -> @location(0) vec4f {
  if (dot(input.corner, input.corner) > 1.0) {
    discard;
  }
  return vec4f(input.world, 1.0);
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
  const pipeline = (vertex, fragment, topology, target = format) => device.createRenderPipeline({
    layout,
    vertex: { module, entryPoint: vertex },
    fragment: { module, entryPoint: fragment, targets: [{ format: target }] },
    primitive: { topology },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" }
  });
  const shown = { dots: pipeline("vertexMain", "fragmentMain", "point-list"), splats: pipeline("splatVertex", "splatFragment", "triangle-list") };
  const picked = { dots: pipeline("vertexMain", "pickFragment", "point-list", "rgba32float"), splats: pipeline("splatVertex", "pickSplatFragment", "triangle-list", "rgba32float") };
  const uniform = device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const pickUniform = device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const pickTarget = device.createTexture({ size: [16, 16], format: "rgba32float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  const pickDepth = device.createTexture({ size: [16, 16], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
  const pickRead = device.createBuffer({ size: 256 * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const colors = device.createBuffer({ size: 256 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const start = combine(turn([1, 0, 0], 0.4), turn([0, 1, 0], -0.6));
  const anterior = combine(turn([1, 0, 0], 0.15), combine(turn([0, 1, 0], 0.5), [0, Math.SQRT1_2, Math.SQRT1_2, 0]));
  const camera = { home: start, rotation: start, distance: 3, center: [0, 0, 0], radius: 1, low: [0, 0, 0], size: [1, 1, 1], stride: 3, values: [0, 1], channel: [0, 0, 1, 0], span: [0, 1], light: false, splat: 0 };
  let points = null;
  let bindGroup = null;
  let pickGroup = null;
  let matrix = null;
  let picking = Promise.resolve(null);
  const watchers = [];
  let firsts = [];
  let filled = [];
  let depth = null;
  let pending = null;

  function settings(width, height, at = null) {
    const near = camera.radius * 0.01;
    const far = camera.distance + camera.radius * 2;
    const rotation = rotationMatrix(camera.rotation);
    const projection = perspective(Math.PI / 4, width / height, near, far);
    const view = multiply(projection, translation([0, 0, -camera.distance]), rotation, translation(camera.center.map(v => -v)));
    const light = [0, 1, 2].map(k => lamp.reduce((sum, v, row) => sum + v * rotation[k * 4 + row], 0));
    let splat = [projection[0] * camera.splat, projection[5] * camera.splat, 1.5 / width, 1.5 / height];
    let used = view;
    if (at) {
      const scale = [width / 16, height / 16];
      const ndc = [at[0] / width * 2 - 1, 1 - at[1] / height * 2];
      used = multiply([scale[0], 0, 0, 0, 0, scale[1], 0, 0, 0, 0, 1, 0, -ndc[0] * scale[0], -ndc[1] * scale[1], 0, 1], view);
      splat = [splat[0] * scale[0], splat[1] * scale[1], 1.5 / 16, 1.5 / 16];
    } else {
      matrix = view;
    }
    return new Float32Array([
      ...used, ...camera.low, camera.stride, ...camera.size, 0, ...camera.channel, ...camera.span, ...camera.values, ...light, camera.light && camera.stride === 5 ? 1 : 0, ...splat
    ]);
  }

  function drawPoints(pass, pipelines, group) {
    if (!group) return;
    const corners = camera.splat > 0 ? 6 : 1;
    pass.setPipeline(corners === 6 ? pipelines.splats : pipelines.dots);
    pass.setBindGroup(0, group);
    filled.forEach((count, part) => count > 0 && pass.draw(count * corners, 1, firsts[part] * corners));
  }

  async function nearest(x, y) {
    device.queue.writeBuffer(pickUniform, 0, settings(canvas.width, canvas.height, [x, y]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: pickTarget.createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: pickDepth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" }
    });
    drawPoints(pass, picked, pickGroup);
    pass.end();
    encoder.copyTextureToBuffer({ texture: pickTarget }, { buffer: pickRead, bytesPerRow: 256 }, [16, 16]);
    device.queue.submit([encoder.finish()]);
    await pickRead.mapAsync(GPUMapMode.READ);
    const texels = new Float32Array(pickRead.getMappedRange().slice(0));
    pickRead.unmap();
    let best = null;
    let distance = Infinity;
    for (let k = 0; k < 256; k++) {
      const away = Math.hypot(k % 16 + 0.5 - 8, Math.floor(k / 16) + 0.5 - 8);
      if (texels[k * 4 + 3] > 0 && away < distance) {
        distance = away;
        best = [...texels.subarray(k * 4, k * 4 + 3)];
      }
    }
    return best;
  }

  const pick = (x, y) => picking = picking.catch(() => null).then(() => nearest(x, y));

  function project(point) {
    if (!matrix) return null;
    const clip = [0, 1, 2, 3].map(row => matrix[row] * point[0] + matrix[4 + row] * point[1] + matrix[8 + row] * point[2] + matrix[12 + row]);
    if (clip[3] <= 0) return null;
    return [(clip[0] / clip[3] + 1) / 2 * canvas.clientWidth, (1 - clip[1] / clip[3]) / 2 * canvas.clientHeight];
  }

  function draw() {
    const width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
    if (canvas.width !== width || canvas.height !== height || !depth) {
      canvas.width = width;
      canvas.height = height;
      depth?.destroy();
      depth = device.createTexture({ size: [width, height], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    }
    device.queue.writeBuffer(uniform, 0, settings(width, height));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" }
    });
    drawPoints(pass, shown, bindGroup);
    pass.end();
    const submitted = performance.now();
    device.queue.submit([encoder.finish()]);
    drawAxes(axes, camera.rotation);
    watchers.forEach(watcher => watcher());
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
    const group = buffer => device.createBindGroup({
      layout: bindings,
      entries: [{ binding: 0, resource: { buffer } }, { binding: 1, resource: { buffer: points } }, { binding: 2, resource: { buffer: colors } }]
    });
    bindGroup = group(uniform);
    pickGroup = group(pickUniform);
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
    camera.channel = [0, 1, 2, 3].map(k => k === axis ? 1 : 0);
    camera.span = span;
    device.queue.writeBuffer(colors, 0, rgba);
    return redraw();
  }

  function shade(on) {
    camera.light = on;
    return redraw();
  }

  const watch = watcher => watchers.push(watcher);

  return { begin, append, loaded, paint, shade, pick, project, watch, finish: draw, gpu: `${adapter.info?.vendor ?? ""} ${adapter.info?.architecture ?? ""}`.trim() };
}
