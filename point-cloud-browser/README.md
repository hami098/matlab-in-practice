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
3. `prepare` reads the sample, computes its bounds, scales each coordinate to a 16-bit integer within them, and writes x, y, z (6 bytes per point) in progressive order: every 64th point first, then the next 64th, built with one `permute`. Any beginning of the file is an even sample of the whole cloud.
4. `afterEach` sends the file name, point count and bounds to the page (`points`). The page sets the camera from the bounds, streams the file straight into one WebGPU storage buffer and draws whatever has arrived, so the whole object appears after the first chunk and fills in. No number goes through JSON.
5. The page draws only when the data or the camera changes.

| File | Does |
|---|---|
| `readPly.m` | binary PLY, any vertex properties; returns x, y, z as an N by 3 single array; checks the declared count against the file size |
| `readNifti.m` | single file NIfTI-1; applies scale and offset; returns the volume in single and the voxel size |
| `ctSurfacePoints.m` | voxels at or above a threshold (300 HU, bone) with a neighbor below it, in millimeters |
| `syntheticCloud.m` | random points on a torus |
| `page/points.js` | the WebGPU viewer: one storage buffer that the vertex shader unpacks with `unpack2x16unorm` (two points in three 32-bit words, since WebGPU has no three-component 16-bit vertex format), color by height, a trackball camera kept as a quaternion so it turns freely, the axes |
| `page/app.js` | the table, the progress bar, the details, the messages with MATLAB, and a PLY reader for dropped files that scales them the same way |

`gunzip` is not supported on thread-based workers, so CT scans are unpacked once when they are downloaded, never on a click: unpacking a 68 MB `.nii.gz` on the MATLAB thread froze the window for 0.6 s.

## Measured

MATLAB R2026b on Windows, NVIDIA Pascal GPU. After a click, the MATLAB thread is free again within 1 to 3 ms. Times are from the moment MATLAB starts preparing.

| Sample | Points | Prepared | First picture | Complete |
|---|---|---|---|---|
| torus 1M | 1,000,000 | 0.05 s | 0.07 s | 0.11 s |
| torus 10M | 10,000,000 | 0.39 s | 0.47 s | 1.04 s |
| torus 50M | 50,000,000 | 1.88 s | 2.25 s | 5.24 s |
| Redwood 06822, truck | 2,673,085 | 0.48 s | 0.52 s | 0.66 s |
| CT s1082 | 749,639 | 0.86 s | 0.89 s | 0.92 s |

16 bits within the bounds keep 1/65535 of the largest extent: 0.06 mm on a 3.7 m scan. The transfer from MATLAB's local web server to the page, about 90 MB/s, is still the largest cost.

### Optimization log

One change at a time, same machine, second of two runs.

| Change | 10M first picture | 10M complete | 50M first picture | 50M complete |
|---|---|---|---|---|
| start: one file, drawn after it fully arrives | 1.70 s | 1.70 s | 8.48 s | 8.48 s |
| bounds from MATLAB, progressive order, drawn while it arrives | 0.58 s | 1.65 s | 2.95 s | 8.86 s |
| 16-bit coordinates, 6 instead of 12 bytes per point | 0.47 s | 1.04 s | 2.25 s | 5.24 s |

Writing the progressive order with 64 strided copies cost 1.56 s for 50M points; one `permute` costs 0.49 s, against 0.33 s for the plain transpose that any interleaved write needs.

MATLAB Online, Chrome 156, over the internet, before the optimizations:

| Sample | Points | Prepared | Transferred |
|---|---|---|---|
| demo motorcycle | 35,000 | 0.06 s | 0.23 s |
| torus 1M | 1,000,000 | 0.03 to 0.06 s | 1.9 to 4.1 s |
| torus 10M | 10,000,000 | 0.28 to 0.29 s | 12.0 to 19.4 s |
| torus 50M | 50,000,000 | 1.43 s | 54.2 s |

There the transfer runs at 3 to 11 MB/s and decides everything.
