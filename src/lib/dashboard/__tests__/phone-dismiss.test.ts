import { canBeginPhoneDismiss, shouldCompletePhoneDismiss } from "../phone-dismiss";

test("downward pull dismisses only from the top of the phone content", () => {
  expect(canBeginPhoneDismiss(20, 2, 0)).toBe(true);
  expect(canBeginPhoneDismiss(20, 2, 30)).toBe(false);
  expect(canBeginPhoneDismiss(-30, 0, 0)).toBe(false);
  expect(canBeginPhoneDismiss(20, 20, 0)).toBe(false);
  expect(canBeginPhoneDismiss(8, 0, 0)).toBe(false);
});

test("short accidental pulls snap back but a long or fast pull exits", () => {
  expect(shouldCompletePhoneDismiss(50, 0.2)).toBe(false);
  expect(shouldCompletePhoneDismiss(90, 0)).toBe(true);
  expect(shouldCompletePhoneDismiss(35, 0.8)).toBe(true);
  expect(shouldCompletePhoneDismiss(-90, 1)).toBe(false);
});
