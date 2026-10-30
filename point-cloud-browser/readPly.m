function xyz = readPly(file)
fid = fopen(file, "r");
if fid < 0
    error("readPly:open", "Cannot open %s.", file)
end
closeFile = onCleanup(@() fclose(fid));
head = fread(fid, [1 65536], "*uint8");
marker = strfind(char(head), "end_header");
if ~startsWith(char(head), "ply") || isempty(marker)
    error("readPly:format", "%s is not a PLY file with a header under 64 KB.", file)
end
start = marker(1) + find(head(marker(1):end) == 10, 1) - 1;
format = "";
elements = strings(0);
count = 0;
names = strings(0);
types = strings(0);
for line = splitlines(string(char(head(1:marker(1) - 1))))'
    words = split(strtrim(line));
    switch words(1)
        case "format"
            format = words(2);
        case "element"
            elements(end + 1) = words(2);
            if words(2) == "vertex"
                count = str2double(words(3));
            end
        case "property"
            if elements(end) == "vertex"
                types(end + 1) = words(2);
                names(end + 1) = words(end);
            end
    end
end
if ~ismember(format, ["binary_little_endian" "binary_big_endian"])
    error("readPly:format", "Only binary PLY is read, %s is %s.", file, format)
end
if isempty(elements) || elements(1) ~= "vertex" || any(types == "list")
    error("readPly:format", "The vertex element must come first and hold no lists.")
end
[sizes, classes] = arrayfun(@typeOf, types);
offsets = cumsum([0 sizes(1:end - 1)]);
stride = sum(sizes);
fseek(fid, 0, "eof");
if count * stride > ftell(fid) - start
    error("readPly:size", "The header declares more vertices than %s holds.", file)
end
fseek(fid, start, "bof");
raw = fread(fid, [stride count], "*uint8");
xyz = zeros(count, 3, "single");
axes = ["x" "y" "z"];
for k = 1:3
    i = find(names == axes(k), 1);
    column = typecast(reshape(raw(offsets(i) + (1:sizes(i)), :), [], 1), classes(i));
    if format == "binary_big_endian"
        column = swapbytes(column);
    end
    xyz(:, k) = single(column);
end
end

function [bytes, class] = typeOf(type)
switch type
    case {"char" "int8"}
        bytes = 1; class = "int8";
    case {"uchar" "uint8"}
        bytes = 1; class = "uint8";
    case {"short" "int16"}
        bytes = 2; class = "int16";
    case {"ushort" "uint16"}
        bytes = 2; class = "uint16";
    case {"int" "int32"}
        bytes = 4; class = "int32";
    case {"uint" "uint32"}
        bytes = 4; class = "uint32";
    case {"float" "float32"}
        bytes = 4; class = "single";
    case {"double" "float64"}
        bytes = 8; class = "double";
    otherwise
        error("readPly:format", "Unknown property type %s.", type)
end
end
