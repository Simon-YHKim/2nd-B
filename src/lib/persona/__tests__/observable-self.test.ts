import { OBSERVABLE_TRAITS, observableSelf, type BfiMeans } from "../observable-self";

const MEANS: BfiMeans = {
  openness: 5,
  conscientiousness: 3,
  extraversion: 4,
  agreeableness: 2,
  neuroticism: 5,
};

describe("observableSelf (SOKA)", () => {
  test("returns only the observable triad (extraversion/conscientiousness/agreeableness), never the internal traits", () => {
    const out = observableSelf(MEANS, "en");
    const traits = out.map((o) => o.trait).sort();
    expect(traits).toEqual(["agreeableness", "conscientiousness", "extraversion"]);
    // openness (5) and neuroticism (5) are the highest means but are INTERNAL -> excluded.
    expect(out.some((o) => o.trait === "openness" || o.trait === "neuroticism")).toBe(false);
    expect(OBSERVABLE_TRAITS).toHaveLength(3);
  });

  test("maps means to the (v-1)/4 percent anchor and sorts descending", () => {
    const out = observableSelf(MEANS, "en");
    // extraversion 4 -> 75, conscientiousness 3 -> 50, agreeableness 2 -> 25.
    expect(out).toEqual([
      { trait: "extraversion", label: expect.any(String), percent: 75 },
      { trait: "conscientiousness", label: expect.any(String), percent: 50 },
      { trait: "agreeableness", label: expect.any(String), percent: 25 },
    ]);
  });

  test("no BFI -> empty (the Seen lens then shows only its honest peer empty state)", () => {
    expect(observableSelf(null, "ko")).toEqual([]);
  });

  test("labels follow the locale", () => {
    expect(observableSelf(MEANS, "ko")[0].label).toBe("외향성");
    expect(observableSelf(MEANS, "en")[0].label).toBe("Extraversion");
  });
});
