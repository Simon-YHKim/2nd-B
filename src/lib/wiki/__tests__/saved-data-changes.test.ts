import { prepareSavedDataDeletion, subscribeSavedDataChanges, type SavedDataChange, type SavedDataDeletionTarget } from "../saved-data-changes";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";

const cleanups: (() => void)[] = [];
function listen(ownerId = "a", listener = jest.fn<void, [SavedDataChange]>()) {
  const unsubscribe = subscribeSavedDataChanges(ownerId, listener);
  cleanups.push(unsubscribe);
  return { listener, unsubscribe };
}
function switchOwner(ownerId: string) {
  noteResolvedOwner(ownerId);
  clearAccountTransition(currentAccountEpoch());
}
const source: SavedDataDeletionTarget = { ownerId: "a", kind: "source", ids: ["s1"] };

beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("a"); });
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); });

test("publishes synchronously after acknowledgement and unsubscribes idempotently", () => {
  const { listener, unsubscribe } = listen();
  const notify = prepareSavedDataDeletion(source);
  expect(listener).not.toHaveBeenCalled();
  notify(1);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith({ ...source, basis: "affected" });
  unsubscribe(); unsubscribe(); notify(1);
  expect(listener).toHaveBeenCalledTimes(1);
});

test.each([undefined, null, 0, -1, NaN, Infinity, 0.5])("unconfirmed count %s requests a requery for IDs and all", count => {
  const { listener } = listen();
  prepareSavedDataDeletion(source)(count);
  prepareSavedDataDeletion({ ownerId: "a", kind: "wiki_page", all: true })(count);
  expect(listener.mock.calls.map(([event]) => event)).toEqual([
    { ...source, basis: "requested" },
    { ownerId: "a", kind: "wiki_page", all: true, basis: "requested" },
  ]);
});

test("short/oversized counts request a requery without claiming affected IDs", () => {
  const { listener } = listen();
  prepareSavedDataDeletion({ ...source, ids: ["s1", "s2"] })(1);
  prepareSavedDataDeletion(source)(2);
  expect(listener.mock.calls.map(([event]) => event)).toEqual([
    { ...source, ids: ["s1", "s2"], basis: "requested" },
    { ...source, basis: "requested" },
  ]);
});

test.each([[], [""], [" \t\n"], ["s1", ""], ["s1", "  "]].map(ids => ({ ids })))("blank IDs suppress the whole target $ids without widening scope", ({ ids }) => {
  const { listener } = listen();
  prepareSavedDataDeletion({ ...source, ids })(1);
  expect(listener).not.toHaveBeenCalled();
});

test.each([null, undefined, 1])("malformed ID %s is ignored without changing the caller result", id => {
  const { listener } = listen();
  const target = { ...source, ids: ["s1", id] } as SavedDataDeletionTarget;
  expect(() => prepareSavedDataDeletion(target)(1)).not.toThrow();
  expect(listener).not.toHaveBeenCalled();
});

test("copies only immutable metadata and counts distinct IDs", () => {
  const { listener } = listen(), ids = ["s1", "s1"];
  const input = { ownerId: "a", kind: "source" as const, ids, body: "never forward", title: "never forward" };
  const notify = prepareSavedDataDeletion(input);
  ids.push("s2"); input.ownerId = "b";
  notify(1);
  const event = listener.mock.calls[0][0];
  expect(event).toEqual({ ...source, basis: "affected" });
  expect(Object.isFrozen(event)).toBe(true);
  expect(Object.isFrozen(event.ids)).toBe(true);
});

test("nonblank IDs are kept literally, never trimmed into another target", () => {
  const { listener } = listen();
  prepareSavedDataDeletion({ ...source, ids: [" s1 "] })(1);
  expect(listener).toHaveBeenCalledWith({ ...source, ids: [" s1 "], basis: "affected" });
});

test.each(["source", "wiki_page"] as const)("all %s event contains only owner/kind/all/basis", kind => {
  const { listener } = listen();
  prepareSavedDataDeletion({ ownerId: "a", kind, all: true })(2);
  expect(listener).toHaveBeenCalledWith({ ownerId: "a", kind, all: true, basis: "affected" });
});

test.each([2, 0, null, undefined])("uningested scope preserves only filter metadata for count %s", count => {
  const { listener } = listen();
  const input = { ownerId: "a", kind: "source" as const, scope: "uningested" as const,
    body: "never forward", title: "never forward" };
  const notify = prepareSavedDataDeletion(input);
  input.ownerId = "b";
  expect(listener).not.toHaveBeenCalled();
  notify(count);
  expect(listener).toHaveBeenCalledTimes(1);
  const event = listener.mock.calls[0][0];
  expect(event).toEqual({ ownerId: "a", kind: "source", scope: "uningested", basis: count === 2 ? "affected" : "requested" });
  expect(Object.isFrozen(event)).toBe(true);
});

test("an acknowledged request without a row count is explicitly unconfirmed", () => {
  const { listener } = listen();
  const notify = prepareSavedDataDeletion(source);
  expect(listener).not.toHaveBeenCalled();
  notify("requested");
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith({ ...source, basis: "requested" });
});

test("a throwing listener cannot escape or stop the next listener", () => {
  listen("a", jest.fn<void, [SavedDataChange]>(() => { throw new Error("observer failed"); }));
  const { listener } = listen();
  expect(() => prepareSavedDataDeletion(source)(1)).not.toThrow();
  expect(listener).toHaveBeenCalledTimes(1);
});

test("a rejecting async listener is contained without awaiting or blocking other observers", async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_resolve, no) => { reject = no; });
  const stop = subscribeSavedDataChanges("a", async () => { await pending; });
  cleanups.push(stop);
  const { listener } = listen();
  expect(prepareSavedDataDeletion(source)(1)).toBeUndefined();
  expect(listener).toHaveBeenCalledTimes(1); // Fan-out stays synchronous while the first observer is pending.
  stop();
  reject(new Error("late observer rejection"));
  await new Promise<void>(resolve => setImmediate(resolve));
  // Jest also fails this test if the detached listener leaves an unhandled rejection.
  prepareSavedDataDeletion(source)(1);
  expect(listener).toHaveBeenCalledTimes(2);
});

test("a listener cannot alter metadata delivered to the next listener", () => {
  listen("a", jest.fn(event => { (event.ids as string[]).push("other"); }));
  const { listener } = listen();
  prepareSavedDataDeletion(source)(1);
  expect(listener).toHaveBeenCalledWith({ ...source, basis: "affected" });
});

test("drops mismatched, signed-out and held owners for both subscription and publication", () => {
  const a = listen(), b = listen("b");
  prepareSavedDataDeletion({ ...source, ownerId: "b" })(1);
  const pending = prepareSavedDataDeletion(source);
  beginAccountOwnerTransition("b");
  const held = listen();
  pending(1); prepareSavedDataDeletion(source)(1);
  noteResolvedOwner(null);
  prepareSavedDataDeletion(source)(1);
  expect(a.listener).not.toHaveBeenCalled();
  expect(b.listener).not.toHaveBeenCalled();
  expect(held.listener).not.toHaveBeenCalled();
});

test("late completion and old subscriptions cannot cross an account ABA", () => {
  const old = listen(), pending = prepareSavedDataDeletion(source);
  switchOwner("b"); switchOwner("a");
  const current = listen();
  pending(1);
  expect(current.listener).not.toHaveBeenCalled();
  prepareSavedDataDeletion(source)(1);
  expect(current.listener).toHaveBeenCalledTimes(1);
  expect(old.listener).not.toHaveBeenCalled();
});

test("an account change inside fan-out stops delivery to remaining observers", () => {
  listen("a", jest.fn<void, [SavedDataChange]>(() => { switchOwner("b"); switchOwner("a"); }));
  const { listener } = listen();
  prepareSavedDataDeletion(source)(1);
  expect(listener).not.toHaveBeenCalled();
});

test("an observer removed during fan-out is skipped", () => {
  let stop = () => {};
  listen("a", jest.fn<void, [SavedDataChange]>(() => stop()));
  const second = listen(); stop = second.unsubscribe;
  prepareSavedDataDeletion(source)(1);
  expect(second.listener).not.toHaveBeenCalled();
});

test("no listeners is a no-op", () => {
  expect(() => prepareSavedDataDeletion(source)(1)).not.toThrow();
});
