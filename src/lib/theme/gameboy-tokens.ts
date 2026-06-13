import { cosmic, withAlpha } from "./tokens";

export const gameboy = {
  borderWidth: 2,
  radius: 0,
  pixelShadow: {
    offsetX: 4,
    offsetY: 4,
    blur: 0,
  },
  scanlineOpacity: 0.07,
  grid: 8,
  screen: cosmic.space950,
  ink: cosmic.moonWhite,
  accent: cosmic.signalBlue,
  power: cosmic.signalMint,
  amber: cosmic.pixelLamp,
  border: withAlpha(cosmic.signalBlue, 0.55),
} as const;

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
    elevation: 4,
  };
}
