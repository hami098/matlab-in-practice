# open-data

Downloads the full open data sets into `cache/` at the repository root, for local tests on large data. `cache/` is never committed.

```matlab
cd open-data
downloadOpenData
```

Files already present are skipped, so it can be run again after an interruption.

| Data set | License | Into | Size |
|---|---|---|---|
| [Redwood 3D Scan](https://github.com/isl-org/redwood-3dscan), 441 reconstructed meshes, binary PLY | public domain; cite [arXiv:1602.02481](https://arxiv.org/abs/1602.02481) | `cache/redwood/<id>.ply` | |
| [TotalSegmentator](https://zenodo.org/records/10047263) small subset, 102 CT scans, NIfTI | CC BY 4.0; cite the [TotalSegmentator paper](https://doi.org/10.1148/ryai.230024) | `cache/totalsegmentator-small/<subject>/ct.nii.gz` | 3.24 GB |
