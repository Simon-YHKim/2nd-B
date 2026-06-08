import { cosmic } from "./tokens";

export const gameboy = {
  borderWidth: 2,
  radius: 0,
  pixelShadow: {
    offsetX: 3,
    offsetY: 3,
    blur: 0,
  },
  scanlineOpacity: 0.04,
  grid: 8,
  screen: cosmic.space950,
  ink: cosmic.moonWhite,
  accent: cosmic.signalBlue,
  power: cosmic.signalMint,
  amber: cosmic.pixelLamp,
  border: "rgba(76,201,240,0.35)",
} as const;

export type PixelShadowStyle = {
  shadowColor: string;
  shadowOffset: {
    width: number;
    height: number;
  };
  shadowRadius: number;
  shadowOpacity: number;
  elevation: 0;
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
    elevation: 0,
  };
}
