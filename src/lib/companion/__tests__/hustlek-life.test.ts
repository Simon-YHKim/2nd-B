import { hustlekAllowsLife, hustlekIdleDelay, hustlekIdleSequence, hustlekSpeechBeat, hustlekSpeechGap } from "../hustlek-life";

test("speech has nonuniform open and closed beats, with a repeating bounded cadence", () => {
  const frames = Array.from({ length: 16 }, (_, index) => hustlekSpeechBeat(index));
  expect(new Set(frames.map(frame => frame.durationMs)).size).toBeGreaterThan(3);
  expect(new Set(frames.map(frame => frame.mouth))).toEqual(new Set([null, "small", "open"]));
  expect(frames.slice(0, 8)).toEqual(frames.slice(8));
  expect(frames.every(frame => frame.durationMs >= 80 && frame.durationMs <= 160)).toBe(true);
});

test.each(["", "Hello.", "Really?", "좋아요!", "그러면,", "你好。", "음…", "Hi "])("speech pauses at %j", text => {
  expect(hustlekSpeechGap(text)).toBe(true);
});

test.each([undefined, "안녕", "Hello", "مرحبا"])("ordinary speech %j can move the mouth", text => {
  expect(hustlekSpeechGap(text)).toBe(false);
});

test("idle gestures remain sparse; yawning/dozing require at least 60 seconds quiet", () => {
  expect(hustlekIdleDelay(() => 0)).toBe(14_000);
  expect(hustlekIdleDelay(() => 1)).toBe(24_000);
  for (const roll of [0, 0.2, 0.5, 0.8, 1]) {
    expect(hustlekIdleSequence(59_999, () => roll).every(frame => ["A02", "A03"].includes(frame.expression))).toBe(true);
  }
  expect(hustlekIdleSequence(60_000, () => 0.8)).toEqual([
    { expression: "D11", durationMs: 1500 }, { expression: "D10", durationMs: 2200 },
  ]);
});

test("only calm neutral/friendly faces permit ambient embellishment", () => {
  expect(hustlekAllowsLife("A01")).toBe(true);
  expect(hustlekAllowsLife("A02")).toBe(true);
  for (const expression of ["B01", "B04", "C07", "C08", "D02"] as const) expect(hustlekAllowsLife(expression)).toBe(false);
});
