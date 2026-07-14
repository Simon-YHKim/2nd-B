// Audit MED (crisis-terms duplication): the LLM proxy Edge Functions keep their
// own copy of CRISIS_TERMS so each is its own C9 safety boundary (a Deno function
// can't import the RN/Node lexicon module). Two copies exist:
//   - supabase/functions/gemini-proxy/index.ts      (inlined; the $0 backbone)
//   - supabase/functions/_shared/llm-proxy-common.ts (claude-proxy + openai-proxy)
// This test enforces the "keep in sync" contract those comments describe, for BOTH:
// the term lists must stay byte-identical (and in order) to src/lib/safety/lexicon.ts,
// and the matching SEMANTICS must equal the client classifier's. A behaviour drift
// here is a silent crisis false-negative on the server boundary, so the build fails
// on it rather than letting the second line of defence rot.

import { readFileSync } from "fs";
import { resolve } from "path";

import * as ts from "typescript";

import { classifyInput } from "../classifier";
import { CRISIS_TERMS } from "../lexicon";

const PROXY_SOURCES = {
  "gemini-proxy": "../../../../supabase/functions/gemini-proxy/index.ts",
  "_shared/llm-proxy-common": "../../../../supabase/functions/_shared/llm-proxy-common.ts",
} as const;

function readProxy(relPath: string): string {
  return readFileSync(resolve(__dirname, relPath), "utf8");
}

function extractArray(src: string, name: string): string[] {
  const start = src.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`${name} not found in proxy source`);
  // Anchor on the assignment so the `[` in the `readonly string[]` type
  // annotation (before the `=`) isn't mistaken for the array literal.
  const eq = src.indexOf("=", start);
  const open = src.indexOf("[", eq);
  const close = src.indexOf("]", open);
  if (open < 0 || close < 0) throw new Error(`${name} array literal not found`);
  const bodyText = src.slice(open + 1, close);
  return [...bodyText.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
}

// Extract the real matcher source out of the Deno function, transpile it, and
// exercise it here. We test the shipped code, not a re-implementation of it.
function loadHasCrisisTerm(src: string): (text: string) => boolean {
  const start = src.indexOf("const CRISIS_TERMS_EN");
  const fnStart = src.indexOf("function hasCrisisTerm");
  if (start < 0 || fnStart < 0) throw new Error("crisis matcher not found in proxy source");
  // The function's closing brace is the first column-0 `}` after its header.
  const end = src.indexOf("\n}", fnStart);
  if (end < 0) throw new Error("hasCrisisTerm end not found");
  const snippet = src.slice(start, end + 2) + "\nexports.hasCrisisTerm = hasCrisisTerm;\n";
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

describe.each(Object.entries(PROXY_SOURCES))("%s crisis-term parity", (_name, relPath) => {
  const src = readProxy(relPath);

  test("CRISIS_TERMS_EN matches lexicon CRISIS_TERMS.en exactly (content + order)", () => {
    expect(extractArray(src, "CRISIS_TERMS_EN")).toEqual([...CRISIS_TERMS.en]);
  });

  test("CRISIS_TERMS_KO matches lexicon CRISIS_TERMS.ko exactly (content + order)", () => {
    expect(extractArray(src, "CRISIS_TERMS_KO")).toEqual([...CRISIS_TERMS.ko]);
  });
});

// Behaviour parity: each proxy's hasCrisisTerm must match the client classifier
// (classifier.ts:matchesTerm) on BOTH axes -- EN word boundaries (so a benign
// substring like "spending it" containing "ending it" doesn't 422 a legitimate
// prompt) and whitespace/Unicode normalization (so a term split by a newline, or
// NFD-decomposed Hangul, doesn't slip RED -> GREEN).
describe.each(Object.entries(PROXY_SOURCES))("%s hasCrisisTerm behaviour parity", (_name, relPath) => {
  const hasCrisisTerm = loadHasCrisisTerm(readProxy(relPath));

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

  // --- normalization parity (the PR that added these closed a live false-negative)

  test("EN: multi-word term split by a newline still matches", () => {
    const text = "I just want to\ndie";
    expect(classifyInput(text, "en").zone).toBe("red");
    expect(hasCrisisTerm(text)).toBe(true);
  });

  test("EN: multi-word term split by nbsp / full-width / double space still matches", () => {
    // \u00a0 = non-breaking space, \u3000 = ideographic (full-width) space.
    // Written as escapes so an editor re-save cannot silently fold them back into
    // plain ASCII spaces and quietly void the test.
    for (const gap of ["\u00a0", "\u3000", "  ", "\t"]) {
      const text = `i want to${gap}die`;
      expect(classifyInput(text, "en").zone).toBe("red");
      expect(hasCrisisTerm(text)).toBe(true);
    }
  });

  test("KO: NFD-decomposed Hangul still matches the NFC-authored lexicon", () => {
    const text = "죽고 싶어요".normalize("NFD");
    expect(classifyInput(text, "ko").zone).toBe("red");
    expect(hasCrisisTerm(text)).toBe(true);
  });

  test("KO: spaced term survives a newline between its words", () => {
    const text = "이제 그만\n죽고 싶다";
    expect(classifyInput(text, "ko").zone).toBe("red");
    expect(hasCrisisTerm(text)).toBe(true);
  });
});
