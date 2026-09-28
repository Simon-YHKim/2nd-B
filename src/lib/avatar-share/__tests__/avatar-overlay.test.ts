import { DEFAULT_AVATAR_SPEC, renderAvatarSvg, resolveAvatarSpec } from "@/lib/avatar";
import { EMPTY_PIXELS, setPixel } from "@/lib/avatar-share/pixels";

const ID = "123e4567-e89b-42d3-a456-426614174000";

test("only bounded shared item IDs survive avatar-spec normalization", () => {
  const clean = resolveAvatarSpec({
    ...DEFAULT_AVATAR_SPEC,
    sharedAssets: {
      hair: ID,
      accessory: '<svg onload="x"/>',
      garment: "not-an-id",
      unknown: ID,
    },
  });
  expect(clean.sharedAssets).toEqual({ hair: ID });
  expect(resolveAvatarSpec({ ...DEFAULT_AVATAR_SPEC, sharedAssets: {} }).sharedAssets).toBeUndefined();
});

test("shared art renders as integer 64-grid palette rectangles above the approved base", () => {
  const pixels = setPixel(EMPTY_PIXELS, 9, 12, 7);
  const base = renderAvatarSvg(DEFAULT_AVATAR_SPEC, 128);
  const withArt = renderAvatarSvg(DEFAULT_AVATAR_SPEC, 128, [{ slot: "hair", pixels }]);
  expect(withArt).toBe(base.replace(
    "</svg>", '<rect x="9" y="12" width="1" height="1" fill="#d97757"/></svg>',
  ));
  expect(renderAvatarSvg(DEFAULT_AVATAR_SPEC, 128, [
    { slot: "hair", pixels: '<script>alert(1)</script>' },
  ])).toBe(base);
});
