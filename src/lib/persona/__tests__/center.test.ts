import { buildCenterCards } from "../center";
import type { PersonaCard } from "../build";

function makePersona(overrides: Partial<PersonaCard> = {}): PersonaCard {
  return {
    version: 1,
    traits: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
    traitsSource: "heuristic",
    mbti: null,
    attachment: null,
    values: [],
    patterns: { summary: "" },
    markdownExport: "",
    ...overrides,
  };
}

describe("buildCenterCards", () => {
  test("returns exactly the three §7-2 cards in order", () => {
    const cards = buildCenterCards(makePersona(), "ko");
    expect(cards.map((c) => c.id)).toEqual(["direction", "neighborhood", "pieces"]);
  });

  test("brightest direction tracks the highest trait", () => {
    const persona = makePersona({
      traits: {
        openness: 0.2,
        conscientiousness: 0.2,
        extraversion: 0.9,
        agreeableness: 0.2,
        neuroticism: 0.2,
      },
    });
    const [direction] = buildCenterCards(persona, "ko");
    expect(direction.body).toContain("바깥으로 향하는 마음");
  });

  test("neuroticism-dominant is framed positively, never clinically", () => {
    const persona = makePersona({
      traits: {
        openness: 0.1,
        conscientiousness: 0.1,
        extraversion: 0.1,
        agreeableness: 0.1,
        neuroticism: 0.95,
      },
    });
    const [direction] = buildCenterCards(persona, "en");
    expect(direction.body).toContain("sensitivity");
    expect(direction.body.toLowerCase()).not.toMatch(/anxiety|disorder|neurotic/);
  });

  test("neighborhood uses the top framework when present", () => {
    const persona = makePersona({ values: ["sdt:autonomy"] });
    const [, neighborhood] = buildCenterCards(persona, "ko");
    expect(neighborhood.body).toContain("자기결정성 · 자율성");
  });

  test("neighborhood falls back gracefully with no frameworks", () => {
    const [, neighborhood] = buildCenterCards(makePersona(), "en");
    expect(neighborhood.body).toMatch(/still settling/i);
  });

  test("pieces names a measured Big Five when source is bfi", () => {
    const persona = makePersona({ traitsSource: "bfi" });
    const [, , pieces] = buildCenterCards(persona, "en");
    expect(pieces.body).toContain("measured Big Five");
  });

  test("pieces lists every present signal", () => {
    const persona = makePersona({
      traitsSource: "bfi",
      mbti: { type: "INTP", scores: { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 } },
      attachment: { style: "secure", anxiety: 2, avoidance: 2 },
      values: ["big_five:openness", "sdt:autonomy"],
    });
    const [, , pieces] = buildCenterCards(persona, "ko");
    expect(pieces.body).toContain("Big Five 실측");
    expect(pieces.body).toContain("MBTI");
    expect(pieces.body).toContain("애착 스타일");
    expect(pieces.body).toContain("2개 프레임워크");
  });

  test("each card carries a distinct character accent", () => {
    const cards = buildCenterCards(makePersona(), "ko");
    const accents = new Set(cards.map((c) => c.accent));
    expect(accents.size).toBe(3);
  });
});
