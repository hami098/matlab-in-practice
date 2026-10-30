# gpu-support

Does the browser inside `uihtml` offer WebGPU and WebGL2?

```matlab
info = gpuSupport
```

`gpuSupport` opens a window with `index.html` and waits up to 30 seconds for its answer. When the page loads, `setup` asks for a WebGPU adapter and device, creates a WebGL2 context, and sends what it found with `sendEventToMATLAB`: the browser version, the GPU vendor and architecture, the largest WebGPU buffer, and the WebGL2 renderer.

MATLAB R2026b on Windows: both available, Chromium 141, WebGPU buffers up to 2 GiB (about 178 million xyz points in float32).

Requires MATLAB R2023a or later.
