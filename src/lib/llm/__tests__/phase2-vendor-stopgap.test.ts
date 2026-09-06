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
//
// T1 stage A (2026-08-31): every switch in routing.ts now resolves "openai" when
// its env var is UNSET (RETIRED_DEFAULT). Until then unset meant "gemini" for the
// seats (Phase 1), for chat (EXPO_PUBLIC_CHAT_VENDOR) and for image-bearing calls
// (EXPO_PUBLIC_MULTIMODAL_VENDOR). "gemini" is still an accepted EXPLICIT value on
// each of those knobs — that is the one-variable rollback — and the tests below
// keep one explicit-gemini case per knob so the rollback cannot be lost silently.

import { PHASE2_VENDOR, resolveVendorForPurpose } from "../routing";
import type { PromptPurpose } from "../types";

// V-4 (Simon, 2026-08-23) moved the two prose seats to Claude, which is the
// "permanent" revert this file's header described. The stopgap is now PARTIAL,
// so the lists are split rather than the guard being loosened: a seat drifting
// between these two arrays is still a CI event.
const CLAUDE_SEATS: PromptPurpose[] = ["persona_narrative", "persona_synthesis", "crosscheck_defend"];

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
  "crosscheck_challenge",
];

// process.env coerces `= undefined` to the string "undefined", which is not the
// same as unset. Restore by deleting when the saved value was absent.
function restoreEnv(name: string, saved: string | undefined): void {
  if (saved === undefined) delete process.env[name];
  else process.env[name] = saved;
}

describe("R6: Phase-2 OpenAI stopgap is pinned + reversible", () => {
  const savedVendor = process.env.EXPO_PUBLIC_LLM_VENDOR;
  const savedPhase = process.env.EXPO_PUBLIC_LLM_PHASE;
  const savedChat = process.env.EXPO_PUBLIC_CHAT_VENDOR;
  const savedMultimodal = process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR;
  afterEach(() => {
    restoreEnv("EXPO_PUBLIC_LLM_VENDOR", savedVendor);
    restoreEnv("EXPO_PUBLIC_LLM_PHASE", savedPhase);
    restoreEnv("EXPO_PUBLIC_CHAT_VENDOR", savedChat);
    restoreEnv("EXPO_PUBLIC_MULTIMODAL_VENDOR", savedMultimodal);
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

  test("unset EXPO_PUBLIC_LLM_VENDOR at Phase 1 lands every seat on openai; =gemini is the explicit rollback", () => {
    // T1 stage A: unset is openai, not gemini. Phase 1 (the unset phase) used
    // to be the Gemini posture; now it is RETIRED_DEFAULT.
    delete process.env.EXPO_PUBLIC_LLM_VENDOR;
    delete process.env.EXPO_PUBLIC_LLM_PHASE;
    for (const seat of [...STOPGAP_SEATS, ...CLAUDE_SEATS]) {
      expect(resolveVendorForPurpose(seat, false)).toBe("openai");
    }
    // The header's "=gemini for the $0 backbone" revert still works explicitly.
    process.env.EXPO_PUBLIC_LLM_VENDOR = "gemini";
    for (const seat of [...STOPGAP_SEATS, ...CLAUDE_SEATS]) {
      expect(resolveVendorForPurpose(seat, false)).toBe("gemini");
    }
  });

  test("the seat override never reaches chat: secondb_chat follows only EXPO_PUBLIC_CHAT_VENDOR (unset → openai)", () => {
    // Unset chat knob resolves RETIRED_DEFAULT (openai since T1 stage A), and
    // the seat switch pointing at a DIFFERENT vendor must not pull chat along.
    delete process.env.EXPO_PUBLIC_CHAT_VENDOR;
    process.env.EXPO_PUBLIC_LLM_VENDOR = "claude";
    expect(resolveVendorForPurpose("secondb_chat", false)).toBe("openai");
    // Nor does a seat switch set to gemini drag chat back to gemini.
    process.env.EXPO_PUBLIC_LLM_VENDOR = "gemini";
    expect(resolveVendorForPurpose("secondb_chat", false)).toBe("openai");
    // Rollback property: explicit gemini on the chat knob still routes chat to
    // gemini, regardless of what the seat switch says.
    process.env.EXPO_PUBLIC_CHAT_VENDOR = "gemini";
    process.env.EXPO_PUBLIC_LLM_VENDOR = "claude";
    expect(resolveVendorForPurpose("secondb_chat", false)).toBe("gemini");
  });

  test("image-bearing calls follow only EXPO_PUBLIC_MULTIMODAL_VENDOR (unset → openai), never the seat override", () => {
    // Unset multimodal knob resolves RETIRED_DEFAULT (openai since T1 stage A).
    // The seat switch is pointed at a DIFFERENT vendor so the assertion can
    // tell "multimodal default" apart from "override leaked through".
    delete process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR;
    process.env.EXPO_PUBLIC_LLM_VENDOR = "claude";
    expect(resolveVendorForPurpose("advisor", true)).toBe("openai");
    // Rollback property: explicit gemini on the multimodal knob still wins over
    // a seat override of openai (the value the console holds today).
    process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR = "gemini";
    process.env.EXPO_PUBLIC_LLM_VENDOR = "openai";
    expect(resolveVendorForPurpose("advisor", true)).toBe("gemini");
  });
});
