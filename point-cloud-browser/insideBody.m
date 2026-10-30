function keep = insideBody(volume, spacing, level, ijk)
step = max(1, round(4.5 ./ spacing));
body = volume(1:step(1):end, 1:step(2):end, 1:step(3):end) > level;
body = widen(~widen(~body));
cell = min(round((ijk - 1) ./ step) + 1, size(body));
keep = body(sub2ind(size(body), cell(:, 1), cell(:, 2), cell(:, 3)));
end

function out = widen(mask)
out = mask;
out(2:end, :, :) = out(2:end, :, :) | mask(1:end - 1, :, :);
out(1:end - 1, :, :) = out(1:end - 1, :, :) | mask(2:end, :, :);
mask = out;
out(:, 2:end, :) = out(:, 2:end, :) | mask(:, 1:end - 1, :);
out(:, 1:end - 1, :) = out(:, 1:end - 1, :) | mask(:, 2:end, :);
mask = out;
out(:, :, 2:end) = out(:, :, 2:end) | mask(:, :, 1:end - 1);
out(:, :, 1:end - 1) = out(:, :, 1:end - 1) | mask(:, :, 2:end);
end
