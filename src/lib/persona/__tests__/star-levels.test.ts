import { traitConfidenceFor, type PersonaCard, type TraitConfidence } from "../build";
import { deriveStarLevels, soulCoreBrightnessFor } from "../star-levels";

function uniformConfidence(tc: TraitConfidence): PersonaCard["traitConfidence"] {
  return { openness: tc, conscientiousness: tc, extraversion: tc, agreeableness: tc, neuroticism: tc };
}

function baseCard(over: Partial<PersonaCard> = {}): PersonaCard {
  return {
    version: 1,
    traits: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
    traitsSource: "heuristic",
    mbti: null,
    attachment: null,
    values: [],
    patterns: { summary: "x" },
    markdownExport: "",
    ...over,
  };
}

describe("deriveStarLevels", () => {
  test("an empty starter card leaves every star dim (L1), Soul Core 0.2", () => {
    const levels = deriveStarLevels(baseCard());
    expect(Object.values(levels).every((l) => l === 1)).toBe(true);
    expect(soulCoreBrightnessFor(baseCard())).toBeCloseTo(0.2);
  });

  test("a BFI result lights star1 to L4 (validated instrument)", () => {
    const card = baseCard({ traitConfidence: uniformConfidence(traitConfidenceFor("bfi", 1)) });
    expect(deriveStarLevels(card).now).toBe(4);
  });

  test("a journal-only heuristic scales star1 with observation count", () => {
    const low = baseCard({ traitConfidence: uniformConfidence(traitConfidenceFor("heuristic", 3)) });
    const high = baseCard({ traitConfidence: uniformConfidence(traitConfidenceFor("heuristic", 20)) });
    expect(deriveStarLevels(low).now).toBe(2);
    expect(deriveStarLevels(high).now).toBe(4);
  });

  test("ECR-S attachment lights star5 (relational) to L4", () => {
    const card = baseCard({ attachment: { style: "secure", anxiety: 2, avoidance: 2 } });
    expect(deriveStarLevels(card).relational).toBe(4);
  });

  test("engaged value frameworks raise star7; observed patterns raise star2", () => {
    const card = baseCard({
      values: ["sdt:autonomy", "via:curiosity", "sdt:relatedness"],
      patterns: { summary: "x", top_attachment: "8" },
    });
    const levels = deriveStarLevels(card);
    expect(levels.values).toBe(3);
    expect(levels.recall).toBe(2);
  });

  test("stars without a shipped engine stay dim (seen, rhythm, possible)", () => {
    const levels = deriveStarLevels(
      baseCard({ attachment: { style: "secure", anxiety: 2, avoidance: 2 }, values: ["sdt:autonomy"] }),
    );
    expect(levels.seen).toBe(1);
    expect(levels.rhythm).toBe(1);
    expect(levels.possible).toBe(1);
  });
});
