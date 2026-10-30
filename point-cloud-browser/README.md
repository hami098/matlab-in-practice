# point-cloud-browser

Pick a row in an HTML table and see its point cloud drawn with WebGPU, while MATLAB stays free.

## Run

```matlab
cd point-cloud-browser
pointCloudBrowser
```

Click a row. Drag to rotate in any direction, scroll to zoom, double-click to reset. The bar on top moves while MATLAB prepares and fills while the points arrive; a new click cancels the running transfer. The panel on the right shows the last load (points, size, extent, timings, frame time, GPU), the axes in the corner turn with the view, and each load prints one line with its timings in the Command Window.

The table lists generated tori (1, 10 and 50 million points), the files in [demo-data](../demo-data) and, when downloaded, the full data sets in `cache` ([open-data](../open-data)).

Without MATLAB, serve the repository folder with any static web server, open `page/index.html` and drop a binary PLY file on it.

## How it works

1. `pointCloudBrowser` copies `page` to a temporary folder and opens it in `uihtml`. The page asks for the list of samples (`ready`).
2. A click sends `select`. MATLAB starts `prepare` on `backgroundPool` with `parfeval` and returns at once.
3. `prepare` reads the sample and writes its points as little-endian float32 x, y, z into the temporary folder.
4. `afterEach` sends the file name and point count to the page (`points`). The page streams the file into a buffer of the announced size, wraps it in a `Float32Array`, and `points.js` uploads it to one WebGPU vertex buffer and draws it. No number goes through JSON.
5. The page draws only when the data or the camera changes.

| File | Does |
|---|---|
| `readPly.m` | binary PLY, any vertex properties; returns x, y, z as an N by 3 single array; checks the declared count against the file size |
| `readNifti.m` | single file NIfTI-1; applies scale and offset; returns the volume in single and the voxel size |
| `ctSurfacePoints.m` | voxels at or above a threshold (300 HU, bone) with a neighbor below it, in millimeters |
| `syntheticCloud.m` | random points on a torus |
| `page/points.js` | the WebGPU viewer: one vertex buffer, color by height, a trackball camera kept as a quaternion so it turns freely, the axes |
| `page/app.js` | the table, the progress bar, the details, the messages with MATLAB, and a PLY reader for dropped files |

`gunzip` is not supported on thread-based workers, so a `.nii.gz` file is unpacked on the MATLAB thread before `parfeval`.

## Measured

MATLAB R2026b on Windows, NVIDIA Pascal GPU. After a click, the MATLAB thread is free again within 1 to 3 ms.

| Sample | Points | Prepared | Transferred | Drawn |
|---|---|---|---|---|
| demo motorcycle | 35,000 | 0.07 s | 0.01 s | 0.01 s |
| demo CT | 9,534 | 0.03 s | 0.00 s | 0.00 s |
| Redwood 00007 | 458,820 | 0.02 s | 0.06 s | 0.02 s |
| torus 1M | 1,000,000 | 0.06 s | 0.11 s | 0.03 s |
| torus 10M | 10,000,000 | 0.35 s | 1.10 s | 0.19 s |
| torus 50M | 50,000,000 | 1.63 s | 5.33 s | 1.14 s |

The transfer from MATLAB's local web server to the page, about 110 MB/s, is the largest cost.

MATLAB Online, Chrome 156, over the internet:

| Sample | Points | Prepared | Transferred |
|---|---|---|---|
| demo motorcycle | 35,000 | 0.06 s | 0.23 s |
| torus 1M | 1,000,000 | 0.03 to 0.06 s | 1.9 to 4.1 s |
| torus 10M | 10,000,000 | 0.28 to 0.29 s | 12.0 to 19.4 s |
| torus 50M | 50,000,000 | 1.43 s | 54.2 s |

There the transfer runs at 3 to 11 MB/s and decides everything.
