// The last two "gemini-proxy" literals in the client (September decommission).
//
// Both survived the four vendor switches for the same reason embeddings did:
// they name a proxy directly instead of resolving one, so nothing that sweeps
// PromptPurpose could see them. Both also fail QUIETLY rather than loudly when
// the key dies, which is why neither would have been found by waiting.
//
//   the outage failover  retries on a dead key, so every error costs an extra
//                        round trip AND the caller ends up holding Gemini's
//                        error instead of the one that actually happened.
//   the safety classifier catches everything and returns null, so a dead key
//                        means it silently becomes lexicon-only while the flag
//                        still reads "on" - a safety layer reporting as enabled
//                        and classifying nothing.
//
// T1 stage A (2026-08-31): unset no longer means gemini on either switch. The
// failover resolves "none" (no retry) and the safety classifier resolves
// "openai" (RETIRED_DEFAULT). An explicit "gemini" is still accepted by both and
// still routes to gemini-proxy - that is the one-variable rollback, and the
// cases below that pin it are the ones that prove it survives.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { failoverVendor, safetyVendor, proxyFnForVendor } from "../routing";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

const BOUNDARY = read("src/lib/llm/boundary.ts");
const SAFETY = read("src/lib/llm/safety.ts");

const KEYS = ["EXPO_PUBLIC_FAILOVER_VENDOR", "EXPO_PUBLIC_SAFETY_VENDOR"] as const;
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const setEnv = (k: string, v: string | undefined) => {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
};

describe("the outage failover", () => {
  test("unset means no retry (T1 stage A: the retiring vendor is no longer the default target)", () => {
    setEnv("EXPO_PUBLIC_FAILOVER_VENDOR", undefined);
    expect(failoverVendor()).toBe("none");
  });

  test("'none' turns the retry off, and that is a supported answer", () => {
    // Once Gemini is gone the remaining targets are the vendor that just
    // failed, or opus prices during an outage. Disabling it is legitimate, so
    // it is expressible rather than requiring a code change. Since T1 stage A
    // it is also what unset resolves to; spelling it out still works.
    setEnv("EXPO_PUBLIC_FAILOVER_VENDOR", "none");
    expect(failoverVendor()).toBe("none");
  });

  test("explicit 'gemini' still retries on Gemini (rollback property)", () => {
    // explicit: unset is openai/none since T1 stage A. Naming gemini is the
    // one-variable rollback and must keep resolving to gemini-proxy.
    setEnv("EXPO_PUBLIC_FAILOVER_VENDOR", "gemini");
    const failoverTarget = failoverVendor();
    expect(failoverTarget).toBe("gemini");
    // Same narrowing boundary.ts uses at both call sites.
    expect(failoverTarget === "none" ? null : proxyFnForVendor(failoverTarget)).toBe("gemini-proxy");
  });

  test("it accepts the vendors and the grok alias", () => {
    for (const [input, want] of [["openai", "openai"], ["claude", "claude"], ["grok", "xai"]] as const) {
      setEnv("EXPO_PUBLIC_FAILOVER_VENDOR", input);
      expect(failoverVendor()).toBe(want);
    }
  });

  test("junk falls back to no retry, the same place unset lands", () => {
    // Before T1 stage A junk fell to gemini "rather than to nothing". Now
    // nothing IS the default, so junk must land exactly where unset does and
    // never on a vendor an operator did not name.
    for (const v of ["", "  ", "nope", "off"]) {
      setEnv("EXPO_PUBLIC_FAILOVER_VENDOR", v);
      expect(failoverVendor()).toBe("none");
    }
  });

  test("both call sites use the switch, and no literal is left", () => {
    expect((BOUNDARY.match(/const failoverFn = failoverTarget === "none" \? null : proxyFnForVendor/g) ?? [])).toHaveLength(2);
    const exec = BOUNDARY.replace(/^\s*\/\/.*$/gm, "");
    expect(exec).not.toContain('invoke("gemini-proxy"');
    expect(exec).not.toMatch(/primaryFn !== "gemini-proxy"/);
  });

  test("it will not retry the proxy that just failed", () => {
    // The old guard was `primaryFn !== "gemini-proxy"`, which only happened to
    // express this because the target was always Gemini. With a switch, an
    // operator can point the failover at the primary's own vendor, and a retry
    // there is a second identical failure.
    expect((BOUNDARY.match(/failoverFn && failoverFn !== primaryFn/g) ?? [])).toHaveLength(2);
  });

  test("⚠ the audit follows the target instead of saying 'gemini'", () => {
    // servedByProvider is what the audit row records. Left hardcoded, the
    // ledger would claim Gemini served a call OpenAI served - and the ledger is
    // the only place anyone can check which vendor did what.
    expect((BOUNDARY.match(/servedByProvider = failoverTarget as LlmVendor;/g) ?? [])).toHaveLength(2);
    const exec = BOUNDARY.replace(/^\s*\/\/.*$/gm, "");
    expect(exec).not.toMatch(/servedByProvider = "gemini";/);
  });
});

describe("the server-side safety classifier", () => {
  test("unset lands on openai (T1 stage A: RETIRED_DEFAULT)", () => {
    setEnv("EXPO_PUBLIC_SAFETY_VENDOR", undefined);
    expect(safetyVendor()).toBe("openai");
    expect(proxyFnForVendor(safetyVendor())).toBe("openai-proxy");
  });

  test("explicit 'gemini' still classifies on Gemini (rollback property)", () => {
    // explicit: unset is openai since T1 stage A. gemini-proxy is reachable
    // only by name now, and this is the name.
    setEnv("EXPO_PUBLIC_SAFETY_VENDOR", "gemini");
    expect(safetyVendor()).toBe("gemini");
    expect(proxyFnForVendor(safetyVendor())).toBe("gemini-proxy");
  });

  test("only the two proxies that can actually serve it are accepted", () => {
    // A safety_classify seat is not enough on its own: the proxy also needs the
    // LLM_SERVER_SAFETY_SEAT exemption, or its own crisis gate 422s exactly the
    // messages the classifier exists to read. claude and xai have neither, so
    // naming them falls to the default - openai since T1 stage A - and never
    // to the proxy that was named.
    setEnv("EXPO_PUBLIC_SAFETY_VENDOR", "openai");
    expect(safetyVendor()).toBe("openai");
    for (const v of ["claude", "xai", "grok", "junk"]) {
      setEnv("EXPO_PUBLIC_SAFETY_VENDOR", v);
      expect(safetyVendor()).toBe("openai");
    }
  });

  test("the call site resolves instead of naming a proxy", () => {
    expect(SAFETY).toContain("invoke(proxyFnForVendor(vendor)");
    const exec = SAFETY.replace(/^\s*\/\/.*$/gm, "");
    expect(exec).not.toContain('invoke("gemini-proxy"');
  });

  test("the Gemini-only model hint is sent only to Gemini", () => {
    // Every other proxy owns its model server-side and ignores the field.
    // Sending a Gemini model id to OpenAI would be noise in the request and a
    // misleading thing to read in a log.
    expect(SAFETY).toMatch(/\.\.\.\(vendor === "gemini" \? \{ model: MODELS\.flash \} : \{\}\)/);
  });

  test("it still fails to the lexicon rather than throwing", () => {
    // Unchanged, and load-bearing: the safety path must never throw. The point
    // of the switch is that the fallback stops being the ONLY outcome.
    const fn = SAFETY.slice(SAFETY.indexOf("async function classifyViaProxy"));
    expect(fn).toMatch(/return null; \/\/ the safety path must never throw/);
  });
});

describe("both switches reach every build", () => {
  test.each([
    [".github/workflows/web-deploy.yml"],
    [".github/workflows/android-release.yml"],
    ["eas.json"],
  ])("%s passes them", (rel) => {
    const src = read(rel);
    for (const k of KEYS) expect(src).toContain(k);
  });

  test("no empty string in eas.json", () => {
    // An empty value there makes eas-cli refuse to parse the file at all, which
    // kills every build and every OTA.
    const eas = JSON.parse(read("eas.json")) as { build: Record<string, { env?: Record<string, string> }> };
    for (const cfg of Object.values(eas.build)) {
      for (const k of KEYS) if (cfg.env && k in cfg.env) expect(cfg.env[k]).not.toBe("");
    }
  });
});

describe("what is left after this", () => {
  test("the client holds no gemini-proxy literal outside the proxy-name union", () => {
    // The sweep that closes the September client-side work. routing.ts still
    // names it in LlmProxyFn and in proxyFnForVendor's explicit "gemini" arm -
    // those ARE the resolver, not a bypass of it. (Since T1 stage A it is no
    // longer the resolver's fall-through; see the next test.)
    for (const rel of ["src/lib/llm/boundary.ts", "src/lib/llm/safety.ts", "src/lib/chat/rag.ts"]) {
      const exec = read(rel).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(exec).not.toContain('"gemini-proxy"');
    }
  });

  test("the resolver's fall-through is openai-proxy; gemini-proxy is reached only by name", () => {
    // T1 stage A. An undefined vendor lands where every unset switch lands.
    expect(proxyFnForVendor(undefined)).toBe("openai-proxy");
    expect(proxyFnForVendor("gemini")).toBe("gemini-proxy");
  });
});
