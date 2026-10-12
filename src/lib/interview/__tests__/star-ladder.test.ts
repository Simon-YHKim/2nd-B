import { DRILL_LAYERS } from "../probe";
import { starLadderRungs } from "../star-ladder";

describe("starLadderRungs: the star summary's five-layer ladder (Q-261012-57)", () => {
  test("always five rungs, the deepest layer on top and the first at the bottom", () => {
    expect(starLadderRungs([]).map((rung) => rung.layer)).toEqual(["echo", "belief", "meaning", "feeling", "fact"]);
    expect(starLadderRungs([]).map((rung) => rung.layer)).toEqual([...DRILL_LAYERS].reverse());
  });

  test("nothing is lit until a layer has a real answer", () => {
    expect(starLadderRungs([]).every((rung) => !rung.on)).toBe(true);
  });

  test("only the covered layers are lit, wherever they sit", () => {
    const lit = (covered: Parameters<typeof starLadderRungs>[0]) =>
      starLadderRungs(covered).filter((rung) => rung.on).map((rung) => rung.layer);
    expect(lit(["fact"])).toEqual(["fact"]);
    expect(lit(["fact", "feeling", "meaning"])).toEqual(["meaning", "feeling", "fact"]);
    // A gap stays a gap: belief without meaning does not light meaning.
    expect(lit(["fact", "belief"])).toEqual(["belief", "fact"]);
    expect(lit([...DRILL_LAYERS])).toEqual(["echo", "belief", "meaning", "feeling", "fact"]);
  });

  test("the input is left as it was", () => {
    const covered = ["feeling", "fact"] as const;
    starLadderRungs(covered);
    expect(covered).toEqual(["feeling", "fact"]);
  });
});
