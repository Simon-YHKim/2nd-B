import { powerOnStartState } from "../power-on-state";

describe("PowerOnOverlay start state", () => {
  it("skips the overlay when reduced motion is preferred", () => {
    expect(powerOnStartState({ alreadyPlayed: false, reducedMotion: true })).toEqual({
      visible: false,
      shouldAnimate: false,
    });
  });

  it("animates on the first full-motion graph entry", () => {
    expect(powerOnStartState({ alreadyPlayed: false, reducedMotion: false })).toEqual({
      visible: true,
      shouldAnimate: true,
    });
  });

  it("skips after the power-on pass has played", () => {
    expect(powerOnStartState({ alreadyPlayed: true, reducedMotion: false })).toEqual({
      visible: false,
      shouldAnimate: false,
    });
  });
});
