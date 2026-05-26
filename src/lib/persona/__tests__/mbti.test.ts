import { MBTI_ITEMS, scoreMbti, type MbtiResponses } from "../mbti";

describe("MBTI_ITEMS shape", () => {
  test("16 items total", () => {
    expect(MBTI_ITEMS).toHaveLength(16);
  });

  test("4 items per dichotomy", () => {
    const counts = new Map<string, number>();
    for (const i of MBTI_ITEMS) counts.set(i.dichotomy, (counts.get(i.dichotomy) ?? 0) + 1);
    for (const d of ["EI", "SN", "TF", "JP"]) {
      expect(counts.get(d)).toBe(4);
    }
  });

  test("each dichotomy has both sides covered as agreeSide", () => {
    const ei = MBTI_ITEMS.filter((i) => i.dichotomy === "EI").map((i) => i.agreeSide);
    expect(ei).toEqual(expect.arrayContaining(["E", "I"]));
    const sn = MBTI_ITEMS.filter((i) => i.dichotomy === "SN").map((i) => i.agreeSide);
    expect(sn).toEqual(expect.arrayContaining(["S", "N"]));
    const tf = MBTI_ITEMS.filter((i) => i.dichotomy === "TF").map((i) => i.agreeSide);
    expect(tf).toEqual(expect.arrayContaining(["T", "F"]));
    const jp = MBTI_ITEMS.filter((i) => i.dichotomy === "JP").map((i) => i.agreeSide);
    expect(jp).toEqual(expect.arrayContaining(["J", "P"]));
  });
});

describe("scoreMbti", () => {
  test("empty → no type", () => {
    const r = scoreMbti({});
    expect(r.complete).toBe(false);
    expect(r.type).toBeNull();
  });

  test("partial answers → no type", () => {
    const r = scoreMbti({ 1: 5 });
    expect(r.complete).toBe(false);
    expect(r.type).toBeNull();
  });

  test("all neutrals (raw=3) → tie-break gives default 'ESTJ'", () => {
    // Ties resolve to first-listed letter (E/S/T/J in the chain).
    const responses: MbtiResponses = {};
    for (const i of MBTI_ITEMS) responses[i.id] = 3;
    const r = scoreMbti(responses);
    expect(r.complete).toBe(true);
    expect(r.type).toBe("ESTJ");
  });

  test("all 5s on E-keyed + 1s on I-keyed → E side wins", () => {
    // For each dichotomy, agree-with-positive-keyed lifts that side;
    // disagree-with-opposite-keyed also lifts the same side.
    const responses: MbtiResponses = {};
    for (const i of MBTI_ITEMS) {
      // Push toward I/N/F/P uniformly for variety.
      if (i.agreeSide === "I" || i.agreeSide === "N" || i.agreeSide === "F" || i.agreeSide === "P") {
        responses[i.id] = 5; // strongly agree → that side
      } else {
        responses[i.id] = 1; // strongly disagree → opposite side
      }
    }
    const r = scoreMbti(responses);
    expect(r.type).toBe("INFP");
  });

  test("complete responses with all 5s on E/S/T/J sides → ESTJ", () => {
    const responses: MbtiResponses = {};
    for (const i of MBTI_ITEMS) {
      if (i.agreeSide === "E" || i.agreeSide === "S" || i.agreeSide === "T" || i.agreeSide === "J") {
        responses[i.id] = 5;
      } else {
        responses[i.id] = 1;
      }
    }
    const r = scoreMbti(responses);
    expect(r.type).toBe("ESTJ");
  });

  test("ignores out-of-range raw values", () => {
    const r = scoreMbti({ 1: 0 as unknown as number, 2: 6 as unknown as number, 3: NaN as unknown as number });
    expect(r.answered).toBe(0);
  });
});
