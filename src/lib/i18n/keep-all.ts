// Korean line breaking for native Text.
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
//
// Middle dot (W3C klreq 7.1.2, cl-07): a line never starts with "·". Engines
// already refuse to start a line with a period, comma, colon or closing bracket,
// but they break before a middle dot, both after a space ("대표: 배소하 / ·
// 소재지") and after a letter ("결제·세금계산서 / ·환불"). So a space before the
// dot becomes a no-break space, a letter before it gets a word joiner, and a
// joined word may break right after its dots ("결제·세금계산서· / 환불은"),
// which keeps long dot lists from becoming one unbreakable run.
// On web, keep-all can still break after a closing quote before an attached
// Korean particle ("‘승인’ / 에서"). Join that quote to the word on each side;
// native keepAllKo already joins the whole word.

import type { ReactNode } from "react";

const HANGUL = /[가-힣]/;
const WORD_JOINER = String.fromCharCode(0x2060);
const NO_BREAK_SPACE = String.fromCharCode(0x00a0);
const MIDDLE_DOT = String.fromCharCode(0x00b7);
const ZERO_WIDTH_JOINER = 0x200d;
const QUOTE_BEFORE_KOREAN_PARTICLE = /([^\s\u2018\u2019\u201c\u201d])([\u2019\u201d])(?=[\uac00-\ud7a3])/gu;

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
    const breakAfterDot = chars[i - 1] === MIDDLE_DOT;
    out += (sameGrapheme || breakAfterDot ? "" : WORD_JOINER) + chars[i];
  }
  return out;
}

/**
 * Keep a middle dot off the start of a line (klreq 7.1.2): the space before it
 * becomes a no-break space and a letter before it gets a word joiner. Applies
 * to every language - a separator dot opening a line reads badly in English
 * too - and on web as well as native, since CSS has no rule for it.
 */
export function keepMiddleDotOffLineStart(text: string): string {
  if (!text.includes(MIDDLE_DOT)) return text;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (text[i + 1] === MIDDLE_DOT) {
      if (ch === " ") {
        out += NO_BREAK_SPACE;
        continue;
      }
      if (ch !== WORD_JOINER && ch !== NO_BREAK_SPACE && !/\s/.test(ch)) {
        out += ch + WORD_JOINER;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** Keep a closing quote attached to its preceding word and following Korean particle on web. */
export function keepWebPunctuationTogether(text: string): string {
  const dotted = keepMiddleDotOffLineStart(text);
  return dotted.replace(QUOTE_BEFORE_KOREAN_PARTICLE, (_match, letter: string, quote: string) =>
    `${letter}${WORD_JOINER}${quote}${WORD_JOINER}`,
  );
}

export function keepAllKo(text: string): string {
  const dotted = keepMiddleDotOffLineStart(text);
  if (!HANGUL.test(dotted)) return dotted;
  return dotted
    .split(/(\s+)/)
    .map((seg) => (/\s/.test(seg) || !HANGUL.test(seg) ? seg : joinWord(seg)))
    .join("");
}

/**
 * Apply a string rewrite to React children: string children are rewritten,
 * nested arrays are walked, and elements (a nested <Text>, an icon) are
 * returned as they are - a nested Text applies the rule to its own strings.
 */
export function mapStringChildren(children: ReactNode, rewrite: (text: string) => string): ReactNode {
  if (typeof children === "string") return rewrite(children);
  if (Array.isArray(children)) return children.map((child: ReactNode) => mapStringChildren(child, rewrite));
  return children;
}

/** keepAllKo over React children (native Text). */
export function keepAllChildren(children: ReactNode): ReactNode {
  return mapStringChildren(children, keepAllKo);
}

/**
 * A TextInput placeholder on native (QA R2A-05 · R2A-06, 2026-10-05). PlainText only
 * rewrites Text children, so an input hint kept Android's default line breaking and
 * split Korean words between syllables ("좋습니 / 다." on /capture-full, "찾 / 고" on
 * /northstar at font scale 1.3). Native gets keepAllKo; web is left as typed because
 * the textarea inherits word-break: keep-all from <html> (src/app/+html.tsx). Only the
 * drawn hint changes: accessibility labels are whatever the caller passed.
 */
export function keepAllPlaceholder<T extends string | undefined>(placeholder: T, os: string): T {
  if (os === "web" || typeof placeholder !== "string") return placeholder;
  return keepAllKo(placeholder) as T;
}
