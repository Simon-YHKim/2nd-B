import { cosmic, withAlpha } from "./tokens";
import { UI_MODE } from "../ui-mode";

// Pixel geometry differs by build: sharp corners + hard offset shadow (legacy)
// vs rounded + flat (deep-space). The cyan pivot moved colors; this moves SHAPE
// too, so the deep-space build reads as the smooth design, not retro pixel chrome.
const geometryCosmic = {
  borderWidth: 2,
  radius: 0,
  pixelShadow: {
    offsetX: 4,
    offsetY: 4,
    blur: 0,
  },
  scanlineOpacity: 0.07,
  grid: 8,
  elevation: 4, // Android material depth for the raised pixel chrome
} as const;

const geometryDeepSpace = {
  borderWidth: 1,
  radius: 13,
  // No hard pixel shadow (DESIGN.md: no drop shadows on dark surfaces).
  pixelShadow: {
    offsetX: 0,
    offsetY: 0,
    blur: 0,
  },
  scanlineOpacity: 0,
  grid: 8,
  elevation: 0, // flat on Android too — the deep-space design has no drop shadow
} as const;

// Legacy cosmic mapping (EXPO_PUBLIC_UI=legacy). Kept exported for the token test
// + the legacy track.
export const gameboyCosmic = {
  ...geometryCosmic,
  screen: cosmic.space950,
  ink: cosmic.moonWhite,
  accent: cosmic.signalBlue,
  power: cosmic.signalMint,
  amber: cosmic.pixelLamp,
  border: withAlpha(cosmic.signalBlue, 0.68),
} as const;

// Deep-space build (2026-06-18, Phase 2): the Game-Boy chrome reads as the smooth
// eye-cyan design — cyan colors AND rounded/flat geometry (radius 13, 1px border,
// no hard pixel shadow / scanlines), so premium buttons/cards/inputs/tab bar stop
// looking like retro pixel chrome.
const gameboyDeepSpace = {
  ...geometryDeepSpace,
  screen: "#0A0E1A",
  ink: "#E8F7FF",
  accent: "#46B6FF",
  power: "#5FF0C0",
  amber: "#FFD166",
  border: "rgba(70,182,255,0.68)", // alpha matches cosmic; clears the 3:1 edge floor on dark
} as const;

export const gameboy = UI_MODE === "deep-space" ? gameboyDeepSpace : gameboyCosmic;

export const androidElevation = {
  pixelShadow: 4,
  authForm: 3,
  card: 2,
} as const;

export type AndroidElevationStyle = {
  elevation: number;
};

export type PixelShadowStyle = {
  shadowColor: string;
  shadowOffset: {
    width: number;
    height: number;
  };
  shadowRadius: number;
  shadowOpacity: number;
  elevation: number;
};

export function androidElevationStyle(elevation: number = androidElevation.card): AndroidElevationStyle {
  return { elevation };
}

export function pixelShadowStyle(shadowColor: string = gameboy.border): PixelShadowStyle {
  return {
    shadowColor,
    shadowOffset: {
      width: gameboy.pixelShadow.offsetX,
      height: gameboy.pixelShadow.offsetY,
    },
    shadowRadius: gameboy.pixelShadow.blur,
    shadowOpacity: 1,
    // Android ignores shadow* and uses elevation. Legacy pixel chrome is raised
    // (elevation 4); the deep-space design is flat (elevation 0) so Android matches
    // the no-drop-shadow look instead of rendering a material shadow.
    ...androidElevationStyle(gameboy.elevation),
  };
}
