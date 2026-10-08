import artwork from "../phone-frame-cells.json";
import { fitPhoneArtwork } from "../phone-frame";
import { phoneFrameSvg } from "../phone-pixel-art";
import { phoneWallpaperSvg } from "../phone-wallpaper";

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

test("the full size drawing reproduces every approved logical cell run", () => {
  const svg = phoneFrameSvg(460, 816);
  const rectangles = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="2" fill="(#[\da-f]+)"\/>/g)];
  expect(rectangles).toHaveLength(artwork.rows.reduce((total, row) => total + row.length, 0));
  let index = 0;
  artwork.rows.forEach((runs, y) => runs.forEach(([x, length, color]) => {
    const actual = rectangles[index++];
    expect(actual.slice(1)).toEqual([String(x * 2), String(y * 2), String(length * 2), artwork.palette[color]]);
  }));
});
