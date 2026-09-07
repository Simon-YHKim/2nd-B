/**
 * A5 regression: clipping someone else's article about suicide prevention must
 * not behave like a first-person crisis disclosure.
 *
 * The live path is /capture (Web Share Target -> CaptureLegacy, which
 * src/app/capture.tsx:344 renders inside the deep-space dock) ->
 * classifyClipper -> callLlm({ purpose: "clipper_classify" }). callLlm
 * classifies its input with classifyInputAnyLocale and, on red, short-circuits
 * into routeCrisis: a hotline reply plus a restricted crisis_events row
 * (src/lib/llm/boundary.ts, the C9 gate). src/lib/safety/ingest-policy.ts was
 * written for exactly this threat in queue E and was never wired to a caller
 * until 2026-09-06 (audit D3-18).
 *
 * These tests pin the wiring, not the classifier: the assertion that matters is
 * that the model is never reached for a quarantined clip, because reaching it is
 * what produced the hotline and the ledger row.
 */
import { classifyClipper } from "../classify-clipper";
import { INGEST_QUARANTINE_TAG } from "../../safety/ingest-policy";

const callLlm = jest.fn();

jest.mock("../../llm/boundary", () => ({
  callLlm: (...args: unknown[]) => callLlm(...args),
}));

jest.mock("../template-queries", () => ({
  listAccessibleTemplates: jest.fn(async () => []),
  matchTemplateByUrl: jest.fn(() => null),
}));

const ARTICLE_EN =
  "This public-health article explains how to recognize the warning signs of suicide "
  + "and how friends can help someone who is thinking about self-harm.";
const ARTICLE_KO = "자살 예방에 관한 기사 — 위기 신호와 주변 사람이 도울 수 있는 방법을 정리했다.";
const ORDINARY =
  "A practical guide to sourdough starters: hydration ratios, feeding schedules, and "
  + "how to tell when the culture is ready to bake with.";

describe("classifyClipper third-party crisis-marker guard (A5)", () => {
  beforeEach(() => {
    callLlm.mockReset();
    callLlm.mockResolvedValue({ text: "{}" });
  });

  it("never calls the model for a clipped suicide-prevention article", async () => {
    const result = await classifyClipper("u1", ARTICLE_EN, "https://example.org/a", "en");
    // The whole point: the text never reaches the C9 gate, so no routeCrisis,
    // no hotline reply, and no crisis_events insert can happen.
    expect(callLlm).not.toHaveBeenCalled();
    expect(result.tags).toContain(INGEST_QUARANTINE_TAG);
  });

  it("does the same for Korean crisis markers", async () => {
    const result = await classifyClipper("u1", ARTICLE_KO, "https://example.org/b", "ko");
    expect(callLlm).not.toHaveBeenCalled();
    expect(result.tags).toContain(INGEST_QUARANTINE_TAG);
  });

  it("leaks no hotline number into the quarantined clip", async () => {
    const result = await classifyClipper("u1", ARTICLE_EN, null, "en");
    expect(JSON.stringify(result)).not.toMatch(/109|1388|988|117|1366/);
  });

  it("still saves: the clip keeps a usable kind rather than failing", async () => {
    const result = await classifyClipper("u1", ARTICLE_EN, "https://example.org/c", "en");
    // Same degraded shape the function already returns when the model call
    // fails, so a capture never fails to save (classify-clipper.ts header).
    expect(typeof result.kind).toBe("string");
    expect(result.kind.length).toBeGreaterThan(0);
    expect(result.track).toBe("daily");
  });

  it("does NOT quarantine ordinary clipped content", async () => {
    // Guard against the opposite failure: quarantining everything would silently
    // turn the AI clipper off.
    await classifyClipper("u1", ORDINARY, "https://example.org/d", "en");
    expect(callLlm).toHaveBeenCalledTimes(1);
    const arg = callLlm.mock.calls[0][0] as { purpose: string };
    expect(arg.purpose).toBe("clipper_classify");
  });
});
