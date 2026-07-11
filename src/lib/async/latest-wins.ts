// A tiny "latest wins" guard for overlapping async loads. When a component can
// fire the same fetch again before the first resolves (e.g. a refresh() called on
// every stage completion, or a userId A->B switch mid-flight), the response that
// resolves LAST would otherwise win — snapping state back to a stale value. Take a
// token before each load and drop the result if a newer load has begun since.
//
//   const guard = createLatestWins();
//   const token = guard.begin();
//   const data = await load();
//   if (guard.isStale(token)) return;   // a newer load superseded this one
//   setState(data);

export interface LatestWins {
  /** Start a load; returns a monotonically increasing token for it. */
  begin(): number;
  /** True once a later begin() has happened, i.e. this token is no longer current. */
  isStale(token: number): boolean;
}

export function createLatestWins(): LatestWins {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      return latest;
    },
    isStale(token: number) {
      return token !== latest;
    },
  };
}
