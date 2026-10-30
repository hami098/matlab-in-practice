function largeTable()
here = fileparts(mfilename("fullpath"));
site = tempname;
copyfile(fullfile(here, "page"), site);
fig = uifigure(Name="large-table", Position=[100 100 1200 700]);
html = uihtml(uigridlayout(fig, [1 1], Padding=0), HTMLSource=fullfile(site, "index.html"));
html.HTMLEventReceivedFcn = @onEvent;
fig.DeleteFcn = @(~, ~) rmdir(site, "s");
job = parallel.FevalFuture.empty;
served = 0;
shown = "";

    function onEvent(~, event)
        switch event.HTMLEventName
            case "query"
                cancel(job);
                served = served + 1;
                job = parfeval(backgroundPool, @query, 1, event.HTMLEventData, site, "v" + served);
                afterEach(job, @deliver, 0, PassFuture=true);
            case "shown"
                disp(event.HTMLEventData)
        end
    end

    function deliver(future)
        if ~isvalid(html) || future.ID ~= job.ID
            return
        end
        if ~isempty(future.Error)
            sendEventToHTMLSource(html, "failed", future.Error.message);
            return
        end
        table = fetchOutputs(future);
        if shown ~= ""
            delete(fullfile(site, shown + "-*.bin"));
        end
        shown = table.prefix;
        sendEventToHTMLSource(html, "table", table);
    end
end

function table = query(request, folder, prefix)
started = tic;
tests = labTests();
master = fullfile(folder, "rows-" + request.rows + ".mat");
if isfile(master)
    columns = load(master);
else
    rng(request.rows);
    columns = labResults(request.rows, tests);
    save(master, "-struct", "columns", "-v6");
end
prepared = toc(started);
keep = true(request.rows, 1);
if request.test > 0
    keep = keep & columns.test == request.test;
end
switch request.flag
    case "abnormal"
        keep = keep & columns.flag > 0;
    case "low"
        keep = keep & columns.flag == 1;
    case "high"
        keep = keep & columns.flag == 2;
end
rows = uint32(find(keep));
if request.sort ~= ""
    key = columns.(request.sort)(rows);
    if request.sort == "test"
        [~, alphabetical] = sort([tests.name]);
        position(alphabetical) = 1:numel(tests);
        key = position(key);
    end
    [~, order] = sort(key, request.direction);
    rows = rows(order);
end
selected = toc(started);
names = string(fieldnames(columns))';
blocks = writeBlocks(columns, rows, folder, prefix, 65536);
table = struct(prefix=prefix, rows=numel(rows), total=request.rows, blockRows=65536, blocks=blocks, ...
    columns=struct(name=num2cell(names), type=cellfun(@(name) class(columns.(name)), cellstr(names), UniformOutput=false)), ...
    tests=tests, seconds=struct(prepared=prepared, selected=selected - prepared, written=toc(started) - selected));
end
