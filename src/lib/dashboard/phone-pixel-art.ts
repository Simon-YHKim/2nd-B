import artwork from "./phone-frame-cells.json";

// Lossless row runs from the approved SVG. Decoded once, outside React/native
// SVG nodes: expo-image paints the result as a single image on Android.
const source = new Uint8Array(artwork.width * artwork.height);
artwork.rows.forEach((runs, y) => runs.forEach(([x, length, color]) => {
  source.fill(color, y * artwork.width + x, y * artwork.width + x + length);
}));

export function phoneFrameSvg(width: number, height: number): string {
  const columns = Math.max(1, Math.floor(width / 2));
  const rows = Math.max(1, Math.floor(height / 2));
  type Run = { x: number; y: number; width: number; height: number; color: number };
  const rectangles: Run[] = [];
  let previous = new Map<string, Run>();
  for (let y = 0; y < rows; y++) {
    const next = new Map<string, Run>();
    const sourceY = Math.floor(y * artwork.height / rows);
    const colorAt = (x: number) => source[sourceY * artwork.width + Math.floor(x * artwork.width / columns)];
    for (let x = 0; x < columns;) {
      const color = colorAt(x);
      let end = x + 1;
      while (end < columns && colorAt(end) === color) end++;
      if (color) {
        const key = `${x}:${end - x}:${color}`;
        const preceding = previous.get(key);
        // Adjacent equal runs form one rectangle, losslessly. The full frame
        // becomes 541 rectangles instead of 6214 before the native decode.
        const run = preceding ?? { x: x * 2, y: y * 2, width: (end - x) * 2, height: 0, color };
        run.height += 2;
        if (!preceding) rectangles.push(run);
        next.set(key, run);
      }
      x = end;
    }
    previous = next;
  }
  const markup = rectangles.map(r => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${artwork.palette[r.color]}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * 2}" height="${rows * 2}" viewBox="0 0 ${columns * 2} ${rows * 2}" shape-rendering="crispEdges">${markup}</svg>`;
}

export function svgImageUri(svg: string): string {
  // expo-image's Android Base64DataFetcher treats every data: URI as base64.
  // Our generated SVG contains ASCII only; use a tiny encoder that also works
  // in Hermes without a DOM btoa or Node Buffer polyfill.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const chunks: string[] = [];
  for (let i = 0; i < svg.length; i += 3) {
    const a = svg.charCodeAt(i);
    const b = svg.charCodeAt(i + 1) || 0;
    const c = svg.charCodeAt(i + 2) || 0;
    chunks.push(alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)]
      + (i + 1 < svg.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=")
      + (i + 2 < svg.length ? alphabet[c & 63] : "="));
  }
  return `data:image/svg+xml;base64,${chunks.join("")}`;
}
