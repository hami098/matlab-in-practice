# open-data

Downloads the full open data sets into `cache/` at the repository root, for local tests on large data. `cache/` is never committed.

```matlab
cd open-data
downloadOpenData
```

One set alone, for example the 275 MB head CT in MATLAB Online: `downloadOpenData("head-ct")`; the others are `"redwood"` and `"totalsegmentator"`.

Files already present are skipped, so it can be run again after an interruption. CT scans are unpacked from `.nii.gz` to `.nii` once, because `gunzip` does not run on thread-based workers.

| Data set | License | Into | Size |
|---|---|---|---|
| [Redwood 3D Scan](https://github.com/isl-org/redwood-3dscan), 441 reconstructed meshes, binary PLY | public domain; cite [arXiv:1602.02481](https://arxiv.org/abs/1602.02481) | `cache/redwood/<id>.ply` | 6.6 GB |
| [TotalSegmentator](https://zenodo.org/records/10047263) small subset, 102 CT scans, NIfTI | CC BY 4.0; cite the [TotalSegmentator paper](https://doi.org/10.1148/ryai.230024) | `cache/totalsegmentator-small/<subject>/ct.nii` | 3.24 GB download, 6.2 GB unpacked |
| [CT Dataset of a Human Head](https://zenodo.org/records/3374839), one head CT at 0.49 x 0.49 x 0.625 mm, NIfTI | CC BY 4.0; credit the record's creators | `cache/head-ct/ct.nii` | 275 MB |

The head CT stores CT numbers with air at 0 and water at 1024, and its header leaves the scale unset; the download writes scale 1 and offset -1024 into the header, so it reads in HU like the others. Its MD5 before that change is `0a8c91e1b9bffc07ffbda2cb800ef9eb`.
