import { cosmic, withAlpha } from "../tokens";
import { androidElevation, androidElevationStyle, gameboy, pixelShadowStyle } from "../gameboy-tokens";

describe("gameboy tokens", () => {
  it("locks the Deep Space Game Boy geometry tokens", () => {
    expect(gameboy.borderWidth).toBe(2);
    expect(gameboy.radius).toBe(0);
    expect(gameboy.pixelShadow).toEqual({ offsetX: 4, offsetY: 4, blur: 0 });
    expect(gameboy.scanlineOpacity).toBe(0.07);
    expect(gameboy.grid).toBe(8);
  });

  it("maps the Game Boy palette to the existing cosmic tokens", () => {
    expect(gameboy.screen).toBe(cosmic.space950);
    expect(gameboy.ink).toBe(cosmic.moonWhite);
    expect(gameboy.accent).toBe(cosmic.signalBlue);
    expect(gameboy.power).toBe(cosmic.signalMint);
    expect(gameboy.amber).toBe(cosmic.pixelLamp);
    expect(gameboy.border).toBe(withAlpha(cosmic.signalBlue, 0.68));
  });

  it("creates a hard-offset React Native shadow style", () => {
    expect(pixelShadowStyle()).toEqual({
      shadowColor: gameboy.border,
      shadowOffset: { width: 4, height: 4 },
      shadowRadius: 0,
      shadowOpacity: 1,
      elevation: 4,
    });
  });

  it("allows a custom hard shadow color", () => {
    expect(pixelShadowStyle(gameboy.power).shadowColor).toBe(gameboy.power);
  });

  it("locks shared Android elevation depths", () => {
    expect(androidElevation).toEqual({
      pixelShadow: 4,
      authForm: 3,
      card: 2,
    });
    expect(androidElevationStyle()).toEqual({ elevation: androidElevation.card });
    expect(androidElevationStyle(androidElevation.authForm)).toEqual({ elevation: 3 });
  });
});
