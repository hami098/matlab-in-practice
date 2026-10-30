function keep = filterRows(columns, filters)
keep = true(numel(columns.patient), 1);
for k = 1:numel(filters)
    data = columns.(filters(k).column);
    if filters(k).kind == "codes"
        allowed = false(256, 1);
        allowed(filters(k).codes + 1) = true;
        keep = keep & allowed(data + 1);
    else
        keep = keep & data >= filters(k).low & data <= filters(k).high;
    end
end
end
