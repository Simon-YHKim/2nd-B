import { fitPhoneArtwork, PHONE_ARTWORK_BOUNDS } from "../phone-frame";

test("the approved artwork uses exact 2px cells at full size", () => {
  const frame = fitPhoneArtwork(460, 816)!;
  expect(frame.artwork).toEqual({ left: 0, top: 0, width: 460, height: 816 });
  expect(frame.screen).toEqual({ left: 56, top: 94, width: 348, height: 616 });
});

test.each([[425, 677], [460, 816], [320, 568], [390, 844]])(
  "all interactive bounds share one 2px grid at %i by %i", (width, height) => {
    const frame = fitPhoneArtwork(width, height)!;
    for (const bounds of [frame.artwork, frame.screen, frame.homeButton]) {
      for (const value of Object.values(bounds)) expect(value % 2).toBe(0);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.left + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.top + bounds.height).toBeLessThanOrEqual(height);
    }
    expect(frame.homeButton.top).toBeGreaterThanOrEqual(frame.screen.top + frame.screen.height);
    expect(frame.homeButton.width).toBeGreaterThanOrEqual(44);
    expect(frame.homeButton.height).toBeGreaterThanOrEqual(44);
  },
);

test("fits the supplied phone body, not the transparent PNG canvas", () => {
  const frame = fitPhoneArtwork(425, 677);
  expect(frame).not.toBeNull();
  if (!frame) return;
  const bodyLeft = frame.artwork.left + PHONE_ARTWORK_BOUNDS.body.left * frame.scale;
  const bodyRight = frame.artwork.left + PHONE_ARTWORK_BOUNDS.body.right * frame.scale;
  const bodyTop = frame.artwork.top + PHONE_ARTWORK_BOUNDS.body.top * frame.scale;
  const bodyBottom = frame.artwork.top + PHONE_ARTWORK_BOUNDS.body.bottom * frame.scale;
  expect(bodyLeft).toBeGreaterThanOrEqual(0);
  expect(bodyRight).toBeLessThanOrEqual(425);
  expect(bodyTop).toBeGreaterThanOrEqual(0);
  expect(bodyBottom).toBeLessThanOrEqual(677);
  expect(frame.screen.left).toBeGreaterThan(bodyLeft);
  expect(frame.screen.top).toBeGreaterThan(bodyTop);
  expect(frame.screen.width).toBeGreaterThan(280);
  expect(frame.screen.height).toBeGreaterThan(500);
  expect(frame.homeButton.top).toBeGreaterThan(frame.screen.top + frame.screen.height);
  expect(frame.homeButton.left).toBeGreaterThan(bodyLeft);
  expect(frame.homeButton.left + frame.homeButton.width).toBeLessThan(bodyRight);
});

test("invalid layouts do not produce an offscreen interactive display", () => {
  expect(fitPhoneArtwork(0, 677)).toBeNull();
  expect(fitPhoneArtwork(425, 0)).toBeNull();
});
