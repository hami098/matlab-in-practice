# point-cloud-browser

Pick a row in an HTML table and see its point cloud drawn with WebGPU, while MATLAB stays free.

## Run

```matlab
cd point-cloud-browser
pointCloudBrowser
```

Click a row.

- **View:** drag to rotate in any direction, scroll to zoom, double-click to reset. A drag that starts outside the view never turns the cloud. The axes in the corner are the cloud's own X, Y and Z.
- **Panels:** the icons at the top right open and close **Color** and **Details**. Drag a panel by its title; panels stop at each other's edges.
- **Color:** the axis that sets the color and the scale. The range starts at the cloud's minimum and maximum and can be typed in; points outside it take the end colors; **Auto** restores it.
- **Details:** points, size, extent, timings, frame time, GPU. At most 4 million points come first, an even sample of the whole cloud; **Load all** brings the rest.
- **Progress:** the bar on top moves while MATLAB prepares and fills while the points arrive; a new click cancels the running transfer and deletes the files of the previous load, so the temporary folder holds one load at most (seven loads used to leave 687 MB until the window closed). Each load prints its timings in the Command Window.

The table lists generated tori (1, 10 and 50 million points), the files in [demo-data](../demo-data) and, when downloaded, the full data sets in `cache` ([open-data](../open-data)).

Without MATLAB, serve the repository folder with any static web server, open `page/index.html` and drop a binary PLY file on it.

## How it works

1. `pointCloudBrowser` copies `page` to a temporary folder and opens it in `uihtml`. The page asks for the list of samples (`ready`).
2. A click sends `select`. MATLAB starts `prepare` on `backgroundPool` with `parfeval` and returns at once.
3. `prepare` reads the sample, and `writePoints` computes its bounds, scales each coordinate to a 16-bit integer within them, and writes x, y, z (6 bytes per point) in progressive order: every 64th point first, then the next 64th, built with one `permute`, split into four files of 16 such steps each. Any beginning of any file is an even sample of the whole cloud.
4. `afterEach` sends the file names, point counts and bounds to the page (`points`). The page sets the camera from the bounds, fetches the four files at the same time, streams each into its own region of one WebGPU storage buffer, and draws whatever has arrived with one draw call per region, so the whole object appears after the first chunks and fills in. Each file stops at its share of 4 million points; **Load all** fetches the same files again in full, without going back to MATLAB. No number goes through JSON.
5. The page draws only when the data or the camera changes.

| File | Does |
|---|---|
| `readPly.m` | binary PLY, any vertex properties; reads the header as bytes, since `fgetl` took 0.39 s for the 8 header lines of a 101 MB file and `fread` 0.01 s for its vertices; returns x, y, z as an N by 3 single array; checks the declared count against the file size |
| `readNifti.m` | single file NIfTI-1; returns the stored values in their own type with the slope and intercept that turn them into real values, since converting to single while reading made it 9 times slower; and the voxel size |
| `ctSurfacePoints.m` | voxels at or above a threshold (300 HU, bone) with a neighbor below it, in millimeters; only those voxels, 1 to 2 % of a CT, are compared with their six neighbors |
| `syntheticCloud.m` | random points on a torus |
| `writePoints.m` | any N by 3 array to the four files the page reads, and the bounds and counts it needs; usable on its own |
| `page/points.js` | the WebGPU viewer: one storage buffer that the vertex shader unpacks with `unpack2x16unorm` (two points in three 32-bit words, since WebGPU has no three-component 16-bit vertex format), color from a 256-entry table indexed by the chosen axis within the chosen range, a trackball camera kept as a quaternion so it turns freely, the axes |
| `page/panels.js` | the panels: opened and closed from the toolbar, dragged by the title inside the view, never on top of each other |
| `page/colors.js` | the color scales (Turbo, Viridis, Plasma, Cividis, Jet, Gray) as stops, turned into the 256-entry table and the CSS gradient of the color bar; changing the scale rewrites only that 4 KB table |
| `page/app.js` | the table, the progress bar, the details, the messages with MATLAB, and a PLY reader for dropped files that scales them the same way |

`gunzip` is not supported on thread-based workers, so CT scans are unpacked once when they are downloaded, never on a click: unpacking a 68 MB `.nii.gz` on the MATLAB thread froze the window for 0.6 s.

## Measured

MATLAB R2026b on Windows, NVIDIA Pascal GPU. After a click, the MATLAB thread is free again within 1 to 3 ms. Times are from the moment MATLAB starts preparing.

| Sample | Points | Prepared | First picture | Complete |
|---|---|---|---|---|
| torus 1M | 1,000,000 | 0.05 s | 0.09 s | 0.09 s |
| torus 10M, 4.2M shown | 10,000,000 | 0.47 s | 0.50 s | 0.65 s |
| torus 50M, 4.1M shown | 50,000,000 | 2.33 s | 2.45 s | 2.83 s |
| Redwood 06822, truck | 2,673,085 | 0.14 s | 0.18 s | 0.25 s |
| CT s1082 | 749,639 | 0.27 s | 0.31 s | 0.34 s |

**Load all** on the 50M torus brought the remaining points in 2.28 s in Chrome from a plain web server; drawing all 50 million takes 13 to 17 ms a frame.

16 bits within the bounds keep 1/65535 of the largest extent: 0.06 mm on a 3.7 m scan.

Parallel work pays where something waits, not where the cores are already busy. One connection to MATLAB's local web server carried 108 to 116 MB/s, two 166 to 170, four 185 to 217, eight 198 to 203; so four files. Preparation stays one job: MATLAB's vectorized functions already use the four cores of this machine inside one worker, so generating 50M points as four jobs took 1.04 s against 1.46 s as one, and sending 600 MB to a worker costs a 0.4 s copy.

### Optimization log

One change at a time, same machine, second of two runs.

| Change | 10M first picture | 10M complete | 50M first picture | 50M complete |
|---|---|---|---|---|
| start: one file, drawn after it fully arrives | 1.70 s | 1.70 s | 8.48 s | 8.48 s |
| bounds from MATLAB, progressive order, drawn while it arrives | 0.58 s | 1.65 s | 2.95 s | 8.86 s |
| 16-bit coordinates, 6 instead of 12 bytes per point | 0.47 s | 1.04 s | 2.25 s | 5.24 s |
| four files fetched at the same time | 0.50 s | 0.87 s | 2.37 s | 4.07 s |
| a budget of 4 million points, the rest on request | 0.50 s | 0.65 s | 2.45 s | 2.83 s |

Faster readers then brought the truck scan from 0.63 s to 0.24 s and the largest CT from 0.90 s to 0.30 s, with identical points.

Writing the progressive order with 64 strided copies cost 1.56 s for 50M points; one `permute` costs 0.49 s, against 0.33 s for the plain transpose that any interleaved write needs.

### MATLAB Online

Chrome 156 over the internet, where the transfer runs at 3 to 11 MB/s; the MATLAB Online machine had 8 workers.

| Sample | Before the optimizations, complete | After: first picture | After: complete |
|---|---|---|---|
| demo motorcycle | 0.29 s | 0.21 s | 0.56 s |
| torus 1M | 2.0 to 4.2 s | 0.42 s | 1.15 s |
| torus 10M | 12.7 to 19.9 s | 0.62 s | 2.96 s, 4.0M shown |
| torus 50M | 56.8 s | 2.49 s | 5.41 s, 4.0M shown |

A long MATLAB Online session grew slow, and the browser console showed MATLAB Online's own file panel timing out; a new session (`exit`, then reload) brought the numbers above back.
