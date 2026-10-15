// REQ-260823-02: Anthropic becomes a specialist - opus seats only, and the
// "max" rung it was already paying for becomes reachable.
//
// Two failures this pins, both of the kind that read as done:
//
//   1. ANTHROPIC_API_KEY__MAX has been registered in production since
//      2026-08-23 and could never be reached, because effortToAnthropic folded
//      max into xhigh before the ceiling was consulted and EFFORT_RANK did not
//      carry the rung at all. A key nobody can reach looks exactly like a key
//      that works.
//   2. "opus only" is a claim about the SEAT MAP, not about what the proxy can
//      serve. claude-proxy has no allowlist by design, so removing a seat does
//      not remove the purpose - it moves it to DEFAULT_CLAUDE_MODEL. Asserting
//      the map alone would let someone believe sonnet is gone when it is not.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as ts from "typescript";

import { phase2EffortFor, PHASE2_EFFORT, PHASE2_VENDOR } from "../routing";
import type { PromptPurpose, ReasoningEffort } from "../types";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

const CLAUDE = read("supabase/functions/claude-proxy/index.ts");
const GEMINI = read("supabase/functions/gemini-proxy/index.ts");
const OPENAI = read("supabase/functions/openai-proxy/index.ts");
const XAI = read("supabase/functions/xai-proxy/index.ts");
const SHARED = read("supabase/functions/_shared/llm-proxy-common.ts");
const REFRESH = read("scripts/refresh-models.ts");

type ProxyVendor = "gemini" | "openai" | "claude" | "xai";
type PurposePolicy = {
  modelTier: "lite" | "flash" | "pro" | "fixed";
  maxEffort: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  modality: "text" | "image" | "audio" | "embed";
  minimumTier: "free" | "brain";
  vendors: readonly ProxyVendor[];
};
type PolicyExports = {
  LLM_PURPOSE_POLICY: Record<string, PurposePolicy>;
  resolveLlmPurposePolicy: (purpose: unknown, vendor: ProxyVendor) => PurposePolicy | null;
  clampLlmPurposeEffort: (
    policy: PurposePolicy,
    requested: unknown,
    vendor: ProxyVendor,
    vendorCeiling?: string,
  ) => string;
  requestMatchesLlmPurposeModality: (
    policy: PurposePolicy,
    actual: "text" | "image" | "audio" | "embed",
  ) => boolean;
};

function loadPurposePolicy(): PolicyExports {
  const start = SHARED.indexOf("export const LLM_PURPOSE_POLICY");
  const end = SHARED.indexOf("// --- crisis gate", start);
  if (start < 0 || end < 0) throw new Error("shared LLM purpose policy block not found");
  const js = ts.transpileModule(SHARED.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exportsObj: Partial<PolicyExports> = {};
  new Function("exports", js)(exportsObj);
  if (
    !exportsObj.LLM_PURPOSE_POLICY ||
    typeof exportsObj.resolveLlmPurposePolicy !== "function" ||
    typeof exportsObj.clampLlmPurposeEffort !== "function" ||
    typeof exportsObj.requestMatchesLlmPurposeModality !== "function"
  ) {
    throw new Error("shared LLM purpose policy did not evaluate");
  }
  return exportsObj as PolicyExports;
}

function loadOpenAiModelTierGuards(): {
  defaultModelForTier: (tier: PurposePolicy["modelTier"]) => string;
  modelAllowedForTier: (candidate: string, tier: PurposePolicy["modelTier"]) => boolean;
} {
  const start = OPENAI.indexOf("function defaultModelForTier");
  const end = OPENAI.indexOf("function resolveModel", start);
  if (start < 0 || end < 0) throw new Error("OpenAI model tier guards not found");
  const snippet = `${OPENAI.slice(start, end)}\nexport { defaultModelForTier, modelAllowedForTier };`;
  const js = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exportsObj: Record<string, unknown> = {};
  new Function("exports", js)(exportsObj);
  return exportsObj as {
    defaultModelForTier: (tier: PurposePolicy["modelTier"]) => string;
    modelAllowedForTier: (candidate: string, tier: PurposePolicy["modelTier"]) => boolean;
  };
}

// 19 = the 16 PromptPurpose members plus the three proxy-only audit labels
// (embed_index, safety_classify, voice_transcribe). It was 29 until S0.5
// (2026-10-07) removed the ten seats in REMOVED_SEATS below.
const KNOWN_PURPOSES = [
  "advisor",
  "audit_qa",
  "capture_ocr",
  "clipper_classify",
  "clipper_template_propose",
  "embed_index",
  "gap_synthesize",
  "interview_probe",
  "northstar_propose",
  "ops_daily_brief",
  "ops_recommend",
  "persona_narrative",
  "persona_synthesis",
  "reasoning_connect",
  "safety_classify",
  "secondb_chat",
  "self_model_propose",
  "source_ingest",
  "voice_transcribe",
] as const;

// The ten seats S0.5 (2026-10-07) removed from the policy and every proxy.
// Pinned so one coming back has to delete it from this list on purpose.
const REMOVED_SEATS = [
  "imagine",
  "import_ingest",
  "capture_classify",
  "capture_voice",
  "axis_estimate",
  "cluster_infer",
  "ttfv_first_insight",
  "digest_weekly",
  "crosscheck_challenge",
  "crosscheck_defend",
] as const;

function proxyMap(src: string, name: string): Record<string, string> {
  const block = src.match(new RegExp(`const ${name}: Record<string, string> = \\{([\\s\\S]*?)\\n\\};`));
  if (!block) throw new Error(`${name} 을 못 찾았다`);
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/^\s*([a-z_]+):\s*'([^']+)'/gm)) out[m[1]] = m[2];
  return out;
}

// Eight sonnet seats left on 2026-08-23. The eighth, ttfv_first_insight, then
// left the purpose union altogether in S0.5 (2026-10-07), so only these seven
// still have somewhere to route; REMOVED_SEATS covers the eighth.
const SONNET_SEATS_REMOVED = [
  "advisor",
  "secondb_chat",
  "gap_synthesize",
  "self_model_propose",
  "northstar_propose",
  "ops_recommend",
  "ops_daily_brief",
] as const;

// axis_estimate, digest_weekly and crosscheck_defend were opus seats until S0.5.
const OPUS_SEATS = [
  "persona_narrative",
  "persona_synthesis",
] as const;

// axis_estimate, cluster_infer, digest_weekly and ttfv_first_insight were xAI
// seats until S0.5: the eight live reasoning seats plus chat remain.
const XAI_SEATS = [
  "advisor",
  "gap_synthesize",
  "northstar_propose",
  "ops_daily_brief",
  "ops_recommend",
  "persona_narrative",
  "persona_synthesis",
  "secondb_chat",
  "self_model_propose",
] as const;

describe("the seat map is opus only", () => {
  test("every seated purpose is an opus model", () => {
    const seats = proxyMap(CLAUDE, "PURPOSE_MODEL");
    expect(Object.keys(seats).sort()).toEqual([...OPUS_SEATS].sort());
    for (const model of Object.values(seats)) expect(model).toMatch(/opus/);
  });

  test("the sonnet purposes are gone from the map", () => {
    const seats = proxyMap(CLAUDE, "PURPOSE_MODEL");
    for (const p of SONNET_SEATS_REMOVED) expect(seats[p]).toBeUndefined();
  });

  test("none of the S0.5 seats is left in either claude-proxy table", () => {
    const seats = proxyMap(CLAUDE, "PURPOSE_MODEL");
    const ceilings = proxyMap(CLAUDE, "PURPOSE_EFFORT_MAX");
    for (const p of REMOVED_SEATS) {
      expect({ p, seat: seats[p], ceiling: ceilings[p] }).toEqual({ p, seat: undefined, ceiling: undefined });
    }
  });

  test("refresh cannot write a sonnet model into any purpose", () => {
    // ANTHROPIC_PURPOSE_MODELS OVERRIDES the built-in map, so an opus-only
    // proxy with a sonnet-writing refresher would be opus-only in the file and
    // sonnet in production.
    expect(REFRESH).toMatch(/export const ANTHROPIC_SONNET_PURPOSES = \[\] as const;/);
  });

  test("unseated labels fail closed instead of falling back to Sonnet", () => {
    expect(CLAUDE).not.toMatch(/DEFAULT_CLAUDE_MODEL/);
    expect(CLAUDE).not.toMatch(/NO ALLOWLIST by design/);
    expect(CLAUDE).toMatch(/resolveLlmPurposePolicy\(purpose, 'claude'\)/);
    expect(CLAUDE).toMatch(/error: 'purpose_not_seated'/);
  });

  test("the removed purposes still route somewhere - to OpenAI", () => {
    // Removing a seat must not strand a purpose. These seven are client-routed
    // to OpenAI, which is the actual destination the order asked for.
    for (const p of SONNET_SEATS_REMOVED) {
      if (p === "secondb_chat") continue; // routed by EXPO_PUBLIC_CHAT_VENDOR, not the seat map
      expect(PHASE2_VENDOR[p as PromptPurpose]).toBe("openai");
    }
  });
});

describe("server-owned LLM purpose policy", () => {
  const policy = loadPurposePolicy();

  test("covers the complete 19-label audit vocabulary and no dead planner label", () => {
    expect(Object.keys(policy.LLM_PURPOSE_POLICY).sort()).toEqual([...KNOWN_PURPOSES].sort());
    expect(KNOWN_PURPOSES).toHaveLength(19);
    expect(policy.LLM_PURPOSE_POLICY).not.toHaveProperty("planner");
  });

  test("the ten S0.5 seats are unknown labels now, on every vendor", () => {
    for (const p of REMOVED_SEATS) {
      expect(policy.LLM_PURPOSE_POLICY).not.toHaveProperty(p);
      for (const vendor of ["gemini", "openai", "claude", "xai"] as const) {
        expect(policy.resolveLlmPurposePolicy(p, vendor)).toBeNull();
      }
    }
  });

  test("unknown, prototype, and known-but-unseated labels all fail closed", () => {
    for (const bad of [null, "", "planner", "toString", "constructor", "__proto__", "totally_new"]) {
      expect(policy.resolveLlmPurposePolicy(bad, "claude")).toBeNull();
    }
    // Known-but-unseated. crosscheck_challenge/gemini and capture_voice/openai
    // used to be the examples here; both labels left the table in S0.5, so they
    // are covered as unknown labels above, and live rows stand in for them.
    expect(policy.resolveLlmPurposePolicy("gap_synthesize", "claude")).toBeNull();
    expect(policy.resolveLlmPurposePolicy("reasoning_connect", "claude")).toBeNull();
    expect(policy.resolveLlmPurposePolicy("secondb_chat", "claude")).toBeNull();
    for (const bad of ["clipper_classify", "capture_ocr", "audit_qa", "reasoning_connect"]) {
      expect(policy.resolveLlmPurposePolicy(bad, "xai")).toBeNull();
    }
  });

  test("xAI exposes exactly its nine intentional seats", () => {
    const seated = KNOWN_PURPOSES.filter((purpose) =>
      policy.resolveLlmPurposePolicy(purpose, "xai") !== null
    );
    expect(seated.sort()).toEqual([...XAI_SEATS].sort());
  });

  test("a relabeled cheap purpose cannot inherit Advisor-level effort", () => {
    const gap = policy.resolveLlmPurposePolicy("gap_synthesize", "openai");
    expect(gap).not.toBeNull();
    expect(gap!.modelTier).toBe("flash");
    expect(policy.clampLlmPurposeEffort(gap!, "max", "openai", "low")).toBe("low");
    expect(policy.clampLlmPurposeEffort(gap!, undefined, "openai", "low")).toBe("low");
    const xaiGap = policy.resolveLlmPurposePolicy("gap_synthesize", "xai");
    expect(xaiGap).not.toBeNull();
    expect(policy.clampLlmPurposeEffort(xaiGap!, "max", "xai", "high")).toBe("low");
  });

  test("high-volume and media labels have hard zero-thinking/modal contracts", () => {
    // clipper_classify stands in for capture_classify (removed in S0.5): the
    // same lite / none / text row.
    const classify = policy.resolveLlmPurposePolicy("clipper_classify", "gemini");
    const ocr = policy.resolveLlmPurposePolicy("capture_ocr", "openai");
    const voice = policy.resolveLlmPurposePolicy("voice_transcribe", "openai");
    expect(classify?.modelTier).toBe("lite");
    expect(policy.clampLlmPurposeEffort(classify!, "max", "gemini")).toBe("none");
    expect(policy.requestMatchesLlmPurposeModality(ocr!, "text")).toBe(false);
    expect(policy.requestMatchesLlmPurposeModality(ocr!, "image")).toBe(true);
    expect(policy.requestMatchesLlmPurposeModality(voice!, "audio")).toBe(true);
    expect(policy.requestMatchesLlmPurposeModality(voice!, "image")).toBe(false);
  });

  test("only the real Advisor label is brain-gated", () => {
    const gated = Object.entries(policy.LLM_PURPOSE_POLICY)
      .filter(([, p]) => p.minimumTier === "brain")
      .map(([purpose]) => purpose);
    expect(gated).toEqual(["advisor"]);
  });
});

describe("all four proxies enforce the shared policy before spending", () => {
  const proxies: Array<[ProxyVendor, string]> = [
    ["gemini", GEMINI],
    ["openai", OPENAI],
    ["claude", CLAUDE],
    ["xai", XAI],
  ];

  test.each(proxies)("%s resolves a shared seat and clamps shared effort", (vendor, src) => {
    expect(src).toContain("resolveLlmPurposePolicy");
    expect(src).toContain("clampLlmPurposeEffort");
    expect(src).toMatch(new RegExp(`resolveLlmPurposePolicy\\(purpose, '${vendor}'\\)`));
    const enforcement = src.indexOf(`resolveLlmPurposePolicy(purpose, '${vendor}')`);
    expect(enforcement).toBeGreaterThan(0);
    expect(enforcement).toBeLessThan(src.indexOf("bump_gemini_spend", enforcement));
  });

  test("Gemini ignores the client model and derives its family from the policy tier", () => {
    const generation = GEMINI.slice(GEMINI.indexOf("const userText"));
    expect(generation).not.toMatch(/const model[^\n]*body\?\.model/);
    expect(generation).toMatch(/serverModelForTier\(purposePolicy\.modelTier\)/);
  });

  test("OpenAI clamps a policy tier even when an override names a dearer family", () => {
    const guards = loadOpenAiModelTierGuards();
    expect(guards.modelAllowedForTier("gpt-5.4", "flash")).toBe(false);
    expect(guards.modelAllowedForTier("gpt-5.4-mini", "flash")).toBe(true);
    expect(guards.modelAllowedForTier("gpt-5.4-nano", "flash")).toBe(true);
    expect(guards.defaultModelForTier("flash")).toBe("gpt-5.4-mini");
    expect(OPENAI).toMatch(/modelAllowedForTier\(candidate, modelTier\)/);
    expect(OPENAI).toMatch(/defaultModelForTier\(modelTier\)/);
    expect(OPENAI).toMatch(/resolveModel\(purpose, purposePolicy\.modelTier\)/);
  });

  test("xAI derives model and effort from its server-owned policy", () => {
    const generation = XAI.slice(XAI.indexOf("const userText"));
    expect(generation).not.toMatch(/const model[^\n]*body\?\.model/);
    expect(XAI).toMatch(/resolveModel\(purpose, purposePolicy\.modelTier\)/);
    expect(XAI).toMatch(/clampLlmPurposeEffort\(\s*purposePolicy,\s*effort,\s*'xai'/s);
  });

  test.each(proxies)("%s fails closed when Advisor entitlement cannot be resolved", (_vendor, src) => {
    expect(src).toMatch(/purposePolicy\.minimumTier === 'brain'/);
    expect(src).toMatch(/tierLookupFailed \|\| tierRank === null/);
    expect(src).toMatch(/error: 'entitlement_check_unavailable'/);
  });

  test("xAI fails every unresolved tier-dependent cap before spending", () => {
    const tierFailure = XAI.indexOf("tierLookupFailed || tierRank === null");
    const unavailable = XAI.indexOf("error: 'entitlement_check_unavailable'", tierFailure);
    const spend = XAI.indexOf("bump_gemini_spend", tierFailure);
    expect(tierFailure).toBeGreaterThan(0);
    expect(unavailable).toBeGreaterThan(tierFailure);
    expect(spend).toBeGreaterThan(unavailable);
  });

  test.each(proxies)("%s rejects purpose/modality mismatches", (_vendor, src) => {
    expect(src).toContain("requestMatchesLlmPurposeModality");
    expect(src).toMatch(/error: 'purpose_modality_mismatch'/);
  });
});

describe("max is a real rung now", () => {
  test("the rank table carries it", () => {
    expect(SHARED).toMatch(/max: 5/);
  });

  test("it is no longer folded into xhigh before the ceiling", () => {
    const policy = loadPurposePolicy();
    const synthesis = policy.resolveLlmPurposePolicy("persona_synthesis", "claude");
    expect(policy.clampLlmPurposeEffort(synthesis!, "max", "claude", "max")).toBe("max");
  });

  test("only whole-corpus reads are approved for it", () => {
    const ceilings = proxyMap(CLAUDE, "PURPOSE_EFFORT_MAX");
    const atMax = Object.keys(ceilings).filter((p) => ceilings[p] === "max").sort();
    // digest_weekly and crosscheck_defend sat here too until S0.5 removed them
    // (no reachable caller). persona_synthesis is the one whole-corpus read left.
    expect(atMax).toEqual(["persona_synthesis"]);
    // The short-prose opus seat stays at high: frequency x unit cost is the
    // rule, and it does not read the corpus.
    expect(ceilings.persona_narrative).toBe("high");
  });

  test("the stale 'no seat is approved for max' comment is gone", () => {
    // It was true when written and became false in this change. A comment that
    // contradicts the table under it is worse than no comment.
    expect(CLAUDE).not.toMatch(/no\s*\n?\/\/ seat is approved for "max" at all/);
    expect(CLAUDE).toMatch(/"max" IS now approved/);
  });

  test("max has an output ceiling of its own", () => {
    // Falling through to the `high` default would have made max cheaper than
    // xhigh, which is the opposite of what it means.
    expect(CLAUDE).toMatch(/case 'max':\s*\n\s*return 32000;/);
  });

  test("the client asks for it on that seat, and on no other", () => {
    expect(phase2EffortFor("persona_synthesis" as PromptPurpose)).toBe("max" as ReasoningEffort);
    // digest_weekly was the second max seat until S0.5.
    const askingMax = Object.entries(PHASE2_EFFORT).filter(([, e]) => e === "max").map(([p]) => p);
    expect(askingMax).toEqual(["persona_synthesis"]);
  });
});

describe("the other two vendors' axes are unchanged", () => {
  test("openai hard-caps max at its provisioned high rung", () => {
    // persona_synthesis replaces digest_weekly (removed in S0.5) as the max
    // row an operator can point at openai: the policy itself allows max, so a
    // "high" result can only come from the vendor cap.
    const policy = loadPurposePolicy();
    const synthesis = policy.resolveLlmPurposePolicy("persona_synthesis", "openai");
    expect(synthesis).not.toBeNull();
    expect(synthesis!.maxEffort).toBe("max");
    expect(policy.clampLlmPurposeEffort(synthesis!, "max", "openai", "high")).toBe("high");
    expect(policy.clampLlmPurposeEffort(synthesis!, "max", "openai")).toBe("high");
  });

  test("openai's ceilings did not gain a max", () => {
    const ceilings = proxyMap(OPENAI, "PURPOSE_EFFORT_MAX");
    expect(Object.values(ceilings)).not.toContain("max");
  });
});

describe("REQ-260823-01: the vendor loop", () => {
  test("it iterates the union rather than a hand-written literal", () => {
    // The literal was ["anthropic","openai","google"] with an `as Vendor[]`
    // cast, and the cast is why it could disagree with the type: "google" was
    // not assignable and "xai" was missing, and neither failed the build.
    expect(REFRESH).toMatch(/for \(const vendor of Object\.keys\(KEY_ENV\) as Vendor\[\]\)/);
    // Comments stripped before the negative check. The fix's own comment quotes
    // the old literal to explain it, and an unstripped scan fails on that -
    // the "a guard trips on its own explanation" trap this repo recorded on
    // 2026-08-23. Executable code is what the assertion is about.
    const exec = REFRESH.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(exec).not.toMatch(/\["anthropic", "openai", "google"\]/);
  });

  test("KEY_ENV covers the whole Vendor union", () => {
    // Which is what makes iterating its keys equivalent to iterating the type.
    const m = REFRESH.match(/type Vendor = ([^;]+);/);
    expect(m).toBeTruthy();
    const vendors = [...m![1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]).sort();
    const block = REFRESH.match(/const KEY_ENV: Record<Vendor, string> = \{([\s\S]*?)\n\};/);
    const keys = [...block![1].matchAll(/^\s*([a-z]+):/gm)].map((x) => x[1]).sort();
    expect(keys).toEqual(vendors);
    expect(vendors).toContain("xai");
  });
});
