import type { HustleKExpressionId } from "./hustlek";

// Source-space face framing measured from the approved 362px portraits. The
// square keeps hair, ears and chin intact while cropping the unused shirt area.
// All expressions use one scale; only the source's head anchor is normalized.
export const HUSTLEK_PORTRAIT_FRAME = { sourceSize: 362, cropSize: 280, topInset: 4 } as const;

// Opaque (alpha >= 128) head center/top, excluding the shirt below source y=275.
// Near-transparent export dust must not determine the portrait's visual anchor.
export const HUSTLEK_HEAD_ANCHORS: Record<HustleKExpressionId, readonly [number, number]> = {
  A01: [181.5, 13], A02: [181, 14], A03: [181, 13], A04: [181, 14],
  A05: [181.5, 13], A06: [181, 13], A07: [181, 13], A08: [181, 13],
  A09: [181.5, 13], A10: [181, 13], A11: [181, 13], A12: [181, 13],
  B01: [188, 11], B02: [187.5, 11], B03: [187.5, 11], B04: [187, 11],
  B05: [188, 10], B06: [187.5, 10], B07: [187.5, 10], B08: [187, 10],
  B09: [188, 8], B10: [187.5, 8], B11: [187.5, 8], B12: [187, 8],
  C01: [183.5, 12], C02: [182, 12], C03: [178.5, 12], C04: [175.5, 12],
  C05: [183.5, 11], C06: [182.5, 11], C07: [178.5, 11], C08: [175.5, 11],
  C09: [183.5, 9], C10: [182, 9], C11: [178.5, 9], C12: [175.5, 9],
  D01: [184.5, 23], D02: [178, 23], D03: [175, 23], D04: [172.5, 23],
  D05: [184.5, 16], D06: [178.5, 16], D07: [175, 16], D08: [172, 16],
  D09: [184.5, 10], D10: [178.5, 10], D11: [175, 10], D12: [171.5, 9],
};

/** Integer layout pixels avoid subpixel shimmer when the supplied face changes. */
export function hustlekPortraitLayout(size: number, expression: HustleKExpressionId = "A01") {
  const side = Number.isFinite(size) ? Math.max(1, Math.round(size)) : 48;
  const imageSide = Math.round(side * HUSTLEK_PORTRAIT_FRAME.sourceSize / HUSTLEK_PORTRAIT_FRAME.cropSize);
  const scale = imageSide / HUSTLEK_PORTRAIT_FRAME.sourceSize;
  const [centerX, top] = HUSTLEK_HEAD_ANCHORS[expression];
  return {
    frame: { width: side, height: side, overflow: "hidden" as const, flexShrink: 0 },
    image: {
      position: "absolute" as const, width: imageSide, height: imageSide,
      left: Math.round(side / 2 - centerX * scale),
      top: Math.round((HUSTLEK_PORTRAIT_FRAME.topInset - top) * scale),
    },
  };
}
