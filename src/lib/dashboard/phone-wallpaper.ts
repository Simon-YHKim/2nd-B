import { phoneIos } from "../theme/phone-ios";

/** The home handset's cyan/violet constellation, extended behind live apps.
 * Coordinates are cells: each emitted edge is a multiple of two layout px. */
export function phoneWallpaperSvg(width: number, height: number): string {
  const w = Math.max(1, Math.floor(width / 2));
  const h = Math.max(1, Math.floor(height / 2));
  const [night, dim, line, blue, cyan, bright, violet] = phoneIos.wallpaper;
  const marks: string[] = [];
  const rect = (x: number, y: number, rw: number, rh: number, fill: string) => {
    marks.push(`<rect x="${Math.round(x) * 2}" y="${Math.round(y) * 2}" width="${rw * 2}" height="${rh * 2}" fill="${fill}"/>`);
  };
  rect(0, 0, w, h, night);
  const point = (x: number, y: number) => [Math.round(x * w), Math.round(y * h)] as const;
  const link = (a: readonly number[], b: readonly number[]) => {
    const length = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    for (let i = 0; i <= length; i++) rect(a[0] + (b[0] - a[0]) * i / length, a[1] + (b[1] - a[1]) * i / length, 1, 1, line);
  };
  const stars = [point(.24, .21), point(.65, .40), point(.87, .62), point(.16, .48)];
  link(stars[3], stars[0]); link(stars[0], stars[1]); link(stars[1], stars[2]);
  [[.11,.07],[.52,.08],[.81,.05],[.34,.14],[.06,.2],[.5,.24],[.69,.24],[.72,.32],[.91,.32],
    [.06,.44],[.42,.53],[.72,.72],[.07,.62],[.29,.59],[.57,.61],[.94,.54],[.97,.72],[.2,.79],
    [.39,.87],[.79,.9],[.52,.94]].forEach(([x, y], i) => { const p = point(x, y); rect(p[0], p[1], 1, 1, i % 3 ? blue : dim); });
  const star = (p: readonly number[], radius: number, glow: string) => {
    rect(p[0] - radius, p[1], radius * 2 + 1, 1, glow);
    rect(p[0], p[1] - radius, 1, radius * 2 + 1, glow);
    rect(p[0] - 1, p[1] - 1, 3, 3, glow);
    rect(p[0], p[1], 1, 1, bright);
  };
  star(stars[0], 4, blue); star(stars[1], 5, cyan); star(stars[2], 2, cyan);
  star(stars[3], 2, blue); star(point(.81, .12), 4, violet);
  // The same low arcing horizon as the home asset, drawn cell by cell.
  for (let x = 0; x < w; x++) {
    const y = Math.round(h * (.68 + .16 * ((x - w / 2) / (w / 2)) ** 2));
    rect(x, y, 1, 1, line);
    if (x % 7 < 3) rect(x, y + 3, 1, 2, dim);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}" shape-rendering="crispEdges">${marks.join("")}</svg>`;
}
