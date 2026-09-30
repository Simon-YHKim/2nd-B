// Korean keep-all for native Text.
//
// Korean wraps at spaces (어절), never between the syllables of one word. The
// web gets that from CSS word-break: keep-all (src/app/+html.tsx). React Native
// has no equivalent (Android textBreakStrategy still breaks inside a word), so
// long lines split mid-word on device: the settings call-recording subtitle
// rendered "...세컨비가 별로 엮 / 어요." and the chat intro modal split 질문
// across lines.
//
// keepAllKo joins the characters of each Hangul-containing word with U+2060
// WORD JOINER (zero-width, no-break on both text engines), leaving whitespace
// as the only break opportunities - the keep-all behavior. It runs on display
// strings only (after t()), so locale bundles and interpolation are untouched.
//
// Since 2026-09-30 it is applied app-wide by components/ui/PlainText (every
// native Text, user-written text included), not per call site. The call sites
// that still wrap strings by hand are harmless: keepAllKo is idempotent.
//
// A joined word wider than its box still wraps: the joiner removes break
// opportunities, and every engine falls back to breaking a word that cannot
// fit on one line (RN Web Text keeps overflow-wrap: break-word; Android and iOS
// break an over-long word at character boundaries, as they do for long URLs).
//
// The joiner never goes inside a grapheme: not before a combining mark, a
// variation selector (the emoji form of a heart), a skin tone or an emoji tag,
// not after a zero-width joiner (family emoji), and not between the two halves
// of a flag. Code points are compared as numbers so no invisible character has
// to appear in this file.

import type { ReactNode } from "react";

const HANGUL = /[가-힣]/;
const WORD_JOINER = String.fromCharCode(0x2060);
const ZERO_WIDTH_JOINER = 0x200d;

/** Code points that attach to the one before them and must not be separated from it. */
const ATTACHES_TO_PREVIOUS: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], // combining diacritical marks
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200c, 0x200d], // zero-width non-joiner, zero-width joiner
  [0x20d0, 0x20ff], // combining marks for symbols (keycap)
  [0xfe00, 0xfe0f], // variation selectors
  [0xfe20, 0xfe2f],
  [0x1f3fb, 0x1f3ff], // emoji skin tones
  [0xe0020, 0xe007f], // emoji tag sequences
  [0xe0100, 0xe01ef], // variation selectors supplement
];

const attachesToPrevious = (cp: number) => ATTACHES_TO_PREVIOUS.some(([lo, hi]) => cp >= lo && cp <= hi);
const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

function joinWord(word: string): string {
  const chars = [...word.split(WORD_JOINER).join("")];
  let out = chars[0] ?? "";
  for (let i = 1; i < chars.length; i++) {
    const a = chars[i - 1].codePointAt(0) ?? 0;
    const b = chars[i].codePointAt(0) ?? 0;
    const sameGrapheme =
      attachesToPrevious(b) || a === ZERO_WIDTH_JOINER || (isRegionalIndicator(a) && isRegionalIndicator(b));
    out += (sameGrapheme ? "" : WORD_JOINER) + chars[i];
  }
  return out;
}

export function keepAllKo(text: string): string {
  if (!HANGUL.test(text)) return text;
  return text
    .split(/(\s+)/)
    .map((seg) => (/\s/.test(seg) || !HANGUL.test(seg) ? seg : joinWord(seg)))
    .join("");
}

/**
 * keepAllKo over React children: string children are joined, nested arrays are
 * walked, and elements (a nested <Text>, an icon) are returned as they are - a
 * nested Text applies the rule to its own strings.
 */
export function keepAllChildren(children: ReactNode): ReactNode {
  if (typeof children === "string") return keepAllKo(children);
  if (Array.isArray(children)) return children.map(keepAllChildren);
  return children;
}
