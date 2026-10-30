function tests = labTests()
names = ["Glucose" "Hemoglobin" "Potassium" "Sodium" "Creatinine" "Cholesterol" "ALT" "TSH" "CRP" "WBC" "Platelets" "HbA1c"];
units = ["mg/dL" "g/dL" "mmol/L" "mmol/L" "mg/dL" "mg/dL" "U/L" "mIU/L" "mg/L" "10^3/uL" "10^3/uL" "%"];
means = [90 14 4.3 140 0.95 180 28 2.2 3 7 250 5.4];
spreads = [15 1.8 0.5 3 0.3 35 15 1.2 5 2 60 0.6];
lows = [70 12 3.5 136 0.6 125 7 0.4 0 4.5 150 4];
highs = [99 17.5 5.1 145 1.2 200 56 4 5 11 400 5.6];
decimals = [0 1 1 0 2 0 0 2 1 1 0 1];
tests = struct(name=num2cell(names), unit=num2cell(units), mean=num2cell(means), spread=num2cell(spreads), ...
    low=num2cell(lows), high=num2cell(highs), decimals=num2cell(decimals));
end
