// Pixel bounds measured from the supplied 1086×1448 transparent phone PNG.
// Fitting the whole canvas would shrink the actual device behind its margins.
export const PHONE_ARTWORK_BOUNDS = {
  canvas: { width: 1086, height: 1448 },
  body: { left: 221, top: 137, right: 866, bottom: 1330 },
  screen: { left: 286, top: 270, right: 800, bottom: 1178 },
  home: { left: 472, top: 1190, right: 614, bottom: 1315 },
} as const;

export function fitPhoneArtwork(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const { canvas, body, screen, home } = PHONE_ARTWORK_BOUNDS;
  const scale = Math.min((width - 8) / (body.right - body.left), (height - 8) / (body.bottom - body.top));
  if (scale <= 0) return null;
  const imageLeft = (width - (body.right - body.left) * scale) / 2 - body.left * scale;
  const imageTop = (height - (body.bottom - body.top) * scale) / 2 - body.top * scale;
  return {
    scale,
    artwork: { left: imageLeft, top: imageTop, width: canvas.width * scale, height: canvas.height * scale },
    screen: {
      left: imageLeft + screen.left * scale,
      top: imageTop + screen.top * scale,
      width: (screen.right - screen.left) * scale,
      height: (screen.bottom - screen.top) * scale,
    },
    homeButton: {
      left: imageLeft + home.left * scale,
      top: imageTop + home.top * scale,
      width: (home.right - home.left) * scale,
      height: (home.bottom - home.top) * scale,
    },
  };
}
