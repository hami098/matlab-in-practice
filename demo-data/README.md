# demo-data

Small files that ship with the repository, so every folder runs right after cloning or in MATLAB Online. Each is under 512 KB. The full data sets are downloaded by [open-data](../open-data).

| File | From | License | Changes |
|---|---|---|---|
| `motorcycle.ply` | [Redwood 3D Scan](https://github.com/isl-org/redwood-3dscan) mesh 01311 | public domain | 35,000 random vertices, x, y, z only |
| `sports-car.ply` | Redwood 3D Scan mesh 01833 | public domain | 35,000 random vertices, x, y, z only |
| `ct-s0591-head.nii` | [TotalSegmentator](https://zenodo.org/records/10047263) subject s0591, CT | CC BY 4.0 | cut to the skull label and 3 mm around it, smoothed with a 1 2 1 filter and resampled to 2.5 mm; stored as uint8 with scale 8 and offset 100, so everything below 100 HU, skin and soft tissue included, reads 100 HU; the patient coordinates in the header follow the cut |

- Redwood: S. Choi, Q. Zhou, S. Miller, V. Koltun, "A Large Dataset of Object Scans", [arXiv:1602.02481](https://arxiv.org/abs/1602.02481), 2016.
- TotalSegmentator: J. Wasserthal et al., "TotalSegmentator: Robust Segmentation of 104 Anatomic Structures in CT Images", Radiology: Artificial Intelligence, 2023, [DOI 10.1148/ryai.230024](https://doi.org/10.1148/ryai.230024).
