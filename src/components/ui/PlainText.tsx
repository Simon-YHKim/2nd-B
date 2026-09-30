import { createElement, type ComponentPropsWithRef } from "react";
import { Platform, Text as RNText } from "react-native";

import { keepAllKo, keepMiddleDotOffLineStart, mapStringChildren } from "@/lib/i18n/keep-all";

// React Native <Text> with Korean line breaking. Every Text in src/ goes through
// here: <Text variant> wraps it, and the screens that style raw text import it
// as RNText. __tests__/plain-text-guard.test.ts fails the build when a file
// imports Text from "react-native" directly again.
//
// Why (Simon QA 2026-09-30): Korean wraps at spaces (어절), never between the
// syllables of one word. On the sign-in screen the legal link read
// "환불 및 청약철회 정 / 책", and the privacy policy alone split 177 words that
// way. Latin-script locales (en · es · pt · id) already break at spaces and only
// split a token that cannot fit (a long URL), which is right, so they are left
// alone.
//
// Web: CSS word-break: keep-all on <html> (src/app/+html.tsx) keeps words whole
// for every element, so strings are not joined there and copy · find-in-page
// stay clean. CSS has no rule for the middle dot (klreq 7.1.2: a line never
// starts with "·"), so that one rewrite runs on web too.
// Native: there is no such style, so string children are rewritten with
// keepAllKo (word joiners between the syllables of a Hangul word, plus the
// middle-dot rule).
//   - selectable text is left as typed: copying it would carry the joiners.
//   - on native a lone string child keeps its original text as the
//     accessibility label, so screen readers never see the joiners (the pattern
//     the hand-wrapped call sites already used).
// Platform is read at render, not at module scope: tests that mock
// react-native without Platform import screens that import this file.

export type PlainTextProps = ComponentPropsWithRef<typeof RNText>;

export function PlainText(props: PlainTextProps) {
  const { children, selectable } = props;
  if (selectable || children == null) return createElement(RNText, props);
  const web = Platform.OS === "web";
  const rewritten = mapStringChildren(children, web ? keepMiddleDotOffLineStart : keepAllKo);
  if (rewritten === children) return createElement(RNText, props);
  const label =
    !web && typeof children === "string" && props.accessibilityLabel === undefined && props["aria-label"] === undefined
      ? children
      : props.accessibilityLabel;
  const next = { ...props, accessibilityLabel: label };
  // Spread an array back as positional children, as JSX would have passed them;
  // handing React one array child would ask every element in it for a key.
  return Array.isArray(rewritten)
    ? createElement(RNText, next, ...rewritten)
    : createElement(RNText, { ...next, children: rewritten });
}
