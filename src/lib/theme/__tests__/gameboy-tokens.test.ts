import { cosmic, withAlpha } from "../tokens";
import { androidElevation, androidElevationStyle, gameboy, gameboyCosmic, pixelShadowStyle } from "../gameboy-tokens";

describe("PIXEL-CLAY 절대 규칙 2 — 게임보이 토큰의 반경도 0", () => {
  // ⚠ 이 세트는 **세 번째가 아니라 네 번째** 반경 토큰이다
  //   (`m3.shape.*` · `radii.*` · `radius`(단수) · `deepSpaceRadii`).
  //   값은 2026-08-21 #1304 에서 이미 0 이 됐는데(레거시 스킨 보호 중단),
  //   가드가 `gameboy.radius` 이름을 허용하지 않아 호출부 54곳(9파일)이
  //   계속 위반으로 세어지고 있었다.
  //
  //   `check-pixel-rules.ts` 의 `radiusAllowed` 가 이 이름을 허용하는 근거가
  //   이 검사다. **여기가 빨개지면 그 허용도 같이 무효가 된다.**
  test("두 스킨 모두 radius 0", () => {
    // `gameboyDeepSpace` 는 export 되지 않는다 — `gameboy` 가 UI_MODE 로 고른 결과다.
    expect({ skin: "cosmic", radius: gameboyCosmic.radius }).toEqual({ skin: "cosmic", radius: 0 });
    expect({ skin: "active", radius: gameboy.radius }).toEqual({ skin: "active", radius: 0 });
  });
});

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
      elevation: gameboy.elevation,
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
