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

import { phase2EffortFor, PHASE2_VENDOR } from "../routing";
import type { PromptPurpose, ReasoningEffort } from "../types";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

const CLAUDE = read("supabase/functions/claude-proxy/index.ts");
const OPENAI = read("supabase/functions/openai-proxy/index.ts");
const REFRESH = read("scripts/refresh-models.ts");

function proxyMap(src: string, name: string): Record<string, string> {
  const block = src.match(new RegExp(`const ${name}: Record<string, string> = \\{([\\s\\S]*?)\\n\\};`));
  if (!block) throw new Error(`${name} 을 못 찾았다`);
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/^\s*([a-z_]+):\s*'([^']+)'/gm)) out[m[1]] = m[2];
  return out;
}

const SONNET_SEATS_REMOVED = [
  "advisor",
  "secondb_chat",
  "gap_synthesize",
  "self_model_propose",
  "northstar_propose",
  "ops_recommend",
  "ops_daily_brief",
  "ttfv_first_insight",
] as const;

const OPUS_SEATS = ["persona_narrative", "axis_estimate", "persona_synthesis", "digest_weekly"] as const;

describe("the seat map is opus only", () => {
  test("every seated purpose is an opus model", () => {
    const seats = proxyMap(CLAUDE, "PURPOSE_MODEL");
    expect(Object.keys(seats).sort()).toEqual([...OPUS_SEATS].sort());
    for (const model of Object.values(seats)) expect(model).toMatch(/opus/);
  });

  test("the eight sonnet purposes are gone from the map", () => {
    const seats = proxyMap(CLAUDE, "PURPOSE_MODEL");
    for (const p of SONNET_SEATS_REMOVED) expect(seats[p]).toBeUndefined();
  });

  test("refresh cannot write a sonnet model into any purpose", () => {
    // ANTHROPIC_PURPOSE_MODELS OVERRIDES the built-in map, so an opus-only
    // proxy with a sonnet-writing refresher would be opus-only in the file and
    // sonnet in production.
    expect(REFRESH).toMatch(/export const ANTHROPIC_SONNET_PURPOSES = \[\] as const;/);
  });

  test("and it is written down that sonnet is still SERVED", () => {
    // The honest half. An unseated purpose falls to DEFAULT_CLAUDE_MODEL, which
    // is deliberately still sonnet so the outage lever stays affordable. A
    // reader who takes "opus only" literally would otherwise mis-price the
    // EXPO_PUBLIC_LLM_VENDOR=claude path.
    expect(CLAUDE).toMatch(/DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5'/);
    expect(CLAUDE).toMatch(/NO ALLOWLIST by design/);
    expect(CLAUDE).toMatch(/at sonnet price/);
  });

  test("the removed purposes still route somewhere - to OpenAI", () => {
    // Removing a seat must not strand a purpose. These eight are client-routed
    // to OpenAI, which is the actual destination the order asked for.
    for (const p of SONNET_SEATS_REMOVED) {
      if (p === "secondb_chat") continue; // routed by EXPO_PUBLIC_CHAT_VENDOR, not the seat map
      expect(PHASE2_VENDOR[p as PromptPurpose]).toBe("openai");
    }
  });
});

describe("max is a real rung now", () => {
  test("the rank table carries it", () => {
    expect(CLAUDE).toMatch(/EFFORT_RANK: Record<string, number> = \{ low: 0, medium: 1, high: 2, xhigh: 3, max: 4 \}/);
  });

  test("it is no longer folded into xhigh before the ceiling", () => {
    // The fold was the bug: it happened on the REQUESTED value, so no ceiling
    // could ever admit max and ANTHROPIC_API_KEY__MAX was unreachable.
    expect(CLAUDE).not.toMatch(/effort === 'max' \? 'xhigh'/);
    expect(CLAUDE).toMatch(/const requested = effort && effort in EFFORT_RANK \? effort : 'high';/);
  });

  test("exactly two seats are approved for it, and both are whole-corpus reads", () => {
    const ceilings = proxyMap(CLAUDE, "PURPOSE_EFFORT_MAX");
    const atMax = Object.keys(ceilings).filter((p) => ceilings[p] === "max").sort();
    expect(atMax).toEqual(["digest_weekly", "persona_synthesis"]);
    // The short-prose opus seats stay at high: frequency x unit cost is the
    // rule, and neither reads the corpus.
    expect(ceilings.persona_narrative).toBe("high");
    expect(ceilings.axis_estimate).toBe("high");
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

  test("the client asks for it on those two seats", () => {
    expect(phase2EffortFor("persona_synthesis" as PromptPurpose)).toBe("max" as ReasoningEffort);
    expect(phase2EffortFor("digest_weekly" as PromptPurpose)).toBe("max" as ReasoningEffort);
  });
});

describe("the other two vendors' axes are unchanged", () => {
  test("openai still folds max into xhigh", () => {
    // The order is explicit that this is an Anthropic-only extension. openai's
    // fold is what makes asking for max harmless on the seats that stayed
    // there - digest_weekly is still an OpenAI seat.
    expect(OPENAI).toMatch(/effort === 'max' \? 'xhigh'/);
    expect(PHASE2_VENDOR.digest_weekly).toBe("openai");
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
