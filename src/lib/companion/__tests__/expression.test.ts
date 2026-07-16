import { reactExpression, subscribeExpression, REACTION_MS } from "../expression";

describe("SecondB expression reactions", () => {
  test("delivers a fired reaction to every subscriber with a duration", () => {
    const seen: Array<{ mood: string; dur: number }> = [];
    const off = subscribeExpression((mood, dur) => seen.push({ mood, dur }));

    reactExpression("positive");
    reactExpression("negative", 800);

    expect(seen).toEqual([
      { mood: "positive", dur: REACTION_MS },
      { mood: "negative", dur: 800 },
    ]);
    off();
  });

  test("stops delivering after unsubscribe", () => {
    let count = 0;
    const off = subscribeExpression(() => (count += 1));
    reactExpression("positive");
    off();
    reactExpression("positive");
    expect(count).toBe(1);
  });
});

describe("expression durations + holds (13-expression vocabulary)", () => {
  const { holdExpression, currentHold, subscribeHold } = require("../expression");
  const { REACTION_HOLD_MS } = require("../faces");

  test("per-expression default durations: sad lingers, wink is quick", () => {
    const seen: Array<{ expr: string; dur: number }> = [];
    const off = subscribeExpression((expr: string, dur: number) => seen.push({ expr, dur }));
    reactExpression("sad");
    reactExpression("wink");
    reactExpression("smug");
    off();
    expect(seen).toEqual([
      { expr: "sad", dur: REACTION_HOLD_MS.sad },
      { expr: "wink", dur: REACTION_HOLD_MS.wink },
      { expr: "smug", dur: REACTION_HOLD_MS.smug },
    ]);
    expect(REACTION_HOLD_MS.sad).toBeGreaterThan(REACTION_HOLD_MS.wink);
  });

  test("holds stack last-wins and release restores the previous", () => {
    const states: Array<string | null> = [];
    const off = subscribeHold((e: string | null) => states.push(e));
    const r1 = holdExpression("thinking");
    const r2 = holdExpression("sad");
    expect(currentHold()).toBe("sad");
    r2();
    expect(currentHold()).toBe("thinking");
    r1();
    expect(currentHold()).toBeNull();
    r1(); // double release is a no-op
    off();
    expect(states).toEqual(["thinking", "sad", "thinking", null]);
  });
});
