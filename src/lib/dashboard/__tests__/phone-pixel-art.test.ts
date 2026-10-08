import artwork from "../phone-frame-cells.json";
import { fitPhoneArtwork } from "../phone-frame";
import { phoneFrameSvg, svgImageUri } from "../phone-pixel-art";
import { phoneWallpaperSvg } from "../phone-wallpaper";

test("SVG data is base64 for expo-image's Android loader, with lossless padding", () => {
  for (const svg of ["a", "ab", "abc", phoneFrameSvg(460, 816), phoneWallpaperSvg(348, 616)]) {
    expect(svgImageUri(svg)).toBe(`data:image/svg+xml;base64,${Buffer.from(svg, "ascii").toString("base64")}`);
  }
});

test.each([[460, 816], [425, 677], [320, 568]])("frame and wallpaper keep opaque 2px cells at %i by %i", (width, height) => {
  const frame = fitPhoneArtwork(width, height)!;
  for (const svg of [phoneFrameSvg(frame.artwork.width, frame.artwork.height), phoneWallpaperSvg(frame.screen.width, frame.screen.height)]) {
    const rectangles = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[\da-f]+)"\/>/g)];
    expect(rectangles.length).toBeGreaterThan(100);
    for (const [, x, y, w, h, color] of rectangles) {
      for (const value of [x, y, w, h]) expect(Number(value) % 2).toBe(0);
      expect(color).toMatch(/^#[\da-f]{6}$/);
    }
    expect(svg).not.toMatch(/opacity|gradient|filter|image /i);
  }
});

test("rectangle merging reproduces every approved logical cell with bounded decode cost", () => {
  const svg = phoneFrameSvg(460, 816);
  const rectangles = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[\da-f]+)"\/>/g)];
  expect(rectangles.length).toBeLessThan(600);
  const actual = new Uint8Array(230 * 408);
  for (const [, rx, ry, rw, rh, color] of rectangles) {
    const [x, y, width, height] = [rx, ry, rw, rh].map(value => Number(value) / 2);
    for (let row = y; row < y + height; row++) actual.fill(artwork.palette.indexOf(color), row * 230 + x, row * 230 + x + width);
  }
  const expected = new Uint8Array(230 * 408);
  artwork.rows.forEach((runs, y) => runs.forEach(([x, length, color]) => {
    expected.fill(color, y * 230 + x, y * 230 + x + length);
  }));
  expect(actual).toEqual(expected);
});
