import { DEFAULT_AVATAR_SPEC, renderAvatarSvg, resolveAvatarSpec } from "@/lib/avatar";
import { EMPTY_PIXELS, setPixel } from "@/lib/avatar-palette/pixels";

test("palette preview uses integer grid rectangles above the approved avatar", () => {
  const pixels = setPixel(EMPTY_PIXELS, 9, 12, 7);
  const base = renderAvatarSvg(DEFAULT_AVATAR_SPEC, 128);
  const preview = renderAvatarSvg(DEFAULT_AVATAR_SPEC, 128, [{ slot: "hair", pixels }]);
  expect(preview).toBe(base.replace(
    "</svg>", '<rect x="9" y="12" width="1" height="1" fill="#d97757"/></svg>',
  ));
});

test("a local palette preview cannot inject SVG or persist shared IDs in the avatar recipe", () => {
  const base = renderAvatarSvg(DEFAULT_AVATAR_SPEC, 128);
  expect(renderAvatarSvg(DEFAULT_AVATAR_SPEC, 128, [
    { slot: "hair", pixels: '<script>alert(1)</script>' },
  ])).toBe(base);
  expect(resolveAvatarSpec({ ...DEFAULT_AVATAR_SPEC, sharedAssets: { hair: "arbitrary" } }))
    .toEqual(resolveAvatarSpec(DEFAULT_AVATAR_SPEC));
});
