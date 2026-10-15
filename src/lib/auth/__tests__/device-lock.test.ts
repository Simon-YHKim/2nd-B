import { createDeviceLock, type DeviceAuthResult } from "../device-lock";

function fixture() {
  let now = 100_000;
  let complete: (result: DeviceAuthResult) => void = () => {};
  const authenticate = jest.fn(() => new Promise<DeviceAuthResult>(resolve => { complete = resolve; }));
  const cancel = jest.fn();
  const lock = createDeviceLock({ now: () => now, active: true, authenticate, cancel });
  return { lock, authenticate, cancel, at(value: number) { now = value; },
    complete(value: DeviceAuthResult = { success: true }) { complete(value); } };
}

test("cold start stays covered until the OS succeeds; a second tap cannot open another prompt", async () => {
  const f = fixture();
  expect(f.lock.getSnapshot().covered).toBe(true);
  const request = f.lock.unlock();
  await f.lock.unlock();
  expect(f.authenticate).toHaveBeenCalledTimes(1);
  expect(f.lock.getSnapshot()).toMatchObject({ covered: true, pending: true });
  f.complete(); await request;
  expect(f.lock.getSnapshot()).toMatchObject({ covered: false, pending: false });
});

test.each(["cancelled", "not_enrolled", "unavailable", "failed"] as const)("%s cannot grant access; an explicit retry can", async error => {
  const f = fixture(); const request = f.lock.unlock();
  f.complete({ success: false, error }); await request;
  expect(f.lock.getSnapshot()).toMatchObject({ covered: true, error });
  const retry = f.lock.unlock(); f.complete(); await retry;
  expect(f.lock.getSnapshot().covered).toBe(false);
});

test.each([59_999, 60_000, 60_001])("return after %i ms uses the exact one-minute boundary", async away => {
  const f = fixture(); const request = f.lock.unlock(); f.complete(); await request;
  f.at(110_000); f.lock.setActive(false);
  expect(f.lock.getSnapshot().covered).toBe(true);
  f.at(110_000 + away); f.lock.setActive(true);
  expect(f.lock.getSnapshot().covered).toBe(away >= 60_000);
});

test("inactive→background preserves the first departure, even if a timer never runs", async () => {
  const f = fixture(); const request = f.lock.unlock(); f.complete(); await request;
  f.at(110_000); f.lock.setActive(false);
  f.at(140_000); f.lock.setActive(false);
  f.at(170_000); f.lock.setActive(true);
  expect(f.lock.getSnapshot().covered).toBe(true);
});

test("OS PIN activity success before foreground is retained, but a later return expires it", async () => {
  const f = fixture(); const request = f.lock.unlock();
  f.at(110_000); f.lock.setActive(false);
  f.at(190_000); f.complete(); await request;
  expect(f.lock.getSnapshot().covered).toBe(true);
  f.at(190_100); f.lock.setActive(true);
  expect(f.lock.getSnapshot().covered).toBe(false);
  f.lock.setActive(false); f.at(250_100); f.lock.setActive(true);
  expect(f.lock.getSnapshot().covered).toBe(true);
});

test("an account change invalidates a late success and holds single-flight until it settles", async () => {
  const f = fixture(); const request = f.lock.unlock(); f.lock.reset();
  expect(f.cancel).toHaveBeenCalledTimes(1);
  await f.lock.unlock(); expect(f.authenticate).toHaveBeenCalledTimes(1);
  f.complete(); await request;
  expect(f.lock.getSnapshot()).toMatchObject({ covered: true, pending: false });
  const retry = f.lock.unlock(); f.complete(); await retry;
  expect(f.lock.getSnapshot().covered).toBe(false);
});

test("clock moving backwards cannot extend the grace period", async () => {
  const f = fixture(); const request = f.lock.unlock(); f.complete(); await request;
  f.at(110_000); f.lock.setActive(false); f.at(50_000); f.lock.setActive(true);
  expect(f.lock.getSnapshot().covered).toBe(true);
});

test("background attempts and an unmounted session never authenticate or accept a late result", async () => {
  const f = fixture(); f.lock.setActive(false); await f.lock.unlock();
  expect(f.authenticate).not.toHaveBeenCalled();
  f.lock.setActive(true); const request = f.lock.unlock(); f.lock.dispose();
  f.complete(); await request; await f.lock.unlock();
  expect(f.authenticate).toHaveBeenCalledTimes(1);
  expect(f.lock.getSnapshot().covered).toBe(true);
});

test("a rejected native request stays covered and clears the pending hold", async () => {
  const lock = createDeviceLock({ now: () => 1, active: true, cancel() {}, authenticate: async () => { throw Error("missing module"); } });
  await lock.unlock();
  expect(lock.getSnapshot()).toMatchObject({ covered: true, pending: false, error: "failed" });
});
