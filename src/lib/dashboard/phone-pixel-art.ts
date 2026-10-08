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
  const rectangles: string[] = [];
  for (let y = 0; y < rows; y++) {
    const sourceY = Math.floor(y * artwork.height / rows);
    const colorAt = (x: number) => source[sourceY * artwork.width + Math.floor(x * artwork.width / columns)];
    for (let x = 0; x < columns;) {
      const color = colorAt(x);
      let end = x + 1;
      while (end < columns && colorAt(end) === color) end++;
      if (color) rectangles.push(`<rect x="${x * 2}" y="${y * 2}" width="${(end - x) * 2}" height="2" fill="${artwork.palette[color]}"/>`);
      x = end;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * 2}" height="${rows * 2}" viewBox="0 0 ${columns * 2} ${rows * 2}" shape-rendering="crispEdges">${rectangles.join("")}</svg>`;
}

export function svgImageUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
