function [volume, spacing, slope, intercept, world] = readNifti(file)
info = dir(file);
machine = "l";
fid = fopen(file, "r", machine);
if fid < 0
    error("readNifti:open", "Cannot open %s.", file)
end
if fread(fid, 1, "int32") ~= 348
    fclose(fid);
    machine = "b";
    fid = fopen(file, "r", machine);
end
closeFile = onCleanup(@() fclose(fid));
fseek(fid, 40, "bof");
dims = fread(fid, 8, "int16")';
fseek(fid, 70, "bof");
type = fread(fid, 1, "int16");
fseek(fid, 76, "bof");
pixdim = fread(fid, 8, "single")';
offset = fread(fid, 1, "single");
slope = fread(fid, 1, "single");
intercept = fread(fid, 1, "single");
fseek(fid, 254, "bof");
code = fread(fid, 1, "int16");
fseek(fid, 280, "bof");
world = fread(fid, [4 3], "single")';
if code <= 0
    world = zeros(3, 0);
end
fseek(fid, 344, "bof");
if ~startsWith(string(fread(fid, [1 4], "*char")), "n+1")
    error("readNifti:format", "%s is not a single file NIfTI-1 image.", file)
end
[bytes, class] = typeOf(type);
shape = dims(2:4);
if dims(1) < 3 || prod(shape) * bytes > info.bytes - offset
    error("readNifti:size", "The header of %s does not match its size.", file)
end
fseek(fid, offset, "bof");
volume = reshape(fread(fid, prod(shape), "*" + class), shape);
if slope == 0
    slope = 1;
    intercept = 0;
end
spacing = pixdim(2:4);
end

function [bytes, class] = typeOf(type)
switch type
    case 2
        bytes = 1; class = "uint8";
    case 4
        bytes = 2; class = "int16";
    case 8
        bytes = 4; class = "int32";
    case 16
        bytes = 4; class = "single";
    case 64
        bytes = 8; class = "double";
    case 256
        bytes = 1; class = "int8";
    case 512
        bytes = 2; class = "uint16";
    otherwise
        error("readNifti:format", "Unsupported data type %d.", type)
end
end
