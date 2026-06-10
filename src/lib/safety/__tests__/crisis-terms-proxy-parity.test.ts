// Audit MED (crisis-terms duplication): the gemini-proxy Edge Function keeps
// its own copy of CRISIS_TERMS so it can be its own C9 safety boundary (a Deno
// function can't import the RN/Node lexicon module). This test enforces the
// "keep in sync" contract the proxy comment describes: the proxy's
// CRISIS_TERMS_EN / CRISIS_TERMS_KO must stay byte-identical (and in the same
// order) to src/lib/safety/lexicon.ts CRISIS_TERMS, failing the build on drift.

import { readFileSync } from "fs";
import { resolve } from "path";

import * as ts from "typescript";

import { classifyInput } from "../classifier";
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

// Behavior parity: the proxy's hasCrisisTerm must use the same EN
// word-boundary matching as the client classifier (classifier.ts:matchesTerm),
// not naive substring matching, so benign substrings (e.g. "spending it"
// containing "ending it") don't 422 legitimate prompts. We extract the actual
// matcher source from the Deno function, transpile it, and exercise it here.
describe("gemini-proxy hasCrisisTerm word-boundary behavior parity", () => {
  const proxySrc = readFileSync(
    resolve(__dirname, "../../../../supabase/functions/gemini-proxy/index.ts"),
    "utf8",
  );

  function loadHasCrisisTerm(): (text: string) => boolean {
    const start = proxySrc.indexOf("const CRISIS_TERMS_EN");
    const fnStart = proxySrc.indexOf("function hasCrisisTerm");
    if (start < 0 || fnStart < 0) throw new Error("crisis matcher not found in gemini-proxy");
    // The function's closing brace is the first column-0 `}` after its header.
    const end = proxySrc.indexOf("\n}", fnStart);
    if (end < 0) throw new Error("hasCrisisTerm end not found");
    const snippet =
      proxySrc.slice(start, end + 2) + "\nexports.hasCrisisTerm = hasCrisisTerm;\n";
    const js = ts.transpileModule(snippet, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const exportsObj: { hasCrisisTerm?: (text: string) => boolean } = {};
    new Function("exports", js)(exportsObj);
    if (typeof exportsObj.hasCrisisTerm !== "function") {
      throw new Error("hasCrisisTerm did not evaluate to a function");
    }
    return exportsObj.hasCrisisTerm;
  }

  const hasCrisisTerm = loadHasCrisisTerm();

  test("EN: embedded substring does NOT match (word boundary)", () => {
    // "spending it" contains "ending it" as a substring; the old substring
    // matcher 422'd this. The client classifier treats it as green.
    const text = "I am spending it on groceries this week";
    expect(classifyInput(text, "en").zone).toBe("green");
    expect(hasCrisisTerm(text)).toBe(false);
  });

  test("EN: standalone term still matches at word boundaries", () => {
    const text = "lately I keep thinking about ending it";
    expect(classifyInput(text, "en").zone).toBe("red");
    expect(hasCrisisTerm(text)).toBe(true);
  });

  test("EN: embedded first occurrence does not mask a later standalone one", () => {
    const text = "I was spending it freely, then talked about ending it";
    expect(classifyInput(text, "en").zone).toBe("red");
    expect(hasCrisisTerm(text)).toBe(true);
  });

  test("EN: punctuation counts as a boundary", () => {
    const text = "suicide.";
    expect(classifyInput(text, "en").zone).toBe("red");
    expect(hasCrisisTerm(text)).toBe(true);
  });

  test("EN: case-insensitive matching preserved", () => {
    const text = "I WANT TO DIE";
    expect(classifyInput(text, "en").zone).toBe("red");
    expect(hasCrisisTerm(text)).toBe(true);
  });

  test("KO: substring matching preserved (no Hangul word boundaries)", () => {
    const text = "요즘 자살예방 캠페인 뉴스를 봤다";
    expect(classifyInput(text, "ko").zone).toBe("red");
    expect(hasCrisisTerm(text)).toBe(true);
  });

  test("benign input stays green on both sides", () => {
    const text = "today I planned my week and cooked dinner";
    expect(classifyInput(text, "en").zone).toBe("green");
    expect(hasCrisisTerm(text)).toBe(false);
  });
});
