// D-2 (defense-in-depth): recommendForDomain must enforce the recommendations
// privacy gate at the ENGINE, before it loads the wiki snapshot or calls the LLM
// gateway. The three call sites already gate in their UI, but a future/forgotten
// call site must NOT be able to leak the user's own material to Gemini. The gate
// is fail-closed: OFF / undefined / a minor -> [] with no snapshot and no call.

jest.mock("../../llm/gemini", () => ({ callGemini: jest.fn() }));
jest.mock("../../wiki/export", () => ({ exportUserWiki: jest.fn() }));
jest.mock("../signals", () => ({ gatherAdherenceSignal: jest.fn(() => Promise.resolve("")) }));
jest.mock("../../growth/lens-signal", () => ({ gatherLensSignal: jest.fn(() => Promise.resolve("")) }));

import { recommendForDomain } from "../recommend";
import { callGemini } from "../../llm/gemini";
import { exportUserWiki } from "../../wiki/export";

const base = {
  userId: "u1",
  locale: "en" as const,
  domainId: "exercise_routine" as const,
  domainLabel: "Exercise routine",
};

describe("recommendForDomain engine gate (D-2)", () => {
  beforeEach(() => jest.clearAllMocks());

  test.each([
    ["undefined (pref never resolved)", undefined],
    ["null", null],
    ["false (opted out / default)", false],
  ])("adult, recommendationsPref=%s -> [] and NO snapshot / LLM call", async (_label, pref) => {
    const out = await recommendForDomain({ ...base, recommendationsPref: pref });
    expect(out).toEqual([]);
    expect(exportUserWiki).not.toHaveBeenCalled();
    expect(callGemini).not.toHaveBeenCalled();
  });

  test("a minor is blocked even if a caller forgets the UI gate", async () => {
    const out = await recommendForDomain({ ...base, minor: true, recommendationsPref: false });
    expect(out).toEqual([]);
    expect(exportUserWiki).not.toHaveBeenCalled();
    expect(callGemini).not.toHaveBeenCalled();
  });

  test("adult opt-in (recommendationsPref=true) -> loads snapshot and calls the gateway", async () => {
    (exportUserWiki as jest.Mock).mockResolvedValue({ prompt: "wiki body" });
    (callGemini as jest.Mock).mockResolvedValue({
      text: JSON.stringify([{ title: "Walk 10 min", reason: "you already jog weekly" }]),
    });
    const out = await recommendForDomain({ ...base, recommendationsPref: true });
    expect(exportUserWiki).toHaveBeenCalledTimes(1);
    expect(callGemini).toHaveBeenCalledTimes(1);
    expect(out).toEqual([{ title: "Walk 10 min", reason: "you already jog weekly" }]);
  });
});
