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

Without MATLAB, open `index.html` in a browser: the same answer appears on the page.

## How it works

When the page loads, it asks for a WebGPU adapter and device, creates a WebGL2 context, and writes what it found on the page: the browser version, the GPU vendor and architecture, the largest WebGPU buffer, and the WebGL2 renderer. Inside `uihtml`, `setup` also sends it to MATLAB with `sendEventToMATLAB`. `gpuSupport` opens the window and waits up to 30 seconds for that answer.

## Measured

- MATLAB R2026b on Windows: both available, Chromium 141, WebGPU buffers up to 2 GiB (about 178 million xyz points in float32).
- Chrome 156 on the same machine, without MATLAB: the same.

Requires MATLAB R2023a or later.
