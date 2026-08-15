// Why a server-recorded read could fail to reach the screen.
//
// Reproduced on the live build (2026-08-09, commit 46c4cbc0): a `major` notice
// with a user_notice_reads row already on the server re-opened its popup on a
// fresh profile. The PostgREST response was captured at 740ms with status 200
// and the correct notice_id, yet the popup, the home bell dot and the inbox
// unread dot all still said "unread" 20 seconds later. Those three read the
// SAME readIds, so the failure was not in the popup rule - the merged ids never
// reached any render.
//
// The store itself is fine. What follows pins the two properties of it that
// make a subscriber's revision go stale, because the hook has to compensate for
// both and a component render test cannot be written in this repo (jest here is
// node + *.test.ts; RN 0.85 + jest 29 leaves StyleSheet undefined).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getReadIds,
  getRevision,
  mergeReadIds,
  resetReadStore,
  subscribe,
} from "../read-store";

describe("read-store notification semantics", () => {
  beforeEach(() => resetReadStore());

  test("a merge that changes nothing does NOT notify", () => {
    // THE defect mechanism. Three components mount useNoticeCenter at once and
    // each fetches the read set. Whichever resolves first merges and notifies;
    // every later one merges the SAME ids, changes nothing, and so notifies
    // nobody. A component whose readRevision was captured before that first
    // notify - or which subscribed after it - is left holding an empty set with
    // no event coming to correct it. Hence the explicit re-sync in
    // src/app/notices.tsx after the merge.
    const seen: number[] = [];
    subscribe(() => seen.push(getRevision()));

    expect(mergeReadIds("user-1", ["notice-a"])).toBe(true);
    expect(seen).toHaveLength(1);

    expect(mergeReadIds("user-1", ["notice-a"])).toBe(false);
    expect(seen).toHaveLength(1);
  });

  test("the ids ARE in the store even when the second merge stays silent", () => {
    mergeReadIds("user-1", ["notice-a"]);
    mergeReadIds("user-1", ["notice-a"]);
    expect([...getReadIds("user-1")]).toEqual(["notice-a"]);
    // So re-reading getRevision() after merging is always enough to recover;
    // no extra fetch is needed.
  });

  test("revision only advances on a real change, so it is a safe staleness key", () => {
    const before = getRevision();
    mergeReadIds("user-1", ["notice-a"]);
    const afterChange = getRevision();
    mergeReadIds("user-1", ["notice-a"]);
    const afterNoop = getRevision();

    expect(afterChange).toBeGreaterThan(before);
    expect(afterNoop).toBe(afterChange);
  });

  test("ids merged for one user never leak into another", () => {
    mergeReadIds("user-1", ["notice-a"]);
    expect([...getReadIds("user-2")]).toEqual([]);
  });

  test("a late merge still lands, which is why it must not be skipped on unmount", () => {
    // The hook used to drop the merge when its effect had been cancelled. The
    // store is module-level and monotonic, so a response arriving after one
    // instance unmounted is still correct for the instances still mounted.
    mergeReadIds("user-1", ["from-unmounted-instance"]);
    expect(getReadIds("user-1").has("from-unmounted-instance")).toBe(true);
  });
});

describe("useNoticeCenter read hydration wiring", () => {
  // Source-literal assertions: the hook is a React hook and cannot be rendered
  // in this suite, but the two lines that carry the fix are cheap to pin.
  const source = readFileSync(
    join(__dirname, "..", "..", "..", "app", "notices.tsx"),
    "utf8",
  );

  const hydrationBlock =
    source.match(/Promise\.all\(\[loadPersistedReadIds[\s\S]*?\.finally\([\s\S]*?\}\);/)?.[0] ?? "";

  test("the read-hydration block was found (guards the assertions below)", () => {
    expect(hydrationBlock).not.toBe("");
    expect(hydrationBlock).toMatch(/mergeReadIds/);
  });

  test("the merge is NOT skipped when the effect was cancelled", () => {
    const beforeMerge = hydrationBlock.slice(0, hydrationBlock.indexOf("mergeReadIds"));
    expect(beforeMerge).not.toMatch(/if \(cancelled\) return;/);
  });

  test("the instance re-syncs its own revision after merging", () => {
    // Without this, a merge that changed nothing (see the store test above)
    // leaves this instance's readRevision stale and its readIds empty.
    expect(hydrationBlock).toMatch(/setReadRevision\(getRevision\(\)\)/);
  });

  test("hydration is flipped only after the merge, never before", () => {
    expect(hydrationBlock.indexOf("mergeReadIds")).toBeLessThan(
      hydrationBlock.indexOf("setReadsHydrated(true)"),
    );
  });
});
