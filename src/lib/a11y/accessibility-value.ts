import { Platform } from "react-native";

/**
 * Announce a control's value on BOTH platforms.
 *
 * React Native reads the `accessibilityValue={{ min, max, now, text }}` object.
 * React Native Web does not: `createDOMProps` only looks at the flat props
 * `accessibilityValueMin/Max/Now/Text` (or their `aria-*` equivalents) and
 * silently drops the object. So a control that sets only the object renders on
 * web as its role with no value at all - a `role="slider"` whose
 * `aria-valuenow`, `aria-valuemin` and `aria-valuemax` are all absent.
 *
 * Measured 2026-09-07 in a real browser against the attested web export: the
 * museum year dial announced as "slider, 연도 탐색" and no year, and every one of
 * the twelve call sites in this repo used the object form only.
 *
 * A screen reader on web therefore says a slider or progress bar exists and
 * never says where it is - which is the entire content of those controls.
 *
 * Spread the result onto the element:
 *
 *     <View accessibilityRole="adjustable" {...a11yValue({ min, max, now, text })} />
 *
 * On native this is exactly the object the platform already expected; the flat
 * props are added only on web, so nothing extra reaches a native view.
 */
export interface A11yValue {
  min?: number;
  max?: number;
  now?: number;
  text?: string;
}

export function a11yValue(value: A11yValue) {
  if (Platform.OS !== "web") return { accessibilityValue: value };
  return {
    // Keep the object too: it is the contract on native, and a future RN Web
    // that learns to read it must not find it missing.
    accessibilityValue: value,
    accessibilityValueMin: value.min,
    accessibilityValueMax: value.max,
    accessibilityValueNow: value.now,
    accessibilityValueText: value.text,
  };
}
