function info = writePoints(xyz, folder, name)
low = min(xyz, [], 1);
high = max(xyz, [], 1);
quantized = uint16((xyz - low) .* (65535 ./ max(high - low, eps("single"))));
whole = 64 * floor(size(quantized, 1) / 64);
ordered = permute(reshape(quantized(1:whole, :), 64, [], 3), [3 2 1]);
urls = strings(1, 4);
counts = zeros(1, 4);
for k = 1:4
    block = reshape(ordered(:, :, 16 * k - 15:16 * k), 3, []);
    if k == 4
        block = [block quantized(whole + 1:end, :).'];
    end
    urls(k) = name + "-" + k + ".bin";
    fid = fopen(fullfile(folder, urls(k)), "w");
    fwrite(fid, block, "uint16", 0, "l");
    fclose(fid);
    counts(k) = size(block, 2);
end
info = struct(urls=urls, counts=counts, count=size(xyz, 1), low=low, high=high);
end
