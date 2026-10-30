# point-cloud-browser

Pick a row in an HTML table and see its point cloud drawn with WebGPU, or the bones of a CT, while MATLAB stays free.

## Run

```matlab
cd point-cloud-browser
pointCloudBrowser
```

Click a row.

- **View:** drag to rotate in any direction, scroll to zoom, double-click to reset. A drag that starts outside the view never turns the cloud. The axes in the corner are the cloud's own X, Y and Z.
- **Panels:** the icons at the top right open and close **Color** and **Details**. Drag a panel by its title; panels stop at each other's edges.
- **Color:** the axis that sets the color and the scale. The range starts at the cloud's minimum and maximum and can be typed in; points outside it take the end colors; **Auto** restores it.
- **CT:** opens upright and facing you, colored by density (HU) on the Bone scale and lit from the camera; **Light** turns the shading off. See [Bone](#bone).
- **Details:** points, size, extent, timings, frame time, GPU. At most 4 million points come first, an even sample of the whole cloud; **Load all** brings the rest.
- **Progress:** the bar on top moves while MATLAB prepares and fills while the points arrive; a new click cancels the running transfer and deletes the files of the previous load, so the temporary folder holds one load at most (seven loads used to leave 687 MB until the window closed). Each load prints its timings in the Command Window.

The table lists generated tori (1, 10 and 50 million points), the files in [demo-data](../demo-data) and, when downloaded, the full data sets in `cache` ([open-data](../open-data)).

Without MATLAB, serve the repository folder with any static web server, open `page/index.html` and drop a binary PLY file on it.

## How it works

1. `pointCloudBrowser` copies `page` to a temporary folder and opens it in `uihtml`. The page asks for the list of samples (`ready`).
2. A click sends `select`. MATLAB starts `prepare` on `backgroundPool` with `parfeval` and returns at once.
3. `prepare` reads the sample, and `writePoints` computes its bounds, scales each coordinate to a 16-bit integer within them, and writes x, y, z (6 bytes per point) in progressive order: every 64th point first, then the next 64th, built with one `permute`, split into four files of 16 such steps each. Any beginning of any file is an even sample of the whole cloud.
4. For a CT, `prepare` keeps only the bone surface and adds a normal and a density to each point ([Bone](#bone)).
5. `afterEach` sends the file names, point counts and bounds to the page (`points`). The page sets the camera from the bounds, fetches the four files at the same time, streams each into its own region of one WebGPU storage buffer, and draws whatever has arrived with one draw call per region, so the whole object appears after the first chunks and fills in. Each file stops at its share of 4 million points; **Load all** fetches the same files again in full, without going back to MATLAB. No number goes through JSON.
6. The page draws only when the data or the camera changes.

| File | Does |
|---|---|
| `readPly.m` | binary PLY, any vertex properties; reads the header as bytes, since `fgetl` took 0.39 s for the 8 header lines of a 101 MB file and `fread` 0.01 s for its vertices; returns x, y, z as an N by 3 single array; checks the declared count against the file size |
| `readNifti.m` | single file NIfTI-1; returns the stored values in their own type with the slope and intercept that turn them into real values, since converting to single while reading made it 9 times slower; the voxel size; and the transform to patient coordinates when the header has one |
| `ctSurfacePoints.m` | voxels at or above a threshold (300 HU, bone) with a neighbor below it, in millimeters; only those voxels, 1 to 2 % of a CT, are compared with their six neighbors; then the normal, the position where the density crosses the threshold, and the density |
| `insideBody.m` | which voxels lie inside the body: the CT sampled every 4.5 mm, above a level (-400 HU), opened by one sample, so the table and cables fall away |
| `syntheticCloud.m` | random points on a torus |
| `writePoints.m` | any N by 3 array to the four files the page reads, and the bounds and counts it needs; with normals and values, one more 32-bit word a point; usable on its own |
| `page/points.js` | the WebGPU viewer: one storage buffer that the vertex shader unpacks with `unpack2x16unorm` (two points in three 32-bit words, since WebGPU has no three-component 16-bit vertex format), color from a 256-entry table indexed by the chosen axis or the density within the chosen range, light from the camera, discs for CT points, a trackball camera kept as a quaternion so it turns freely, the axes |
| `page/panels.js` | the panels: opened and closed from the toolbar, dragged by the title inside the view, never on top of each other |
| `page/colors.js` | the color scales (Turbo, Viridis, Plasma, Cividis, Jet, Gray, Bone) as stops, turned into the 256-entry table and the CSS gradient of the color bar; changing the scale rewrites only that 4 KB table |
| `page/app.js` | the table, the progress bar, the details, the messages with MATLAB, and a PLY reader for dropped files that scales them the same way |

`gunzip` is not supported on thread-based workers, so CT scans are unpacked once when they are downloaded, never on a click: unpacking a 68 MB `.nii.gz` on the MATLAB thread froze the window for 0.6 s.

## Bone

A CT holds one density per voxel in Hounsfield units (HU): air -1000, fat about -100, water 0, muscle about 40, bone from about 300 to over 1500.

1. **Threshold.** Bone is every voxel at 300 HU or more; its surface is the bone voxels with a neighbor below 300 HU.
2. **Inside the body.** The patient table, cables and electrodes on the skin pass 300 HU too. `insideBody` marks the voxels above -400 HU on a grid every 4.5 mm, removes one grid step from the outside of that mask and adds it back: objects thinner than about 9 mm, such as the table top and cables, disappear, and the body returns to its shape. Surface voxels outside it are dropped.
3. **Normal and position.** The density rises fastest into the bone; that direction, from the six neighbors, gives the normal. Each point moves along it to where the density crosses 300 HU, at most half a voxel, so the voxel steps do not show.
4. **Density.** The higher of the voxel's own and that of its neighbor one voxel deeper, so thick cortical bone reads white and thin bone darker.
5. **Patient coordinates.** The transform in the NIfTI header turns voxels into millimeters in patient coordinates: x to the patient's right, y to the front, z up (RAS). The page opens such a CT upright and facing you.
6. **Drawing.** Each point carries its normal and density in one more 32-bit word, 10 bytes a point. The page colors it by density on the Bone scale, lights it from the camera, and draws it as a disc 1.2 voxels wide, six vertices a point in one draw call, so the surface stays closed when zoomed in. Scans and tori stay one pixel a point: 50 million discs would be 300 million vertices.

Checked against the bone labels that come with TotalSegmentator (skull, vertebrae, ribs, sternum, clavicles, scapulae, humeri, hips, sacrum, femurs) on 14 scans from 8 of the 11 study types in the set. A point counts as bone within two voxels of a labeled bone; a labeled bone surface counts as found within two voxels of a point. Median, lowest to highest:

| Bone from | Inside the body | Shown points that are labeled bone | Labeled bone surface found |
|---|---|---|---|
| 200 HU | | 0.69, 0.46 to 0.83 | 0.99, 0.96 to 0.99 |
| 300 HU | | 0.90, 0.52 to 0.96 | 0.95, 0.85 to 0.98 |
| 400 HU | | 0.94, 0.66 to 0.99 | 0.84, 0.70 to 0.97 |
| 500 HU | | 0.94, 0.77 to 0.99 | 0.69, 0.57 to 0.93 |
| 300 HU | yes | 0.93, 0.73 to 0.98 | 0.95, 0.85 to 0.98 |

Above 300 HU the threshold loses bone faster than it drops other things; the body mask lifted the trauma scans, where the patient lies on a board, from 0.52 to 0.73, 0.66 to 0.81 and 0.71 to 0.83, and cost at most 0.016 of the found bone. What remains is partly real bone without a label in this set, such as the forearms, partly contrast filled aorta and heart (up to 10 % of the points in contrast scans), calcified rib cartilage, and the part of the table the head rests on.

## Measured

MATLAB R2026b on Windows, NVIDIA Pascal GPU. After a click, the MATLAB thread is free again within 1 to 3 ms. Times are from the moment MATLAB starts preparing.

| Sample | Points | Prepared | First picture | Complete |
|---|---|---|---|---|
| torus 1M | 1,000,000 | 0.05 s | 0.09 s | 0.09 s |
| torus 10M, 4.2M shown | 10,000,000 | 0.47 s | 0.50 s | 0.65 s |
| torus 50M, 4.1M shown | 50,000,000 | 2.33 s | 2.45 s | 2.83 s |
| Redwood 06822, truck | 2,673,085 | 0.14 s | 0.18 s | 0.25 s |
| CT s1082, bone | 514,720 | 0.70 s | 0.78 s | 0.81 s |

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

Finding bone, the normals and the density cost the largest CT 0.18 s: reading and preparing it took 0.32 s before and 0.50 s after, median of seven, both in one MATLAB session; the body mask is 0.09 s of that. The CT row above was measured after this change, on a day this machine ran slower: the 50M torus then took 2.9 to 3.5 s to prepare.

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
