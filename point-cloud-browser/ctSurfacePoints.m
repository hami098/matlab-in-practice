function [xyz, normal, density] = ctSurfacePoints(volume, spacing, threshold, body)
inside = volume >= threshold;
index = find(inside);
shape = size(volume);
strides = [1 shape(1) shape(1) * shape(2)];
[i, j, k] = ind2sub(shape, index);
interior = i > 1 & i < shape(1) & j > 1 & j < shape(2) & k > 1 & k < shape(3);
for step = strides
    candidates = index(interior);
    interior(interior) = inside(candidates - step) & inside(candidates + step);
end
ijk = [i(~interior) j(~interior) k(~interior)];
ijk = ijk(insideBody(volume, spacing, body, ijk), :);
center = sub2ind(shape, ijk(:, 1), ijk(:, 2), ijk(:, 3));
value = single(volume(center));
rise = zeros(numel(center), 3, "single");
for d = 1:3
    up = min(ijk(:, d) + 1, shape(d)) - ijk(:, d);
    down = ijk(:, d) - max(ijk(:, d) - 1, 1);
    rise(:, d) = (single(volume(center + up * strides(d))) - single(volume(center - down * strides(d)))) ./ (single(up + down) * spacing(d));
end
steepness = sqrt(sum(rise .^ 2, 2));
normal = -rise ./ max(steepness, eps("single"));
offset = min(max((value - threshold) ./ max(steepness, eps("single")), 0), 0.5 * min(spacing)) .* normal;
xyz = single(ijk - 1) .* single(spacing) + offset;
toward = round(rise .* single(spacing) ./ max(abs(rise .* single(spacing)), [], 2));
toward(isnan(toward)) = 0;
inner = min(max(ijk + double(toward), 1), shape);
density = max(value, single(volume(sub2ind(shape, inner(:, 1), inner(:, 2), inner(:, 3)))));
end
