function largeTable()
here = fileparts(mfilename("fullpath"));
site = tempname;
copyfile(fullfile(here, "page"), site);
catalog = labCatalog();
fig = uifigure(Name="large-table", Position=[60 60 1440 820]);
html = uihtml(uigridlayout(fig, [1 1], Padding=0), HTMLSource=fullfile(site, "index.html"));
html.HTMLEventReceivedFcn = @onEvent;
fig.DeleteFcn = @(~, ~) shutDown();
job = parallel.FevalFuture.empty;
producer = parallel.FevalFuture.empty;
served = 0;
live = true;
rate = 1000;
appended = 0;
feeding = "";
recent = {};
current = struct(prefix="", request=[], store="", snapshot=Inf, chunks=0, waiting=0, shown=false);

    function onEvent(~, event)
        switch event.HTMLEventName
            case "query"
                ask(event.HTMLEventData);
            case "live"
                live = logical(event.HTMLEventData);
                feed();
            case {"shown" "done"}
                disp(event.HTMLEventData)
        end
    end

    function ask(request)
        cancel(job);
        served = served + 1;
        current = struct(prefix="v" + served, request=request, store=fullfile(site, "rows-" + request.rows), ...
            snapshot=Inf, chunks=0, waiting=0, shown=false);
        queue = parallel.pool.DataQueue;
        afterEach(queue, @announce);
        job = parfeval(backgroundPool, @query, 1, request, current.store, site, char(current.prefix), queue, catalog);
        afterEach(job, @deliver, 0, PassFuture=true);
    end

    function announce(table)
        if ~isvalid(html) || table.prefix ~= current.prefix
            return
        end
        current.snapshot = table.snapshot;
        current.shown = true;
        tidy(current.prefix);
        sendEventToHTMLSource(html, "table", table);
        cellfun(@take, recent);
    end

    function deliver(future)
        if ~isvalid(html) || future.ID ~= job.ID
            return
        end
        if ~isempty(future.Error)
            sendEventToHTMLSource(html, "failed", future.Error.message);
            return
        end
        tidy(current.prefix);
        sendEventToHTMLSource(html, "complete", fetchOutputs(future));
        if feeding ~= current.store
            appended = current.snapshot;
        end
        feed();
    end

    function feed()
        if live && feeding == current.store && producer.State == "running"
            return
        end
        cancel(producer);
        feeding = "";
        if ~live || ~current.shown
            return
        end
        stream = parallel.pool.DataQueue;
        afterEach(stream, @arrived);
        feeding = current.store;
        producer = parfeval(backgroundPool, @produce, 0, current.store, catalog, rate, stream);
    end

    function arrived(rows)
        batch = struct(first=appended + 1, rows=rows);
        appended = appended + numel(rows.patient);
        recent = [recent(max(1, end - 39):end) {batch}];
        if current.shown
            take(batch);
        end
    end

    function take(batch)
        if ~isvalid(html) || batch.first <= current.snapshot
            return
        end
        current.snapshot = batch.first + numel(batch.rows.patient) - 1;
        keep = filterRows(batch.rows, current.request.filters);
        if ~any(keep)
            return
        end
        if current.request.sort == ""
            current.chunks = current.chunks + 1;
            name = current.prefix + "-h" + current.chunks;
            writeBlocks(batch.rows, uint32(flip(find(keep))), site, name, nnz(keep));
            sendEventToHTMLSource(html, "head", struct(file=char(name + "-0.bin"), count=nnz(keep)));
        else
            current.waiting = current.waiting + nnz(keep);
            sendEventToHTMLSource(html, "waiting", current.waiting);
        end
    end

    function tidy(prefix)
        stale = dir(fullfile(site, "*.bin"));
        stale = stale(~startsWith({stale.name}, prefix + "-"));
        arrayfun(@(file) delete(fullfile(file.folder, file.name)), stale);
    end

    function shutDown()
        cancel(job);
        cancel(producer);
        rmdir(site, "s");
    end
end

function table = query(request, store, folder, prefix, queue, catalog)
started = tic;
template = labResults(0, catalog, 0, 0);
if ~isfolder(store)
    building = store + "-" + prefix;
    mkdir(building);
    rng(request.rows);
    appendColumns(building, labResults(request.rows, catalog, newestMinute(), 2 * 365 * 24 * 60));
    movefile(building, store);
end
columns = readColumns(store, template);
prepared = toc(started);
keep = filterRows(columns, request.filters);
if request.sort == ""
    rows = uint32(flip(find(keep)));
else
    rows = uint32(find(keep));
    [~, order] = sort(columns.(request.sort)(rows), request.direction);
    rows = rows(order);
end
selected = toc(started);
blockRows = 65536;
names = string(fieldnames(columns))';
writeBlocks(columns, rows(1:min(blockRows, end)), folder, prefix, blockRows);
table = struct(prefix=prefix, rows=numel(rows), total=numel(columns.patient), snapshot=numel(columns.patient), ...
    blockRows=blockRows, blocks=ceil(numel(rows) / blockRows), ...
    columns=struct(name=cellstr(names), type=cellfun(@(name) class(columns.(name)), cellstr(names), UniformOutput=false)), ...
    tests=catalog.tests, categories=catalog.categories, complete=false, ...
    seconds=struct(prepared=prepared, selected=selected - prepared, first=toc(started) - selected, written=0));
send(queue, table);
writeBlocks(columns, rows, folder, prefix, blockRows, 2);
table.complete = true;
table.seconds.written = toc(started) - selected;
end

function produce(store, catalog, rate, stream)
while true
    pause(0.5);
    rows = labResults(round(rate / 2), catalog, newestMinute(), 0);
    appendColumns(store, rows);
    send(stream, rows);
end
end

function minute = newestMinute()
minute = floor(minutes(datetime("now", TimeZone="UTC") - datetime(2025, 1, 1, TimeZone="UTC")));
end
