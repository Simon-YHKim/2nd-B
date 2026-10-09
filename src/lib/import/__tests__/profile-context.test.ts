import { parseProfileContext, selectedProfileContext, selectAllContext } from "../profile-context";

export const fixture = {
  format: "polascope.user-context", version: "1.0-draft",
  origin: { service: "unknown", model: null, exported_at: null },
  coverage: { accessed: ["current_chat"], unavailable: [], omissions: [], more_items: "unknown", account_completeness: "unknown" },
  sources: [{ id: "s1", kind: "chat_excerpt", speaker: "user", conversation_id: null, message_id: null, label: null, occurred_at: null, excerpt: "I prefer mornings." }],
  items: [{ id: "i1", category: "preference", statement: "I prefer mornings.", reported_basis: "user_statement", evidence_ids: ["s1"], valid_time: { from: null, to: null, description: null }, conflicts_with: [] }],
};

describe("profile context input", () => {
  test("accepts the common contract and a single JSON fence without changing statements", () => {
    expect(parseProfileContext(JSON.stringify(fixture))).toEqual(fixture);
    expect(parseProfileContext("```json\n" + JSON.stringify(fixture) + "\n```")).toEqual(fixture);
  });
  test.each([
    "some text", JSON.stringify({ ...fixture, version: "2" }),
    JSON.stringify({ ...fixture, owner: "forged" }),
    JSON.stringify({ ...fixture, items: [{ ...fixture.items[0], statement: "" }] }),
    JSON.stringify({ ...fixture, items: [{ ...fixture.items[0], evidence_ids: ["missing"] }] }),
    JSON.stringify({ ...fixture, items: [{ ...fixture.items[0], conflicts_with: ["i1"] }] }),
    JSON.stringify({ ...fixture, items: [fixture.items[0], fixture.items[0]] }),
    JSON.stringify({ ...fixture, items: [{ ...fixture.items[0], statement: "a".repeat(801) }] }),
    JSON.stringify({ ...fixture, origin: { ...fixture.origin, exported_at: "2026-02-30T00:00:00Z" } }),
    JSON.stringify({ ...fixture, items: [{ ...fixture.items[0], valid_time: { from: "2026-02-01", to: "2025-01-01", description: null } }] }),
    '{"format":"fake","format":"polascope.user-context"}',
    "a".repeat(262145),
    "Intro\n```json\n" + JSON.stringify(fixture) + "\n```",
  ])("rejects invalid input without treating raw text as a fact", (text) => {
    expect(() => parseProfileContext(text)).toThrow();
  });
});

describe("review approval boundary", () => {
  const input = parseProfileContext(JSON.stringify({ ...fixture, items: [fixture.items[0], {
    ...fixture.items[0], id: "i2", reported_basis: "assistant_inference", statement: "An interpretation", evidence_ids: [],
  }] }));
  const review = { i1: { selected: false, confirmed: false, statement: "I prefer mornings." }, i2: { selected: false, confirmed: false, statement: "An interpretation" } };
  test("bulk selection never confirms an AI interpretation", () => {
    const next = selectAllContext(input, review, true);
    expect(next.i1.selected).toBe(true); expect(next.i2.selected).toBe(false);
    expect(selectAllContext(input, { ...review, i2: { ...review.i2, confirmed: true } }, true).i2.selected).toBe(true);
    expect(selectAllContext(input, next, false).i1.selected).toBe(false);
  });
  test("a forged selected interpretation is rejected", () => {
    expect(() => selectedProfileContext(input, { ...review, i2: { ...review.i2, selected: true } })).toThrow();
  });
  test("memory summaries and claimed direct statements without an original user excerpt need confirmation", () => {
    for (const reported_basis of ["memory_summary", "user_statement"]) {
      const noOriginal = parseProfileContext(JSON.stringify({ ...fixture, sources: [], items: [{ ...fixture.items[0], reported_basis, evidence_ids: [] }] }));
      expect(selectAllContext(noOriginal, review, true).i1.selected).toBe(false);
      expect(() => selectedProfileContext(noOriginal, { ...review, i1: { ...review.i1, selected: true } })).toThrow();
    }
  });
  test("only selected edited statements and their citations leave the review", () => {
    const result = selectedProfileContext(input, { ...review, i2: { selected: true, confirmed: true, statement: "My own corrected statement" } });
    expect(result.document.sources).toEqual([]);
    expect(result.document.items).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("mornings");
    expect(result.confirmedIds).toEqual(["i2"]);
    expect(result.document.items[0].reported_basis).toBe("assistant_inference");
  });
});
