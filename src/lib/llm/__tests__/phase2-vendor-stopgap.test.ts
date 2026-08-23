// R6 guard: the Phase-2 reasoning seats are on a STOPGAP vendor. The design intent
// (D-26) is Anthropic/Claude for the KO-prose narrative surfaces, but the account's
// credits were exhausted on 2026-07-06 so all nine live seats were re-pinned to
// OpenAI (gpt-5.4). That deviation had no test, so it could silently outlive its
// reason. This pins the current stopgap (any change is now a conscious CI event),
// verifies the code-free revert switch works, and documents the revert.
//
// REVERT (when Anthropic has credits AND the post-deadline review greenlights it,
// per docs handoff ai_260721 -- gemini/openai stays during D-27):
//   * code-free, immediate: set EXPO_PUBLIC_LLM_VENDOR=claude (routes every seat to
//     claude-proxy, which is still deployed + keyed), OR =gemini for the $0 backbone;
//   * permanent: flip the PHASE2_VENDOR values below back to "claude" and update the
//     STOPGAP_SEATS expectation here.
// Which vendor actually served each call is auditable (ai_audit_log.reasoning_vendor,
// 0095), so the stopgap is observable in prod, not just in code.

import { PHASE2_VENDOR, resolveVendorForPurpose } from "../routing";
import type { PromptPurpose } from "../types";

// V-4 (Simon, 2026-08-23) moved the two prose seats to Claude, which is the
// "permanent" revert this file's header described. The stopgap is now PARTIAL,
// so the lists are split rather than the guard being loosened: a seat drifting
// between these two arrays is still a CI event.
const CLAUDE_SEATS: PromptPurpose[] = ["persona_narrative", "persona_synthesis"];

const STOPGAP_SEATS: PromptPurpose[] = [
  "advisor",
  "gap_synthesize",
  "self_model_propose",
  "northstar_propose",
  "axis_estimate",
  "ops_recommend",
  "ops_daily_brief",
  "digest_weekly",
  "ttfv_first_insight",
  "cluster_infer",
];

describe("R6: Phase-2 OpenAI stopgap is pinned + reversible", () => {
  const savedVendor = process.env.EXPO_PUBLIC_LLM_VENDOR;
  const savedPhase = process.env.EXPO_PUBLIC_LLM_PHASE;
  afterEach(() => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = savedVendor;
    process.env.EXPO_PUBLIC_LLM_PHASE = savedPhase;
  });

  test("the seats split exactly two ways, and cover the whole map", () => {
    for (const seat of STOPGAP_SEATS) expect(PHASE2_VENDOR[seat]).toBe("openai");
    for (const seat of CLAUDE_SEATS) expect(PHASE2_VENDOR[seat]).toBe("claude");
    // No third vendor, and no seat missing from either list - the point of the
    // original guard was that a seat cannot drift somewhere unnoticed, and that
    // survives the split.
    expect([...STOPGAP_SEATS, ...CLAUDE_SEATS].sort()).toEqual(Object.keys(PHASE2_VENDOR).sort());
    for (const vendor of Object.values(PHASE2_VENDOR)) {
      expect(["openai", "claude"]).toContain(vendor);
    }
  });

  test("⚠ the map is unreachable while EXPO_PUBLIC_LLM_VENDOR names a vendor", () => {
    // The trap V-4 walks into. Step 2 of resolveVendorForPurpose returns the
    // env value verbatim for every seat, and the console set it to "openai" on
    // 2026-08-23 - so editing PHASE2_VENDOR alone changes nothing in
    // production. Pinned as a test because "I changed the map" reads as done.
    process.env.EXPO_PUBLIC_LLM_VENDOR = "openai";
    for (const seat of CLAUDE_SEATS) {
      expect(resolveVendorForPurpose(seat, false)).toBe("openai");
    }
    // perPurpose is the flip that makes the map mean something.
    process.env.EXPO_PUBLIC_LLM_VENDOR = "perPurpose";
    for (const seat of CLAUDE_SEATS) expect(resolveVendorForPurpose(seat, false)).toBe("claude");
    for (const seat of STOPGAP_SEATS) expect(resolveVendorForPurpose(seat, false)).toBe("openai");
  });

  test("EXPO_PUBLIC_LLM_VENDOR=claude is a code-free revert for every seat", () => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = "claude";
    for (const seat of STOPGAP_SEATS) {
      expect(resolveVendorForPurpose(seat, false)).toBe("claude");
    }
  });

  test("the backbone override never routes non-seats (streaming chat) off Gemini", () => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = "claude";
    expect(resolveVendorForPurpose("secondb_chat", false)).toBe("gemini");
  });

  test("image-bearing calls stay Gemini even under a backbone override", () => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = "openai";
    expect(resolveVendorForPurpose("advisor", true)).toBe("gemini");
  });
});
