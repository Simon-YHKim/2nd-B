import { cosmic, withAlpha } from "../tokens";
import { androidElevation, androidElevationStyle, gameboy, gameboyCosmic, pixelShadowStyle } from "../gameboy-tokens";

describe("gameboy tokens", () => {
  it("locks the legacy pixel geometry tokens", () => {
    // gameboyCosmic is the sharp pixel geometry (legacy build); the active
    // `gameboy` flips to rounded/flat in the deep-space build.
    expect(gameboyCosmic.borderWidth).toBe(2);
    expect(gameboyCosmic.radius).toBe(0);
    expect(gameboyCosmic.pixelShadow).toEqual({ offsetX: 4, offsetY: 4, blur: 0 });
    expect(gameboyCosmic.scanlineOpacity).toBe(0.07);
    expect(gameboyCosmic.grid).toBe(8);
  });

  it("maps the legacy Game Boy palette to the existing cosmic tokens", () => {
    // gameboyCosmic is the legacy (EXPO_PUBLIC_UI=legacy) mapping; the active
    // `gameboy` export flips to the cyan identity in the deep-space build.
    expect(gameboyCosmic.screen).toBe(cosmic.space950);
    expect(gameboyCosmic.ink).toBe(cosmic.moonWhite);
    expect(gameboyCosmic.accent).toBe(cosmic.signalBlue);
    expect(gameboyCosmic.power).toBe(cosmic.signalMint);
    expect(gameboyCosmic.amber).toBe(cosmic.pixelLamp);
    expect(gameboyCosmic.border).toBe(withAlpha(cosmic.signalBlue, 0.68));
  });

  it("builds the shadow style from the active pixel-shadow geometry", () => {
    expect(pixelShadowStyle()).toEqual({
      shadowColor: gameboy.border,
      shadowOffset: { width: gameboy.pixelShadow.offsetX, height: gameboy.pixelShadow.offsetY },
      shadowRadius: gameboy.pixelShadow.blur,
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
