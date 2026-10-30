function appendColumns(folder, columns)
for name = string(fieldnames(columns))'
    fid = fopen(fullfile(folder, name + ".bin"), "a");
    fwrite(fid, columns.(name), class(columns.(name)), 0, "l");
    fclose(fid);
end
end
