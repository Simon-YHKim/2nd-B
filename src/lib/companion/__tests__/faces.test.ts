import {
  FACES,
  REACTION_HOLD_MS,
  SLEEPY_AFTER_MS,
  nextIdleDelayMs,
  pickIdleAction,
  type Expression,
  type FaceSpec,
} from "../faces";

const ALL: Expression[] = [
  "neutral",
  "positive",
  "negative",
  "happy",
  "delight",
  "smug",
  "wink",
  "surprised",
  "thinking",
  "sad",
  "bored",
  "whistle",
  "sleepy",
];

describe("SecondB face vocabulary", () => {
  test("the vocabulary is 13 expressions deep and every one has a full face", () => {
    expect(Object.keys(FACES).sort()).toEqual([...ALL].sort());
    for (const expr of ALL) {
      const f: FaceSpec = FACES[expr];
      expect(f.eyes).toHaveLength(2);
      expect(["smile", "flat", "frown", "open", "o", "smirk"]).toContain(f.mouth);
      expect(["normal", "slow", "none"]).toContain(f.blink);
    }
  });

  test("eye geometry stays in renderable ranges", () => {
    for (const expr of ALL) {
      for (const eye of FACES[expr].eyes) {
        expect(eye.h).toBeGreaterThan(0);
        expect(eye.h).toBeLessThanOrEqual(1.6);
        expect(eye.top).toBeGreaterThan(0.5); // on the visor, below the crown
        expect(eye.top).toBeLessThan(0.7);
        expect(Math.abs(eye.tilt)).toBeLessThanOrEqual(20);
      }
    }
  });

  test("arc (closed) eyes never blink — they ARE a held blink", () => {
    for (const expr of ALL) {
      const f = FACES[expr];
      if (f.eyes.some((e) => e.arc)) expect(f.blink).toBe("none");
    }
  });

  test("asymmetry lands where designed: wink closes ONE eye, smug lowers ONE lid", () => {
    const wink = FACES.wink;
    expect(wink.eyes.filter((e) => e.arc)).toHaveLength(1);
    const smug = FACES.smug;
    expect(smug.eyes[0].h).toBeLessThan(smug.eyes[1].h);
  });

  test("only whistle floats the notelet", () => {
    for (const expr of ALL) {
      expect(Boolean(FACES[expr].note)).toBe(expr === "whistle");
    }
  });

  test("stronger moments hold longer than the wink", () => {
    expect(REACTION_HOLD_MS.sad!).toBeGreaterThan(REACTION_HOLD_MS.wink!);
    expect(REACTION_HOLD_MS.delight!).toBeGreaterThan(REACTION_HOLD_MS.wink!);
  });
});

describe("idle policy (평소 딴청)", () => {
  test("rolls nothing half the time, whistle and bored the rest", () => {
    expect(pickIdleAction(() => 0.0).expr).toBeNull();
    expect(pickIdleAction(() => 0.49).expr).toBeNull();
    expect(pickIdleAction(() => 0.6).expr).toBe("whistle");
    expect(pickIdleAction(() => 0.9).expr).toBe("bored");
  });

  test("a long quiet stretch deepens bored into sleepy", () => {
    expect(pickIdleAction(() => 0.9, SLEEPY_AFTER_MS).expr).toBe("sleepy");
    expect(pickIdleAction(() => 0.9, SLEEPY_AFTER_MS - 1).expr).toBe("bored");
  });

  test("every rolled action carries a bounded hold", () => {
    for (const r of [0.55, 0.8, 0.99]) {
      const a = pickIdleAction(() => r, SLEEPY_AFTER_MS);
      if (a.expr) {
        expect(a.holdMs).toBeGreaterThanOrEqual(2000);
        expect(a.holdMs).toBeLessThanOrEqual(5000);
      }
    }
  });

  test("idle rolls are spaced 14-28s apart", () => {
    expect(nextIdleDelayMs(() => 0)).toBe(14_000);
    expect(nextIdleDelayMs(() => 0.9999)).toBeLessThan(28_000);
  });
});
