function downloadOpenData(sets)
arguments
    sets (1, :) string {mustBeMember(sets, ["redwood" "totalsegmentator" "head-ct"])} = ["redwood" "totalsegmentator" "head-ct"]
end
cache = fullfile(fileparts(fileparts(mfilename("fullpath"))), "cache");
if ismember("redwood", sets)
    redwood = fullfile(cache, "redwood");
    if ~isfolder(redwood)
        mkdir(redwood)
    end
    ids = string(jsondecode(webread("https://raw.githubusercontent.com/isl-org/redwood-3dscan/master/meshes.json")));
    for id = ids'
        target = fullfile(redwood, id + ".ply");
        if ~isfile(target)
            websave(target, "http://redwood-data.org/3dscan/data/mesh/" + id + ".ply");
        end
    end
end
if ismember("totalsegmentator", sets)
    ct = fullfile(cache, "totalsegmentator-small");
    if ~isfolder(ct)
        archive = fullfile(cache, "totalsegmentator-small.zip");
        websave(archive, "https://zenodo.org/api/records/10047263/files/Totalsegmentator_dataset_small_v201.zip/content");
        unzip(archive, ct);
        delete(archive);
    end
    for scan = dir(fullfile(ct, "*", "ct.nii.gz"))'
        gunzip(fullfile(scan.folder, scan.name));
        delete(fullfile(scan.folder, scan.name));
    end
end
if ismember("head-ct", sets)
    head = fullfile(cache, "head-ct");
    if ~isfolder(head)
        mkdir(head)
    end
    target = fullfile(head, "ct.nii");
    if ~isfile(target)
        partial = target + ".part";
        websave(partial, "https://zenodo.org/records/3374839/files/PhantomCT.nii?download=1");
        fid = fopen(partial, "r+", "l");
        fseek(fid, 112, "bof");
        fwrite(fid, [1 -1024], "single");
        fclose(fid);
        movefile(partial, target);
    end
end
end
