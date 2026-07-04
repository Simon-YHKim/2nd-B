// D-26 Phase 2 purpose-keyed vendor routing (src/lib/llm/routing.ts).
//
// Pure-unit suite over the routing module — no network, no gateway. The
// invariants under test:
//   - Phase 1 (default): EVERY purpose resolves to the Gemini backbone.
//   - Phase 2: only the D-26 Anthropic seats move; everything else stays.
//   - Owner pin (Simon 2026-07-04): capture_ocr is Gemini UNCONDITIONALLY,
//     and any image-bearing call is forced to Gemini regardless of seat.
//   - secondb_chat stays Gemini in Phase 2 (streaming interim, D-26 A1).
//   - proxyFnForVendor maps vendors to their edge functions.

import {
  GEMINI_PINNED_PURPOSES,
  PHASE2_EFFORT,
  PHASE2_VENDOR,
  llmPhase,
  phase2EffortFor,
  proxyFnForVendor,
  resolveVendorForPurpose,
} from "../routing";
import type { PromptPurpose } from "../types";

const CLAUDE_SEATS: PromptPurpose[] = [
  "advisor",
  "persona_narrative",
  "gap_synthesize",
  "self_model_propose",
  "northstar_propose",
  "axis_estimate",
  "persona_synthesis",
  "ops_recommend",
];

const GEMINI_STAYERS: PromptPurpose[] = [
  "secondb_chat", // streaming interim — D-26 A1
  "interview_probe",
  "audit_qa",
  "clipper_classify",
  "capture_ocr",
  "capture_voice",
  "knowledge_lookup",
  "import_ingest",
  "clipper_template_propose",
  "imagine",
  "journal_reflect",
];

function withPhase<T>(phase: string | undefined, fn: () => T): T {
  const prev = process.env.EXPO_PUBLIC_LLM_PHASE;
  if (phase === undefined) delete process.env.EXPO_PUBLIC_LLM_PHASE;
  else process.env.EXPO_PUBLIC_LLM_PHASE = phase;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_LLM_PHASE;
    else process.env.EXPO_PUBLIC_LLM_PHASE = prev;
  }
}

describe("D-26 vendor routing", () => {
  test("phase defaults to 1 when the env is unset or not '2'", () => {
    withPhase(undefined, () => expect(llmPhase()).toBe(1));
    withPhase("", () => expect(llmPhase()).toBe(1));
    withPhase("1", () => expect(llmPhase()).toBe(1));
    withPhase("phase2", () => expect(llmPhase()).toBe(1));
    withPhase("2", () => expect(llmPhase()).toBe(2));
  });

  test("Phase 1: every purpose (seats included) resolves to gemini", () => {
    withPhase(undefined, () => {
      for (const p of [...CLAUDE_SEATS, ...GEMINI_STAYERS]) {
        expect(resolveVendorForPurpose(p, false)).toBe("gemini");
      }
    });
  });

  test("Phase 2: the Anthropic seats move to claude", () => {
    withPhase("2", () => {
      for (const p of CLAUDE_SEATS) {
        expect(resolveVendorForPurpose(p, false)).toBe("claude");
      }
    });
  });

  test("Phase 2: non-seat purposes stay on the Gemini backbone", () => {
    withPhase("2", () => {
      for (const p of GEMINI_STAYERS) {
        expect(resolveVendorForPurpose(p, false)).toBe("gemini");
      }
    });
  });

  test("owner pin: OCR + voice are Gemini unconditionally (in the pinned set)", () => {
    expect(GEMINI_PINNED_PURPOSES.has("capture_ocr")).toBe(true);
    expect(GEMINI_PINNED_PURPOSES.has("capture_voice")).toBe(true);
    withPhase("2", () => {
      expect(resolveVendorForPurpose("capture_ocr", false)).toBe("gemini");
      expect(resolveVendorForPurpose("capture_ocr", true)).toBe("gemini");
      expect(resolveVendorForPurpose("capture_voice", false)).toBe("gemini");
    });
  });

  test("image-bearing calls force gemini even on a claude seat", () => {
    withPhase("2", () => {
      expect(resolveVendorForPurpose("advisor", true)).toBe("gemini");
      expect(resolveVendorForPurpose("persona_narrative", true)).toBe("gemini");
    });
  });

  test("Phase 2 effort defaults follow the D-26 matrix", () => {
    expect(phase2EffortFor("advisor")).toBe("high");
    expect(phase2EffortFor("persona_narrative")).toBe("high");
    expect(phase2EffortFor("gap_synthesize")).toBe("low");
    expect(phase2EffortFor("self_model_propose")).toBe("high");
    expect(phase2EffortFor("northstar_propose")).toBe("high");
    expect(phase2EffortFor("axis_estimate")).toBe("high");
    expect(phase2EffortFor("persona_synthesis")).toBe("xhigh");
    expect(phase2EffortFor("ops_recommend")).toBe("medium");
    expect(phase2EffortFor("secondb_chat")).toBeUndefined();
  });

  test("invariant: every Phase 2 seat has an explicit effort entry", () => {
    // Without this, a seat added to PHASE2_VENDOR but forgotten in
    // PHASE2_EFFORT silently escalates to DEFAULT_EFFORT ("high") in
    // gemini.ts — a cost regression no other test would catch.
    for (const seat of Object.keys(PHASE2_VENDOR)) {
      expect(PHASE2_EFFORT[seat as PromptPurpose]).toBeDefined();
    }
  });

  test("vendors map to their edge functions", () => {
    expect(proxyFnForVendor("gemini")).toBe("gemini-proxy");
    expect(proxyFnForVendor("claude")).toBe("claude-proxy");
    expect(proxyFnForVendor("openai")).toBe("openai-proxy");
    expect(proxyFnForVendor(undefined)).toBe("gemini-proxy");
  });
});
