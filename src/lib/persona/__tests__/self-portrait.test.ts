import { buildSelfPortrait, filledCount } from "../self-portrait";
import type { PersonaCard } from "../build";

function makePersona(overrides: Partial<PersonaCard> = {}): PersonaCard {
  return {
    version: 1,
    traits: { openness: 0.6, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.4 },
    traitsSource: "bfi",
    mbti: null,
    attachment: null,
    values: [],
    patterns: {},
    markdownExport: "",
    ...overrides,
  };
}

describe("buildSelfPortrait — data contract", () => {
  it("returns all five fields in mission order", () => {
    const fields = buildSelfPortrait({ persona: null }, "ko");
    expect(fields.map((f) => f.id)).toEqual(["who", "forWhom", "goal", "do", "fuel"]);
  });

  it("marks every field collecting when there is no persona (never fabricates)", () => {
    const fields = buildSelfPortrait({ persona: null }, "ko");
    expect(fields.every((f) => f.status === "collecting" && f.value === null)).toBe(true);
    expect(filledCount(fields)).toBe(0);
  });

  it("fills `who` from a measured MBTI type", () => {
    const persona = makePersona({ mbti: { type: "INFJ", scores: { E: 0, I: 1, S: 0, N: 1, T: 0, F: 1, J: 1, P: 0 } } });
    const who = buildSelfPortrait({ persona }, "en").find((f) => f.id === "who")!;
    expect(who.status).toBe("filled");
    expect(who.value).toContain("INFJ");
  });

  it("falls back to attachment style for `who` when MBTI is absent", () => {
    const persona = makePersona({ attachment: { style: "secure", anxiety: 2, avoidance: 2 } });
    const who = buildSelfPortrait({ persona }, "ko").find((f) => f.id === "who")!;
    expect(who.status).toBe("filled");
    expect(who.value).toBeTruthy();
  });

  it("fills `fuel` from the top measured value framework", () => {
    const persona = makePersona({ values: ["big_five"] });
    const fuel = buildSelfPortrait({ persona }, "ko").find((f) => f.id === "fuel")!;
    expect(fuel.status).toBe("filled");
    expect(fuel.value).toBeTruthy();
  });

  it("keeps forWhom / goal / do collecting (no backing data contract yet)", () => {
    const persona = makePersona({
      mbti: { type: "INFJ", scores: { E: 0, I: 1, S: 0, N: 1, T: 0, F: 1, J: 1, P: 0 } },
      values: ["big_five"],
    });
    const fields = buildSelfPortrait({ persona }, "ko");
    for (const id of ["forWhom", "goal", "do"] as const) {
      expect(fields.find((f) => f.id === id)!.status).toBe("collecting");
    }
    // who + fuel filled = 2
    expect(filledCount(fields)).toBe(2);
  });

  it("routes each field to where its missing signal is added", () => {
    const fields = buildSelfPortrait({ persona: null }, "en");
    const byId = Object.fromEntries(fields.map((f) => [f.id, f.route]));
    expect(byId).toMatchObject({
      who: "/persona",
      forWhom: "/interview",
      goal: "/imagine",
      do: "/journal",
      fuel: "/audit",
    });
  });
});
