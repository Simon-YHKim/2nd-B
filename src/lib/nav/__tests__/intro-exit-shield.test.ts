// 오프닝이 끝난 직후의 탭이 아래 탭바로 떨어지지 않는가 (QA 261004 W-05).
//
// 막의 수명은 순수 상태라 가짜 타이머로 잰다. 막이 실제로 그려지는 자리와
// 모양은 렌더 테스트가 막혀 있어(RN 0.85) 소스 계약으로 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  INTRO_EXIT_SHIELD_MS,
  hasIntroEnded,
  isIntroExitShieldActive,
  resetIntroExitShieldForTests,
  startIntroExitShield,
  subscribeIntroExitShield,
} from "../intro-exit-shield";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("막의 수명", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetIntroExitShieldForTests();
  });
  afterEach(() => {
    resetIntroExitShieldForTests();
    jest.useRealTimers();
  });

  it("시간은 판정이 정한 350~400ms 안이다", () => {
    expect(INTRO_EXIT_SHIELD_MS).toBeGreaterThanOrEqual(350);
    expect(INTRO_EXIT_SHIELD_MS).toBeLessThanOrEqual(400);
  });

  it("오프닝이 끝나기 전에는 막이 없다", () => {
    expect(isIntroExitShieldActive()).toBe(false);
  });

  it("오프닝이 끝나는 순간 켜지고, 그 시간이 다 지나야 꺼진다", () => {
    const seen: boolean[] = [];
    subscribeIntroExitShield(() => seen.push(isIntroExitShieldActive()));

    startIntroExitShield();
    expect(isIntroExitShieldActive()).toBe(true);

    // 웹 재현에서 아래 탭이 드러나기까지 143~201ms 였다. 그 구간은 막 안이다.
    jest.advanceTimersByTime(201);
    expect(isIntroExitShieldActive()).toBe(true);

    jest.advanceTimersByTime(INTRO_EXIT_SHIELD_MS - 201 - 1);
    expect(isIntroExitShieldActive()).toBe(true);

    jest.advanceTimersByTime(1);
    expect(isIntroExitShieldActive()).toBe(false);
    // 구독자는 켜질 때와 꺼질 때 한 번씩 듣는다.
    expect(seen).toEqual([true, false]);
  });

  it("다시 시작하면 시간을 처음부터 잰다", () => {
    startIntroExitShield();
    jest.advanceTimersByTime(INTRO_EXIT_SHIELD_MS - 50);
    startIntroExitShield();
    jest.advanceTimersByTime(INTRO_EXIT_SHIELD_MS - 1);
    expect(isIntroExitShieldActive()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isIntroExitShieldActive()).toBe(false);
  });

  it("오프닝이 끝났다는 사실은 막이 걷힌 뒤에도 남는다(공유 거절 한 줄이 읽는다)", () => {
    expect(hasIntroEnded()).toBe(false);
    const seen: boolean[] = [];
    subscribeIntroExitShield(() => seen.push(hasIntroEnded()));
    startIntroExitShield();
    expect(hasIntroEnded()).toBe(true);
    jest.advanceTimersByTime(INTRO_EXIT_SHIELD_MS);
    expect(isIntroExitShieldActive()).toBe(false);
    expect(hasIntroEnded()).toBe(true);
    // 켜지는 순간의 알림에서 이미 참이다.
    expect(seen[0]).toBe(true);
    resetIntroExitShieldForTests();
    expect(hasIntroEnded()).toBe(false);
  });

  it("구독을 끊으면 더 듣지 않는다", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeIntroExitShield(listener);
    unsubscribe();
    startIntroExitShield();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("막이 그려지는 자리 (루트 레이아웃)", () => {
  const layout = read("src/app/_layout.tsx");

  it("오프닝을 끝내는 onContinue 가 막을 켠다", () => {
    const start = layout.indexOf("<LoadingScreen");
    const onContinue = layout.slice(layout.indexOf("onContinue={() => {", start), layout.indexOf("}}", start));
    expect(onContinue).toContain("startIntroExitShield();");
    expect(onContinue).toContain("setIntroDone(true);");
  });

  it("막은 IntroGate 바로 다음 형제다 - 오프닝 뒤의 모든 갈래(Stack · 독 · 떠 있는 칩) 위에 온다", () => {
    const introEnd = layout.indexOf("</IntroGate>");
    const shield = layout.indexOf("<IntroExitShield />");
    const providerEnd = layout.indexOf("</SecondbHeadTrackProvider>");
    expect(introEnd).toBeGreaterThan(0);
    expect(shield).toBeGreaterThan(introEnd);
    expect(providerEnd).toBeGreaterThan(shield);
    // 다른 요소가 끼어 있지 않다(주석만 허용).
    const between = layout.slice(introEnd + "</IntroGate>".length, shield).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(between.trim()).toBe("");
  });
});

describe("막의 모양", () => {
  const component = read("src/components/ui/IntroExitShield.tsx");

  it("터치를 받기만 하고 아무 동작도 하지 않는다", () => {
    expect(component).toContain('pointerEvents="auto"');
    expect(component).toContain("onStartShouldSetResponder={claimTouch}");
    expect(component).toContain("const claimTouch = (): boolean => true;");
    expect(component).not.toMatch(/onPress|onResponderRelease|router\./);
  });

  it("보조 기술에서는 숨는다", () => {
    expect(component).toContain("accessibilityElementsHidden");
    expect(component).toContain('importantForAccessibility="no-hide-descendants"');
    expect(component).toContain("aria-hidden");
  });

  it("화면 전체를 width/height 100% 로 덮고 형제들 위에 쌓인다", () => {
    const style = component.slice(component.indexOf("shield: {"));
    expect(style).toContain('width: "100%"');
    expect(style).toContain('height: "100%"');
    expect(style).not.toContain("absoluteFill");
    expect(style).toMatch(/zIndex: \d+/);
    // 상수 elevation: 안드로이드에서 쌓임 순서를 맞춘다.
    expect(style).toContain("elevation: SHIELD_ELEVATION");
  });

  it("막이 꺼져 있으면 아무것도 그리지 않는다", () => {
    expect(component).toContain("if (!shielding) return null;");
  });
});
