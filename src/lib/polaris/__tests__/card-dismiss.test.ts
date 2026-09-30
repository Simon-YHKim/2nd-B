import { cardDismissDirection, cardEdges, shouldCompleteCardDismiss } from "../card-dismiss";

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
