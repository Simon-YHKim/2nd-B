import { androidElevation, androidElevationStyle, gameboy, pixelShadowStyle } from "../gameboy-tokens";

describe("PIXEL-CLAY 절대 규칙 2 — 게임보이 토큰의 반경도 0", () => {
  // ⚠ 이 세트는 **세 번째가 아니라 네 번째** 반경 토큰이다
  //   (`m3.shape.*` · `radii.*` · `radius`(단수) · `deepSpaceRadii`).
  //   값은 2026-08-21 #1304 에서 이미 0 이 됐는데(레거시 스킨 보호 중단),
  //   가드가 `gameboy.radius` 이름을 허용하지 않아 호출부 54곳(9파일)이
  //   계속 위반으로 세어지고 있었다.
  //
  //   `check-pixel-rules.ts` 의 `radiusAllowed` 가 이 이름을 허용하는 근거가
  //   이 검사다. **여기가 빨개지면 그 허용도 같이 무효가 된다.**
  test("radius 0", () => {
    // 옛 레거시 팔레트(gameboyCosmic)는 2026-10-05 EXPO_PUBLIC_UI 레버와 함께 빠졌다
    // (Simon 결정 Q-261004-11). 남은 팔레트는 `gameboy` 하나다.
    expect({ skin: "active", radius: gameboy.radius }).toEqual({ skin: "active", radius: 0 });
  });
});

describe("gameboy tokens", () => {
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
