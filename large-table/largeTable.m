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
expected = "";

    function onEvent(~, event)
        switch event.HTMLEventName
            case "query"
                cancel(job);
                served = served + 1;
                expected = "v" + served;
                queue = parallel.pool.DataQueue;
                afterEach(queue, @announce);
                job = parfeval(backgroundPool, @query, 1, event.HTMLEventData, site, expected, queue);
                afterEach(job, @deliver, 0, PassFuture=true);
            case {"shown" "done"}
                disp(event.HTMLEventData)
        end
    end

    function announce(table)
        if ~isvalid(html) || table.prefix ~= expected
            return
        end
        tidy(table.prefix);
        sendEventToHTMLSource(html, "table", table);
    end

    function deliver(future)
        if ~isvalid(html) || future.ID ~= job.ID
            return
        end
        if isempty(future.Error)
            tidy(expected);
            sendEventToHTMLSource(html, "complete", fetchOutputs(future));
        else
            sendEventToHTMLSource(html, "failed", future.Error.message);
        end
    end

    function tidy(current)
        stale = dir(fullfile(site, "*.bin"));
        stale = stale(~startsWith({stale.name}, current + "-"));
        arrayfun(@(file) delete(fullfile(file.folder, file.name)), stale);
    end
end

function table = query(request, folder, prefix, queue)
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
        [~, alphabetical] = sort(string({tests.name}));
        position = zeros(1, numel(tests), "uint8");
        position(alphabetical) = 1:numel(tests);
        key = position(key);
    end
    [~, order] = sort(key, request.direction);
    rows = rows(order);
end
selected = toc(started);
blockRows = 65536;
names = string(fieldnames(columns))';
writeBlocks(columns, rows(1:min(blockRows, end)), folder, prefix, blockRows);
table = struct(prefix=char(prefix), rows=numel(rows), total=request.rows, blockRows=blockRows, blocks=ceil(numel(rows) / blockRows), ...
    columns=struct(name=cellstr(names), type=cellfun(@(name) class(columns.(name)), cellstr(names), UniformOutput=false)), ...
    tests=tests, complete=false, seconds=struct(prepared=prepared, selected=selected - prepared, first=toc(started) - selected, written=0));
send(queue, table);
writeBlocks(columns, rows, folder, prefix, blockRows, 2);
table.complete = true;
table.seconds.written = toc(started) - selected;
end
