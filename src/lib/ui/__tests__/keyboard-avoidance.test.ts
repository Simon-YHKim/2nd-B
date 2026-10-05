// 키보드 피하기 — 규칙 하나, 분기 0.
//
// 2026-10-05: 0.10.0 vc59 를 API 36 에뮬레이터에서 돌렸더니 /secondb 입력창이 키보드에
// 완전히 가렸다. 화면 22곳이 `behavior={Platform.OS === "ios" ? "padding" : undefined}` 로
// Android 를 비워 두고 adjustResize 가 창을 줄여 주기를 기다렸는데, RN 0.85 + Expo 56 의
// edge-to-edge 창은 줄지 않는다(근거는 src/lib/ui/keyboard-avoidance.ts 머리말).
//
// 이 파일은 두 가지를 지킨다.
//   1. 계산 - Android 가 실제로 겹친 만큼 띄우고, 이미 줄어든 창에서는 두 번 띄우지 않는다.
//   2. 경계 - 화면이 RN KeyboardAvoidingView 나 플랫폼별 behavior 를 다시 직접 쓰지 않는다.
//      그 분기가 다시 생기면 Android 가 또 조용히 빠진다.
import fs from "node:fs";
import path from "node:path";

import {
  IOS_KEYBOARD_BEHAVIOR,
  keyboardAvoidanceMode,
  keyboardOverlap,
  nextKeyboardPadding,
} from "../keyboard-avoidance";

describe("플랫폼별 처리", () => {
  test("iOS 는 예전과 같은 padding, Android 는 잰 겹침, 웹은 아무것도 안 한다", () => {
    expect(keyboardAvoidanceMode("ios")).toBe("ios-padding");
    expect(IOS_KEYBOARD_BEHAVIOR).toBe("padding");
    expect(keyboardAvoidanceMode("android")).toBe("android-measured");
    expect(keyboardAvoidanceMode("web")).toBe("none");
    expect(keyboardAvoidanceMode("windows")).toBe("none");
  });
});

describe("Android 겹침 계산", () => {
  // vc59 에뮬레이터(1440x3120, 3.5x) 의 /secondb 스크린샷(s14 · s15)에서 어림한 dp 값.
  // 창 본문이 약 56dp 에서 시작해 787dp 에서 끝나고, 키보드 윗변이 약 555dp 다.
  const secondbBody = { pageY: 56, height: 731 };
  const keyboardTop = 555;

  test("뷰 아래 끝이 키보드 윗변까지 오도록 겹친 만큼 띄운다", () => {
    expect(keyboardOverlap(secondbBody, keyboardTop)).toBe(56 + 731 - 555);
  });

  test("부모 기준 y(0)로 계산하면 부족하다 - RN KeyboardAvoidingView 가 Android 에서 빠뜨리는 몫", () => {
    const relativeToParent = keyboardOverlap({ pageY: 0, height: secondbBody.height }, keyboardTop);
    const absolute = keyboardOverlap(secondbBody, keyboardTop);
    // 입력창(약 48dp)보다 큰 차이라 parent 기준 padding 으로는 입력창이 여전히 가린다.
    expect(absolute - relativeToParent).toBe(secondbBody.pageY);
    expect(absolute - relativeToParent).toBeGreaterThan(48);
  });

  test("창이 이미 줄어 뷰가 키보드 위에 있으면 0 - 두 번 띄우지 않는다", () => {
    expect(keyboardOverlap({ pageY: 56, height: 499 }, keyboardTop)).toBe(0);
    expect(keyboardOverlap({ pageY: 56, height: 400 }, keyboardTop)).toBe(0);
  });

  test("키보드가 없거나 값이 이상하면 0", () => {
    expect(keyboardOverlap(secondbBody, null)).toBe(0);
    expect(keyboardOverlap(null, keyboardTop)).toBe(0);
    expect(keyboardOverlap({ pageY: Number.NaN, height: 731 }, keyboardTop)).toBe(0);
    expect(keyboardOverlap({ pageY: 56, height: Number.POSITIVE_INFINITY }, keyboardTop)).toBe(0);
    expect(keyboardOverlap(secondbBody, Number.NaN)).toBe(0);
    expect(keyboardOverlap({ pageY: 0, height: 0 }, keyboardTop)).toBe(0);
  });

  test("뷰 높이를 넘지 않는다 - 키보드가 뷰 전체를 덮어도 자식 높이가 음수가 되지 않는다", () => {
    expect(keyboardOverlap({ pageY: 700, height: 100 }, 300)).toBe(100);
  });

  test("소수 dp 는 올림 - 1px 이 키보드 밑에 남지 않는다", () => {
    expect(keyboardOverlap({ pageY: 10.2, height: 600 }, 555)).toBe(56);
  });
});

describe("여백 갱신 규칙", () => {
  test("키보드 이벤트로 잴 때는 늘리고 줄인다", () => {
    expect(nextKeyboardPadding(0, 232, true)).toBe(232);
    expect(nextKeyboardPadding(232, 120, true)).toBe(120);
  });

  test("레이아웃 변화로 다시 잴 때는 줄이기만 한다 - 내용 높이 뷰가 여백만큼 자라며 끝없이 커지는 고리를 끊는다", () => {
    let padding = nextKeyboardPadding(0, 100, true);
    // 내용 높이 뷰: 여백을 받은 만큼 뷰가 길어져 다음 측정이 그만큼 커진다.
    for (let i = 0; i < 5; i += 1) padding = nextKeyboardPadding(padding, padding + 100, false);
    expect(padding).toBe(100);
  });

  test("창이 실제로 줄어든 기기에서는 레이아웃 측정이 0 으로 내려 보낸다", () => {
    expect(nextKeyboardPadding(232, 0, false)).toBe(0);
  });

  test("이상한 측정값은 0 으로 본다", () => {
    expect(nextKeyboardPadding(232, Number.NaN, true)).toBe(0);
    expect(nextKeyboardPadding(232, -5, false)).toBe(0);
  });
});

// ── 경계 ──────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const HELPER = "src/lib/ui/keyboard.tsx";
// 경계 안: 영역 자신과, 왜 RN 을 감싸는지 설명하는 계산부.
const BOUNDARY = new Set([HELPER, "src/lib/ui/keyboard-avoidance.ts"]);

interface Violation {
  file: string;
  line: number;
  rule: string;
}

const RULES: Array<{ rule: string; pattern: RegExp }> = [
  // RN 의 KeyboardAvoidingView 는 영역 안에서만 쓴다. 이름만 적힌 주석도 잡는다 -
  // 주석이 낡은 설계("Android 는 KAV 를 비워 둔다")를 다시 가르치지 않게 한다.
  { rule: "KeyboardAvoidingView 직접 사용", pattern: /\bKeyboardAvoidingView\b/ },
  // 플랫폼마다 behavior 를 고르는 삼항 - 상수로 빼서 쓰든 prop 에 바로 쓰든.
  {
    rule: "플랫폼별 키보드 behavior 분기",
    pattern: /Platform\.OS\s*[!=]==?\s*["'](?:ios|android)["']\s*\?\s*["'](?:padding|height|position)["']/,
  },
  {
    rule: "플랫폼별 키보드 behavior 분기",
    pattern: /\?\s*["'](?:padding|height|position)["']\s*:\s*(?:undefined|["'](?:padding|height|position)["'])/,
  },
  // keyboardVerticalOffset 은 RN 이름이다. 화면은 iOS 전용임이 드러나는 이름을 쓴다.
  { rule: "keyboardVerticalOffset 직접 사용", pattern: /\bkeyboardVerticalOffset\b/ },
];

/** 한 파일의 위반. 경로는 저장소 기준 `/` 구분. */
function keyboardViolations(file: string, text: string): Violation[] {
  if (BOUNDARY.has(file)) return [];
  const out: Violation[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const { rule, pattern } of RULES) {
      if (pattern.test(line)) out.push({ file, line: index + 1, rule });
    }
  });
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      // 테스트는 금지 패턴을 문자열로 들고 있어야 하므로 제외한다(이 파일 포함).
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...sourceFiles(rel));
    } else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

describe("경계 - 화면은 키보드 영역 하나로만 피한다", () => {
  test("검사기는 옛 분기와 그 변형을 잡는다(변이 검증)", () => {
    const mutants: Array<[string, string]> = [
      ["옛 prop 분기", '      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>'],
      ["옛 상수 분기", '  const keyboardBehavior = Platform.OS === "ios" ? "padding" : undefined;'],
      ["height 로 바꾼 분기", '  const behavior = Platform.OS === "ios" ? "padding" : "height";'],
      ["android 를 먼저 쓴 분기", '  behavior={Platform.OS === "android" ? "height" : "padding"}'],
      ["Platform 없이 남은 삼항", '  behavior={isIos ? "padding" : undefined}'],
      ["RN import", 'import { KeyboardAvoidingView, View } from "react-native";'],
      ["오프셋 직접 전달", "        keyboardVerticalOffset={insets.top}"],
    ];
    for (const [name, line] of mutants) {
      expect({ name, hits: keyboardViolations("src/app/mutant.tsx", line).length }).not.toEqual({ name, hits: 0 });
    }
    // 영역 파일 자신은 RN 을 감싸야 하므로 허용한다.
    expect(keyboardViolations(HELPER, "<KeyboardAvoidingView behavior={IOS_KEYBOARD_BEHAVIOR} />")).toEqual([]);
    // 지금 화면이 쓰는 모양은 통과한다.
    expect(keyboardViolations("src/app/ok.tsx", "      <KeyboardAvoidingArea style={{ flex: 1 }} iosKeyboardVerticalOffset={insets.top}>")).toEqual([]);
    expect(keyboardViolations("src/app/ok.tsx", '          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}')).toEqual([]);
  });

  test("src 에 직접 분기가 0건이고, 영역은 실제로 쓰인다", () => {
    const files = sourceFiles("src");
    // 아무것도 못 읽은 채 "위반 0" 으로 통과하지 않게 읽은 양을 못박는다.
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain(HELPER);

    const violations: Violation[] = [];
    let areaUses = 0;
    for (const file of files) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      violations.push(...keyboardViolations(file, text));
      // 줄 머리의 JSX 여는 태그만 센다. 주석 속 `<KeyboardAvoidingArea>` 는 쓰임이 아니다.
      areaUses += text.match(/^[ \t]*<KeyboardAvoidingArea\b/gm)?.length ?? 0;
    }
    expect(violations).toEqual([]);
    // 2026-10-05 이 PR 이 옮긴 자리 22곳(21파일). 줄었다면 화면이 키보드 처리를 잃은 것이다.
    expect(areaUses).toBeGreaterThanOrEqual(22);
  });

  test("영역은 플랫폼마다 정해진 일만 한다", () => {
    const helper = fs.readFileSync(path.join(ROOT, HELPER), "utf8");
    expect(helper).toContain("keyboardAvoidanceMode(Platform.OS)");
    // iOS: 예전 그대로 RN KeyboardAvoidingView + padding + 화면이 준 오프셋.
    expect(helper).toContain("behavior={IOS_KEYBOARD_BEHAVIOR}");
    expect(helper).toContain("keyboardVerticalOffset={iosKeyboardVerticalOffset}");
    // Android: 키보드 윗변과 뷰의 절대 아래 끝을 직접 비교한다.
    expect(helper).toContain('Keyboard.addListener("keyboardDidShow"');
    expect(helper).toContain('Keyboard.addListener("keyboardDidHide"');
    expect(helper).toContain("event.endCoordinates.screenY");
    expect(helper).toContain("hostRef.current?.measure(");
    expect(helper).toContain("keyboardOverlap({ pageY, height }, keyboardTop)");
    expect(helper).toContain("paddingBottom: padding");
    // 웹: behavior 없이 그대로.
    expect(helper).toContain("return <KeyboardAvoidingView {...props} />;");
  });
});
