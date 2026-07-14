// The loader contract, enforced.
//
//   throws  -> we could not read. Say so.
//   null    -> we read fine, there is genuinely no result yet.
//
// All seven loadLatest* used to collapse the first two:
//
//   if (error || !data || data.length === 0) return null;
//
// supabase-js does not throw on a query error -- it RESOLVES with { error } -- so an
// offline user who HAD completed an assessment was told they had not taken it, their
// star stayed dark, and values.tsx / strengths.tsx handed them the survey again. The app
// quietly erased their work whenever the network hiccuped.
//
// That is the 정직한 밝기 invariant inverted. The sky is supposed to reflect what the user
// actually put in; here it reported LESS than they put in, because we could not look.
//
// And the honest branch was already written everywhere -- attachment.tsx:335 and
// big-five.tsx both carry `.catch(() => setHasError(true))` that could never fire.
// Splitting the condition is what makes those live.

import {
  loadLatestAttachment,
  loadLatestBfi,
  loadLatestIpip,
  loadLatestMotivation,
  loadLatestStrengths,
  loadLatestValues,
  loadMemorizedHistogram,
} from "../build";

type QueryResult = { data: unknown; error: unknown };

/** Chainable stub for the supabase query builder, resolving to `result`. */
function client(result: QueryResult): { from: () => unknown } {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "contains", "order", "limit", "gte", "in"]) {
    chain[m] = jest.fn(() => chain);
  }
  // Awaiting the builder resolves it (supabase-js is thenable).
  chain.then = (res: (v: QueryResult) => unknown) => Promise.resolve(result).then(res);
  return { from: jest.fn(() => chain) };
}

const READ_FAILED = { data: null, error: { message: "network error", code: "PGRST000" } };
const READ_EMPTY = { data: [], error: null };

// loadMemorizedHistogram has a different shape (returns a record, not a row), so it is
// exercised separately below.
const ROW_LOADERS = [
  ["loadLatestAttachment", loadLatestAttachment],
  ["loadLatestBfi", loadLatestBfi],
  ["loadLatestIpip", loadLatestIpip],
  ["loadLatestMotivation", loadLatestMotivation],
  ["loadLatestStrengths", loadLatestStrengths],
  ["loadLatestValues", loadLatestValues],
] as const;

describe("loader contract: a failed read is not 'no result'", () => {
  test.each(ROW_LOADERS)("%s REJECTS on a query error", async (_name, loader) => {
    const c = client(READ_FAILED) as never;
    await expect(loader(c, "u1")).rejects.toMatchObject({ message: "network error" });
  });

  test.each(ROW_LOADERS)("%s returns null on a genuinely empty read", async (_name, loader) => {
    const c = client(READ_EMPTY) as never;
    await expect(loader(c, "u1")).resolves.toBeNull();
  });

  test("loadMemorizedHistogram rejects on a query error too", async () => {
    const c = client(READ_FAILED) as never;
    await expect(loadMemorizedHistogram(c, "u1")).rejects.toMatchObject({ message: "network error" });
  });
});

// The screens are the other half. There is no RN renderer in this jest setup
// (testEnvironment: node), so assert the source shape -- normalizing CRLF first, since
// the repo checks out with CRLF on Windows and a guard that reads the wrong text still
// reports PASS.
describe("the instrument screens tell a failed read apart from an empty one", () => {
  const read = (rel: string): string =>
    (require("fs").readFileSync(require("path").resolve(__dirname, "../../../", rel), "utf8") as string).replace(
      /\r\n/g,
      "\n",
    );

  test.each(["app/values.tsx", "app/strengths.tsx"])("%s no longer calls a read failure 'no result yet'", (rel) => {
    const src = read(rel);
    expect(src).not.toContain('A load failure is treated as "no result yet"');
    expect(src).toMatch(/setHasError\(true\);/);
    expect(src).toMatch(/if \(hasError\) \{/);
    expect(src).toMatch(/ds\.axisCheck\.loadError/);
    expect(src).toMatch(/ds\.axisCheck\.retry/);
  });

  test.each(["app/attachment.tsx", "app/big-five.tsx"])("%s already had the honest branch; it can now fire", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/setHasError\(true\)/);
  });

  test("build.ts no longer folds a query error into null", () => {
    // Strip comments first: the file's header quotes the OLD condition verbatim to
    // explain the bug, and matching that would fail the test on its own documentation.
    const code = read("lib/persona/build.ts")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/if \(error \|\| !data/);
    // Seven loadLatest* loaders plus loadMemorizedHistogram, each guarding separately.
    expect(code.match(/if \(error\) throw error;/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });
});
