import { createLatestWins } from "../latest-wins";

describe("createLatestWins", () => {
  test("only the most recent begin() token stays current (out-of-order resolution)", () => {
    const g = createLatestWins();
    const t1 = g.begin();
    const t2 = g.begin();
    // t2 is the latest, so an earlier load (t1) resolving last must be seen as stale
    // while the latest (t2) applies — regardless of which promise settles first.
    expect(g.isStale(t1)).toBe(true);
    expect(g.isStale(t2)).toBe(false);
  });

  test("a fresh begin() supersedes a previously-current token", () => {
    const g = createLatestWins();
    const t1 = g.begin();
    expect(g.isStale(t1)).toBe(false); // current while it is the only one
    const t2 = g.begin();
    expect(g.isStale(t1)).toBe(true); // now superseded
    expect(g.isStale(t2)).toBe(false);
  });

  test("tokens are strictly increasing and distinct", () => {
    const g = createLatestWins();
    const seen = [g.begin(), g.begin(), g.begin()];
    expect(seen).toEqual([1, 2, 3]);
  });
});
