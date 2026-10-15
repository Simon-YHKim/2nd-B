import { beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner, __resetAccountEpochForTests } from "../../auth/account-epoch";
import { boundedScroll, readViewMemory, writeViewMemory } from "../view-memory";

beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("qa-a"); });

test("different navigation entries keep independent positions and survive a remount", () => {
  writeViewMemory("scroll:phone:/ops:0", { x: 0, y: 640 });
  writeViewMemory("scroll:phone:/reading:0", { x: 0, y: 220 });
  expect(readViewMemory("scroll:phone:/ops:0")).toEqual({ x: 0, y: 640 });
  expect(readViewMemory("scroll:phone:/reading:0")).toEqual({ x: 0, y: 220 });
});

test("the pre-publication account boundary removes old navigation before another owner sees it", () => {
  writeViewMemory("phone", { screenStack: ["/ledger"] });
  beginAccountOwnerTransition("qa-b");
  expect(readViewMemory("phone")).toBeUndefined();
  noteResolvedOwner("qa-b"); clearAccountTransition(currentAccountEpoch());
  expect(readViewMemory("phone")).toBeUndefined();
});

test("shorter content clamps its scroll rather than opening a blank area", () => {
  expect(boundedScroll({ x: 0, y: 640 }, 320, 700, 320, 500)).toEqual({ x: 0, y: 200 });
  expect(boundedScroll({ x: 0, y: 640 }, 320, 200, 320, 500)).toEqual({ x: 0, y: 0 });
});
