// PIXEL-CLAY v4 프리미티브 (이주 P4).
//
// 이것들은 **레거시 cosmic-pixel 스킨과 다른 물건이다.** 이름이 둘 다 "픽셀" 이라
// 세션마다 섞였다 - `docs/PIXEL-CLAY-MIGRATION.md` §1 의 세 이름 구분을 볼 것.
// `src/components/premium/PixelCorner.tsx` 는 그 레거시 쪽이고 `gameboy-tokens` 를
// 읽는다. 여기 것들은 `m3.*` 만 읽는다.
export { PixelSurface, type PixelSurfaceProps, type PixelSurfaceVariant } from "./PixelSurface";
export { PixelDither, PixelScrim, type PixelDitherProps } from "./PixelDither";
export { pixelPressTransform, pixelStateDensity, type DitherDensity } from "./press";
export { PixelPressable, type PixelPressableProps } from "./PixelPressable";
export { PixelGateShell, type PixelGateShellProps } from "./PixelGateShell";
