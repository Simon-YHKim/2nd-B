import { classifyIngestClipping, isSafeToAutoSurface } from "../ingest-policy";

describe("classifyIngestClipping (A5 — third-party clipping policy)", () => {
  // The defining A5 regression: clipping a suicide-prevention / self-harm
  // article must NOT behave like a first-person crisis disclosure.
  it("quarantines a suicide-prevention article without any crisis routing", () => {
    const article =
      "This public-health article explains how to recognize warning signs of suicide and "
      + "how friends can help someone who is thinking about self-harm.";
    const r = classifyIngestClipping(article, "en");

    expect(r.action).toBe("quarantine");
    expect(r.containsCrisisMarkers).toBe(true);
    // No hotline can leak — the result shape has no routing field at all.
    expect(r).not.toHaveProperty("crisisRouting");
    expect(r).not.toHaveProperty("hotline");
    expect(JSON.stringify(r)).not.toMatch(/109|1388|988/);
    expect(isSafeToAutoSurface(r)).toBe(false);
  });

  it("quarantines a Korean crisis-marker clipping the same way", () => {
    const r = classifyIngestClipping("자살 예방에 관한 기사 — 위기 신호와 대처 방법 안내.", "ko");
    expect(r.action).toBe("quarantine");
    expect(r.containsCrisisMarkers).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/109|1388|988/);
  });

  it("allows ordinary content with no markers", () => {
    const r = classifyIngestClipping("A recipe for slow-roasted tomatoes with garlic and basil.", "en");
    expect(r.action).toBe("allow");
    expect(r.containsCrisisMarkers).toBe(false);
    expect(r.lexiconMatches).toHaveLength(0);
    expect(isSafeToAutoSurface(r)).toBe(true);
  });

  it("allows but flags forbidden clinical lexicon (tag/strip downstream)", () => {
    // 'therapy' is in the forbidden clinical lexicon — allowed for a clipping
    // but surfaced so the tag/strip step downstream can act on it.
    const r = classifyIngestClipping("Notes from a therapy session about boundaries.", "en");
    expect(r.action).toBe("allow");
    expect(r.containsCrisisMarkers).toBe(false);
    expect(r.lexiconMatches.length).toBeGreaterThan(0);
  });
});
