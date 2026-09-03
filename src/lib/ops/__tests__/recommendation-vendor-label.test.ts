// The recommendations consent copy names the processor the records are sent
// to. That name must come from the resolution the ops calls actually follow —
// on 2026-09-01 the live screen said "Gemini" while the vendor switch was one
// console command away from openai (REQ-260901-03 precondition).

import { resolveVendorForPurpose } from "../../llm/routing";
import { recommendationVendorLabel } from "../recommend";

const KEYS = [
  "EXPO_PUBLIC_LLM_VENDOR",
  "EXPO_PUBLIC_LLM_PHASE",
  "EXPO_PUBLIC_REASONING_PROVIDER",
] as const;
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

describe("recommendationVendorLabel follows the ops_recommend resolution", () => {
  test("explicit vendors map to their display names", () => {
    const cases: Array<[string, string]> = [
      ["openai", "OpenAI"],
      ["gemini", "Gemini"],
      ["claude", "Anthropic Claude"],
      ["xai", "xAI Grok"],
      ["grok", "xAI Grok"], // the operator alias normalizes to xai
    ];
    for (const [value, label] of cases) {
      process.env.EXPO_PUBLIC_LLM_VENDOR = value;
      expect(recommendationVendorLabel()).toBe(label);
    }
  });

  test("perPurpose follows the per-seat map, not a literal", () => {
    process.env.EXPO_PUBLIC_LLM_VENDOR = "perPurpose";
    const vendor = resolveVendorForPurpose("ops_recommend", false);
    process.env.EXPO_PUBLIC_LLM_VENDOR = vendor; // label for that vendor, explicitly
    const expected = recommendationVendorLabel();
    process.env.EXPO_PUBLIC_LLM_VENDOR = "perPurpose";
    expect(recommendationVendorLabel()).toBe(expected);
  });

  test("unset follows whatever the resolver decides — never pins the moving default", () => {
    // The unset default changes with the Gemini retirement (#1505); the label
    // must track the resolver, so this asserts agreement, not a literal.
    const vendor = resolveVendorForPurpose("ops_recommend", false);
    const unsetLabel = recommendationVendorLabel();
    process.env.EXPO_PUBLIC_LLM_VENDOR = vendor;
    expect(recommendationVendorLabel()).toBe(unsetLabel);
  });
});
