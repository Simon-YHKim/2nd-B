import { fitPhoneArtwork, PHONE_ARTWORK_BOUNDS } from "../phone-frame";

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
