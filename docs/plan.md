# Plan

## Goal

An application, and the parts it is built from, that opens point clouds of tens of millions of points in MATLAB and keeps the window responsive the whole time: while a file loads, the user can still rotate the view, cancel the load or pick another file. Each part is small enough to read in one sitting and to lift into another program.

## Why the obvious way freezes

MATLAB runs app callbacks, graphics updates and the code they call on one thread. Three common patterns put large data on that thread:

1. **Work inside a callback.** Reading a file or reducing a cloud in a button callback blocks every other callback, including the ones that redraw the window, until it returns.
2. **Numbers as JSON.** Data given to a `uihtml` component through its `Data` property is encoded with `jsonencode` and parsed in the page with `JSON.parse`. Every coordinate becomes decimal text, several times larger than its 4 bytes, and both steps take time in proportion to the size.
3. **Tables as the default view.** `uitable` is the first tool at hand for showing data, and its cost grows with the rows it holds.

The design below keeps the MATLAB thread for user events and nothing heavy.

## Architecture

```
file on disk -> reader -> reduction -> float32 bytes -> page (uihtml) -> Float32Array -> WebGL2
                |---- backgroundPool, parfeval ----|

MATLAB thread: user events, parfeval, afterEach
```

- **Readers** return plain arrays: an N by 3 `single` array of coordinates and, when the file has them, an N by 3 `uint8` array of colors. No toolbox object crosses the interface, so the output fits any code. Formats: PLY (ascii, binary little and big endian), PCD (ascii, binary), xyz TIFF, DICOM series. Every reader checks the counts in a header against the file size before it allocates, so a crafted header cannot ask for gigabytes.
- **Reduction**: voxel grid and random subsets in base MATLAB, and a coarse level that is shown first.
- **Background pipeline**: one `parfeval` per job on `backgroundPool`, the result handed back with `afterEach`, `cancel` when another file is picked. How progress travels from a worker to the window (`parallel.pool.DataQueue`, with and without Parallel Computing Toolbox) is measured, not assumed.
- **Transport**: the coordinates reach the page as bytes, see [Transport](#transport).
- **Viewer**: a page with its own HTML, CSS and JavaScript; points drawn with WebGL2, orbit, pan and zoom, point size, color by height. A MATLAB class wraps the `uihtml` component so that it drops into any `uifigure`, `uigridlayout` cell or `uipanel`.

## Measured so far

MATLAB R2026b on Windows, with Parallel Computing, Point Cloud and Image Processing Toolboxes installed. Each call ran through `parfeval(backgroundPool, ...)`.

| Call on a `backgroundPool` worker | Result |
|---|---|
| `fopen` and `fread` | runs |
| `pcread` on a binary PLY file | error: not supported on a thread-based worker |
| `isosurface` | error: not supported on a thread-based worker |

In R2026b `pcread` and `pcdownsample` ship in Point Cloud Toolbox; earlier releases have them in Computer Vision Toolbox.

What follows from it:

- The readers are written in base MATLAB on top of `fread`, so they run in the background. `pcread` stays as the reference for correctness and speed, called outside the background path.
- The CT surface is extracted in a preparation step that writes a point file, not in the interactive path.
- Without Parallel Computing Toolbox, `backgroundPool` has a single worker, according to MathWorks. Not yet measured here.

## Decisions and open questions

### Drawing: WebGL2 first, WebGPU as a measured experiment

- **WebGL2.** Points are one vertex buffer and a short shader. MATLAB Online runs in the user's browser, where WebGL2 is available. Whether the embedded browser of desktop MATLAB exposes WebGL2 and WebGPU is the first thing M1 records.
- **WebGPU.** Its gain is compute shaders: culling and level of detail on the GPU. Worth it only where the measured WebGL2 path runs out. It sits behind feature detection, with WebGL2 as the fallback.
- **Open3D: not used.** Its viewer opens a native window outside the MATLAB app, it adds a Python dependency, it does not run in MATLAB Online, and its processing (downsampling, normals, registration) is already available in MATLAB.
- **WebAssembly: not used for now.** The page hands a typed array to the GPU. Parsing and reduction happen in MATLAB. It is considered only if a measurement shows a JavaScript hotspot.
- **`pcshow` is the baseline.** The same cloud is shown with `pcshow` and with the page, and both are measured: time to first frame, frame time while rotating, memory.

### Transport

| | Path | JSON | Expected cost |
|---|---|---|---|
| T0 | numbers in the `Data` property | yes | the baseline to beat |
| T1 | bytes written to a file under the page's folder; the page fetches it as an `ArrayBuffer` and wraps it in a `Float32Array` | none | 4 bytes per coordinate, no parsing |
| T2 | bytes as base64 text in an event (`sendEventToHTMLSource`), decoded in the page into a `Float32Array` | one string | 4/3 of the bytes, no per-number parsing |

T1 is the target. Open point: MATLAB documents that supporting files of a `uihtml` page must sit in its folder or below it, and a MATLAB Answers thread reports a 404 for `fetch` in a deployed web app. M1 measures T1 on desktop MATLAB and in MATLAB Online, with T2 as the fallback. T1 writes into a temporary copy of the page folder, never into the repository.

### Workers

`backgroundPool` by default. A process pool (`parpool("Processes")`, Parallel Computing Toolbox) only for a step that cannot run on threads and still has to be interactive: each process worker is a separate MATLAB process with its own memory, which works against the resource budget.

## Resource budget

The application has to coexist with other industrial software on the same machine.

- **Memory.** Single precision throughout. 10 million points take 120 MB as single (x, y, z) and 240 MB as double.
- **Points on screen.** A 1920 by 1200 display has 2.3 million pixels. The page receives at most a set number of points, coarse first and refined on request. The full resolution stays in MATLAB. The default budget comes from M1 and M5.
- **CPU.** The number of background workers is a setting. The default is one, so a load never takes every core of a machine that runs other work.
- **GPU.** The page draws only when the camera, the data or the style changes. There is no continuous animation loop, so an idle viewer costs close to nothing.
- Every milestone records peak memory, CPU time and the idle CPU of the application.

## Data

Nothing from these data sets is committed; the hook refuses the formats by name.

- **MVTec 3D-AD.** 10 categories: bagel, cable gland, carrot, cookie, dowel, foam, peach, potato, rope, tire. Scanned with an industrial structured-light sensor (Zivid One+ Medium, 1920 by 1200 raw), each sample is a three-channel image holding x, y and z. License CC BY-NC-SA 4.0: no commercial use. Citation: P. Bergmann, D. Sattlegger, C. Steger, "The MVTec 3D-AD Dataset for Unsupervised 3D Anomaly Detection and Localization", VISAPP 2022, pp. 202-213, DOI 10.5220/0010865000003124.
- **ABC.** CAD models with STEP, Parasolid, STL and OBJ (with normals and curvature) files. The site says: "The copyright of the CAD models is owned by their creators. For licensing details, see Onshape Terms of Use 1.g.ii." The NYU archive records of the chunks also list the MIT License; the two statements are not reconciled anywhere. Here the meshes are only sampled into points locally, and nothing is redistributed. Citation: S. Koch et al., "ABC: A Big CAD Model Dataset For Geometric Deep Learning", CVPR 2019.
- **TCIA.** Most collections are licensed CC BY 3.0 or 4.0; a few are CC BY-NC, and limited-access collections need an agreement. Only openly licensed CT collections are used, each cited as its page asks. TCIA points public DICOM downloads to the NCI Imaging Data Commons; the download method is chosen in M6. The repository never stores the images and never tries to identify anyone in them.

## Milestones

| | Milestone | Done when |
|---|---|---|
| M0 | Repository | license, citation, checks, this plan |
| M1 | Transport and browser probe | the smallest page receives 10^5, 10^6 and 10^7 points through T0, T1 and T2; measured: time the MATLAB thread is blocked, time to first frame, peak memory; WebGL2 and WebGPU availability recorded; desktop and MATLAB Online |
| M2 | Viewer | WebGL2 renderer, orbit, pan, zoom, drawing on demand, the component class; a check that refuses comments in MATLAB, JavaScript, CSS and HTML lands with this first code |
| M3 | Readers | PLY and PCD in base MATLAB, compared with `pcread` on generated files: equal output, time, memory; tests with malformed headers |
| M4 | Background pipeline | `parfeval` and `afterEach`, cancel, progress; responsiveness measured during loads |
| M5 | Reduction and budget | voxel grid and random subsets against `pcdownsample`; coarse first, then refined |
| M6 | Open data | download and preparation scripts: MVTec xyz images, ABC meshes sampled into points, TCIA CT turned into surface points |
| M7 | Tables without `uitable` | the same rows in a `uitable` and in an HTML list that renders only the visible rows, measured |
| M8 | Packaging | a toolbox file (`.mltbx`), examples that open with the MATLAB Online badge, tests in CI with MATLAB on GitHub Actions |
| M9 | WebGPU | the same scenes with WebGPU against WebGL2 |

## How numbers are produced

- **Blocked time.** A timer on the MATLAB thread fires every 10 ms and records how late each tick runs. The lateness summed over a load is the time the window could not respond.
- **Time to first frame.** `performance.now()` in the page, from the arrival of the data to the first frame drawn with it.
- **Memory.** Peak memory of the MATLAB process, read from the operating system.
- Each number states the MATLAB release, the operating system, the CPU and GPU class, the number of points and the median of repeated runs. Raw output stays local in `results/`; the aggregates go to `docs/measurements.md`.
