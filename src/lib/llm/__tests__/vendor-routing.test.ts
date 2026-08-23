// D-26 Phase 2 purpose-keyed vendor routing (src/lib/llm/routing.ts).
//
// Pure-unit suite over the routing module — no network, no gateway. The
// invariants under test:
//   - Phase 1 (default): EVERY purpose resolves to the Gemini backbone.
//   - Phase 2: the reasoning seats move to OpenAI (re-routed 2026-07-06); rest stay.
//   - Owner pin (Simon 2026-07-04): capture_ocr is Gemini UNCONDITIONALLY,
//     and any image-bearing call is forced to Gemini regardless of seat.
//   - secondb_chat ignores phase entirely: it routes by EXPO_PUBLIC_CHAT_VENDOR
//     (unset -> Gemini), so moving chat never drags the nine seats with it.
//   - proxyFnForVendor maps vendors to their edge functions.

import {
  GEMINI_PINNED_PURPOSES,
  PHASE2_EFFORT,
  PHASE2_VENDOR,
  llmPhase,
  llmVendorOverride,
  phase2EffortFor,
  proxyFnForVendor,
  resolveVendorForPurpose,
} from "../routing";
import type { PromptPurpose } from "../types";

// The two prose seats went to Claude on 2026-08-23 (V-4), so "the seats" are
// no longer one vendor. Split rather than shortened: both halves are asserted.
const CLAUDE_SEATS: PromptPurpose[] = ["persona_narrative", "persona_synthesis"];

const OPENAI_SEATS: PromptPurpose[] = [
  "advisor",
  "gap_synthesize",
  "self_model_propose",
  "northstar_propose",
  "axis_estimate",
  "ops_recommend",
  "ops_daily_brief",
];

const GEMINI_STAYERS: PromptPurpose[] = [
  "interview_probe",
  "audit_qa",
  "clipper_classify",
  "capture_ocr",
  "capture_voice",
  "source_ingest",
  "import_ingest",
  "clipper_template_propose",
  "imagine",
  "reasoning_connect",
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

function withVendor<T>(vendor: string | undefined, fn: () => T): T {
  const prev = process.env.EXPO_PUBLIC_LLM_VENDOR;
  if (vendor === undefined) delete process.env.EXPO_PUBLIC_LLM_VENDOR;
  else process.env.EXPO_PUBLIC_LLM_VENDOR = vendor;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_LLM_VENDOR;
    else process.env.EXPO_PUBLIC_LLM_VENDOR = prev;
  }
}

function withChatVendor<T>(vendor: string | undefined, fn: () => T): T {
  const prev = process.env.EXPO_PUBLIC_CHAT_VENDOR;
  if (vendor === undefined) delete process.env.EXPO_PUBLIC_CHAT_VENDOR;
  else process.env.EXPO_PUBLIC_CHAT_VENDOR = vendor;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_CHAT_VENDOR;
    else process.env.EXPO_PUBLIC_CHAT_VENDOR = prev;
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
      for (const p of [...OPENAI_SEATS, ...CLAUDE_SEATS, ...GEMINI_STAYERS]) {
        expect(resolveVendorForPurpose(p, false)).toBe("gemini");
      }
    });
  });

  test("Phase 2: the reasoning seats move to their per-seat vendor", () => {
    withPhase("2", () => {
      for (const p of OPENAI_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("openai");
      for (const p of CLAUDE_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("claude");
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

  test("image-bearing calls force gemini even on an openai seat", () => {
    withPhase("2", () => {
      expect(resolveVendorForPurpose("advisor", true)).toBe("gemini");
      expect(resolveVendorForPurpose("persona_narrative", true)).toBe("gemini");
    });
  });

  // ── EXPO_PUBLIC_LLM_VENDOR global backbone switch ──────────────────────────
  describe("EXPO_PUBLIC_LLM_VENDOR switch", () => {
    test("override parses gemini/claude/openai/perPurpose (case-insensitive), else null", () => {
      withVendor("gemini", () => expect(llmVendorOverride()).toBe("gemini"));
      withVendor("CLAUDE", () => expect(llmVendorOverride()).toBe("claude"));
      withVendor("OpenAI", () => expect(llmVendorOverride()).toBe("openai"));
      withVendor("perPurpose", () => expect(llmVendorOverride()).toBe("perPurpose"));
      withVendor("perpurpose", () => expect(llmVendorOverride()).toBe("perPurpose"));
      withVendor(undefined, () => expect(llmVendorOverride()).toBeNull());
      withVendor("", () => expect(llmVendorOverride()).toBeNull());
      withVendor("bogus", () => expect(llmVendorOverride()).toBeNull());
    });

    test("=gemini → 100% Gemini for every purpose, even with Phase 2 set", () => {
      withPhase("2", () =>
        withVendor("gemini", () => {
          for (const p of [...OPENAI_SEATS, ...CLAUDE_SEATS, ...GEMINI_STAYERS]) {
            expect(resolveVendorForPurpose(p, false)).toBe("gemini");
          }
        }),
      );
    });

    test("=openai → every reasoning seat to openai; non-seats stay gemini", () => {
      withPhase("1", () =>
        withVendor("openai", () => {
          for (const p of OPENAI_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("openai");
          for (const p of GEMINI_STAYERS) expect(resolveVendorForPurpose(p, false)).toBe("gemini");
        }),
      );
    });

    test("=claude → every reasoning seat to claude; non-seats stay gemini", () => {
      withVendor("claude", () => {
        for (const p of OPENAI_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("claude");
        for (const p of GEMINI_STAYERS) expect(resolveVendorForPurpose(p, false)).toBe("gemini");
      });
    });

    test("=perPurpose → seats follow the PHASE2_VENDOR map, regardless of phase", () => {
      withPhase("1", () =>
        withVendor("perPurpose", () => {
          for (const seat of Object.keys(PHASE2_VENDOR) as PromptPurpose[]) {
            expect(resolveVendorForPurpose(seat, false)).toBe(PHASE2_VENDOR[seat]);
          }
          expect(resolveVendorForPurpose("secondb_chat", false)).toBe("gemini");
        }),
      );
    });

    test("the switch never overrides the OCR/voice/image pin", () => {
      for (const v of ["openai", "claude", "gemini", "perPurpose"]) {
        withVendor(v, () => {
          expect(resolveVendorForPurpose("capture_ocr", false)).toBe("gemini");
          expect(resolveVendorForPurpose("capture_voice", false)).toBe("gemini");
          expect(resolveVendorForPurpose("advisor", true)).toBe("gemini"); // image
        });
      }
    });

    test("unset → back-compat unchanged (phase drives routing)", () => {
      withVendor(undefined, () => {
        withPhase("1", () => expect(resolveVendorForPurpose("advisor", false)).toBe("gemini"));
        withPhase("2", () => expect(resolveVendorForPurpose("advisor", false)).toBe("openai"));
      });
    });

    test('empty string routes identically to unset — it is the shipped default', () => {
      // The build workflows and eas.json now pass EXPO_PUBLIC_LLM_VENDOR through
      // with '' as the fallback, so "" is what actually reaches a production
      // bundle. If it ever stopped meaning "no override" the nine seats would
      // move without anyone setting anything.
      for (const phase of ["1", "2"]) {
        withPhase(phase, () => {
          const unset = withVendor(undefined, () => resolveVendorForPurpose("advisor", false));
          const empty = withVendor("", () => resolveVendorForPurpose("advisor", false));
          expect(empty).toBe(unset);
        });
      }
    });
  });

  describe("EXPO_PUBLIC_CHAT_VENDOR — the chat-only knob (Simon 2026-08-18)", () => {
    test("unset → chat stays on the Gemini backbone, in either phase", () => {
      withChatVendor(undefined, () => {
        withPhase("1", () => expect(resolveVendorForPurpose("secondb_chat", false)).toBe("gemini"));
        withPhase("2", () => expect(resolveVendorForPurpose("secondb_chat", false)).toBe("gemini"));
      });
    });

    test("routes chat to the named vendor without needing Phase 2", () => {
      // The point of the knob: production runs Phase 1, and flipping to Phase 2
      // just to move chat would switch nine other surfaces at the same time.
      withPhase("1", () => {
        withChatVendor("openai", () =>
          expect(resolveVendorForPurpose("secondb_chat", false)).toBe("openai"),
        );
        withChatVendor("claude", () =>
          expect(resolveVendorForPurpose("secondb_chat", false)).toBe("claude"),
        );
        withChatVendor("gemini", () =>
          expect(resolveVendorForPurpose("secondb_chat", false)).toBe("gemini"),
        );
      });
    });

    test("garbage values fall back to Gemini rather than throwing", () => {
      for (const v of ["", "  ", "gpt", "openai ", "OPENAI", "true"]) {
        withChatVendor(v, () => {
          const got = resolveVendorForPurpose("secondb_chat", false);
          // "openai " and "OPENAI" normalise (trim + lowercase); the rest do not
          // resolve and must degrade to the backbone, never to undefined.
          expect(["gemini", "openai"]).toContain(got);
        });
      }
    });

    test("it moves ONLY chat — the nine seats and the stayers are untouched", () => {
      withChatVendor("openai", () => {
        withPhase("1", () => {
          for (const seat of OPENAI_SEATS) {
            expect(resolveVendorForPurpose(seat, false)).toBe("gemini");
          }
          for (const p of GEMINI_STAYERS) {
            expect(resolveVendorForPurpose(p, false)).toBe("gemini");
          }
        });
      });
    });

    test("an image-bearing chat turn still goes to Gemini", () => {
      // Only gemini-proxy forwards inline image data; the knob must not beat
      // that pin or a photo-carrying turn would fail upstream.
      withChatVendor("openai", () =>
        expect(resolveVendorForPurpose("secondb_chat", true)).toBe("gemini"),
      );
    });

    test("the knob does not leak into the global seat switch", () => {
      // EXPO_PUBLIC_LLM_VENDOR governs seats; chat is not a seat. Setting the
      // seat switch must not move chat, and vice versa.
      withChatVendor(undefined, () =>
        withVendor("openai", () =>
          expect(resolveVendorForPurpose("secondb_chat", false)).toBe("gemini"),
        ),
      );
      withChatVendor("openai", () =>
        withVendor(undefined, () =>
          withPhase("1", () => expect(resolveVendorForPurpose("advisor", false)).toBe("gemini")),
        ),
      );
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
    // chat is not a PHASE2_VENDOR seat, but it still needs an effort when the
    // chat knob puts it on a non-Gemini vendor -- without one boundary.ts falls
    // back to DEFAULT_EFFORT ("high") on the highest-volume surface in the app.
    expect(phase2EffortFor("secondb_chat")).toBe("low");
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
