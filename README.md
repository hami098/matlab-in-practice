# matlab-in-practice

[![Open in MATLAB Online](https://www.mathworks.com/images/responsive/global/open-in-matlab-online.svg)](https://matlab.mathworks.com/open/github/v1?repo=hami098/matlab-in-practice)

Small MATLAB examples for large 3D data. Each folder answers one question and runs on its own, with MATLAB alone: no toolboxes, interfaces in plain HTML and JavaScript on WebGPU or WebGL2.

I am not affiliated with MathWorks. I am an independent researcher exploring how MATLAB is used in practice.

| Folder | Question | Status |
|---|---|---|
| [gpu-support](gpu-support) | Does the browser inside `uihtml` offer WebGPU and WebGL2? | done |
| webgpu-vs-webgl2-2d | Which draws 2D faster? | planned |
| float32-transfer | How do points reach the page as a `Float32Array`, without JSON? | planned |
| background-loading | How does `parfeval` on `backgroundPool` keep the window responsive? | planned |
| ply-pcd-reader | How fast can plain MATLAB read binary PLY and PCD? | planned |
| webgpu-point-cloud | How large a point cloud can WebGPU draw? | planned |
| open-data | Download scripts for open data sets | planned |

## Rules

- One folder, one question. Each folder has a README; the code has no comments.
- MATLAB alone, open source code, openly licensed data. Data is downloaded, never committed.
- A choice stays only if a measurement supports it.

## License

MIT. Keep the copyright line in your copy. To cite, use [CITATION.cff](CITATION.cff).
