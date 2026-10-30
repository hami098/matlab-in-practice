function info = writePoints(xyz, folder, name)
low = min(xyz, [], 1);
high = max(xyz, [], 1);
quantized = uint16((xyz - low) .* (65535 ./ max(high - low, eps("single"))));
whole = 64 * floor(size(quantized, 1) / 64);
ordered = permute(reshape(quantized(1:whole, :), 64, [], 3), [3 2 1]);
urls = name + "-" + (1:4) + ".bin";
counts = whole / 4 * [1 1 1 1] + [0 0 0 size(quantized, 1) - whole];
for k = 1:4
    fid = fopen(fullfile(folder, urls(k)), "w");
    fwrite(fid, ordered(:, :, 16 * k - 15:16 * k), "uint16", 0, "l");
    if k == 4
        fwrite(fid, quantized(whole + 1:end, :).', "uint16", 0, "l");
    end
    fclose(fid);
end
info = struct(urls=urls, counts=counts, count=size(xyz, 1), low=low, high=high);
end
