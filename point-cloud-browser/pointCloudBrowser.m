function pointCloudBrowser()
here = fileparts(mfilename("fullpath"));
samples = findSamples(fileparts(here));
site = tempname;
copyfile(fullfile(here, "page"), site);
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

function samples = findSamples(root)
samples = struct(id={}, name={}, kind={}, source={}, megabytes={}, count={}, file={});
for count = [1e6 1e7 5e7]
    samples(end + 1) = struct(id=numel(samples) + 1, name=sprintf("torus %dM", count / 1e6), kind="synthetic", ...
        source="generated", megabytes=12 * count / 1e6, count=count, file="");
end
files = [dir(fullfile(root, "demo-data", "*.ply")); dir(fullfile(root, "demo-data", "*.nii"))
    dir(fullfile(root, "cache", "redwood", "*.ply")); dir(fullfile(root, "cache", "totalsegmentator-small", "*", "ct.nii"))];
for f = files'
    [~, subject] = fileparts(f.folder);
    name = extractBefore(string(f.name), ".");
    if f.name == "ct.nii"
        name = string(subject);
    end
    kind = "ct";
    if endsWith(f.name, ".ply")
        kind = "scan";
    end
    source = "cache";
    if contains(f.folder, "demo-data")
        source = "demo";
    end
    samples(end + 1) = struct(id=numel(samples) + 1, name=name, kind=kind, source=source, ...
        megabytes=f.bytes / 1e6, count=NaN, file=string(fullfile(f.folder, f.name)));
end
end

function info = prepare(sample, folder, name)
started = tic;
switch sample.kind
    case "scan"
        xyz = readPly(sample.file);
    case "ct"
        [volume, spacing, slope, intercept] = readNifti(sample.file);
        xyz = ctSurfacePoints(volume, spacing, (300 - intercept) / slope);
    case "synthetic"
        xyz = syntheticCloud(sample.count);
end
low = min(xyz, [], 1);
high = max(xyz, [], 1);
quantized = uint16((xyz - low) .* (65535 ./ max(high - low, eps("single"))));
whole = 64 * floor(size(quantized, 1) / 64);
ordered = permute(reshape(quantized(1:whole, :), 64, [], 3), [3 2 1]);
urls = strings(1, 4);
counts = zeros(1, 4);
for k = 1:4
    block = reshape(ordered(:, :, 16 * k - 15:16 * k), 3, []);
    if k == 4
        block = [block quantized(whole + 1:end, :).'];
    end
    urls(k) = name + "-" + k + ".bin";
    fid = fopen(fullfile(folder, urls(k)), "w");
    fwrite(fid, block, "uint16", 0, "l");
    fclose(fid);
    counts(k) = size(block, 2);
end
info = struct(name=sample.name, urls=urls, counts=counts, count=size(xyz, 1), low=low, high=high, seconds=toc(started));
end
