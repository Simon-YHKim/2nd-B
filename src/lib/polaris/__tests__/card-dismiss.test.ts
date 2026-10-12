import { cardDismissDirection, cardEdges, cardHasMoreBelow, shouldCompleteCardDismiss } from "../card-dismiss";

const both = { top: true, bottom: true };

test("a card that does not scroll is at both edges", () => {
  expect(cardEdges(0, 500, 400)).toEqual(both);
});

test("a long card body is at the top, in the middle, then at the bottom", () => {
  expect(cardEdges(0, 500, 1200)).toEqual({ top: true, bottom: false });
  expect(cardEdges(300, 500, 1200)).toEqual({ top: false, bottom: false });
  expect(cardEdges(700, 500, 1200)).toEqual({ top: false, bottom: true });
});

test("swiping down or up dismisses when the body is at that edge", () => {
  expect(cardDismissDirection(30, 2, both)).toBe("down");
  expect(cardDismissDirection(-30, 2, both)).toBe("up");
});

test("mid-scroll drags stay with the card's own scroll", () => {
  expect(cardDismissDirection(30, 0, { top: false, bottom: true })).toBeNull();
  expect(cardDismissDirection(-30, 0, { top: true, bottom: false })).toBeNull();
});

test("horizontal and tiny drags belong to the deck, not to dismissing", () => {
  expect(cardDismissDirection(20, 40, both)).toBeNull();
  expect(cardDismissDirection(-20, -20, both)).toBeNull();
  expect(cardDismissDirection(10, 0, both)).toBeNull();
});

test("short pulls snap back and long or fast pulls exit, in both directions", () => {
  expect(shouldCompleteCardDismiss(50, 0.2)).toBe(false);
  expect(shouldCompleteCardDismiss(-50, -0.2)).toBe(false);
  expect(shouldCompleteCardDismiss(90, 0)).toBe(true);
  expect(shouldCompleteCardDismiss(-90, 0)).toBe(true);
  expect(shouldCompleteCardDismiss(35, 0.8)).toBe(true);
  expect(shouldCompleteCardDismiss(-35, -0.8)).toBe(true);
});

describe("cardHasMoreBelow: the card's more-below mark (Q-261012-55)", () => {
  test("stays off until the body has been measured", () => {
    expect(cardHasMoreBelow(undefined)).toBe(false);
    expect(cardHasMoreBelow({ y: 0, viewport: 0, content: 900 })).toBe(false);
    expect(cardHasMoreBelow({ y: 0, viewport: 500, content: 0 })).toBe(false);
  });

  test("is on while text runs past the visible bottom", () => {
    expect(cardHasMoreBelow({ y: 0, viewport: 500, content: 900 })).toBe(true);
    expect(cardHasMoreBelow({ y: 200, viewport: 500, content: 900 })).toBe(true);
  });

  test("is off for a body that fits and once a long body reaches its end", () => {
    expect(cardHasMoreBelow({ y: 0, viewport: 500, content: 500 })).toBe(false);
    expect(cardHasMoreBelow({ y: 0, viewport: 500, content: 502 })).toBe(false);
    expect(cardHasMoreBelow({ y: 400, viewport: 500, content: 900 })).toBe(false);
    expect(cardHasMoreBelow({ y: 398, viewport: 500, content: 900 })).toBe(false);
  });

  test("never disagrees with the bottom edge the swipe-to-close reads", () => {
    for (const body of [
      { y: 0, viewport: 500, content: 1200 },
      { y: 300, viewport: 500, content: 1200 },
      { y: 699, viewport: 500, content: 1200 },
      { y: 700, viewport: 500, content: 1200 },
      { y: 0, viewport: 640, content: 640 },
    ]) {
      expect(cardHasMoreBelow(body)).toBe(!cardEdges(body.y, body.viewport, body.content).bottom);
    }
  });
});
