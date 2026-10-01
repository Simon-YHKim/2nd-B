import { pagePointFromTouch } from "../touch-point";

describe("pagePointFromTouch", () => {
  it("reads native React Native touch coordinates", () => {
    expect(pagePointFromTouch({ pageX: 24, pageY: 48 })).toEqual({ pageX: 24, pageY: 48 });
  });

  it("reads browser TouchEvent coordinates from the first active finger", () => {
    expect(pagePointFromTouch({ touches: [{ pageX: 100, pageY: 200 }, { pageX: 140, pageY: 200 }] }))
      .toEqual({ pageX: 100, pageY: 200 });
  });

  it("ignores invalid or missing coordinates instead of feeding undefined to Animated.ValueXY", () => {
    expect(pagePointFromTouch({})).toBeNull();
    expect(pagePointFromTouch({ touches: [{ pageX: undefined, pageY: 5 }] })).toBeNull();
  });
});
