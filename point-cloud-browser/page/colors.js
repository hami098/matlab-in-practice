const scales = {
  turbo: ["#30123b", "#4145ab", "#4675ed", "#39a2fc", "#1bcfd4", "#24eca6", "#61fc6c", "#a4fc3b", "#d1e834", "#f3c63a", "#fe9b2d", "#f36315", "#d93806", "#b11901", "#7a0402"],
  viridis: ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
  plasma: ["#0d0887", "#46039f", "#7201a8", "#9c179e", "#bd3786", "#d8576b", "#ed7953", "#fb9f3a", "#fdca26", "#f0f921"],
  cividis: ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8779", "#a69d75", "#c4b56c", "#e4cf5b", "#fee838"],
  jet: ["#00007f", "#0000ff", "#007fff", "#00ffff", "#7fff7f", "#ffff00", "#ff7f00", "#ff0000", "#7f0000"],
  gray: ["#3a3a3a", "#ffffff"]
};

function table(name) {
  const stops = scales[name].map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255));
  const out = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const position = i / 255 * (stops.length - 1);
    const low = Math.min(Math.floor(position), stops.length - 2);
    const t = position - low;
    for (let k = 0; k < 3; k++) out[i * 4 + k] = stops[low][k] * (1 - t) + stops[low + 1][k] * t;
    out[i * 4 + 3] = 1;
  }
  return out;
}

const gradient = name => `linear-gradient(to right, ${scales[name].join(", ")})`;
