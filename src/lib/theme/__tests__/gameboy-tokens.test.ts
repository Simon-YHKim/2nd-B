import { cosmic, withAlpha } from "../tokens";
import { gameboy, pixelShadowBoxShadow, pixelShadowStyle } from "../gameboy-tokens";

describe("gameboy tokens", () => {
  it("locks the Deep Space Game Boy geometry tokens", () => {
    expect(gameboy.borderWidth).toBe(2);
    expect(gameboy.radius).toBe(0);
    expect(gameboy.pixelShadow).toEqual({ offsetX: 3, offsetY: 3, blur: 0 });
    expect(gameboy.scanlineOpacity).toBe(0.04);
    expect(gameboy.grid).toBe(8);
  });

  it("maps the Game Boy palette to the existing cosmic tokens", () => {
    expect(gameboy.screen).toBe(cosmic.space950);
    expect(gameboy.ink).toBe(cosmic.moonWhite);
    expect(gameboy.accent).toBe(cosmic.signalBlue);
    expect(gameboy.power).toBe(cosmic.signalMint);
    expect(gameboy.amber).toBe(cosmic.pixelLamp);
    expect(gameboy.border).toBe(withAlpha(cosmic.signalBlue, 0.35));
  });

  it("creates a hard-offset React Native shadow style", () => {
    expect(pixelShadowStyle()).toEqual({
      boxShadow: `3px 3px 0px ${withAlpha(cosmic.signalBlue, 0.35)}`,
      shadowColor: gameboy.border,
      shadowOffset: { width: 3, height: 3 },
      shadowRadius: 0,
      shadowOpacity: 1,
      elevation: 0,
    });
  });

  it("allows a custom hard shadow color", () => {
    expect(pixelShadowStyle(gameboy.power).shadowColor).toBe(gameboy.power);
    expect(pixelShadowBoxShadow(gameboy.power)).toBe("3px 3px 0px #72F2C7");
  });

  it("does not rely on Android elevation for the pixel shadow", () => {
    const style = pixelShadowStyle();

    expect(style.elevation).toBe(0);
    expect(style.boxShadow).toBeTruthy();
  });
});
