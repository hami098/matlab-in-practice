function columns = readColumns(folder, template)
names = string(fieldnames(template))';
bytes = arrayfun(@(name) numel(typecast(zeros(1, class(template.(name))), "uint8")), names);
stored = arrayfun(@(name) dir(fullfile(folder, name + ".bin")).bytes, names);
count = min(stored ./ bytes);
columns = template;
for name = names
    fid = fopen(fullfile(folder, name + ".bin"), "r");
    columns.(name) = fread(fid, count, "*" + class(template.(name)), 0, "l");
    fclose(fid);
end
end
