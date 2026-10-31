function pointCloudBrowser()
here = fileparts(mfilename("fullpath"));
site = tempname;
copyfile(fullfile(here, "page"), site);
samples = findSamples(fileparts(here), site);
fig = uifigure(Name="point-cloud-browser", Position=[100 100 1200 700]);
html = uihtml(uigridlayout(fig, [1 1], Padding=0), HTMLSource=fullfile(site, "index.html"));
html.HTMLEventReceivedFcn = @onEvent;
fig.DeleteFcn = @(~, ~) rmdir(site, "s");
job = parallel.FevalFuture.empty;
served = 0;

    function onEvent(~, event)
        switch event.HTMLEventName
            case "ready"
                sendEventToHTMLSource(html, "samples", rmfield(samples, "file"));
            case "select"
                cancel(job);
                delete(fullfile(site, "*.bin"));
                served = served + 1;
                job = parfeval(backgroundPool, @prepare, 1, samples(event.HTMLEventData), site, "points-" + served);
                afterEach(job, @deliver, 0, PassFuture=true);
            case "shown"
                disp(event.HTMLEventData)
        end
    end

    function deliver(future)
        if ~isvalid(html) || future.ID ~= job.ID
            return
        end
        if isempty(future.Error)
            sendEventToHTMLSource(html, "points", fetchOutputs(future));
        else
            sendEventToHTMLSource(html, "failed", future.Error.message);
        end
    end
end

function samples = findSamples(root, site)
files = [dir(fullfile(root, "demo-data", "*.ply")); dir(fullfile(root, "demo-data", "*.nii.gz")); dir(fullfile(root, "cache", "head-ct", "ct.nii"))
    dir(fullfile(root, "cache", "totalsegmentator-small", "*", "ct.nii")); dir(fullfile(root, "cache", "redwood", "*.ply"))]';
folders = string({files.folder});
fileNames = string({files.name});
[~, subjects] = fileparts(folders);
names = extractBefore(fileNames, ".");
names(fileNames == "ct.nii") = subjects(fileNames == "ct.nii");
kinds = repmat("ct", size(names));
kinds(endsWith(fileNames, ".ply")) = "scan";
sources = repmat("cache", size(names));
sources(contains(folders, "demo-data")) = "demo";
paths = fullfile(folders, fileNames);
packed = endsWith(paths, ".gz");
if any(packed)
    paths(packed) = string(gunzip(cellstr(paths(packed)), site));
end
generated = [1e6 1e7 5e7];
names = [compose("torus %dM", generated / 1e6) names];
samples = struct(id=num2cell(1:numel(names)), name=cellstr(names), ...
    kind=cellstr([repmat("synthetic", 1, 3) kinds]), source=cellstr([repmat("generated", 1, 3) sources]), ...
    megabytes=num2cell([12 * generated / 1e6, [files.bytes] / 1e6]), count=num2cell([generated NaN(size(files))]), ...
    file=num2cell([strings(1, 3) paths]));
end

function info = prepare(sample, folder, name)
started = tic;
switch sample.kind
    case "scan"
        info = writePoints(readPly(sample.file), folder, name);
    case "ct"
        [volume, spacing, slope, intercept, world] = readNifti(sample.file);
        [xyz, normal, density] = ctSurfacePoints(volume, spacing, (300 - intercept) / slope, (-400 - intercept) / slope);
        space = '';
        voxel = spacing;
        if ~isempty(world)
            rotation = world(:, 1:3) ./ spacing;
            xyz = xyz * rotation' + world(:, 4)';
            normal = normal * rotation';
            voxel = spacing * abs(rotation)';
            space = 'RAS';
        end
        info = writePoints(xyz, folder, name, normal, density * slope + intercept);
        info.space = space;
        info.voxel = voxel;
        info.unit = 'mm';
    case "synthetic"
        info = writePoints(syntheticCloud(sample.count), folder, name);
end
info.name = char(sample.name);
info.seconds = toc(started);
end
