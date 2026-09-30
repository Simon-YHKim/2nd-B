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
  expect(sheet).toContain("<Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={onCancel}>");
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
  expect(sheet).toContain("onSave(joinClock(draft, pattern.hour12))");
  expect(sheet).toContain("if (visible) setDraft(splitClock(value, pattern.hour12));");
  expect(sheet).toContain("paddingBottom: Math.max(insets.bottom, m3.spacing.s8)");
  expect(sheet).toContain('accessibilityLabel={t("actions.save")}');
});

test("each wheel column is one adjustable control on every platform", () => {
  expect(wheel).toContain('accessibilityRole="adjustable"');
  expect(wheel).toContain("{...a11yValue({ min: 0, max: Math.max(0, count - 1), now: index, text: current })}");
  expect(wheel).toContain('accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}');
  expect(wheel).toContain("tabIndex: 0,");
  expect(wheel).toContain("wheelKeyTarget(event.key, index, count, wrap)");
  expect(wheel).toContain('element.addEventListener("wheel", onWheel, { passive: false });');
  expect(wheel).toContain('return () => element.removeEventListener("wheel", onWheel);');
  // Neighbour rows repeat what increment/decrement already do; they stay out of the a11y tree.
  expect(wheel).toContain('importantForAccessibility="no-hide-descendants"');
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
});
