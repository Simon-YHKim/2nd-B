// F11 guard: crisis matching must fold full-width / compatibility Latin (IME
// full-width mode, pasted compatibility forms) to ASCII before matching. The
// classifier used NFC, which does NOT fold full-width Latin, so a full-width
// "ｉ ｗａｎｔ ｔｏ ｄｉｅ" slipped RED->GREEN on the lexicon-only path (keyless web,
// where the semantic layer is dark). NFKC folds it. This pins that behavior.

import { classifyInput } from "../classifier";

// Map ASCII printables to their full-width forms (U+FF01..U+FF5E) and spaces to
// the ideographic space (U+3000) -- the exact shapes an IME/full-width paste yields.
function toFullWidth(s: string): string {
  return s
    .replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0))
    .replace(/ /g, "　");
}

describe("F11: NFKC folds full-width Latin crisis terms to RED", () => {
  test("full-width EN crisis phrase is caught (was a silent bypass under NFC)", () => {
    const fw = toFullWidth("i want to die");
    expect(fw).not.toBe("i want to die"); // sanity: it really is full-width
    expect(classifyInput(fw, "en").zone).toBe("red");
  });

  test("full-width 'suicide' is caught", () => {
    expect(classifyInput(toFullWidth("suicide"), "en").zone).toBe("red");
  });

  test("full-width benign text stays GREEN (no NFKC over-match)", () => {
    expect(classifyInput(toFullWidth("i love sunny days and coffee"), "en").zone).toBe("green");
  });

  test("plain-ASCII behavior is unchanged", () => {
    expect(classifyInput("i want to die", "en").zone).toBe("red");
    expect(classifyInput("today was a good day", "en").zone).toBe("green");
  });
});
