import { captureLiveOwnerCheck, observeLiveOwner, withLiveOwnerSignal } from "../live-owner-guard";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner } from "../account-epoch";

beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("a"); });

test.each(["b", null, ""])("a mismatched or absent owner %j cannot acquire a live check", owner => {
  expect(captureLiveOwnerCheck(owner ?? "")).toThrow(expect.objectContaining({ name: "AbortError" }));
});

test.each(["hold", "switch", "return"])("%s aborts a live request before any next dispatch", change => {
  const guard = observeLiveOwner(captureLiveOwnerCheck("a"));
  try {
    guard.assertCurrent();
    if (change === "hold") beginAccountOwnerTransition("b");
    else noteResolvedOwner("b");
    if (change === "return") { noteResolvedOwner("a"); clearAccountTransition(currentAccountEpoch()); }
    expect(guard.signal.aborted).toBe(true);
    expect(guard.assertCurrent).toThrow(expect.objectContaining({ name: "AbortError" }));
  } finally { guard.release(); }
});

test("same-owner refresh does not cancel and a completed operation unsubscribes", () => {
  const guard = observeLiveOwner(captureLiveOwnerCheck("a"));
  noteResolvedOwner("a");
  guard.assertCurrent(); expect(guard.signal.aborted).toBe(false);
  guard.release(); guard.release(); noteResolvedOwner("b");
  expect(guard.signal.aborted).toBe(false);
  expect(guard.assertCurrent).toThrow(expect.objectContaining({ name: "AbortError" }));
});

test.each([false, true])("parent cancellation propagates (already aborted: %s)", early => {
  const parent = new AbortController(); if (early) parent.abort();
  const guard = observeLiveOwner(captureLiveOwnerCheck("a"), parent.signal);
  try {
    if (!early) parent.abort();
    expect(guard.signal.aborted).toBe(true);
    expect(guard.assertCurrent).toThrow(expect.objectContaining({ name: "AbortError" }));
  } finally { guard.release(); }
});

test.each([false, true])("scoped transport releases its subscription after settlement (failure: %s)", async fail => {
  let requestSignal: AbortSignal | undefined;
  const result = withLiveOwnerSignal(captureLiveOwnerCheck("a"), undefined, async signal => {
    requestSignal = signal;
    if (fail) throw new Error("transport_failed");
    return "received";
  });
  if (fail) await expect(result).rejects.toThrow("transport_failed");
  else await expect(result).resolves.toBe("received");
  noteResolvedOwner("b");
  expect(requestSignal?.aborted).toBe(false);
});
