// The legacy pro-tier seam (EXPO_PUBLIC_REASONING_PROVIDER) after T1 stage A.
//
// The seam is the last rung of resolveVendorForPurpose: when the vendor axis
// resolves "gemini" for a reasoning-tier call, the legacy variable gets the
// last word. While its unset value was "gemini" that rung was a no-op unless
// the operator set something. T1 stage A moved every unset default to openai —
// and the review found that reading the seam's DEFAULT there would turn an
// explicit EXPO_PUBLIC_LLM_VENDOR=gemini into openai on every pro-tier seat
// (advisor, reasoning_connect, imagine): the one-variable rollback broken on
// the seats where a vendor swap is most visible. The fix reads the seam only
// when it is actually set. These tests pin all three shapes.

import { legacyReasoningProvider, legacyReasoningProviderOverride, resolveVendorForPurpose } from "../routing";

const KEYS = ["EXPO_PUBLIC_LLM_VENDOR", "EXPO_PUBLIC_REASONING_PROVIDER", "EXPO_PUBLIC_LLM_PHASE", "EXPO_PUBLIC_BACKBONE_VENDOR"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const PRO_SEATS = ["advisor", "persona_synthesis", "axis_estimate"] as const;

describe("explicit gemini rollback survives the legacy seam", () => {
  test("EXPO_PUBLIC_LLM_VENDOR=gemini with the seam UNSET stays gemini on every pro-tier seat", () => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = "gemini";
    expect(legacyReasoningProviderOverride()).toBeNull();
    for (const p of PRO_SEATS) {
      expect(`${p}=${resolveVendorForPurpose(p, false, { reasoningTier: true })}`).toBe(`${p}=gemini`);
    }
  });

  test("the seam still gets the last word when it IS set", () => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = "gemini";
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "openai";
    expect(legacyReasoningProviderOverride()).toBe("openai");
    for (const p of PRO_SEATS) {
      expect(resolveVendorForPurpose(p, false, { reasoningTier: true })).toBe("openai");
    }
    // and an explicit "gemini" in the seam is honoured too (rollback via either variable)
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "gemini";
    for (const p of PRO_SEATS) {
      expect(resolveVendorForPurpose(p, false, { reasoningTier: true })).toBe("gemini");
    }
  });

  test("the seam never speaks when the axis did not resolve gemini", () => {
    // perPurpose axis: advisor is openai in PHASE2_VENDOR; the seam must not touch it.
    process.env.EXPO_PUBLIC_LLM_VENDOR = "perPurpose";
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "gemini";
    expect(resolveVendorForPurpose("advisor", false, { reasoningTier: true })).toBe("openai");
  });

  test("everything unset resolves the retired default, not gemini", () => {
    expect(legacyReasoningProviderOverride()).toBeNull();
    expect(legacyReasoningProvider()).toBe("openai");
    for (const p of PRO_SEATS) {
      expect(resolveVendorForPurpose(p, false, { reasoningTier: true })).toBe("openai");
    }
  });

  test("junk in the seam is no opinion, not a silent vendor", () => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = "gemini";
    process.env.EXPO_PUBLIC_REASONING_PROVIDER = "anthropic-please";
    expect(legacyReasoningProviderOverride()).toBeNull();
    expect(resolveVendorForPurpose("advisor", false, { reasoningTier: true })).toBe("gemini");
  });
});
