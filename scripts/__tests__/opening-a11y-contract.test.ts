import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openingA11yContract } from "../opening-a11y-contract";

const source = readFileSync(resolve(__dirname, "../../src/components/ui/LoadingScreen.tsx"), "utf8");

test("the approved opening has accessible loading, a small corner skip and retry, and no sound toggle", () => {
  expect(openingA11yContract(source)).toBe(true);
});

test.each([
  'accessibilityLabel={t("loadingGate.loading")}',
  'importantForAccessibility="no-hide-descendants"',
  "accessibilityElementsHidden",
  "style={[styles.skip, ",
  "hitSlop={8}",
  't("loadingGate.skipShort")',
  'accessibilityHint={t("loadingGate.skipHint")}',
  "onPress={skip}",
  "disabled={!ready}",
  'accessibilityLabel={t("loadingGate.skip")}',
  "accessibilityState={{ disabled: !ready }}",
  't("loadingGate.retry")',
])("removing %s fails the opening guard", required => {
  expect(source).toContain(required);
  expect(openingA11yContract(source.replace(required, ""))).toBe(false);
});

test.each(["opening-skip", "opening-retry"])("another button cannot supply a missing role on %s", id => {
  const marker = source.indexOf(`testID="${id}"`);
  const role = source.indexOf('accessibilityRole="button"', marker);
  expect(role).toBeGreaterThan(marker);
  const mutated = source.slice(0, role) + source.slice(role).replace('accessibilityRole="button"', "");
  expect(openingA11yContract(mutated)).toBe(false);
});

test("bringing the sound toggle back fails the guard (Simon 2026-10-03: removed)", () => {
  const withToggle = source.replace(
    '<Pressable testID="opening-skip"',
    '<Pressable testID="opening-sound" onPress={toggleSound} accessibilityRole="button"></Pressable>\n    <Pressable testID="opening-skip"',
  );
  expect(withToggle).not.toBe(source);
  expect(openingA11yContract(withToggle)).toBe(false);
});

test("the aggregate uses the new control contract without the retired phase strings", () => {
  const checker = readFileSync(resolve(__dirname, "../check-constraints.ts"), "utf8");
  expect(checker).toContain("openingA11yContract(loadingScreen)");
  expect(checker).not.toContain('loadingScreen.includes(\'t("loadingGate.open")\')');
  expect(checker).not.toContain('loadingScreen.includes(\'t("loadingGate.enterHint")\')');
  expect(checker).not.toContain('phase === \\"zooming\\"');
});
