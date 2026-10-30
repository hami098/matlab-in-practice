function blocks = writeBlocks(columns, rows, folder, prefix, blockRows, first)
arguments
    columns
    rows
    folder
    prefix
    blockRows
    first = 1
end
names = string(fieldnames(columns))';
blocks = ceil(numel(rows) / blockRows);
for block = first:blocks
    picked = rows((block - 1) * blockRows + 1:min(block * blockRows, numel(rows)));
    fid = fopen(fullfile(folder, prefix + "-" + (block - 1) + ".bin"), "w");
    for name = names
        fwrite(fid, columns.(name)(picked), class(columns.(name)), 0, "l");
    end
    fclose(fid);
end
end
