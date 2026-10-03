import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openingA11yContract } from "../opening-a11y-contract";

const source = readFileSync(resolve(__dirname, "../../src/components/ui/LoadingScreen.tsx"), "utf8");

test("the approved opening has accessible loading, sound, skip and retry controls", () => {
  expect(openingA11yContract(source)).toBe(true);
});

test.each([
  'accessibilityLabel={t("loadingGate.loading")}',
  'importantForAccessibility="no-hide-descendants"',
  "accessibilityElementsHidden",
  "onPress={toggleSound}",
  'accessibilityLabel={t(sounds.enabled ? "loadingGate.soundOff" : "loadingGate.soundEnable")}',
  "accessibilityState={{ selected: sounds.enabled }}",
  '"loadingGate.soundOn"',
  "onPress={skip}",
  "disabled={!ready}",
  'accessibilityLabel={t("loadingGate.skip")}',
  "accessibilityState={{ disabled: !ready }}",
  't("loadingGate.retry")',
])("removing %s fails the opening guard", required => {
  expect(source).toContain(required);
  expect(openingA11yContract(source.replace(required, ""))).toBe(false);
});

test.each(["opening-sound", "opening-skip", "opening-retry"])("another button cannot supply a missing role on %s", id => {
  const marker = source.indexOf(`testID="${id}"`);
  const role = source.indexOf('accessibilityRole="button"', marker);
  expect(role).toBeGreaterThan(marker);
  const mutated = source.slice(0, role) + source.slice(role).replace('accessibilityRole="button"', "");
  expect(openingA11yContract(mutated)).toBe(false);
});

test("the aggregate uses the new control contract without the retired phase strings", () => {
  const checker = readFileSync(resolve(__dirname, "../check-constraints.ts"), "utf8");
  expect(checker).toContain("openingA11yContract(loadingScreen)");
  expect(checker).not.toContain('loadingScreen.includes(\'t("loadingGate.open")\')');
  expect(checker).not.toContain('loadingScreen.includes(\'t("loadingGate.enterHint")\')');
  expect(checker).not.toContain('phase === \\"zooming\\"');
});
