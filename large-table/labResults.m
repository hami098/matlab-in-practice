function columns = labResults(count, tests)
patients = max(1, round(count / 20));
ages = uint8(randi([18 95], patients, 1));
sexes = uint8(randi(2, patients, 1));
patient = uint32(randi(patients, count, 1));
test = uint8(randi(numel(tests), count, 1));
means = [tests.mean];
spreads = [tests.spread];
value = single(abs(means(test)' + spreads(test)' .* randn(count, 1)));
lows = [tests.low];
highs = [tests.high];
flag = uint8(value < lows(test)') + 2 * uint8(value > highs(test)');
columns = struct(patient=patient, time=int32(randi(2 * 365 * 24 * 60, count, 1)), value=value, ...
    test=test, flag=flag, age=ages(patient), sex=sexes(patient));
end
