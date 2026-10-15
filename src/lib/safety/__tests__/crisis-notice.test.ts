import {
  beginAccountOwnerTransition, captureAccountOwnerLease, clearAccountTransition,
  currentAccountEpoch, noteResolvedOwner,
} from "../../auth/account-epoch";
import { dismissCrisisNotice, getCrisisNotice, publishCrisisNotice, subscribeCrisisNotice } from "../crisis-notice";

function login(owner: string) {
  noteResolvedOwner(owner);
  clearAccountTransition(currentAccountEpoch());
  return captureAccountOwnerLease(owner)!;
}

beforeEach(() => {
  noteResolvedOwner(null);
  clearAccountTransition(currentAccountEpoch());
});

test("late safety result survives route disposal with no original text retained", async () => {
  const owner = login("A");
  let complete!: () => void;
  const request = new Promise<void>(resolve => { complete = resolve; });
  const delivery = request.then(() => publishCrisisNotice(owner, "KR_109"));
  const routeListener = jest.fn();
  const unsubscribe = subscribeCrisisNotice(routeListener);
  unsubscribe(); // source route is gone; app host still reads the same store
  complete();
  expect(await delivery).toBe(true);
  expect(getCrisisNotice()).toEqual({ id: expect.any(Number), hotline: "KR_109" });
  expect(routeListener).not.toHaveBeenCalled();
});

test.each(["KR_109", "KR_1388", "GLOBAL_988"] as const)("routes %s without changing its hotline", hotline => {
  expect(publishCrisisNotice(login("A"), hotline)).toBe(true);
  expect(getCrisisNotice()?.hotline).toBe(hotline);
});

test("pre-publication account change clears guidance synchronously", () => {
  const owner = login("A");
  publishCrisisNotice(owner, "KR_109");
  const seen = jest.fn(() => getCrisisNotice());
  const unsubscribe = subscribeCrisisNotice(seen);
  beginAccountOwnerTransition("B");
  expect(getCrisisNotice()).toBeNull();
  expect(seen).toHaveReturnedWith(null);
  expect(publishCrisisNotice(owner, "KR_109")).toBe(false);
  unsubscribe();
});

test.each(["B", null])("late result cannot appear for %s after leaving A", nextOwner => {
  const owner = login("A");
  noteResolvedOwner(nextOwner);
  clearAccountTransition(currentAccountEpoch());
  expect(publishCrisisNotice(owner, "KR_109")).toBe(false);
  expect(getCrisisNotice()).toBeNull();
});

test("A to B to A does not revive an old request", () => {
  const oldLease = login("A");
  login("B");
  login("A");
  expect(publishCrisisNotice(oldLease, "KR_109")).toBe(false);
  expect(getCrisisNotice()).toBeNull();
});

test("failed account transition back to A still invalidates pre-transition work", () => {
  const owner = login("A");
  beginAccountOwnerTransition("B");
  beginAccountOwnerTransition("A");
  expect(publishCrisisNotice(owner, "KR_109")).toBe(false);
  expect(publishCrisisNotice(captureAccountOwnerLease("A"), "KR_109")).toBe(true);
});

test("stale dialog close does not discard a newer notice", () => {
  const owner = login("A");
  publishCrisisNotice(owner, "KR_109");
  const first = getCrisisNotice()!;
  publishCrisisNotice(owner, "KR_1388");
  dismissCrisisNotice(first.id);
  expect(getCrisisNotice()?.hotline).toBe("KR_1388");
  dismissCrisisNotice(getCrisisNotice()!.id);
  expect(getCrisisNotice()).toBeNull();
});

test("unresolved owner cannot publish and snapshots stay stable without a change", () => {
  expect(publishCrisisNotice(null, "KR_109")).toBe(false);
  publishCrisisNotice(login("A"), "KR_109");
  const snapshot = getCrisisNotice();
  expect(getCrisisNotice()).toBe(snapshot);
  noteResolvedOwner("A");
  expect(getCrisisNotice()).toBe(snapshot);
});
