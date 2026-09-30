// PixelTimeSheet · PixelWheel 소스 계약 (Simon 2026-09-30, /data-connections 시간 설정 팝업).
//
// 렌더 테스트는 막혀 있다(RN 0.85 + jest 29, 재시도 금지). 그래서 컴포넌트가 지켜야 하는
// 것 - 닫는 길, 접근성, PIXEL-CLAY 규칙 - 이 소스에 남아 있는지를 읽어서 본다.
import { readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(DIR, file), "utf8");
const sheet = read("PixelTimeSheet.tsx");
const wheel = read("PixelWheel.tsx");

test("the sheet closes by its glyph, the scrim, the hardware back button and Escape on web", () => {
  expect(sheet).toContain('<Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>');
  // The scrim is a responder View, not a Pressable: RN-web gives every Pressable tabIndex 0 and the
  // Modal focus trap put first focus on the unnamed full-screen scrim, where Enter discarded the draft.
  expect(sheet).toContain("onStartShouldSetResponder={() => true}");
  expect(sheet).toContain("onResponderRelease={onCancel}");
  expect(sheet).not.toMatch(/<Pressable[^>]*onPress=\{onCancel\}/);
  expect(sheet).toContain('accessibilityLabel={t("actions.close")}');
  expect(sheet).toContain('if (event.key === "Escape")');
  expect(sheet).toContain('document.removeEventListener("keydown", onKey)');
  expect(sheet).toContain("accessibilityViewIsModal onAccessibilityEscape={onCancel}");
});

test("the scrim is sized so the web dither covers the screen instead of one 4x4 tile", () => {
  expect(sheet).toContain("<PixelScrim style={styles.scrimImage} />");
  expect(sheet).toContain('scrimImage: { width: "100%", height: "100%" }');
});

test("the sheet reads its clock from the locale and hands back one 24-hour value", () => {
  expect(sheet).toContain('parseClockPattern(t("timePicker.pattern"))');
  expect(sheet).toContain("onSave(clockText(draft.hour24, draft.minute))");
  expect(sheet).toContain("if (visible) setDraft(parseClock(value));");
  // The 12-hour hour column turns over all 24 hours, so 11 AM -> 12 lands on noon, not midnight.
  expect(sheet).toContain("labels={hourLabels}");
  expect(sheet).toContain("index={draft.hour24}");
  expect(sheet).toContain("hour24: withPeriod(current.hour24, next === 1 ? 1 : 0)");
  expect(sheet).toContain("paddingBottom: Math.max(insets.bottom, m3.spacing.s8)");
  expect(sheet).toContain('accessibilityLabel={t("actions.save")}');
});

test("each wheel column is one adjustable control on every platform", () => {
  expect(wheel).toContain('accessibilityRole="adjustable"');
  expect(wheel).toContain("{...a11yValue({ min: 0, max: Math.max(0, count - 1), now: index, text: spoken })}");
  expect(sheet).toContain('t("timePicker.hourValue", {');
  expect(sheet).toContain('t("timePicker.minuteValue", {');
  expect(wheel).toContain('accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}');
  expect(wheel).toContain("tabIndex: 0,");
  expect(wheel).toContain("wheelKeyTarget(event.key, index, count, wrap)");
  expect(wheel).toContain('element.addEventListener("wheel", onWheel, { passive: false });');
  expect(wheel).toContain('return () => element.removeEventListener("wheel", onWheel);');
  // Neighbour rows repeat what increment/decrement already do; they stay out of the a11y tree.
  expect(wheel).toContain('importantForAccessibility="no-hide-descendants"');
  // RN-web forwards none of those props, so the web gets its own: no tab stop, hidden from readers.
  expect(wheel).toContain('Platform.OS === "web" ? { tabIndex: -1 as const, "aria-hidden": true as const } : {}');
  expect(wheel).toContain("{...webHidden}");
  // A web mouse drag inside a neighbour row must not also count as a tap on it.
  expect(wheel).toContain("if (!dragging.current) move(delta);");
});

test("the hour:minute separator is drawing only, and a failed save is spoken on native", () => {
  expect(sheet).toMatch(/key="separator"[\s\S]{0,120}accessible=\{false\}[\s\S]{0,40}aria-hidden[\s\S]{0,40}importantForAccessibility="no"/);
  expect(sheet).toContain('accessibilityLiveRegion="assertive"');
  expect(sheet).toContain("AccessibilityInfo.announceForAccessibility(error)");
});

test("PIXEL-CLAY: no alpha, no curves, no spring, and no cap on the device font size", () => {
  for (const src of [sheet, wheel]) {
    expect(src).not.toMatch(/\bopacity\s*[:=]/);
    expect(src).not.toMatch(/withAlpha\(|rgba\(/);
    expect(src).not.toMatch(/Easing\.|Animated\.spring|withSpring/);
    expect(src).not.toMatch(/borderRadius/);
    // Simon Q-260914-02: font scaling stays uncapped; the rows grow with it instead.
    expect(src).not.toContain("maxFontSizeMultiplier");
  }
  expect(wheel).toContain("Math.ceil(SELECTED_LINE * fontScale)");
  // Rows take a minimum height so a label that wraps at the largest text sizes grows its row.
  expect(wheel).toContain("const rowStyle = { minHeight: row };");
});
