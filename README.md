# matlab-in-practice

[![Open in MATLAB Online](https://www.mathworks.com/images/responsive/global/open-in-matlab-online.svg)](https://matlab.mathworks.com/open/github/v1?repo=hami098/matlab-in-practice)

Small MATLAB examples for large 3D data. Each folder answers one question and runs on its own, with MATLAB alone and no toolboxes. MATLAB prepares the data; a plain HTML, CSS and JavaScript page draws it with WebGPU or WebGL2, and the same page runs in any browser without MATLAB.

I am not affiliated with MathWorks. I am an independent researcher exploring how MATLAB is used in practice.

| Folder | Question | Status |
|---|---|---|
| [gpu-support](gpu-support) | Does the browser inside `uihtml` offer WebGPU and WebGL2? | done |
| [point-cloud-browser](point-cloud-browser) | Pick a row in an HTML table, see its point cloud or CT with WebGPU, MATLAB stays free | done |
| [large-table](large-table) | Ten million rows, scrolled, sorted and filtered without `uitable`, MATLAB stays free | done |
| webgpu-vs-webgl2-2d | Which draws 2D faster? | planned |
| float32-transfer | What is the fastest way to move points from MATLAB to the page? | planned |
| ply-pcd-reader | How fast can plain MATLAB read binary PLY and PCD? | planned |
| webgpu-point-cloud | How large a point cloud can WebGPU draw? | planned |

Data: small demo files ship in [demo-data](demo-data); the full data sets are downloaded locally by [open-data](open-data).

## Run

1. Click **Open in MATLAB Online** above, or clone the repository and open its folder in MATLAB.
2. In the Command Window, go into a folder and call its function, for example:

   ```matlab
   cd gpu-support
   info = gpuSupport
   ```

Each folder's README names its function and explains the result.

## Rules

- One folder, one question. Each folder has a README; the code has no comments.
- MATLAB's Code Analyzer (`codeIssues`) reports nothing.
- MATLAB alone, open source code, openly licensed data. Only demo files under 512 KB are committed.
- Pages use WebGPU and WebGL2 directly, with no framework, and never depend on MATLAB.
- A choice stays only if a measurement supports it.

## License

MIT. Keep the copyright line in your copy. To cite, use [CITATION.cff](CITATION.cff).
