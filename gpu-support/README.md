# gpu-support

Does the browser inside `uihtml` offer WebGPU and WebGL2?

## Run

```matlab
cd gpu-support
info = gpuSupport
```

A small window opens and closes. Then read the answer:

```matlab
info.webgpu
info.webgl2
```

`available: 1` means the API works. In MATLAB Online the page runs in your own browser, so the answer is about your browser and GPU. In desktop MATLAB it is about the browser built into MATLAB.

## How it works

`gpuSupport` opens a window with `index.html` and waits up to 30 seconds for its answer. When the page loads, `setup` asks for a WebGPU adapter and device, creates a WebGL2 context, and sends what it found with `sendEventToMATLAB`: the browser version, the GPU vendor and architecture, the largest WebGPU buffer, and the WebGL2 renderer.

## Measured

MATLAB R2026b on Windows: both available, Chromium 141, WebGPU buffers up to 2 GiB (about 178 million xyz points in float32).

Requires MATLAB R2023a or later.
