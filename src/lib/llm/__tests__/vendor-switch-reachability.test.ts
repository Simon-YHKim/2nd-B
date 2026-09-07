// Two things, and the second one is why the first exists.
//
// 1. Grok (xai) is a routable vendor now (Simon, 2026-08-21).
// 2. A switch is only real if the BUILD passes it.
//
// Expo inlines EXPO_PUBLIC_* from the build environment, and this repo's
// workflows enumerate what they pass - there is no wildcard. So a switch can be
// implemented, tested, merged and documented, and setting its repo Variable
// still changes nothing, silently. That was true of
// EXPO_PUBLIC_MULTIMODAL_VENDOR and EXPO_PUBLIC_BACKBONE_VENDOR between the day
// they were written and 2026-08-21: both were absent from web-deploy.yml,
// android-release.yml and eas.json, so the planned OCR flip would have been a
// no-op that reported success.
//
// The reachability sweep below is the general form of that bug. It reads the
// switches out of the source rather than listing them, so a switch added later
// is covered without anyone remembering this file exists.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { backboneVendor, chatVendorOverride, llmVendorOverride, multimodalVendor, proxyFnForVendor } from "../routing";
import type { LlmVendor } from "../routing";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

const ROUTING = read("src/lib/llm/routing.ts");
const BOUNDARY = read("src/lib/llm/boundary.ts");
const XAI_PROXY = read("supabase/functions/xai-proxy/index.ts");

const ENV_KEYS = [
  "EXPO_PUBLIC_LLM_VENDOR",
  "EXPO_PUBLIC_CHAT_VENDOR",
  "EXPO_PUBLIC_MULTIMODAL_VENDOR",
  "EXPO_PUBLIC_BACKBONE_VENDOR",
  "EXPO_PUBLIC_REASONING_PROVIDER",
] as const;

const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const setEnv = (k: string, v: string | undefined) => {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
};

describe("a switch nobody's build passes is not a switch", () => {
  // Read the switches from the source instead of listing them here. A literal
  // list would have to be remembered; this cannot be forgotten.
  // Both spellings: routing.ts reads process.env directly, boundary.ts goes
  // through an `env` helper object. Matching only the first form found six of
  // the nine and would have called that complete.
  const declared = new Set(
    [...`${ROUTING}${BOUNDARY}`.matchAll(/(?:process\.)?env\.(EXPO_PUBLIC_[A-Z_]+)/g)].map((m) => m[1]),
  );

  // Deliberate exclusions, each with a reason. Not a place to park a failure.
  const EXEMPT = new Set([
    // The retired Vertex branch (C2). It is read to stamp an audit field and
    // defaults false; there is no posture an operator would flip it to.
    "EXPO_PUBLIC_USE_VERTEX",
  ]);

  const WEB = read(".github/workflows/web-deploy.yml");
  const ANDROID = read(".github/workflows/android-release.yml");
  const EAS = read("eas.json");

  test("the sweep found the switches (a silent zero would pass everything)", () => {
    expect(declared.size).toBeGreaterThanOrEqual(8);
    for (const k of ENV_KEYS) expect(declared.has(k)).toBe(true);
  });

  test.each([...ENV_KEYS])("%s reaches the web build", (key) => {
    expect(WEB).toContain(key);
  });

  test.each([...ENV_KEYS])("%s reaches the native build", (key) => {
    expect(ANDROID).toContain(key);
    // eas.json carries all of them now, LLM_VENDOR included. It used to be
    // exempt here on unset-semantics grounds; see the test below for why that
    // exemption was the thing hiding the divergence.
    expect(EAS).toContain(key);
  });

  test("eas.json holds no empty EXPO_PUBLIC_* value", () => {
    // THE ACTUAL BUG, and it is worth more than the presence checks above.
    // eas-cli refuses to parse an eas.json with an empty env string:
    //   "build.preview.env.EXPO_PUBLIC_LLM_VENDOR" is not allowed to be empty
    // That is not a warning. Every `eas build` and every `eas update` fails
    // before doing anything, so OTA publishing and native builds were both
    // dead from the moment #1234 added EXPO_PUBLIC_LLM_VENDOR: "" until this
    // was found on 2026-08-21. Nobody noticed because the OTA gate skips
    // publishing on an ordinary merge and no native build ran in between.
    const eas = JSON.parse(EAS) as { build: Record<string, { env?: Record<string, string> }> };
    const empties: string[] = [];
    for (const [profile, cfg] of Object.entries(eas.build)) {
      for (const [key, value] of Object.entries(cfg.env ?? {})) {
        if (value === "") empties.push(`${profile}.${key}`);
      }
    }
    expect(empties).toEqual([]);
  });

  test("EXPO_PUBLIC_LLM_VENDOR is PRESENT in eas.json, with a real value", () => {
    // This assertion used to say the opposite, and its reasoning was sound
    // while its conclusion was wrong. The reasoning (as of when it was
    // written; since T1 stage A, 2026-08-31, unset resolves openai): the other
    // switches default to "gemini", so writing "gemini" equals unset, while
    // this one defers to the phase rule instead - no literal reproduces
    // "unset", and "" is what broke eas-cli, so absence was the only way to
    // say unset.
    //
    // All true. What it missed is that "unset" is not neutral here. Phase 1
    // pins every reasoning seat to Gemini, so leaving the key out was not
    // declining to have an opinion - it was choosing Gemini for all twelve,
    // silently, in the one build path nobody can inspect after the fact.
    //
    // The cost surfaced on 2026-08-24: the console had moved the web to OpenAI
    // days earlier, native was still on the phase rule, and the v0.2.0 APK on
    // GitHub Releases was routing 100% of its AI at a key Google stops
    // honouring in September. The ledger had been saying so since 08-23 22:31.
    //
    // So native states its posture out loud now. If it should differ from the
    // web, it differs on purpose and in writing - see
    // native-web-vendor-parity.test.ts, which is the assertion that would have
    // caught this one.
    const eas = JSON.parse(EAS) as { build: Record<string, { env?: Record<string, string> }> };
    for (const profile of ["preview", "production"]) {
      const env = eas.build[profile]?.env ?? {};
      expect(env.EXPO_PUBLIC_LLM_VENDOR).toBeTruthy();
    }
  });

  test("every switch the LLM layer reads is passed by every build path", () => {
    const missing: string[] = [];
    for (const key of declared) {
      if (EXEMPT.has(key)) continue;
      const gaps = [
        WEB.includes(key) ? null : "web-deploy.yml",
        ANDROID.includes(key) ? null : "android-release.yml",
        // No exemption here any more. A key absent from eas.json is a key
        // whose native value is whatever the code happens to default to, and
        // that default is not visible from anything an operator reads.
        EAS.includes(key) ? null : "eas.json",
      ].filter(Boolean);
      if (gaps.length > 0) missing.push(`${key} -> ${gaps.join(", ")}`);
    }
    expect(missing).toEqual([]);
  });
});

describe("xai is routable", () => {
  test("the vendor resolves to its own proxy", () => {
    expect(proxyFnForVendor("xai")).toBe("xai-proxy");
    // The other three are unchanged; a new branch must not shadow them.
    expect(proxyFnForVendor("openai")).toBe("openai-proxy");
    expect(proxyFnForVendor("claude")).toBe("claude-proxy");
    expect(proxyFnForVendor("gemini")).toBe("gemini-proxy");
    // An undefined vendor lands on the retired default's proxy (T1 stage A,
    // 2026-08-31). gemini-proxy is reachable by NAME only, per the line above.
    expect(proxyFnForVendor(undefined)).toBe("openai-proxy");
  });

  test("the seat, chat and backbone switches accept it", () => {
    setEnv("EXPO_PUBLIC_LLM_VENDOR", "xai");
    expect(llmVendorOverride()).toBe("xai");
    setEnv("EXPO_PUBLIC_CHAT_VENDOR", "xai");
    expect(chatVendorOverride()).toBe("xai");
    setEnv("EXPO_PUBLIC_BACKBONE_VENDOR", "xai");
    expect(backboneVendor()).toBe("xai");
  });

  test("an operator typing the product name gets the vendor", () => {
    // The product is Grok; the API host, the secret and the audit ledger all
    // say xai. Refusing "grok" would fall through to the retired default
    // (openai since T1 stage A; gemini before) with no error anywhere, which
    // is the same silent no-op that made this project believe for weeks that
    // it was on OpenAI when it was not.
    setEnv("EXPO_PUBLIC_LLM_VENDOR", "grok");
    expect(llmVendorOverride()).toBe("xai");
    setEnv("EXPO_PUBLIC_CHAT_VENDOR", "  GROK  ");
    expect(chatVendorOverride()).toBe("xai");
    setEnv("EXPO_PUBLIC_BACKBONE_VENDOR", "Grok");
    expect(backboneVendor()).toBe("xai");
  });

  test("a near-miss is refused and lands on the retired default, not xai", () => {
    // The alias is one exact word. "x-ai" or "grok-4" would be a guess about
    // what the operator meant, and guessing wrong is how a call ends up at a
    // vendor nobody chose. A refused value falls to RETIRED_DEFAULT (openai
    // since T1 stage A, 2026-08-31) - the point is that it is not xai.
    for (const v of ["x-ai", "grok-4", "xAI!", "gr0k"]) {
      setEnv("EXPO_PUBLIC_BACKBONE_VENDOR", v);
      expect(backboneVendor()).toBe("openai");
    }
  });

  test("the multimodal switch does NOT accept it; it falls to the retired default", () => {
    // xai-proxy has no image or audio path and refuses an attachment outright.
    // Accepting the value here would turn a capability gap into a 415 on every
    // photo and voice memo. The refusal lands on RETIRED_DEFAULT (openai),
    // whose proxy carries both binary seats.
    setEnv("EXPO_PUBLIC_MULTIMODAL_VENDOR", "xai");
    expect(multimodalVendor()).toBe("openai");
  });
});

describe("gemini is still reachable by name (one-variable rollback)", () => {
  // T1 stage A moved every unset switch to openai. "gemini" stays an ACCEPTED
  // explicit value until gemini-proxy is deleted from the console, so a single
  // repo Variable can put a switch back. This is the property that makes the
  // default flip reversible; if it goes, the rollback goes with it.
  test("each switch this file exercises accepts an explicit gemini", () => {
    setEnv("EXPO_PUBLIC_LLM_VENDOR", "gemini");
    expect(llmVendorOverride()).toBe("gemini");
    setEnv("EXPO_PUBLIC_CHAT_VENDOR", "gemini");
    expect(chatVendorOverride()).toBe("gemini");
    setEnv("EXPO_PUBLIC_BACKBONE_VENDOR", "gemini");
    expect(backboneVendor()).toBe("gemini");
    setEnv("EXPO_PUBLIC_MULTIMODAL_VENDOR", "gemini");
    expect(multimodalVendor()).toBe("gemini");
    // and the name resolves to its own proxy, not the default's
    expect(proxyFnForVendor("gemini")).toBe("gemini-proxy");
  });
});

describe("the xai proxy seats what the switches can point at", () => {
  function seats(): string[] {
    const block = XAI_PROXY.match(/const PURPOSE_MODEL: Record<string, string> = \{([\s\S]*?)\n\};/);
    if (!block) throw new Error("xai-proxy 의 PURPOSE_MODEL 을 못 찾았다");
    return [...block[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
  }

  test("the twelve reasoning seats plus chat", () => {
    expect(seats().sort()).toEqual(
      [
        "advisor",
        "axis_estimate",
        "cluster_infer",
        "digest_weekly",
        "gap_synthesize",
        "northstar_propose",
        "ops_daily_brief",
        "ops_recommend",
        "persona_narrative",
        "persona_synthesis",
        "secondb_chat",
        "self_model_propose",
        "ttfv_first_insight",
      ].sort(),
    );
  });

  test("the nine backbone purposes are deliberately absent", () => {
    // They are the highest-volume surfaces in the app (one classify per
    // capture, one per clip) and no cheap Grok tier is confirmed. Seating them
    // on the frontier model to make BACKBONE_VENDOR=xai "work" would be the
    // most expensive mistake available in that file. Unseated, the call answers
    // purpose_not_seated: loud, and free.
    const backbone = [
      "audit_qa",
      "capture_classify",
      "clipper_classify",
      "clipper_template_propose",
      "imagine",
      "import_ingest",
      "interview_probe",
      "reasoning_connect",
      "source_ingest",
    ];
    for (const p of backbone) expect(seats()).not.toContain(p);
  });

  test("no binary seat, and attachments are refused rather than dropped", () => {
    expect(seats()).not.toContain("capture_ocr");
    expect(XAI_PROXY).toContain("attachment_not_supported");
    expect(XAI_PROXY).not.toContain("image_url");
  });
});

describe("the xai proxy keeps the shared guarantees", () => {
  test("same spend counter, no new allowance", () => {
    expect(XAI_PROXY).toContain("bump_gemini_spend");
    expect(XAI_PROXY).toContain("refund_gemini_spend");
  });

  test("crisis screening runs before any paid call", () => {
    const crisis = XAI_PROXY.indexOf("safety_red_zone");
    const spend = XAI_PROXY.indexOf("bump_gemini_spend");
    const fetchCall = XAI_PROXY.indexOf("await fetch(XAI_ENDPOINT");
    expect(crisis).toBeGreaterThan(-1);
    expect(crisis).toBeLessThan(spend);
    expect(spend).toBeLessThan(fetchCall);
  });

  test("the purpose allowlist uses hasOwnProperty, not `in`", () => {
    // `in` walks the prototype chain, so 'toString' / '__proto__' passed the
    // same gate in openai-proxy and resolveModel returned an inherited
    // FUNCTION as the model.
    expect(XAI_PROXY).toContain("Object.prototype.hasOwnProperty.call(PURPOSE_MODEL, purpose)");
    expect(XAI_PROXY).not.toMatch(/if \(!purpose \|\| !\(purpose in PURPOSE_MODEL\)\)/);
  });

  test("C3: the call is audited as xai", () => {
    // The audit row is the only record of which vendor served a call, and the
    // only way the first live Grok call gets confirmed.
    expect(XAI_PROXY).toContain("from('ai_audit_log')");
    expect(XAI_PROXY).toContain("reasoning_vendor: 'xai'");
  });

  test("the effort vocabulary is unchanged", () => {
    // PURPOSE_EFFORT_MAX is a cross-proxy contract. Simon's order names it
    // explicitly as not-to-be-changed.
    expect(XAI_PROXY).toContain("{ none: 0, low: 1, medium: 2, high: 3, xhigh: 4 }");
  });

  test("chat is capped at low", () => {
    // The highest-volume surface that can reach this proxy. A ceiling, not a
    // request, so a stale client cannot raise it.
    expect(XAI_PROXY).toMatch(/secondb_chat: 'low'/);
  });
});

describe("what is unverified is behind a lever, not a literal", () => {
  test("the model id can be changed without a redeploy", () => {
    expect(XAI_PROXY).toContain("XAI_PURPOSE_MODELS");
    expect(XAI_PROXY).toContain("XAI_MODEL");
  });

  test("reasoning_effort is opt-in", () => {
    // xAI accepts it on some models and rejects it on others, and an
    // unsupported parameter fails the WHOLE call rather than degrading. The
    // effort still bounds max_tokens and is still audited either way.
    expect(XAI_PROXY).toContain("XAI_SEND_REASONING_EFFORT");
    expect(XAI_PROXY).toMatch(/sendsReasoningEffort\(\) \? \{ reasoning_effort: clampedEffort \} : \{\}/);
    expect(XAI_PROXY).toContain("reasoning_effort: clampedEffort,\n      key_combo");
  });

  test("the structured-output dialect can be downgraded without a redeploy", () => {
    expect(XAI_PROXY).toContain("XAI_RESPONSE_FORMAT");
    expect(XAI_PROXY).toContain("'json_object'");
  });

  test("the unverified points are stated, not implied", () => {
    // A future reader must be able to tell a measured constant from a guess.
    expect(XAI_PROXY).toContain("UNVERIFIED");
  });
});

describe("nothing routes to xai by default", () => {
  test("every switch left unset lands on the retired default (openai), never xai", () => {
    // Until T1 stage A (2026-08-31) unset meant gemini. It now means openai;
    // the invariant this test guards is that it never means xai.
    for (const k of ENV_KEYS) setEnv(k, undefined);
    expect(llmVendorOverride()).toBeNull();
    expect(chatVendorOverride()).toBeNull();
    expect(backboneVendor()).toBe("openai");
    expect(multimodalVendor()).toBe("openai");
  });

  test("the seat map still ships as openai, not xai", () => {
    // Simon's first flip is OpenAI. Grok being routable must not quietly
    // become Grok being routed.
    // Anchored on the declaration, not the first mention: the name appears in
    // comments far above, and an unanchored match swept in prose that quotes
    // other vendor names.
    const block = ROUTING.match(/export const PHASE2_VENDOR[\s\S]*?\n\};/);
    expect(block).toBeTruthy();
    expect(block![0]).not.toContain('"xai"');
  });
});

// Exercise the type so a widened union that forgets a branch is a compile error
// here rather than a runtime surprise elsewhere.
const ALL_VENDORS: LlmVendor[] = ["gemini", "claude", "openai", "xai"];
test("every vendor in the union has a proxy", () => {
  for (const v of ALL_VENDORS) expect(proxyFnForVendor(v)).toMatch(/-proxy$/);
});
