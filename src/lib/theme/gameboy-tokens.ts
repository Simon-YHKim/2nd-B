import { cosmic, withAlpha } from "./tokens";
import { UI_MODE } from "../ui-mode";

// Shared pixel geometry (sharp corners + hard offset shadow), identical in both
// builds — the cyan pivot only moves the COLOR aliases.
const gameboyGeometry = {
  borderWidth: 2,
  radius: 0,
  pixelShadow: {
    offsetX: 4,
    offsetY: 4,
    blur: 0,
  },
  scanlineOpacity: 0.07,
  grid: 8,
} as const;

// Legacy cosmic mapping (EXPO_PUBLIC_UI=legacy). Kept exported for the token test
// + the legacy track.
export const gameboyCosmic = {
  ...gameboyGeometry,
  screen: cosmic.space950,
  ink: cosmic.moonWhite,
  accent: cosmic.signalBlue,
  power: cosmic.signalMint,
  amber: cosmic.pixelLamp,
  border: withAlpha(cosmic.signalBlue, 0.68),
} as const;

// Cyan global pivot (2026-06-18): in the deep-space build the Game-Boy color
// aliases read as the eye-cyan identity, so the premium pixel chrome (buttons,
// cards, inputs, tab bar) is cyan too. Geometry is unchanged (Phase 2 softens
// shapes per screen).
const gameboyDeepSpace = {
  ...gameboyGeometry,
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
    // Android ignores shadow* and uses elevation; 0 rendered flat (no depth).
    // Give material depth so cards/forms are not flat on Android (AG native review 2026-06-13).
    ...androidElevationStyle(androidElevation.pixelShadow),
  };
}
