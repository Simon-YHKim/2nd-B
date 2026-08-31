// D-26 Phase 2 purpose-keyed vendor routing (src/lib/llm/routing.ts).
//
// Pure-unit suite over the routing module — no network, no gateway. The
// invariants under test, as of T1 stage A (2026-08-31):
//   - Every switch resolves RETIRED_DEFAULT ("openai") when UNSET. Until T1
//     stage A an unset switch meant "gemini"; that posture is gone. Phase 1
//     with nothing set therefore lands EVERY purpose on openai.
//   - Phase 2: the reasoning seats move to their per-seat vendor (re-routed
//     2026-07-06; two prose seats to Claude 2026-08-23). Non-seats never read
//     the seat map: they take EXPO_PUBLIC_BACKBONE_VENDOR instead.
//   - Anything carrying a binary (capture_ocr / capture_voice / any image on
//     the call) goes to EXPO_PUBLIC_MULTIMODAL_VENDOR before any other switch
//     is consulted. Simon 2026-08-23: "OCR = openai 유지 (gemini 예외 없음)".
//   - secondb_chat ignores phase entirely: it routes by EXPO_PUBLIC_CHAT_VENDOR
//     (unset -> openai), so moving chat never drags the seats with it.
//   - Rollback property: "gemini" is still ACCEPTED as an explicit value on
//     every switch and still reaches gemini-proxy. One case per switch proves
//     it; those cases are the ones to keep until gemini-proxy is deleted.
//   - proxyFnForVendor maps vendors to their edge functions; undefined lands
//     on openai-proxy, the retired default's proxy.

import {
  GEMINI_PINNED_PURPOSES,
  MULTIMODAL_PURPOSES,
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
const CLAUDE_SEATS: PromptPurpose[] = ["persona_narrative", "persona_synthesis", "crosscheck_defend"];

const OPENAI_SEATS: PromptPurpose[] = [
  "advisor",
  "gap_synthesize",
  "self_model_propose",
  "northstar_propose",
  "axis_estimate",
  "ops_recommend",
  "ops_daily_brief",
];

// Purposes in no seat: they take EXPO_PUBLIC_BACKBONE_VENDOR and nothing else.
// This list used to be called GEMINI_STAYERS — named for where they landed by
// default, not for what they are. The default moved; the grouping did not.
const BACKBONE_PURPOSES: PromptPurpose[] = [
  "interview_probe",
  "audit_qa",
  "clipper_classify",
  "capture_classify",
  "source_ingest",
  "import_ingest",
  "clipper_template_propose",
  "imagine",
  "reasoning_connect",
];

// The binary-carrying pair: they take EXPO_PUBLIC_MULTIMODAL_VENDOR, not the
// backbone switch, so a backbone rollback must NOT move them.
const MULTIMODAL_PAIR: PromptPurpose[] = ["capture_ocr", "capture_voice"];

const NON_SEATS: PromptPurpose[] = [...BACKBONE_PURPOSES, ...MULTIMODAL_PAIR];

const EVERY_PURPOSE: PromptPurpose[] = [...OPENAI_SEATS, ...CLAUDE_SEATS, ...NON_SEATS];

function withEnv<T>(key: string, value: string | undefined, fn: () => T): T {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

function withPhase<T>(phase: string | undefined, fn: () => T): T {
  return withEnv("EXPO_PUBLIC_LLM_PHASE", phase, fn);
}

function withVendor<T>(vendor: string | undefined, fn: () => T): T {
  return withEnv("EXPO_PUBLIC_LLM_VENDOR", vendor, fn);
}

function withChatVendor<T>(vendor: string | undefined, fn: () => T): T {
  return withEnv("EXPO_PUBLIC_CHAT_VENDOR", vendor, fn);
}

function withBackbone<T>(vendor: string | undefined, fn: () => T): T {
  return withEnv("EXPO_PUBLIC_BACKBONE_VENDOR", vendor, fn);
}

function withMultimodal<T>(vendor: string | undefined, fn: () => T): T {
  return withEnv("EXPO_PUBLIC_MULTIMODAL_VENDOR", vendor, fn);
}

describe("D-26 vendor routing", () => {
  test("phase defaults to 1 when the env is unset or not '2'", () => {
    withPhase(undefined, () => expect(llmPhase()).toBe(1));
    withPhase("", () => expect(llmPhase()).toBe(1));
    withPhase("1", () => expect(llmPhase()).toBe(1));
    withPhase("phase2", () => expect(llmPhase()).toBe(1));
    withPhase("2", () => expect(llmPhase()).toBe(2));
  });

  test("Phase 1 with every switch unset: every purpose resolves to openai (the retired default)", () => {
    // Until T1 stage A this asserted "gemini". Unset no longer means gemini
    // anywhere in routing.ts; a build missing a variable lands on openai.
    withPhase(undefined, () => {
      for (const p of EVERY_PURPOSE) {
        expect(resolveVendorForPurpose(p, false)).toBe("openai");
      }
    });
  });

  test("Phase 2: the reasoning seats move to their per-seat vendor", () => {
    withPhase("2", () => {
      for (const p of OPENAI_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("openai");
      for (const p of CLAUDE_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("claude");
    });
  });

  test("Phase 2: non-seat purposes take their own switch, not the seat map (unset → openai)", () => {
    withPhase("2", () => {
      for (const p of NON_SEATS) {
        expect(resolveVendorForPurpose(p, false)).toBe("openai");
      }
    });
  });

  test("rollback: EXPO_PUBLIC_BACKBONE_VENDOR=gemini puts the backbone purposes back on gemini, in either phase", () => {
    // The one-variable rollback property: "gemini" is still an accepted
    // operator value, it just never happens by default any more.
    for (const phase of ["1", "2"]) {
      withPhase(phase, () =>
        withBackbone("gemini", () => {
          for (const p of BACKBONE_PURPOSES) {
            expect(resolveVendorForPurpose(p, false)).toBe("gemini");
          }
          // The binary pair is on the multimodal switch, not the backbone.
          for (const p of MULTIMODAL_PAIR) {
            expect(resolveVendorForPurpose(p, false)).toBe("openai");
          }
          // The seats do not follow the backbone switch either: a Claude seat
          // tells Phase 1 (retired default) apart from Phase 2 (seat map).
          withVendor(undefined, () => {
            expect(resolveVendorForPurpose("advisor", false)).toBe("openai");
            expect(resolveVendorForPurpose("persona_narrative", false)).toBe(
              phase === "2" ? "claude" : "openai",
            );
          });
        }),
      );
    }
  });

  test("multimodal pin: OCR + voice follow EXPO_PUBLIC_MULTIMODAL_VENDOR regardless of phase (unset → openai)", () => {
    expect(GEMINI_PINNED_PURPOSES.has("capture_ocr")).toBe(true);
    expect(GEMINI_PINNED_PURPOSES.has("capture_voice")).toBe(true);
    // The old name is an alias of the new set, not a stale copy.
    expect(GEMINI_PINNED_PURPOSES).toBe(MULTIMODAL_PURPOSES);
    withPhase("2", () => {
      expect(resolveVendorForPurpose("capture_ocr", false)).toBe("openai");
      expect(resolveVendorForPurpose("capture_ocr", true)).toBe("openai");
      expect(resolveVendorForPurpose("capture_voice", false)).toBe("openai");
    });
  });

  test("rollback: EXPO_PUBLIC_MULTIMODAL_VENDOR=gemini puts OCR + voice back on gemini, in either phase", () => {
    for (const phase of ["1", "2"]) {
      withPhase(phase, () =>
        withMultimodal("gemini", () => {
          expect(resolveVendorForPurpose("capture_ocr", false)).toBe("gemini");
          expect(resolveVendorForPurpose("capture_ocr", true)).toBe("gemini");
          expect(resolveVendorForPurpose("capture_voice", false)).toBe("gemini");
          // and it moves ONLY the binary pair
          for (const p of BACKBONE_PURPOSES) {
            expect(resolveVendorForPurpose(p, false)).toBe("openai");
          }
        }),
      );
    }
  });

  test("image-bearing calls go to the multimodal switch even on a reasoning seat", () => {
    withPhase("2", () => {
      // unset → openai. persona_narrative is a CLAUDE seat, so "openai" on the
      // image call is the multimodal switch winning, not the seat map.
      expect(resolveVendorForPurpose("advisor", true)).toBe("openai");
      expect(resolveVendorForPurpose("persona_narrative", true)).toBe("openai");
      expect(resolveVendorForPurpose("persona_narrative", false)).toBe("claude");
      // explicit gemini on the multimodal switch beats the seat map the same way
      withMultimodal("gemini", () => {
        expect(resolveVendorForPurpose("advisor", true)).toBe("gemini");
        expect(resolveVendorForPurpose("persona_narrative", true)).toBe("gemini");
        expect(resolveVendorForPurpose("persona_narrative", false)).toBe("claude");
      });
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

    test("=gemini → every reasoning seat to gemini even with Phase 2 set; non-seats do not follow (unset → openai)", () => {
      // Rollback case for the seat switch. The seat switch never reached the
      // backbone; the non-seats only LOOKED like they followed it while the
      // backbone default was also gemini.
      withPhase("2", () =>
        withVendor("gemini", () => {
          for (const p of [...OPENAI_SEATS, ...CLAUDE_SEATS]) {
            expect(resolveVendorForPurpose(p, false)).toBe("gemini");
          }
          for (const p of NON_SEATS) {
            expect(resolveVendorForPurpose(p, false)).toBe("openai");
          }
        }),
      );
    });

    test("rollback: gemini on all three switches → 100% Gemini for every purpose, even with Phase 2 set", () => {
      // What "=gemini → 100% Gemini" used to prove with one variable now takes
      // three, because the other two switches no longer default to gemini.
      withPhase("2", () =>
        withVendor("gemini", () =>
          withBackbone("gemini", () =>
            withMultimodal("gemini", () => {
              for (const p of EVERY_PURPOSE) {
                expect(resolveVendorForPurpose(p, false)).toBe("gemini");
              }
            }),
          ),
        ),
      );
    });

    test("=openai → every reasoning seat to openai; non-seats take the backbone switch (unset → openai)", () => {
      withPhase("1", () =>
        withVendor("openai", () => {
          for (const p of OPENAI_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("openai");
          for (const p of NON_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("openai");
          // "openai" is also the unset default, so the line above cannot tell
          // "took the backbone switch" from "followed the seat switch". A
          // backbone value no default lands on can.
          withBackbone("gemini", () => {
            for (const p of OPENAI_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("openai");
            for (const p of BACKBONE_PURPOSES) expect(resolveVendorForPurpose(p, false)).toBe("gemini");
          });
        }),
      );
    });

    test("=claude → every reasoning seat to claude; non-seats take the backbone switch (unset → openai)", () => {
      withVendor("claude", () => {
        for (const p of OPENAI_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("claude");
        for (const p of NON_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("openai");
        withBackbone("gemini", () => {
          for (const p of OPENAI_SEATS) expect(resolveVendorForPurpose(p, false)).toBe("claude");
          for (const p of BACKBONE_PURPOSES) expect(resolveVendorForPurpose(p, false)).toBe("gemini");
        });
      });
    });

    test("=perPurpose → seats follow the PHASE2_VENDOR map, regardless of phase; chat is not a seat", () => {
      withPhase("1", () =>
        withVendor("perPurpose", () => {
          for (const seat of Object.keys(PHASE2_VENDOR) as PromptPurpose[]) {
            expect(resolveVendorForPurpose(seat, false)).toBe(PHASE2_VENDOR[seat]);
          }
          // chat takes its own knob (unset → openai), never the seat map
          withChatVendor(undefined, () =>
            expect(resolveVendorForPurpose("secondb_chat", false)).toBe("openai"),
          );
        }),
      );
    });

    test("the seat switch never reaches the multimodal pin (OCR/voice/image follow EXPO_PUBLIC_MULTIMODAL_VENDOR)", () => {
      for (const v of ["openai", "claude", "gemini", "perPurpose"]) {
        withVendor(v, () => {
          // unset multimodal → openai, whatever the seat switch says. With
          // v=claude or v=gemini this is a real discrimination: the seat
          // switch's vendor is NOT what the binary calls got.
          expect(resolveVendorForPurpose("capture_ocr", false)).toBe("openai");
          expect(resolveVendorForPurpose("capture_voice", false)).toBe("openai");
          expect(resolveVendorForPurpose("advisor", true)).toBe("openai"); // image
          // explicit gemini on the multimodal switch wins over every seat value
          withMultimodal("gemini", () => {
            expect(resolveVendorForPurpose("capture_ocr", false)).toBe("gemini");
            expect(resolveVendorForPurpose("capture_voice", false)).toBe("gemini");
            expect(resolveVendorForPurpose("advisor", true)).toBe("gemini"); // image
          });
        });
      }
    });

    test("unset → phase drives the seats: Phase 1 lands on the retired default, Phase 2 on the seat map", () => {
      withVendor(undefined, () => {
        withPhase("1", () => {
          expect(resolveVendorForPurpose("advisor", false)).toBe("openai");
          // a Claude seat tells Phase 1 (retired default) apart from Phase 2
          expect(resolveVendorForPurpose("persona_narrative", false)).toBe("openai");
        });
        withPhase("2", () => {
          expect(resolveVendorForPurpose("advisor", false)).toBe("openai");
          expect(resolveVendorForPurpose("persona_narrative", false)).toBe("claude");
        });
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
    test("unset → chat lands on the retired default (openai), in either phase", () => {
      withChatVendor(undefined, () => {
        withPhase("1", () => expect(resolveVendorForPurpose("secondb_chat", false)).toBe("openai"));
        withPhase("2", () => expect(resolveVendorForPurpose("secondb_chat", false)).toBe("openai"));
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
        // rollback case for the chat knob: explicit gemini still reaches gemini
        withChatVendor("gemini", () =>
          expect(resolveVendorForPurpose("secondb_chat", false)).toBe("gemini"),
        );
      });
    });

    test("garbage values fall back to the retired default (openai) rather than throwing", () => {
      for (const v of ["", "  ", "gpt", "openai ", "OPENAI", "true"]) {
        withChatVendor(v, () => {
          const got = resolveVendorForPurpose("secondb_chat", false);
          // "openai " and "OPENAI" normalise (trim + lowercase); the rest do not
          // resolve and must degrade to the retired default, never to undefined.
          // Both roads end at openai now, so this is an exact match.
          expect(got).toBe("openai");
        });
      }
    });

    test("it moves ONLY chat — the seats and the non-seats are untouched", () => {
      withChatVendor("openai", () => {
        withPhase("1", () => {
          for (const seat of OPENAI_SEATS) {
            expect(resolveVendorForPurpose(seat, false)).toBe("openai");
          }
          for (const p of NON_SEATS) {
            expect(resolveVendorForPurpose(p, false)).toBe("openai");
          }
        });
      });
      // "openai" is also what every unset switch lands on, so the case above
      // cannot tell a leak from a default. A chat vendor no default lands on can.
      for (const v of ["claude", "gemini"]) {
        withChatVendor(v, () => {
          withPhase("1", () => {
            expect(resolveVendorForPurpose("secondb_chat", false)).toBe(v);
            for (const seat of OPENAI_SEATS) {
              expect(resolveVendorForPurpose(seat, false)).toBe("openai");
            }
            for (const p of NON_SEATS) {
              expect(resolveVendorForPurpose(p, false)).toBe("openai");
            }
          });
        });
      }
    });

    test("an image-bearing chat turn goes to the multimodal switch, not the chat knob", () => {
      // The chat vendor is not guaranteed to forward inline image data; the
      // knob must not beat the multimodal switch or a photo-carrying turn
      // would fail upstream.
      withChatVendor("openai", () =>
        expect(resolveVendorForPurpose("secondb_chat", true)).toBe("openai"),
      );
      // a chat vendor no default lands on: the image turn must not follow it
      withChatVendor("claude", () => {
        expect(resolveVendorForPurpose("secondb_chat", false)).toBe("claude");
        expect(resolveVendorForPurpose("secondb_chat", true)).toBe("openai");
      });
      // explicit gemini on the multimodal switch beats the chat knob
      withMultimodal("gemini", () =>
        withChatVendor("openai", () =>
          expect(resolveVendorForPurpose("secondb_chat", true)).toBe("gemini"),
        ),
      );
    });

    test("the knob does not leak into the global seat switch", () => {
      // EXPO_PUBLIC_LLM_VENDOR governs seats; chat is not a seat. Setting the
      // seat switch must not move chat, and vice versa. Each direction is
      // checked with a vendor no default lands on, so "openai" here means
      // "took its own default", not "followed the other switch".
      withChatVendor(undefined, () => {
        withVendor("openai", () =>
          expect(resolveVendorForPurpose("secondb_chat", false)).toBe("openai"),
        );
        withVendor("claude", () =>
          expect(resolveVendorForPurpose("secondb_chat", false)).toBe("openai"),
        );
      });
      withVendor(undefined, () =>
        withPhase("1", () => {
          withChatVendor("openai", () =>
            expect(resolveVendorForPurpose("advisor", false)).toBe("openai"),
          );
          withChatVendor("claude", () =>
            expect(resolveVendorForPurpose("advisor", false)).toBe("openai"),
          );
        }),
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
    // max, not xhigh, since 2026-08-23 (REQ-260823-02). It is the whole-corpus
    // deep read that Simon reserved the top rung for, and it now routes to
    // Claude - the only vendor whose proxy carries that rung. The seats that
    // stayed on OpenAI are unaffected: openai-proxy folds max into xhigh.
    expect(phase2EffortFor("persona_synthesis")).toBe("max");
    expect(phase2EffortFor("ops_recommend")).toBe("medium");
    // chat is not a PHASE2_VENDOR seat, but it still needs an effort when the
    // chat knob puts it on a non-Gemini vendor -- without one boundary.ts falls
    // back to DEFAULT_EFFORT ("high") on the highest-volume surface in the app.
    expect(phase2EffortFor("secondb_chat")).toBe("low");
  });

  test("invariant: every Phase 2 seat has an explicit effort entry", () => {
    // Without this, a seat added to PHASE2_VENDOR but forgotten in
    // PHASE2_EFFORT silently escalates to DEFAULT_EFFORT ("high") in
    // boundary.ts — a cost regression no other test would catch.
    for (const seat of Object.keys(PHASE2_VENDOR)) {
      expect(PHASE2_EFFORT[seat as PromptPurpose]).toBeDefined();
    }
  });

  test("vendors map to their edge functions; undefined lands on the retired default's proxy", () => {
    // rollback case: an explicit gemini still reaches gemini-proxy by name
    expect(proxyFnForVendor("gemini")).toBe("gemini-proxy");
    expect(proxyFnForVendor("claude")).toBe("claude-proxy");
    expect(proxyFnForVendor("openai")).toBe("openai-proxy");
    expect(proxyFnForVendor("xai")).toBe("xai-proxy");
    expect(proxyFnForVendor(undefined)).toBe("openai-proxy");
  });
});
