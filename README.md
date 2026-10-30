# matlab-in-practice

[![Open in MATLAB Online](https://www.mathworks.com/images/responsive/global/open-in-matlab-online.svg)](https://matlab.mathworks.com/open/github/v1?repo=hami098/matlab-in-practice)

Large 3D point clouds in MATLAB, in an interface that keeps responding while the data is loaded and processed. Scans of industrial parts, points sampled from CAD models and surfaces extracted from CT volumes are read, reduced and drawn by code written from scratch: reading and reducing run in the background, the coordinates reach the page as raw float32 bytes, and the page draws them with WebGL. Every choice is measured, and the measurements are part of the repository.

> **Status:** design. No code yet. The plan, what is already measured and what is still open are in [docs/plan.md](docs/plan.md).

I am not affiliated with MathWorks. I am an independent researcher, exploring how MATLAB is used in practice. MATLAB is a registered trademark of The MathWorks, Inc.

## What it shows

- **The window never waits for the data.** MATLAB runs app callbacks and graphics updates on a single thread, so a file read or a reduction inside a callback freezes the window until it ends. Here that work runs on `backgroundPool` through `parfeval`. The MATLAB thread only starts the work and receives the result (`afterEach`).
- **An interface written in HTML, not assembled from `uitable` and axes.** The window is one `uihtml` component with its own HTML, CSS and JavaScript.
- **Binary, not JSON.** Coordinates leave MATLAB as little-endian float32 bytes and arrive in JavaScript as a `Float32Array`, ready for the GPU. No numeric array goes through `jsonencode`.
- **A small footprint next to other software.** The application is meant for machines that already run other industrial software: a bounded number of background workers, single precision throughout, no more points sent to the screen than it can show, and drawing only when something changes.
- **Base MATLAB first.** The core needs MATLAB alone. Toolboxes are optional: Parallel Computing adds workers, Point Cloud is the reference the readers are compared with, Image Processing reads DICOM.
- **Easy to take apart.** Readers return plain arrays, not toolbox objects. The viewer is one component that drops into any `uifigure`, and the byte format it accepts is documented, so another program can feed it too.

## Data

Open data sets only, downloaded by a script into `data/cache/` and never committed. Tests generate their own data and need no download.

| Data set | What it gives | License |
|---|---|---|
| [MVTec 3D-AD](https://www.mvtec.com/company/research/datasets/mvtec-3d-ad) | real scans of 10 object categories, among them cable glands, dowels, foam, rope and tires, as xyz images | CC BY-NC-SA 4.0, no commercial use |
| [ABC](https://deep-geometry.github.io/abc-dataset/) | CAD models of mechanical parts; points are sampled from their meshes | models owned by their creators, see [docs/plan.md](docs/plan.md#data) |
| [TCIA](https://www.cancerimagingarchive.net/) | CT series in DICOM; a surface is extracted with marching cubes and turned into points | set per collection; only openly licensed collections are used |

Formats read: PLY, PCD, xyz TIFF, DICOM series.

## Requirements

Developed and measured on MATLAB R2026b. The oldest supported release will be stated here once the code exists. Optional: Parallel Computing Toolbox, Point Cloud Toolbox, Image Processing Toolbox.

## Conventions

- **No comments in code.** What a file does and why it is written that way is explained in the `README.md` of its folder. A reader starts there.
- English, plain punctuation: no en or em dashes, the hook refuses them.
- A component earns its place: a library or a technique is added when a measurement shows that it solves a problem.

## Layout (planned)

```
matlab/     readers, reduction, the background pipeline, the viewer component
viewer/     the page inside uihtml: HTML, CSS, JavaScript, WebGL2
examples/   scripts that open with the MATLAB Online badge
data/       download and preparation scripts; downloads go to data/cache/, never committed
tests/      matlab.unittest tests on generated data
docs/       plan, measurement method, measurements
```

## Checks

Activate the hooks once per clone:

```
git config core.hooksPath .githooks
```

The pre-commit hook refuses en and em dashes, secrets and data files by name, files over 512 KB, and anything gitleaks finds. CI runs the same checks over every tracked file and a gitleaks scan over the whole history.

## License

MIT, see [LICENSE](LICENSE). You may use, change and ship this code in open or closed products, as long as the copyright line and the license text stay in your copy. To cite the work, use [CITATION.cff](CITATION.cff); GitHub shows it as "Cite this repository".
