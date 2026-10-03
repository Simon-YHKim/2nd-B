/** Each opening control must carry its own role, label and state. A label on
 * another button cannot satisfy a missing label in this control.
 *
 * Simon (localhost QA 2026-10-03) removed the sound toggle and moved skip to a
 * small bottom-right button (its touch target stays 44 dp through hitSlop). Skip
 * keeps its role, label, hint and ready gate; the sound toggle must stay gone. */
export function openingA11yContract(source: string): boolean {
  const control = (id: string) => {
    const marker = source.indexOf(`testID="${id}"`);
    if (marker < 0) return "";
    const start = source.lastIndexOf("<Pressable", marker);
    const end = source.indexOf("</Pressable>", marker);
    const next = source.indexOf("<Pressable", marker);
    return start < 0 || end < 0 || (next >= 0 && next < end) ? "" : source.slice(start, end);
  };
  const skip = control("opening-skip");
  const retry = control("opening-retry");
  return source.includes('accessibilityLabel={t("loadingGate.loading")}') &&
    source.includes("accessibilityElementsHidden") &&
    source.includes('importantForAccessibility="no-hide-descendants"') &&
    !source.includes('testID="opening-sound"') &&
    !source.includes("toggleSound") &&
    skip.includes("style={[styles.skip, ") &&
    skip.includes("hitSlop={8}") &&
    skip.includes('t("loadingGate.skipShort")') &&
    skip.includes('accessibilityHint={t("loadingGate.skipHint")}') &&
    skip.includes('accessibilityRole="button"') &&
    skip.includes("onPress={skip}") &&
    skip.includes("disabled={!ready}") &&
    skip.includes('accessibilityLabel={t("loadingGate.skip")}') &&
    skip.includes("accessibilityState={{ disabled: !ready }}") &&
    retry.includes('accessibilityRole="button"') &&
    retry.includes('t("loadingGate.retry")');
}
