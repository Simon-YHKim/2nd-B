/** Each opening control must carry its own role, label and state. A label on
 * another button cannot satisfy a missing label in this control. */
export function openingA11yContract(source: string): boolean {
  const control = (id: string) => {
    const marker = source.indexOf(`testID="${id}"`);
    if (marker < 0) return "";
    const start = source.lastIndexOf("<Pressable", marker);
    const end = source.indexOf("</Pressable>", marker);
    const next = source.indexOf("<Pressable", marker);
    return start < 0 || end < 0 || (next >= 0 && next < end) ? "" : source.slice(start, end);
  };
  const sound = control("opening-sound");
  const skip = control("opening-skip");
  const retry = control("opening-retry");
  return source.includes('accessibilityLabel={t("loadingGate.loading")}') &&
    source.includes("accessibilityElementsHidden") &&
    source.includes('importantForAccessibility="no-hide-descendants"') &&
    sound.includes('accessibilityRole="button"') &&
    sound.includes("onPress={toggleSound}") &&
    sound.includes('accessibilityLabel={t(sounds.enabled ? "loadingGate.soundOff" : "loadingGate.soundEnable")}') &&
    sound.includes("accessibilityState={{ selected: sounds.enabled }}") &&
    sound.includes('"loadingGate.soundOn"') &&
    skip.includes('accessibilityRole="button"') &&
    skip.includes("onPress={skip}") &&
    skip.includes("disabled={!ready}") &&
    skip.includes('accessibilityLabel={t("loadingGate.skip")}') &&
    skip.includes("accessibilityState={{ disabled: !ready }}") &&
    retry.includes('accessibilityRole="button"') &&
    retry.includes('t("loadingGate.retry")');
}
