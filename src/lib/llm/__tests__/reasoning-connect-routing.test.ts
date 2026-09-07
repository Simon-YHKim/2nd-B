// reasoning_connect routing pins (S2 감사 2026-07-19, 스펙 #1072 결정).
//
// Two traps this file exists to prevent:
//   1. cluster_infer 재사용: reasoning_connect was deliberately created as its
//      OWN purpose because cluster_infer holds a Phase-2 seat — a "convenient"
//      reuse would silently hand the /reasoning deep run to whatever the SEAT
//      switch (EXPO_PUBLIC_LLM_VENDOR / EXPO_PUBLIC_LLM_PHASE) says
//      (docs/LLM-ROUTING.md §4). The deep run follows the BACKBONE switch
//      (EXPO_PUBLIC_BACKBONE_VENDOR) instead, until the Phase-2 cutover runbook
//      explicitly assigns its seat. Since T1 stage A (2026-08-31) an unset
//      backbone resolves "openai", not "gemini"; explicit "gemini" is still
//      accepted (one-variable rollback), and this file proves both.
//   2. sub-brain pro->flash pin: reasoning_connect is pro-for-EVERY-tier by
//      design (weekly-ledger-bounded); the gemini-proxy tier pin must exempt
//      it or the SERVED model becomes tier-keyed (SAME-QUALITY violation,
//      스펙 계약 12).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GEMINI_PINNED_PURPOSES, PHASE2_VENDOR, resolveVendorForPurpose } from "../routing";
import { PURPOSE_TIER } from "../types";

const root = join(__dirname, "..", "..", "..", "..");
const reasoningScreen = readFileSync(join(root, "src", "app", "reasoning.tsx"), "utf8");
const geminiProxy = readFileSync(
  join(root, "supabase", "functions", "gemini-proxy", "index.ts"),
  "utf8",
);

function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

describe("reasoning_connect follows the backbone switch, never the seat switch", () => {
  test("is NOT a Phase-2 vendor seat (deliberate PHASE2_VENDOR absence)", () => {
    expect(Object.prototype.hasOwnProperty.call(PHASE2_VENDOR, "reasoning_connect")).toBe(false);
    // Not an OCR/voice pin either — its backbone residence comes from seat
    // absence, which is exactly what this test pins.
    expect(GEMINI_PINNED_PURPOSES.has("reasoning_connect")).toBe(false);
  });

  test("Phase 2 flip does not move it off the backbone (unset backbone → openai since T1 stage A)", () => {
    withEnv("EXPO_PUBLIC_BACKBONE_VENDOR", undefined, () => {
      withEnv("EXPO_PUBLIC_LLM_VENDOR", undefined, () => {
        withEnv("EXPO_PUBLIC_LLM_PHASE", "2", () => {
          expect(resolveVendorForPurpose("reasoning_connect", false)).toBe("openai");
        });
      });
    });
  });

  test("the global vendor switch does not move it (non-seat purposes take the backbone, openai when unset)", () => {
    // "claude" and "xai" are the distinguishing values: a seat WOULD move to
    // them, so the deep run staying on the backbone default proves it is not
    // following the seat switch.
    for (const vendor of ["openai", "claude", "xai", "perPurpose"]) {
      withEnv("EXPO_PUBLIC_BACKBONE_VENDOR", undefined, () => {
        withEnv("EXPO_PUBLIC_LLM_VENDOR", vendor, () => {
          withEnv("EXPO_PUBLIC_LLM_PHASE", "2", () => {
            expect(resolveVendorForPurpose("reasoning_connect", false)).toBe("openai");
          });
        });
      });
    }
  });

  test("rollback: explicit EXPO_PUBLIC_BACKBONE_VENDOR=gemini still lands on gemini, seat switch notwithstanding", () => {
    // explicit: unset is openai since T1 stage A. The seat switch is pointed
    // at a THIRD vendor so a pass cannot be explained by either default.
    withEnv("EXPO_PUBLIC_BACKBONE_VENDOR", "gemini", () => {
      withEnv("EXPO_PUBLIC_LLM_VENDOR", "claude", () => {
        withEnv("EXPO_PUBLIC_LLM_PHASE", "2", () => {
          expect(resolveVendorForPurpose("reasoning_connect", false)).toBe("gemini");
        });
      });
    });
  });

  test("the trap is real: cluster_infer IS a Phase-2 seat that leaves Gemini", () => {
    withEnv("EXPO_PUBLIC_LLM_VENDOR", undefined, () => {
      withEnv("EXPO_PUBLIC_LLM_PHASE", "2", () => {
        const seat = resolveVendorForPurpose("cluster_infer", false);
        expect(seat).toBe(PHASE2_VENDOR.cluster_infer);
        expect(seat).not.toBe("gemini");
      });
    });
  });

  test("PURPOSE_TIER keeps the deep run on the pro tier", () => {
    expect(PURPOSE_TIER.reasoning_connect).toBe("pro");
  });

  test("the /reasoning call sites use reasoning_connect, never cluster_infer", () => {
    expect(reasoningScreen.match(/purpose: "reasoning_connect",/g)).toHaveLength(2);
    expect(reasoningScreen).not.toMatch(/cluster_infer/);
  });
});

describe("gemini-proxy: reasoning_connect is exempt from the sub-brain pro pin", () => {
  test("the exemption set exists and names reasoning_connect", () => {
    expect(geminiProxy).toMatch(/const PRO_FOR_ALL_TIERS = new Set\(\['reasoning_connect'\]\);/);
  });

  test("the effectiveModel pin consults the exemption", () => {
    expect(geminiProxy).toMatch(/!\(purpose && PRO_FOR_ALL_TIERS\.has\(purpose\)\)/);
  });

  test("reasoning_connect is not premium-gated (all tiers may run it)", () => {
    expect(geminiProxy).toMatch(/const PREMIUM_PURPOSES = new Set\(\['advisor', 'planner'\]\);/);
  });
});
