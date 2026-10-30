function xyz = syntheticCloud(count)
u = 2 * pi * rand(count, 1, "single");
v = 2 * pi * rand(count, 1, "single");
ring = 1 + 0.35 * cos(v);
xyz = [ring .* cos(u), ring .* sin(u), 0.35 * sin(v)];
end
