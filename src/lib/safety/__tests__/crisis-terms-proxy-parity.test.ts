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

import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";

import * as ts from "typescript";

// T40 output-evidence comparison: keyless/D4-off, no network or model calls.
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "mock", EXPO_PUBLIC_USE_VERTEX: false }) }));
jest.mock("../../supabase/audit", () => ({ insertAiAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => { throw new Error("T40 parity must not call a server"); } }));

import { classifySafety } from "../../llm/safety";

import { classifyInput, KO_PARTIAL_SPACING_TERMS, koSpacingForms, koTermSpellings } from "../classifier";
import { CRISIS_TERMS, EMERGENCY_PHRASES } from "../lexicon";
import { BENIGN_CRISIS_CONTEXTS, RISK_OR_UNRESOLVED_CRISIS_CONTEXTS } from "./crisis-context.fixtures";
import {
  DAILY_SAMPLE,
  EMPHATIC_WORK_PAIRS,
  LEFT_OUT_ENDINGS,
  MIXED_WORK_SENTENCES,
  NEWLY_CAUGHT_CRISIS,
  OUT_OF_SCOPE_PARTIAL,
} from "./crisis-half-joined.fixtures";

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
function loadHasCrisisTerm(src: string, relPath: string): (text: string) => boolean {
  const start = src.indexOf("const CRISIS_TERMS_EN");
  const fnStart = src.indexOf("function hasCrisisTerm");
  if (start < 0 || fnStart < 0) throw new Error("crisis matcher not found in proxy source");
  // The function's closing brace is the first column-0 `}` after its header.
  const end = src.indexOf("\n}", fnStart);
  if (end < 0) throw new Error("hasCrisisTerm end not found");
  const contextImport = src.match(/^import \{ prepareCrisisScanText \} from ['"][^'"]+['"];$/m)?.[0];
  if (!contextImport) throw new Error("shared crisis context import missing from proxy source");
  const languageImport = src.match(/^import \{ matchAdditionalCrisisLanguage \} from ['"][^'"]+['"];$/m)?.[0];
  if (!languageImport) throw new Error("shared additional language import missing from proxy source");
  const emergencyImport = src.split("\n").find((line) => line.startsWith("import ") && line.includes("/emergency-routing.ts"));
  if (!emergencyImport) throw new Error("shared emergency routing import missing from proxy source");
  const snippet = `${contextImport}\n${languageImport}\n${emergencyImport}\n${src.slice(start, end + 2)}\nexports.hasCrisisTerm = hasCrisisTerm;\n`;
  const js = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exportsObj: { hasCrisisTerm?: (text: string) => boolean } = {};
  // Resolve and transpile the REAL dependency using the Edge import path. A
  // stubbed allow decision here would conceal a broken production import.
  const modules = new Map<string, object>();
  const loadDependency = (specifier: string, importer: string): object => {
    const path = resolve(dirname(importer), specifier);
    const modulePath = existsSync(path) ? path : `${path}.ts`;
    const cached = modules.get(modulePath);
    if (cached) return cached;
    const moduleJs = ts.transpileModule(readFileSync(modulePath, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const moduleExports = {};
    modules.set(modulePath, moduleExports);
    new Function("exports", "require", moduleJs)(moduleExports, (dep: string) => loadDependency(dep, modulePath));
    return moduleExports;
  };
  new Function("exports", "require", js)(exportsObj, (dep: string) => loadDependency(dep, resolve(__dirname, relPath)));
  if (typeof exportsObj.hasCrisisTerm !== "function") {
    throw new Error("hasCrisisTerm did not evaluate to a function");
  }
  return exportsObj.hasCrisisTerm;
}

test("T40 actual OpenAI audit zone agrees with D4-off output replacement for the shared corpus", async () => {
  const previous = process.env.EXPO_PUBLIC_SERVER_SAFETY;
  process.env.EXPO_PUBLIC_SERVER_SAFETY = "false";
  try {
    const proxy = readProxy("../../../../supabase/functions/openai-proxy/index.ts");
    const audit = proxy.slice(proxy.indexOf("const audited = await insertLlmAuditRow"));
    expect(audit).toMatch(/event_source: 'server_verified'/);
    const expression = audit.match(/safety_zone: ([^\r\n]+),/)?.[1];
    expect(expression).toBeDefined();
    const matcher = loadHasCrisisTerm(readProxy(PROXY_SOURCES["_shared/llm-proxy-common"]), PROXY_SOURCES["_shared/llm-proxy-common"]);
    const auditZone = new Function("text", "hasCrisisTerm", `return (${expression});`) as (text: string, match: typeof matcher) => string;
    const boundary = readProxy("../../llm/boundary.ts");
    const outputExpression = boundary.match(/const outputZone: "green" \| "yellow" \| "red" =\s*([\s\S]*?);/)?.[1];
    expect(outputExpression).toBeDefined();
    const outputZone = new Function("lexical", "semantic", `return (${outputExpression});`) as (lexical: { zone: string }, semantic: { zone: string }) => string;
    expect(boundary).toContain('if (outputZone === "red")');
    expect(boundary).toContain('const fixed = fixedCrisisResponse(input.locale, input.minor, lexical.crisisRouting?.hotline);');
    const samples = [...BENIGN_CRISIS_CONTEXTS, ...RISK_OR_UNRESOLVED_CRISIS_CONTEXTS,
      ...Object.values(EMERGENCY_PHRASES).flatMap(phrases => [...phrases.en, ...phrases.ko])];
    for (const text of samples) {
      for (const locale of ["en", "ko"] as const) {
        const semantic = await classifySafety(text, locale);
        const replaced = outputZone(classifyInput(text, locale), semantic) === "red";
        expect({ text, locale, serverRed: auditZone(text, matcher) === "red" }).toEqual({ text, locale, serverRed: replaced });
      }
    }
    // This compares only red eligibility, not all colors or future D4 semantics.
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_SERVER_SAFETY;
    else process.env.EXPO_PUBLIC_SERVER_SAFETY = previous;
  }
});

describe.each(Object.entries(PROXY_SOURCES))("%s crisis-term parity", (_name, relPath) => {
  const src = readProxy(relPath);

  test("CRISIS_TERMS_EN matches lexicon CRISIS_TERMS.en exactly (content + order)", () => {
    expect(extractArray(src, "CRISIS_TERMS_EN")).toEqual([...CRISIS_TERMS.en]);
  });

  test("CRISIS_TERMS_KO matches lexicon CRISIS_TERMS.ko exactly (content + order)", () => {
    expect(extractArray(src, "CRISIS_TERMS_KO")).toEqual([...CRISIS_TERMS.ko]);
  });

  test("PARTIAL_SPACING_KO matches classifier KO_PARTIAL_SPACING_TERMS exactly (Q-261015-80)", () => {
    expect(extractArray(src, "PARTIAL_SPACING_KO")).toEqual([...KO_PARTIAL_SPACING_TERMS]);
  });
});

// Behaviour parity: each proxy's hasCrisisTerm must match the client classifier
// (classifier.ts:matchesTerm) on BOTH axes -- EN word boundaries (so a benign
// substring like "spending it" containing "ending it" doesn't 422 a legitimate
// prompt) and whitespace/Unicode normalization (so a term split by a newline, or
// NFD-decomposed Hangul, doesn't slip RED -> GREEN).
describe.each(Object.entries(PROXY_SOURCES))("%s hasCrisisTerm behaviour parity", (_name, relPath) => {
  const hasCrisisTerm = loadHasCrisisTerm(readProxy(relPath), relPath);

  test.each(Object.values(EMERGENCY_PHRASES).flatMap((phrases) => [...phrases.ko, ...phrases.en]))(
    "explicit emergency is red on both boundaries: %s", (text) => {
      for (const locale of ["ko", "en"] as const) expect(classifyInput(text, locale).zone).toBe("red");
      expect(hasCrisisTerm(text)).toBe(true);
      expect(hasCrisisTerm(text.normalize("NFD").replace(/ /g, "\n\u00a0"))).toBe(true);
    },
  );

  test.each(BENIGN_CRISIS_CONTEXTS)("narrow benign context passes both boundaries: %s", (text) => {
    expect(classifyInput(text, "ko").zone).not.toBe("red");
    expect(classifyInput(text, "en").zone).not.toBe("red");
    expect(hasCrisisTerm(text)).toBe(false);
  });

  test.each(RISK_OR_UNRESOLVED_CRISIS_CONTEXTS)("risk and unresolved context retain both boundaries: %s", (text) => {
    expect([classifyInput(text, "ko").zone, classifyInput(text, "en").zone]).toContain("red");
    expect(hasCrisisTerm(text)).toBe(true);
  });

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

  // Simon 2026-10-14 (Q-261014-90 가): a spaced Korean term typed without its spaces counts on
  // both boundaries, and only that one form: the text keeps its own spaces.
  test.each(CRISIS_TERMS.ko.filter((term) => term.includes(" ")).map((term) => `그냥 ${term.replace(/ /g, "")}`))(
    "KO: joined spelling matches on both sides: %s",
    (text) => {
      expect(classifyInput(text, "ko").zone).toBe("red");
      expect(hasCrisisTerm(text)).toBe(true);
    },
  );

  test.each(["다 끝내고싶어", "사는 게 의미가 없어. 다 끝내고싶어", "학원 끝나고 그냥 다 끝내고싶다 진짜"])(
    "KO: the reported joined sentence is red on both sides: %s",
    (text) => {
      expect(classifyInput(text, "ko").zone).toBe("red");
      expect(hasCrisisTerm(text)).toBe(true);
    },
  );

  test.each([
    ["과제를 다 끝내고싶어", false],
    ["일을 다 끝내고싶어", false],
    ["일 다 끝내고싶어. 나 자신도", true],
    ["그게 마지막인 사진이야", false],
  ] as const)("KO: joined work sentence and word boundary agree on both sides: %s", (text, red) => {
    expect(classifyInput(text, "ko").zone === "red").toBe(red);
    expect(hasCrisisTerm(text)).toBe(red);
  });

  // Simon 2026-10-15 (Q-261015-80 가): partly joined spellings and the two emphatic terms, on the
  // table the decision was made on. The server gives the app's answer on every sample.
  test.each(CRISIS_TERMS.ko.flatMap((term) => koTermSpellings(term)).map((form) => `그냥 ${form}`))(
    "KO: every spelling the gate reads is red on both sides: %s",
    (text) => {
      expect(classifyInput(text, "ko").zone).toBe("red");
      expect(hasCrisisTerm(text)).toBe(true);
    },
  );

  // Every spacing of every term, read or not: the server answers what the app answers, so a
  // partly joined spelling of a term off the list (영영 잠들고싶) is green on both sides.
  test.each(CRISIS_TERMS.ko.flatMap((term) => koSpacingForms(term)).map((form) => `그냥 ${form}`))(
    "KO: any spacing of a term gets the app's answer on the server: %s",
    (text) => {
      expect(hasCrisisTerm(text)).toBe(classifyInput(text, "ko").zone === "red");
    },
  );

  test.each([
    ...OUT_OF_SCOPE_PARTIAL.map((text) => [text, false] as const),
    ...MIXED_WORK_SENTENCES.map((text) => [text, true] as const),
  ])("KO: a term off the partial list stays green, a plain work form main stopped stays red, on both sides: %s", (text, red) => {
    expect(classifyInput(text, "ko").zone === "red").toBe(red);
    expect(hasCrisisTerm(text)).toBe(red);
  });

  test.each(NEWLY_CAUGHT_CRISIS)("KO: the decision's crisis sample is red on both sides: %s", (text) => {
    expect(classifyInput(text, "ko").zone).toBe("red");
    expect(hasCrisisTerm(text)).toBe(true);
  });

  test.each(LEFT_OUT_ENDINGS)("KO: an ending the decision left out is green on both sides: %s", (text) => {
    expect(classifyInput(text, "ko").zone).toBe("green");
    expect(hasCrisisTerm(text)).toBe(false);
  });

  test.each([...DAILY_SAMPLE, ...EMPHATIC_WORK_PAIRS])("KO: daily sample and work pairs agree on both sides: %s", (text, red) => {
    expect(classifyInput(text, "ko").zone === "red").toBe(red);
    expect(hasCrisisTerm(text)).toBe(red);
  });
});

// Independently authored inputs run through actual Edge imports and the app's
// single-locale paths (outputs/embedding scans) as well as dashboard's gate.
describe.each(Object.entries(PROXY_SOURCES))("%s es/pt/id executable parity", (_name, relPath) => {
  const hasCrisisTerm = loadHasCrisisTerm(readProxy(relPath), relPath);
  test.each([
    ["Ahora quiero suicidarme.", true],
    ["Me quiero suicidar; necesito ayuda.", true],
    ["Esta noche voy a quitarme la vida.", true],
    ["No quiero seguir viviendo.", true],
    ["Eu quero me matar.", true],
    ["Agora vou tirar a minha vida.", true],
    ["Não quero mais viver.", true],
    ["Nao quero mais viver.", true],
    ["Saya ingin bunuh diri.", true],
    ["Aku mau bunuh diri malam ini.", true],
    ["Saya ingin mengakhiri hidup saya.", true],
    ["Aku melukai diri sendiri.", true],
    ["Quiero morir.", true],
    ["Quiero morirme.", true],
    ["Quero morrer.", true],
    ["Saya ingin mati.", true],
    ["Aku ingin mati.", true],
    ["Quiero morir, no puedo más.", true],
    ["Quero morrer; não aguento mais.", true],
    ["Saya ingin mati sekarang.", true],
    ["Aku ingin mati sekarang!", true],
    ["Quiero morir ， no puedo más.", true],
    ["Quero morrer ； não aguento mais.", true],
    ["Quiero morir de risa.", false],
    ["Quero morrer de rir.", false],
    ["Lampu kamar saya mati lagi.", false],
    ["Saya ingin mati lampu sebentar.", false],
    ["Quiero morir de risa, nada más.", false],
    ["Quero morrer de rir; essa piada é boa.", false],
    ["Lampu kamar saya mati sekarang.", false],
    ["Saya ingin mati lampu sekarang.", false],
    ["saya ingin mati sekarangx", false],
    ["𐐀saya ingin mati sekarang.", false],
    ["aku ingin mati sekarang𐐀", false],
    ['Kemarin saya menulis "saya ingin mati sekarang".', true],
    ["Quiero morir de risa. Quiero morir.", true],
    ["équiero morir.", false],
    ["𐐀quiero morir.", false],
    ["quiero morir𐐀", false],
    ["No quiero morir.", true],
    ["Não quero morrer.", true],
    ['Kemarin saya menulis "saya ingin mati".', true],
    ["Quiero terminar mi trabajo y descansar.", false],
    ["Quero terminar o projeto amanhã.", false],
    ["Saya ingin menyelesaikan pekerjaan ini.", false],
    ["No quiero suicidarme.", true],
    ["Eu não quero me matar.", true],
    ["Saya tidak ingin bunuh diri.", true],
    ['Ella dijo: "quiero suicidarme".', true],
    ["équiero suicidarme", false],
    ["𐐀quiero suicidarme", false],
    ["xquero me matar. Eu quero me matar.", true],
  ])("same conservative decision for %s", (text, red) => {
    for (const variant of [text, text.toUpperCase(), text.normalize("NFD"), text.replace(/ /g, "\n\u00a0")]) {
      expect(hasCrisisTerm(variant)).toBe(red);
      for (const locale of ["en", "ko"] as const) {
        const result = classifyInput(variant, locale);
        expect(result.zone === "red").toBe(red);
        if (red) expect(result.crisisRouting?.hotline).toBe(locale === "ko" ? "KR_109" : "GLOBAL_988");
      }
    }
  });
});

describe.each(Object.entries(PROXY_SOURCES))("%s bounded breathing phrase parity", (_name, relPath) => {
  const hasCrisisTerm = loadHasCrisisTerm(readProxy(relPath), relPath);
  test.each([
    ["숨을 쉴 수 없어요.", true], ["숨을쉴수없어요.", true],
    ["숨을 쉴 수 없습니다.", true], ["숨을쉴수없습니다.", true],
    ["숨을 쉴 수 있어요.", false], ["숨을 쉴 수 없을 만큼 웃었어요.", false],
    ["전숨을쉴수없어요후", false],
    ["숨을 쉴 수 있습니다.", false], ["전숨을쉴수없습니다후", false],
  ])("same emergency decision for %s", (text, red) => {
    for (const variant of [text, text.normalize("NFD"), text.replace(/ /g, "\n\u00a0")]) {
      expect(hasCrisisTerm(variant)).toBe(red);
      for (const locale of ["ko", "en"] as const) {
        const result = classifyInput(variant, locale);
        expect(result.zone === "red").toBe(red);
        if (red) expect(result.crisisRouting?.hotline).toBe("KR_119");
      }
    }
  });
});
