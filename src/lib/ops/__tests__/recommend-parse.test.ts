import { OPS_MAX_RECOMMENDATIONS, parseOpsRecommendations } from "../recommend";

describe("parseOpsRecommendations (model output is clamped, never trusted)", () => {
  test("parses a fenced JSON array and keeps valid fields", () => {
    const raw = '```json\n[{"title":"Evening reset","reason":"Fits your notes.","durationMinutes":10,"recurrence":"daily","checklist":["One surface"],"startsAtIso":"2026-06-12T21:00:00.000Z"}]\n```';
    const out = parseOpsRecommendations(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      title: "Evening reset",
      reason: "Fits your notes.",
      durationMinutes: 10,
      recurrence: "daily",
      checklist: ["One surface"],
      startsAtIso: "2026-06-12T21:00:00.000Z",
    });
  });

  test("drops rows missing title or reason, caps the list, and ignores junk fields", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      title: `Idea ${i}`,
      reason: "Why.",
      recurrence: i % 2 ? "yearly" : "weekly",
      durationMinutes: -5,
      checklist: "not-an-array",
    }));
    const raw = JSON.stringify([{ reason: "no title" }, { title: "no reason" }, ...rows]);
    const out = parseOpsRecommendations(raw);
    expect(out).toHaveLength(OPS_MAX_RECOMMENDATIONS);
    expect(out[0].recurrence).toBe("weekly");
    expect(out[0].durationMinutes).toBeUndefined();
    expect(out[0].checklist).toBeUndefined();
    expect(out[1].recurrence).toBeUndefined();
  });

  test("non-JSON, crisis copy, or empty replies parse to an empty list", () => {
    expect(parseOpsRecommendations("")).toEqual([]);
    expect(parseOpsRecommendations("We hear you. Call or text 988.")).toEqual([]);
    expect(parseOpsRecommendations("[not json")).toEqual([]);
    expect(parseOpsRecommendations('{"title":"object not array"}')).toEqual([]);
  });

  test("oversized text fields are truncated with an ellipsis", () => {
    const raw = JSON.stringify([{ title: "t".repeat(200), reason: "r".repeat(500) }]);
    const out = parseOpsRecommendations(raw);
    expect(out[0].title.length).toBeLessThanOrEqual(80);
    expect(out[0].title.endsWith("…")).toBe(true);
    expect(out[0].reason.length).toBeLessThanOrEqual(240);
  });

  test("invalid startsAtIso is dropped while the row survives", () => {
    const out = parseOpsRecommendations(JSON.stringify([{ title: "x", reason: "y", startsAtIso: "soon" }]));
    expect(out[0].startsAtIso).toBeUndefined();
  });
});
