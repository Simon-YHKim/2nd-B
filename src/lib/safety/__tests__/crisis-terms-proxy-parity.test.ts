// Audit MED (crisis-terms duplication): the gemini-proxy Edge Function keeps
// its own copy of CRISIS_TERMS so it can be its own C9 safety boundary (a Deno
// function can't import the RN/Node lexicon module). This test enforces the
// "keep in sync" contract the proxy comment describes: the proxy's
// CRISIS_TERMS_EN / CRISIS_TERMS_KO must stay byte-identical (and in the same
// order) to src/lib/safety/lexicon.ts CRISIS_TERMS, failing the build on drift.

import { readFileSync } from "fs";
import { resolve } from "path";

import { CRISIS_TERMS } from "../lexicon";

function extractArray(src: string, name: string): string[] {
  const start = src.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`${name} not found in gemini-proxy`);
  // Anchor on the assignment so the `[` in the `readonly string[]` type
  // annotation (before the `=`) isn't mistaken for the array literal.
  const eq = src.indexOf("=", start);
  const open = src.indexOf("[", eq);
  const close = src.indexOf("]", open);
  if (open < 0 || close < 0) throw new Error(`${name} array literal not found`);
  const bodyText = src.slice(open + 1, close);
  return [...bodyText.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
}

describe("gemini-proxy crisis-term parity with lexicon", () => {
  const proxySrc = readFileSync(
    resolve(__dirname, "../../../../supabase/functions/gemini-proxy/index.ts"),
    "utf8",
  );

  test("CRISIS_TERMS_EN matches lexicon CRISIS_TERMS.en exactly (content + order)", () => {
    expect(extractArray(proxySrc, "CRISIS_TERMS_EN")).toEqual([...CRISIS_TERMS.en]);
  });

  test("CRISIS_TERMS_KO matches lexicon CRISIS_TERMS.ko exactly (content + order)", () => {
    expect(extractArray(proxySrc, "CRISIS_TERMS_KO")).toEqual([...CRISIS_TERMS.ko]);
  });
});
