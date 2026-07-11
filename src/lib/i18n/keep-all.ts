// Korean keep-all for native Text.
//
// The web reference sets CSS word-break: keep-all, so Korean copy wraps at
// spaces. React Native has no equivalent (Android textBreakStrategy still
// breaks inside a word), so long lines split mid-word on device: the settings
// call-recording subtitle rendered "...세컨비가 별로 엮 / 어요." and the chat
// intro modal split 질문 across lines.
//
// keepAllKo joins the characters of each Hangul-containing word with U+2060
// WORD JOINER (zero-width, no-break on both text engines), leaving whitespace
// as the only break opportunities - the keep-all behavior, applied per string
// at the call site AFTER t() so locale bundles and interpolation are untouched.
//
// Use it on short UI copy only. A joined word longer than the line cannot
// wrap at all, so never feed it user-generated or unbounded text.

const HANGUL = /[가-힣]/;
const WORD_JOINER = "⁠";

export function keepAllKo(text: string): string {
  if (!HANGUL.test(text)) return text;
  return text
    .split(/(\s+)/)
    .map((seg) => (/\s/.test(seg) || !HANGUL.test(seg) ? seg : [...seg].join(WORD_JOINER)))
    .join("");
}
