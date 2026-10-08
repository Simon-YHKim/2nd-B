// Approved native artwork (Simon 2026-10-08). One cell is always 2 layout px.
// Responsive frames resample logical cells, never stretch a raster fractionally.
export const PHONE_ARTWORK_BOUNDS = {
  canvas: { width: 230, height: 408 },
  body: { left: 8, top: 2, right: 220, bottom: 406 },
  screen: { left: 28, top: 47, right: 202, bottom: 355 },
  home: { left: 94, top: 357, right: 136, bottom: 399 },
} as const;

export function fitPhoneArtwork(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const { canvas, screen, home } = PHONE_ARTWORK_BOUNDS;
  const scale = Math.min(width / canvas.width, height / canvas.height, 2);
  if (scale < 0.8) return null;
  const snap = (value: number) => Math.floor(value / 2) * 2;
  const artworkWidth = snap(canvas.width * scale);
  const artworkHeight = snap(canvas.height * scale);
  const imageLeft = snap((width - artworkWidth) / 2);
  const imageTop = snap((height - artworkHeight) / 2);
  // Use the same nearest-cell boundaries as phone-pixel-art's rasterizer.
  const x = (value: number) => Math.ceil(value * artworkWidth / canvas.width / 2) * 2;
  const y = (value: number) => Math.ceil(value * artworkHeight / canvas.height / 2) * 2;
  return {
    scale,
    artwork: { left: imageLeft, top: imageTop, width: artworkWidth, height: artworkHeight },
    screen: {
      left: imageLeft + x(screen.left),
      top: imageTop + y(screen.top),
      width: x(screen.right) - x(screen.left),
      height: y(screen.bottom) - y(screen.top),
    },
    homeButton: {
      left: imageLeft + x(home.left),
      top: imageTop + y(home.top),
      width: Math.max(44, x(home.right) - x(home.left)),
      height: Math.max(44, y(home.bottom) - y(home.top)),
    },
  };
}
