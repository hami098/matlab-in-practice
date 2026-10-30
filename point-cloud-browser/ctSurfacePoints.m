function xyz = ctSurfacePoints(volume, spacing, threshold)
inside = false(size(volume) + 2);
inside(2:end - 1, 2:end - 1, 2:end - 1) = volume >= threshold;
index = find(inside);
interior = true(size(index));
for step = [1 size(inside, 1) size(inside, 1) * size(inside, 2)]
    interior = interior & inside(index - step) & inside(index + step);
end
[i, j, k] = ind2sub(size(inside), index(~interior));
xyz = single([i j k] - 2) .* single(spacing);
end
