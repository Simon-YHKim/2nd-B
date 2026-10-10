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
  KEYBOARD_REVEAL_MARGIN,
  keyboardAvoidanceMode,
  keyboardOverlap,
  keyboardRevealScrollY,
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

describe("입력칸 아래 버튼까지 키보드 위로 (2026-10-07 실기 R2A-02 후속)", () => {
  // 실기 캡처 c4w_memo_kb.png(1440x3120, 3.5x)에서 어림한 dp. /capture 메모 모드에서 키보드가
  // 처음 뜬 직후다. ScrollView 는 약 58dp 에서 시작해 키보드 윗변 555dp 에서 끝나고(영역이 띄운 뒤),
  // 메모 칸 묶음(capForm)이 178dp, 담기 칸이 550dp 에서 시작한다(높이 약 52dp). 스크롤은 0 이었다 -
  // 위쪽 메모 · 링크 · 할 일 칸이 다 보였다. 담기는 위 끝 5dp(실기 15px 안팎)만 보였다.
  const scrollTop = 58;
  const keyboardTop = 555;
  const viewportHeight = keyboardTop - scrollTop;
  const formTop = 178 - scrollTop; // 내용 좌표
  const save = { y: 550 - scrollTop, height: 52 };
  const memo = {
    revealBottom: save.y + save.height + KEYBOARD_REVEAL_MARGIN,
    keepTop: formTop,
    viewportHeight,
    scrollY: 0,
  };

  test("고치기 전 자리: 담기가 키보드 위로 몇 dp 만 보인다", () => {
    const visible = keyboardTop - (scrollTop + save.y);
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(save.height / 4);
  });

  test("담기 아래 끝이 키보드 위에 오도록 내리고, 메모 칸 위 끝은 화면 안에 남는다", () => {
    const y = keyboardRevealScrollY(memo);
    expect(y).not.toBeNull();
    const saveBottomOnScreen = scrollTop + save.y + save.height - (y as number);
    const formTopOnScreen = scrollTop + formTop - (y as number);
    expect(saveBottomOnScreen).toBeLessThanOrEqual(keyboardTop - KEYBOARD_REVEAL_MARGIN);
    expect(formTopOnScreen).toBeGreaterThanOrEqual(scrollTop);
    // 필요한 만큼만: 한 dp 더 내리면 여유가 남는다.
    expect(saveBottomOnScreen + 1).toBeGreaterThan(keyboardTop - KEYBOARD_REVEAL_MARGIN);
  });

  test("화면이 작아 둘 다 못 담으면 메모 칸 위 끝에서 멈춘다 - 쓰는 자리가 버튼보다 먼저다", () => {
    expect(keyboardRevealScrollY({ ...memo, viewportHeight: 300 })).toBe(formTop);
    // 위 끝을 모르면(아직 안 쟀으면) 제한 없이 버튼까지 내린다.
    expect(keyboardRevealScrollY({ ...memo, viewportHeight: 300, keepTop: null })).toBe(memo.revealBottom - 300);
  });

  test("내리기만 한다 - 이미 보이거나 사용자가 더 내려 둔 자리는 그대로", () => {
    expect(keyboardRevealScrollY({ ...memo, viewportHeight: 800 })).toBeNull();
    expect(keyboardRevealScrollY({ ...memo, scrollY: 200 })).toBeNull();
    // 메모 칸 위 끝이 이미 화면 위로 지나간 자리에서 끌어올리지 않는다.
    expect(keyboardRevealScrollY({ ...memo, viewportHeight: 300, scrollY: formTop + 40 })).toBeNull();
  });

  test("값이 이상하면 움직이지 않는다", () => {
    expect(keyboardRevealScrollY({ ...memo, viewportHeight: 0 })).toBeNull();
    expect(keyboardRevealScrollY({ ...memo, viewportHeight: Number.NaN })).toBeNull();
    expect(keyboardRevealScrollY({ ...memo, revealBottom: Number.POSITIVE_INFINITY })).toBeNull();
    expect(keyboardRevealScrollY({ ...memo, scrollY: Number.NaN })).toBeNull();
    // 위 끝 값만 이상하면 그 제한만 버린다.
    expect(keyboardRevealScrollY({ ...memo, keepTop: Number.NaN })).toBe(keyboardRevealScrollY({ ...memo, keepTop: null }));
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
    // 2026-10-05 #2055 가 옮긴 자리 22곳(21파일) + 같은 날 /capture 기본 화면(CaptureView, QA R2A-02).
    // 줄었다면 화면이 키보드 처리를 잃은 것이다.
    expect(areaUses).toBeGreaterThanOrEqual(23);
  });

  // QA R2A-02 (2026-10-05): /capture 의 CaptureView 는 KeyboardAvoidingView 를 쓴 적이 없어 #2055 의
  // 옮기기 목록에도, 위 규칙에도 걸리지 않았다. ScrollView 에 `automaticallyAdjustKeyboardInsets` 만
  // 있었는데 그 prop 은 iOS 전용이라 Android 에서는 4W1H 마지막 칸과 담기 버튼이 키보드 밑에 남았다.
  // 그 prop 이 보이는 파일은 Android 를 따로 처리하고 있어야 한다.
  test("iOS 전용 키보드 inset 을 쓰는 파일은 Android 용 영역도 쓴다", () => {
    const iosOnlyWithoutArea = (text: string) =>
      /\bautomaticallyAdjustKeyboardInsets\b/.test(text) && !/^[ \t]*<KeyboardAvoidingArea\b/m.test(text);
    // 변이 검증: 고치기 전 CaptureView 모양은 걸리고, 고친 모양은 통과한다.
    expect(iosOnlyWithoutArea("    <View style={styles.capCoachRoot}>\n      <ScrollView\n        automaticallyAdjustKeyboardInsets\n")).toBe(true);
    expect(
      iosOnlyWithoutArea("    <KeyboardAvoidingArea style={styles.capCoachRoot} iosHandledByScrollView>\n      <ScrollView\n        automaticallyAdjustKeyboardInsets\n"),
    ).toBe(false);

    const files = sourceFiles("src");
    // 영역 파일 자신은 그 prop 을 설명하는 주석만 갖는다.
    const users = files.filter(
      (file) => !BOUNDARY.has(file) && /\bautomaticallyAdjustKeyboardInsets\b/.test(fs.readFileSync(path.join(ROOT, file), "utf8")),
    );
    // 지금 쓰는 곳이 0 이 되면 이 검사는 공허해진다. 그때는 이 검사를 은퇴시킨다.
    expect(users).toContain("src/components/deep-space/DeepSpaceViews.tsx");
    expect(users.filter((file) => iosOnlyWithoutArea(fs.readFileSync(path.join(ROOT, file), "utf8")))).toEqual([]);
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
    // iOS 에서 안쪽 ScrollView 가 inset 을 맡는 화면은 영역이 평범한 View 다(두 번 띄우지 않는다).
    // 그 분기는 iOS 갈래 안에만 있어야 Android 측정이 그대로 돈다.
    const iosBranch = helper.slice(helper.indexOf('if (mode === "ios-padding") {'), helper.indexOf('if (mode === "android-measured")'));
    expect(iosBranch).toContain("if (iosHandledByScrollView) return <View {...props} />;");
    expect(helper.indexOf("iosHandledByScrollView) return")).toBeLessThan(helper.indexOf('if (mode === "android-measured")'));
  });
});

// /capture 메모 칸이 위 계산을 실제로 쓰는지(2026-10-07 실기 R2A-02 후속). Jest 는 RN 을 렌더하지
// 못하므로 배선을 소스에서 확인한다.
describe("배선 - /capture 메모 칸을 누르면 담기까지 보인다", () => {
  const helper = fs.readFileSync(path.join(ROOT, HELPER), "utf8").replace(/\r\n/g, "\n");
  const views = fs.readFileSync(path.join(ROOT, "src/components/deep-space/DeepSpaceViews.tsx"), "utf8").replace(/\r\n/g, "\n");
  const capture = views.slice(views.indexOf("export function CaptureView"), views.indexOf("// ── 세컨비 / Chat"));

  test("훅은 Android 측정 갈래에서만 움직이고, 키보드가 떠 있을 때 계산대로 내린다", () => {
    const hook = helper.slice(helper.indexOf("export function useKeyboardReveal("));
    expect(hook.length).toBeGreaterThan(0);
    expect(hook).toContain('keyboardAvoidanceMode(Platform.OS) === "android-measured"');
    expect(hook).toContain("if (!enabled) return { scrollProps: {}, keepTopProps: {}, targetProps: {}, inputProps: {} };");
    expect(hook).toContain("Keyboard.isVisible()");
    // 멈추면 포커스 기억도 지운다 - 빠진 입력칸은 onBlur 를 못 보낼 수 있다.
    expect(hook).toContain("if (!active) frameRef.current.focused = false;");
    expect(hook).toContain("frame.target.y + frame.target.height + KEYBOARD_REVEAL_MARGIN");
    expect(hook).toContain("keepTop: frame.keepTop");
    expect(hook).toContain("viewportHeight: frame.viewport");
    expect(hook).toContain("scrollY: frame.scrollY");
    expect(hook).toContain("scrollRef.current?.scrollTo({ y, animated: true })");
    // 영역이 ScrollView 를 줄인 뒤(onLayout)와 포커스 때 둘 다 계산한다.
    expect(hook).toMatch(/onLayout: \(event\) => \{\s*frameRef\.current\.viewport = event\.nativeEvent\.layout\.height;\s*reveal\(\);/);
    expect(hook).toMatch(/onFocus: \(\) => \{\s*frameRef\.current\.focused = true;\s*reveal\(\);/);
  });

  test("CaptureView 는 ScrollView · 메모 칸 묶음 · 메모 칸 · 담기 칸에 하나씩 펼친다", () => {
    // 첫 기록 안내 동안과 메모 모드 밖(4W1H · 링크 · 할 일)에서는 멈춘다.
    expect(capture).toContain("const saveReveal = useKeyboardReveal(scrollRef, {\n    active: coachStep == null && mode === \"text\" && !fourwOn,\n  });");
    const scroll = capture.slice(capture.indexOf("<ScrollView\n        ref={scrollRef}"), capture.indexOf("{/* Fixed square tiles"));
    expect(scroll).toContain("{...saveReveal.scrollProps}");
    // 메모(4W1H 꺼짐) 갈래의 묶음이 내용 컨테이너의 직계 자식이고, 그 첫 칸이 메모 입력칸이다.
    const memo = capture.slice(capture.indexOf("{!fourwOn ? ("), capture.indexOf("{attachStrip}"));
    expect(memo).toContain("<View style={[styles.capForm, styles.capFillSpace]} {...saveReveal.keepTopProps}>");
    expect(memo).toContain('accessibilityLabel={t("capture:modes.memo.label")}\n                  {...saveReveal.inputProps}');
    expect(capture).toContain(
      "<View ref={saveCoachTargetRef} collapsable={false} style={styles.capSubmit} {...saveReveal.targetProps}>",
    );
    // 한 번씩만 - 다른 칸에 잘못 펼치면 좌표가 섞인다.
    for (const spread of ["scrollProps", "keepTopProps", "inputProps", "targetProps"]) {
      expect(capture.split(`{...saveReveal.${spread}}`).length - 1).toBe(1);
    }
  });
});
