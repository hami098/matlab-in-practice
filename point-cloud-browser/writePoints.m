function info = writePoints(xyz, folder, name, normal, value)
arguments
    xyz
    folder
    name
    normal = zeros(0, 3, "single")
    value = zeros(0, 1, "single")
end
low = min(xyz, [], 1);
high = max(xyz, [], 1);
words = uint16((xyz - low) .* (65535 ./ max(high - low, eps("single"))));
values = zeros(1, 0);
if ~isempty(normal)
    sorted = sort(value);
    values = double([sorted(1) sorted(ceil(0.99 * end))]);
    level = uint8((value - values(1)) .* (255 / max(values(2) - values(1), eps)));
    bytes = [reshape(typecast(reshape(int8(127 * normal), [], 1), "uint8"), [], 3) level];
    words = [words reshape(typecast(reshape(bytes.', [], 1), "uint16"), 2, []).'];
    if mod(size(words, 1), 2)
        words(end + 1, :) = words(end, :);
    end
end
stride = size(words, 2);
whole = 64 * floor(size(words, 1) / 64);
ordered = permute(reshape(words(1:whole, :), 64, [], stride), [3 2 1]);
urls = name + "-" + (1:4) + ".bin";
counts = whole / 4 * [1 1 1 1] + [0 0 0 size(words, 1) - whole];
for k = 1:4
    fid = fopen(fullfile(folder, urls(k)), "w");
    fwrite(fid, pairUp(ordered(:, :, 16 * k - 15:16 * k)), "uint16", 0, "l");
    if k == 4
        fwrite(fid, pairUp(words(whole + 1:end, :).'), "uint16", 0, "l");
    end
    fclose(fid);
end
info = struct(urls=urls, counts=counts, count=size(words, 1), low=low, high=high, stride=stride, values=values);
end

function words = pairUp(words)
if size(words, 1) == 5
    pairs = reshape(words, 5, 2, []);
    words = [reshape(pairs(1:3, :, :), 6, []); reshape(pairs(4:5, :, :), 4, [])];
end
end
