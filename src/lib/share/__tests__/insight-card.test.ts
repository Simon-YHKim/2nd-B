import {
  deriveCardProps,
  captureCardProps,
  FALLBACK_INSIGHT,
  FALLBACK_LIT_COUNT,
} from "../insight-card";

// Pure mapping only — the native capture/share path is NOT tested here (it
// lazy-imports react-native-view-shot + expo-sharing, which are native-only).
describe("deriveCardProps (core-brain + star_tier_history → ShareCard props)", () => {
  test("maps a real north-star sentence + lit count through unchanged", () => {
    const props = deriveCardProps({
      northStarSentence: "나는 호기심으로 세상을 읽는다.",
      litStars: 6,
      handle: "simon",
    });
    expect(props).toEqual({
      insight: "나는 호기심으로 세상을 읽는다.",
      handle: "simon",
      litCount: 6,
    });
  });

  test("missing / blank sentence falls back to the canonical sentence", () => {
    expect(deriveCardProps({ handle: "x" }).insight).toBe(FALLBACK_INSIGHT);
    expect(deriveCardProps({ northStarSentence: "   ", handle: "x" }).insight).toBe(
      FALLBACK_INSIGHT,
    );
    expect(deriveCardProps({ northStarSentence: null, handle: "x" }).insight).toBe(
      FALLBACK_INSIGHT,
    );
  });

  test("trims surrounding whitespace from a real sentence", () => {
    expect(
      deriveCardProps({ northStarSentence: "  깊이 산다.  ", handle: "x" }).insight,
    ).toBe("깊이 산다.");
  });

  test("missing / non-finite litStars falls back to the canonical 4", () => {
    expect(deriveCardProps({ handle: "x" }).litCount).toBe(FALLBACK_LIT_COUNT);
    expect(deriveCardProps({ litStars: null, handle: "x" }).litCount).toBe(
      FALLBACK_LIT_COUNT,
    );
    expect(deriveCardProps({ litStars: NaN, handle: "x" }).litCount).toBe(
      FALLBACK_LIT_COUNT,
    );
  });

  test("litStars is clamped to 0..7 and rounded", () => {
    expect(deriveCardProps({ litStars: -3, handle: "x" }).litCount).toBe(0);
    expect(deriveCardProps({ litStars: 12, handle: "x" }).litCount).toBe(7);
    expect(deriveCardProps({ litStars: 3.6, handle: "x" }).litCount).toBe(4);
  });

  test("blank handle falls back to 'me'", () => {
    expect(deriveCardProps({ handle: "" }).handle).toBe("me");
    expect(deriveCardProps({ handle: null }).handle).toBe("me");
    expect(deriveCardProps({ handle: "  ari  " }).handle).toBe("ari");
  });
});

describe("captureCardProps", () => {
  test("builds 1080-sized ShareCard props with the variant + defaults", () => {
    const props = captureCardProps({
      variant: "B",
      insight: "x",
      handle: "y",
    });
    expect(props.variant).toBe("B");
    expect(props.size).toBe(1080);
    expect(props.litCount).toBe(FALLBACK_LIT_COUNT);
  });

  test("passes an explicit litCount through", () => {
    expect(
      captureCardProps({ variant: "A", insight: "x", handle: "y", litCount: 2 }).litCount,
    ).toBe(2);
  });
});
