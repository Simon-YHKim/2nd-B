// /ratifications told the user "기록이 하나도 없다" while their ratified records sat one
// filter tap away.
//
// The old empty-state condition was `visible.length === 0 && unchanged.length === 0`.
// `unchanged` is only the same-level echo rows, so when every record is a real tier change
// (the normal case) `unchanged` is 0. The 보류/거절 filters yield `visible = []` by design
// (a persisted ratification is always an acceptance). So tapping 보류 or 거절 satisfied both
// halves and rendered the "nothing at all" card -- over a full log of ratified records.
//
// ratificationEmptyState keys "nothing at all" on the honest count (`all`), and "nothing in
// THIS filter" on `visible`. That distinction is the whole fix, so it is the whole test.

import { ratificationEmptyState } from "@/lib/persona/brightness-timeline";

describe("ratificationEmptyState", () => {
  test("truly empty log → 'none'", () => {
    expect(ratificationEmptyState(0, 0)).toBe("none");
  });

  test("records exist but none in this filter → 'filtered' (the bug case)", () => {
    // 5 ratified records, filter=보류 → visible 0. Must NOT say "하나도 없다".
    expect(ratificationEmptyState(5, 0)).toBe("filtered");
  });

  test("records to show → null (render the list)", () => {
    expect(ratificationEmptyState(5, 3)).toBeNull();
    expect(ratificationEmptyState(1, 1)).toBeNull();
  });

  test("'none' is reserved for a genuinely empty log — a non-empty log is never 'none'", () => {
    for (let all = 1; all <= 20; all++) {
      for (let vis = 0; vis <= all; vis++) {
        expect(ratificationEmptyState(all, vis)).not.toBe("none");
      }
    }
  });
});

// The screen must route its empty branches through the helper, not the old compound
// condition. Source-shape check (CRLF-normalized), no RN renderer here.
describe("the screen uses the helper, not the buggy condition", () => {
  const src = require("fs")
    .readFileSync(require("path").resolve(__dirname, "../ratifications.tsx"), "utf8")
    .replace(/\r\n/g, "\n") as string;
  // Ignore comments: the header quotes the old condition to explain it.
  const code = src
    .split("\n")
    .filter((l: string) => !l.trimStart().startsWith("//"))
    .join("\n");

  test("the old `visible === 0 && unchanged === 0` empty test is gone from the render", () => {
    expect(code).not.toMatch(/visible\.length === 0 && unchanged\.length === 0/);
  });

  test("both empty branches go through ratificationEmptyState", () => {
    expect(code).toMatch(/ratificationEmptyState\(all\.length, visible\.length\) === "none"/);
    expect(code).toMatch(/ratificationEmptyState\(all\.length, visible\.length\) === "filtered"/);
  });
});
