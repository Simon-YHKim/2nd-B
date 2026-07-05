// D-2 (defense-in-depth): recommendForDomain must enforce the recommendations
// privacy gate at the ENGINE, before it loads the wiki snapshot or calls the LLM
// gateway. The three call sites already gate in their UI, but a future/forgotten
// call site must NOT be able to leak the user's own material to Gemini. The gate
// is fail-closed: OFF / undefined / a minor -> [] with no snapshot and no call.

jest.mock("../../llm/gemini", () => ({ callGemini: jest.fn() }));
jest.mock("../../wiki/export", () => ({ exportUserWiki: jest.fn() }));
jest.mock("../signals", () => ({ gatherAdherenceSignal: jest.fn(() => Promise.resolve("")) }));
jest.mock("../../growth/lens-signal", () => ({ gatherLensSignal: jest.fn(() => Promise.resolve("")) }));
// D-26 A17: mock the daily brief so these tests exercise the on-demand path
// deterministically. getOpsDailyBrief null + buildOpsDailyBrief {} => no brief,
// so recommendForDomain falls through to the single-domain call. A dedicated
// brief-serving test overrides these per-test.
jest.mock("../daily-brief", () => ({
  getOpsDailyBrief: jest.fn(() => Promise.resolve(null)),
  buildOpsDailyBrief: jest.fn(() => Promise.resolve({})),
}));

import { recommendForDomain, resetOpsRecommendCacheForTests } from "../recommend";
import { callGemini } from "../../llm/gemini";
import { exportUserWiki } from "../../wiki/export";
import { buildOpsDailyBrief, getOpsDailyBrief } from "../daily-brief";

const base = {
  userId: "u1",
  locale: "en" as const,
  domainId: "exercise_routine" as const,
  domainLabel: "Exercise routine",
};

describe("recommendForDomain engine gate (D-2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetOpsRecommendCacheForTests();
  });

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

  test("TTL cache: a repeat run within the TTL reuses the result (no 2nd snapshot/LLM call)", async () => {
    (exportUserWiki as jest.Mock).mockResolvedValue({ prompt: "wiki body" });
    (callGemini as jest.Mock).mockResolvedValue({
      text: JSON.stringify([{ title: "Walk 10 min", reason: "you already jog weekly" }]),
    });
    const first = await recommendForDomain({ ...base, recommendationsPref: true });
    // OpsHomeScreen tab-flip refire: same user/domain/locale seconds later.
    const second = await recommendForDomain({ ...base, recommendationsPref: true });
    expect(second).toEqual(first);
    expect(exportUserWiki).toHaveBeenCalledTimes(1);
    expect(callGemini).toHaveBeenCalledTimes(1);
  });

  test("TTL cache never bypasses the privacy gate: pref flip to OFF returns []", async () => {
    (exportUserWiki as jest.Mock).mockResolvedValue({ prompt: "wiki body" });
    (callGemini as jest.Mock).mockResolvedValue({
      text: JSON.stringify([{ title: "Walk 10 min", reason: "you already jog weekly" }]),
    });
    await recommendForDomain({ ...base, recommendationsPref: true });
    const afterOptOut = await recommendForDomain({ ...base, recommendationsPref: false });
    expect(afterOptOut).toEqual([]);
  });

  test("A17: a passive run serves this domain from today's brief — NO snapshot, NO LLM call", async () => {
    (getOpsDailyBrief as jest.Mock).mockResolvedValue({
      exercise_routine: [{ title: "Walk 15 min", reason: "from the daily brief" }],
    });
    const out = await recommendForDomain({ ...base, recommendationsPref: true });
    expect(out).toEqual([{ title: "Walk 15 min", reason: "from the daily brief" }]);
    expect(exportUserWiki).not.toHaveBeenCalled();
    expect(callGemini).not.toHaveBeenCalled();
    expect(buildOpsDailyBrief).not.toHaveBeenCalled(); // brief already existed
  });

  test("A17: no brief yet -> builds it once, then serves the domain slice", async () => {
    (getOpsDailyBrief as jest.Mock).mockResolvedValue(null);
    (buildOpsDailyBrief as jest.Mock).mockResolvedValue({
      exercise_routine: [{ title: "Stretch", reason: "built brief" }],
    });
    const out = await recommendForDomain({ ...base, recommendationsPref: true });
    expect(out).toEqual([{ title: "Stretch", reason: "built brief" }]);
    expect(buildOpsDailyBrief).toHaveBeenCalledTimes(1);
    expect(callGemini).not.toHaveBeenCalled(); // the build IS the day's one call
  });

  test("A17: brief covers other domains but not this one -> self-corrects via on-demand call", async () => {
    (getOpsDailyBrief as jest.Mock).mockResolvedValue({ reading_list: [{ title: "Read", reason: "x" }] });
    (exportUserWiki as jest.Mock).mockResolvedValue({ prompt: "wiki body" });
    (callGemini as jest.Mock).mockResolvedValue({
      text: JSON.stringify([{ title: "Walk", reason: "on-demand" }]),
    });
    const out = await recommendForDomain({ ...base, recommendationsPref: true });
    expect(out).toEqual([{ title: "Walk", reason: "on-demand" }]);
    expect(callGemini).toHaveBeenCalledTimes(1); // fell through
  });

  test("A17: an explicit forceFresh run BYPASSES the brief (rich per-domain call)", async () => {
    (getOpsDailyBrief as jest.Mock).mockResolvedValue({
      exercise_routine: [{ title: "cached", reason: "brief" }],
    });
    (exportUserWiki as jest.Mock).mockResolvedValue({ prompt: "wiki body" });
    (callGemini as jest.Mock).mockResolvedValue({
      text: JSON.stringify([{ title: "fresh", reason: "forced" }]),
    });
    const out = await recommendForDomain({ ...base, recommendationsPref: true, forceFresh: true });
    expect(out).toEqual([{ title: "fresh", reason: "forced" }]);
    expect(getOpsDailyBrief).not.toHaveBeenCalled(); // brief skipped on forceFresh
    expect(callGemini).toHaveBeenCalledTimes(1);
  });
});
