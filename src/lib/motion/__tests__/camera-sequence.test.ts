import { CAMERA_APPROACH, CAMERA_SHUTTER, runCameraSequence } from '../camera-sequence';

function harness(steps = CAMERA_APPROACH) {
  const completions: ((finished: boolean) => void)[] = [];
  const stop = jest.fn();
  const onStep = jest.fn(); const onDone = jest.fn();
  const animate = jest.fn((_step, complete) => { completions.push(complete); return { stop }; });
  const cancel = runCameraSequence(steps, { animate, onStep, onDone });
  return { completions, stop, onStep, onDone, animate, cancel };
}

test('aim finishes before zoom, zoom before focus, ready only after focus', () => {
  const h = harness();
  expect(h.onStep.mock.calls).toEqual([['aim']]);
  h.completions[0](true); expect(h.onStep.mock.calls).toEqual([['aim'], ['zoom']]);
  h.completions[1](true); expect(h.onStep).toHaveBeenLastCalledWith('focus');
  expect(h.onDone).not.toHaveBeenCalled();
  h.completions[2](true); expect(h.onDone).toHaveBeenCalledTimes(1);
  h.completions[2](true); expect(h.onDone).toHaveBeenCalledTimes(1);
  expect(CAMERA_APPROACH.map(s => s.to)).toEqual([0.4, 0.8, 1]);
});

test('cancelling at zoom stops the animation and prevents a stale focus lock', () => {
  const h = harness(); h.completions[0](true); h.cancel();
  h.completions[1](true);
  expect(h.stop).toHaveBeenCalledTimes(1);
  expect(h.animate).toHaveBeenCalledTimes(2);
  expect(h.onDone).not.toHaveBeenCalled();
});

test('interrupted native animation never advances or navigates', () => {
  const h = harness(); h.completions[0](false); h.completions[0](true);
  expect(h.animate).toHaveBeenCalledTimes(1);
  expect(h.onDone).not.toHaveBeenCalled();
});

test('shutter completes before its single navigation callback, cancellation prevents entry', () => {
  const completed = harness(CAMERA_SHUTTER);
  expect(completed.onDone).not.toHaveBeenCalled();
  completed.completions[0](true); completed.completions[0](true);
  expect(completed.onDone).toHaveBeenCalledTimes(1);
  const cancelled = harness(CAMERA_SHUTTER); cancelled.cancel(); cancelled.completions[0](true);
  expect(cancelled.onDone).not.toHaveBeenCalled();
});
