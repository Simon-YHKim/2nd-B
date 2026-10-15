/** Shared with ChatTextInput: font scale changes the box, never the type size. */
export const CHAT_INPUT_SIZE = {
  minHeight: 36,
  maxHeight: 124,
  lineHeight: 22,
  verticalPadding: 7,
} as const;

function scaledLineBox(fontScale: number): number {
  // PhoneTextInput adds a 2px border on each side of the same text/padding.
  return Math.ceil(CHAT_INPUT_SIZE.lineHeight * fontScale + 2 * CHAT_INPUT_SIZE.verticalPadding + 4);
}

/** Preserve #2212's 36 / 36 / 62 minimum at Android scale 1 / 1.3 / 2. */
export function chatInputMinimumHeight(platform: string, fontScale: number): number {
  return platform === "android" && fontScale > 1.3
    ? Math.min(CHAT_INPUT_SIZE.maxHeight, scaledLineBox(fontScale))
    : CHAT_INPUT_SIZE.minHeight;
}

/** Measured height includes soft wrapping and the phone's 44px minimum. */
export function chatComposerAlignment(platform: string, fontScale: number, inputHeight: number): "center" | "flex-end" {
  if (platform !== "android") return "flex-end";
  // The measured box is not exactly the computed one: device pixels round it up (47dp reads back as
  // 47.14dp at density 3.5) and the phone input's border can be counted in. On the Android 16 emulator a
  // second line added 22dp at scale 2.0 (62 -> 84) and 16.9dp at 1.31 (47.1 -> 64), not a whole scaled
  // line, so the slack is half an unscaled line: the limit sits between one line and two at both scales.
  const singleLineLimit = Math.max(44, scaledLineBox(fontScale)) + CHAT_INPUT_SIZE.lineHeight / 2;
  return inputHeight < singleLineLimit ? "center" : "flex-end";
}

/** Keep the compact #2207 row at ordinary scales; large text can wrap. */
export function chatStatusMaxLines(fontScale: number): 1 | 2 {
  return fontScale > 1.3 ? 2 : 1;
}
