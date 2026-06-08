import { cosmic, withAlpha } from "./tokens";

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
  border: withAlpha(cosmic.signalBlue, 0.35),
} as const;

export type PixelShadowStyle = {
  boxShadow: string;
  shadowColor: string;
  shadowOffset: {
    width: number;
    height: number;
  };
  shadowRadius: number;
  shadowOpacity: number;
  elevation: 0;
};

export function pixelShadowBoxShadow(shadowColor: string = gameboy.border): string {
  return `${gameboy.pixelShadow.offsetX}px ${gameboy.pixelShadow.offsetY}px ${gameboy.pixelShadow.blur}px ${shadowColor}`;
}

export function pixelShadowStyle(shadowColor: string = gameboy.border): PixelShadowStyle {
  return {
    boxShadow: pixelShadowBoxShadow(shadowColor),
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
