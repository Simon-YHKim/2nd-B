// Embeddings were the last live path with no way off Gemini.
//
// embedTexts invoked "gemini-proxy" by NAME, so it never passed through
// resolveVendorForPurpose and none of the four vendor switches reached it. The
// sweep that proves every PromptPurpose can leave Gemini could not see it
// either - an embed call is not a PromptPurpose call, so a test that looked
// complete was silent about the one path that mattered most. Google stops
// accepting Standard keys in September and RAG depends on this.
//
// The other half of this file is about what makes flipping it dangerous, which
// is not the switch: vectors from two different models are not comparable, and
// nothing records which model produced a stored row. Search would keep working
// and start returning unrelated things.
//
// T1 stage A (2026-08-31): the UNSET default is now openai (RETIRED_DEFAULT in
// routing.ts), not gemini. Explicit "gemini" is still accepted and still routes
// to gemini-proxy - that is the one-variable rollback, and this file proves it.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { embedVendor, proxyFnForVendor } from "../routing";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

const BOUNDARY = read("src/lib/llm/boundary.ts");
const ROUTING = read("src/lib/llm/routing.ts");
const OPENAI = read("supabase/functions/openai-proxy/index.ts");
const GEMINI = read("supabase/functions/gemini-proxy/index.ts");

const KEY = "EXPO_PUBLIC_EMBED_VENDOR";
const saved = process.env[KEY];
afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});
const setEnv = (v: string | undefined) => {
  if (v === undefined) delete process.env[KEY];
  else process.env[KEY] = v;
};

describe("the default is openai since T1 stage A", () => {
  test("unset resolves to openai", () => {
    setEnv(undefined);
    expect(embedVendor()).toBe("openai");
    expect(proxyFnForVendor(embedVendor())).toBe("openai-proxy");
  });

  test("junk falls back to openai rather than to nothing", () => {
    for (const v of ["", "  ", "anthropic", "grok", "true"]) {
      setEnv(v);
      expect(embedVendor()).toBe("openai");
    }
  });

  test("explicit gemini still resolves to gemini-proxy (one-variable rollback)", () => {
    setEnv("Gemini");
    expect(embedVendor()).toBe("gemini");
    expect(proxyFnForVendor(embedVendor())).toBe("gemini-proxy");
  });
});

describe("only the two vendors that can actually embed", () => {
  test("openai is accepted", () => {
    setEnv("OpenAI");
    expect(embedVendor()).toBe("openai");
    expect(proxyFnForVendor(embedVendor())).toBe("openai-proxy");
  });

  test("claude and xai are refused and land on the openai default", () => {
    // claude has no embeddings API and xai-proxy has no embed route.
    // Accepting either would turn a capability gap into a 400 on every index
    // build - the same mistake as letting the multimodal switch name a proxy
    // that cannot carry a binary. Refused values fall to RETIRED_DEFAULT, which
    // is openai since T1 stage A.
    for (const v of ["claude", "xai"]) {
      setEnv(v);
      expect(embedVendor()).toBe("openai");
    }
  });
});

describe("the call site actually uses it", () => {
  test("no proxy is named by literal any more", () => {
    // The bug itself. A hardcoded name is invisible to every switch and to the
    // sweep that checks the switches.
    expect(BOUNDARY).toContain('invoke(proxyFnForVendor(embedVendor())');
    expect(BOUNDARY).not.toMatch(/invoke\("gemini-proxy", \{\s*\n\s*body: \{ op: "embed"/);
  });
});

describe("openai-proxy can serve it, with the same guards", () => {
  test("the route exists", () => {
    expect(OPENAI).toContain("body?.op === 'embed'");
  });

  test("the dimension is forced to the column's width", () => {
    // wiki_pages.embedding and records.embedding are vector(768). Without the
    // `dimensions` parameter the reply is the model's native width and every
    // insert fails on the column type.
    expect(OPENAI).toContain("dimensions: EMBED_DIM");
    expect(OPENAI).toMatch(/const EMBED_DIM = 768;/);
  });

  test("a wrong-shaped batch is refused, not written", () => {
    // The caller writes whatever it gets. A short or mis-sized batch would
    // become a corrupt index rather than an error.
    expect(OPENAI).toContain("embed_shape_mismatch");
    expect(OPENAI).toMatch(/vectors\.length !== texts\.length \|\| vectors\.some\(\(v\) => v\.length !== EMBED_DIM\)/);
  });

  test("the reply is sorted by index rather than trusted in order", () => {
    // The caller matches vectors to texts POSITIONALLY. A reordered reply
    // attaches every embedding to the wrong page, and the result still looks
    // like a working search.
    expect(OPENAI).toMatch(/rows\.sort\(\(a, b\) => \(Number\(a\?\.index\)/);
  });

  test("the same limits and the same crisis backstop as gemini-proxy", () => {
    // Divergence here shows up as a quota gap or a safety gap, not as an
    // obvious bug, so the numbers are compared against the original.
    for (const src of [OPENAI, GEMINI]) {
      expect(src).toMatch(/const MAX_EMBED_TEXTS = 50;/);
      expect(src).toMatch(/const MAX_EMBED_TEXT_LEN = 2000;/);
    }
    const route = OPENAI.slice(OPENAI.indexOf("body?.op === 'embed'"), OPENAI.indexOf("const userText"));
    expect(route).toContain("hasCrisisTerm(t)");
    expect(route).toContain("bump_gemini_spend");
    expect(route).toContain("purpose: 'embed_index'");
    expect(route).toContain("reasoning_vendor: 'openai'");
  });
});

describe("the re-index hazard is written where someone will read it", () => {
  test("the switch carries the warning, not just the docs", () => {
    // 0068 already lived this: when text-embedding-004 was retired, every
    // stored vector had to be nulled. The difference now is that nothing
    // records which model produced a row, so a half-migrated table cannot be
    // told from a healthy one.
    const note = ROUTING.slice(ROUTING.indexOf("EXPO_PUBLIC_EMBED_VENDOR"), ROUTING.indexOf("export function embedVendor"));
    expect(note).toMatch(/RE-INDEX/);
    expect(note).toMatch(/0068/);
    expect(note).toMatch(/nothing records WHICH model/);
  });
});

describe("the switch reaches every build", () => {
  test.each([
    [".github/workflows/web-deploy.yml"],
    [".github/workflows/android-release.yml"],
    ["eas.json"],
  ])("%s passes it", (rel) => {
    // A switch no build passes is a switch that does nothing and says nothing -
    // exactly what happened to the multimodal and backbone switches.
    expect(read(rel)).toContain(KEY);
  });

  test("eas.json holds no empty value for it", () => {
    // An empty string there makes eas-cli refuse to parse the file at all.
    const eas = JSON.parse(read("eas.json")) as { build: Record<string, { env?: Record<string, string> }> };
    for (const cfg of Object.values(eas.build)) {
      if (cfg.env && KEY in cfg.env) expect(cfg.env[KEY]).not.toBe("");
    }
  });
});
