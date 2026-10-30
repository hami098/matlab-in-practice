function xyz = ctSurfacePoints(volume, spacing, threshold)
inside = volume >= threshold;
padded = false(size(inside) + 2);
padded(2:end - 1, 2:end - 1, 2:end - 1) = inside;
interior = padded(1:end - 2, 2:end - 1, 2:end - 1) & padded(3:end, 2:end - 1, 2:end - 1) ...
    & padded(2:end - 1, 1:end - 2, 2:end - 1) & padded(2:end - 1, 3:end, 2:end - 1) ...
    & padded(2:end - 1, 2:end - 1, 1:end - 2) & padded(2:end - 1, 2:end - 1, 3:end);
[i, j, k] = ind2sub(size(inside), find(inside & ~interior));
xyz = single([i j k] - 1) .* single(spacing);
end
