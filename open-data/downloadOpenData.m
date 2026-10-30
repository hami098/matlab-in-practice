function downloadOpenData()
cache = fullfile(fileparts(fileparts(mfilename("fullpath"))), "cache");
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
ct = fullfile(cache, "totalsegmentator-small");
if ~isfolder(ct)
    archive = fullfile(cache, "totalsegmentator-small.zip");
    websave(archive, "https://zenodo.org/api/records/10047263/files/Totalsegmentator_dataset_small_v201.zip/content");
    unzip(archive, ct);
    delete(archive);
end
end
