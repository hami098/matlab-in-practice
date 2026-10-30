#!/bin/sh
matches="$(grep -E -i '(^|/)(secrets/|\.sops\.ya?ml$|[^/]*\.sops\.[^/]+$|\.env$|\.env\.[^/]+$|[^/]*\.(dec|pem|key|p12|pfx|agekey|age|tfstate|tfvars)$|id_(rsa|ecdsa|ed25519)[^/]*$|[^/]*\.(ply|pcd|las|laz|e57|xyz|pts|obj|stl|step|stp|x_t|dcm|dicom|nii|nrrd|mha|mhd|raw|tif|tiff|mat|bin|npy|npz|h5|hdf5|csv|zip|gz|7z|rar|tar|xz|zst)$|^local\.json$)' \
  | grep -v -E '(^|/)\.env\.example$')"
[ -z "$matches" ] && exit 0
printf '%s\n' "$matches"
exit 1
