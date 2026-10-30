function blocks = writeBlocks(columns, rows, folder, prefix, blockRows)
names = string(fieldnames(columns))';
blocks = ceil(numel(rows) / blockRows);
for block = 1:blocks
    picked = rows((block - 1) * blockRows + 1:min(block * blockRows, numel(rows)));
    fid = fopen(fullfile(folder, prefix + "-" + (block - 1) + ".bin"), "w");
    for name = names
        fwrite(fid, columns.(name)(picked), class(columns.(name)), 0, "l");
    end
    fclose(fid);
end
end
