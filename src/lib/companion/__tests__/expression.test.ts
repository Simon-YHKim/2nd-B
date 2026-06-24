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
