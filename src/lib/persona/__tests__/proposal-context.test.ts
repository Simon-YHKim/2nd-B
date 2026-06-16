import type { PersonaCard } from "../build";
import { proposalContextForStar } from "../proposal-context";

function baseCard(over: Partial<PersonaCard> = {}): PersonaCard {
  return {
    version: 1,
    traits: { openness: 0.8, conscientiousness: 0.5, extraversion: 0.3, agreeableness: 0.6, neuroticism: 0.2 },
    traitsSource: "bfi",
    mbti: null,
    attachment: null,
    values: [],
    patterns: { summary: "writes often about learning" },
    markdownExport: "",
    ...over,
  };
}

describe("proposalContextForStar", () => {
  test("star1 (now) before = trait percentages; evidence = summary", () => {
    const ctx = proposalContextForStar(baseCard(), "now");
    expect(ctx.before).toContain("openness 80");
    expect(ctx.before).toContain("neuroticism 20");
    expect(ctx.evidence).toContain("writes often about learning");
  });

  test("star5 (relational) reflects a present ECR-S attachment", () => {
    const ctx = proposalContextForStar(
      baseCard({ attachment: { style: "secure", anxiety: 2.5, avoidance: 1.8 } }),
      "relational",
    );
    expect(ctx.before).toContain("secure");
    expect(ctx.before).toContain("2.5");
  });

  test("star5 (relational) is honest when attachment is missing", () => {
    expect(proposalContextForStar(baseCard(), "relational").before).toBe("not assessed yet");
  });

  test("star7 (values) lists engaged frameworks", () => {
    const ctx = proposalContextForStar(baseCard({ values: ["sdt:autonomy", "via:curiosity"] }), "values");
    expect(ctx.before).toContain("sdt:autonomy");
    expect(ctx.before).toContain("via:curiosity");
  });

  test("evidence includes observed top_ pattern kinds", () => {
    const ctx = proposalContextForStar(
      baseCard({ patterns: { summary: "s", top_attachment: "8", top_career: "3" } }),
      "now",
    );
    expect(ctx.evidence).toContain("attachment: 8");
    expect(ctx.evidence).toContain("career: 3");
  });

  test("stars without a card-resident value are honest", () => {
    expect(proposalContextForStar(baseCard(), "possible").before).toBe("not gathered yet");
  });
});
