// Guards the crash class that shipped to users on 2026-07-03 (#711, `[ota]`).
//
// What happened: `components/deepspace/index.ts` had a require cycle, so ShareCard
// could evaluate BEFORE `lib/theme/m3` on some entry orders. Its module-scope
// `StyleSheet.create({ color: m3.accent.shareEyebrow })` then dereferenced
// `undefined` and `withAlpha` threw -- a live redbox on the /settings path.
//
// #969 (2026-07-12) broke that barrel cycle. As of 2026-07-14 the repo has ZERO
// runtime require cycles -- verified, and worth stating precisely because the naive
// check disagrees: `madge --circular` reports 10, but every one of them is an artifact
// of `import type` edges (e.g. persona/brightness.ts:10 `import type { TraitConfidence }
// from "./build"` paired with persona/build.ts:21 `import type { LadderLevel } from
// "./brightness"`). Type-only imports are erased at compile time, so they cannot
// produce a runtime cycle. With `skipTypeImports` the true count is 0.
//
// But the powder is still there: 35 files dereference `m3.*` at module scope inside
// StyleSheet.create. Only the spark was removed. ONE re-introduced runtime cycle
// re-arms all 35 -- and nothing in CI was stopping that. Hence this guard, and hence
// the bar is zero rather than a ratchet: zero is where we are, and getting back to
// zero after a regression lands is far more expensive than never leaving it.
//
// Static analysis is the right tool here even though a render test would also catch
// some of these: the crash is entry-order dependent, so a test only catches it if the
// test's module graph happens to reproduce the bad order. The cycle is a fact of the
// graph, not of one traversal -- so we check the graph.

import madge from "madge";

const ROOT = process.cwd();

// RATCHET: empty, and it must stay empty. If a cycle is ever genuinely unavoidable,
// add its signature here WITH a comment explaining why, and treat that as a debt.
const KNOWN_CYCLES: readonly string[] = [];

// The layers whose cycles produce the #711 crash: a component evaluating before the
// theme module it dereferences at module scope. Called out separately so the failure
// message can name the specific hazard rather than just "cycle found".
// madge returns paths relative to baseDir (the repo root), hence the `src/` prefix --
// matching on a bare "components/" silently never fires, which is exactly the kind of
// dead guard this script exists to prevent, so uiLayerSelfTest() below proves it fires.
const UI_LAYERS = ["src/components/", "src/app/", "src/screens/"];

/** A cycle is a rotation-invariant set of modules; normalize so the signature is stable. */
function signature(cycle: string[]): string {
  return [...cycle].sort().join(" > ");
}

function touchesUi(cycle: string[]): boolean {
  return cycle.some((mod) => UI_LAYERS.some((layer) => mod.startsWith(layer)));
}

/**
 * Proves the UI matcher actually fires before we trust it. A guard whose predicate
 * silently never matches is worse than no guard: it reports PASS forever. The first
 * draft of this file matched on "components/" while madge emits "src/components/", so
 * the #711 hazard message would never have printed. This makes that failure loud.
 */
function uiLayerSelfTest(): void {
  const mustMatch = ["src/components/deep-space/X.tsx", "src/app/index.tsx", "src/screens/Y.tsx"];
  const mustNotMatch = ["src/lib/persona/build.ts", "scripts/check-require-cycles.ts"];
  const bad = [
    ...mustMatch.filter((p) => !touchesUi([p])).map((p) => `should match but did not: ${p}`),
    ...mustNotMatch.filter((p) => touchesUi([p])).map((p) => `should NOT match but did: ${p}`),
  ];
  if (bad.length > 0) {
    console.error("Require-cycle guard is BROKEN (its UI-layer matcher is dead):");
    for (const b of bad) console.error(`    - ${b}`);
    console.error("\n  Fix UI_LAYERS so it matches the paths madge actually emits.");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  uiLayerSelfTest();

  const res = await madge("src", {
    baseDir: ROOT,
    fileExtensions: ["ts", "tsx"],
    tsConfig: "tsconfig.json",
    detectiveOptions: { ts: { skipTypeImports: true }, tsx: { skipTypeImports: true } },
  });

  const known = new Set(KNOWN_CYCLES);
  const offenders = res.circular().filter((c) => !known.has(signature(c)));

  if (offenders.length > 0) {
    const ui = offenders.filter(touchesUi);
    console.error(`Require-cycle guard FAIL  ${offenders.length} runtime require cycle(s)\n`);

    if (ui.length > 0) {
      console.error(
        `  ${ui.length} of them reach the UI layer (components/ app/ screens/). This is the\n` +
          `  exact shape that crashed live on 2026-07-03 (#711 [ota]): a component evaluates\n` +
          `  before lib/theme/m3, its module-scope StyleSheet m3.* deref reads undefined, and\n` +
          `  withAlpha throws a redbox. 35 files still deref m3.* at module scope, so ONE such\n` +
          `  cycle re-arms all of them.\n`,
      );
    }

    for (const c of offenders) console.error(`    - ${c.join(" > ")}`);
    console.error(
      `\n  Break the cycle. Usually one of:\n` +
        `    - import the leaf module directly instead of through a barrel (index.ts)\n` +
        `    - make the back-edge an "import type" (erased at compile time, so not a cycle)\n` +
        `    - extract the shared piece into its own module both sides can depend on (see #969)\n`,
    );
    process.exit(1);
  }

  console.log(
    `Require cycles PASS  0 runtime cycles (type-only import edges are excluded: they are\n` +
      `  erased at compile time and cannot cycle at runtime -- see the header of this file)`,
  );
}

main().catch((err) => {
  console.error("Require-cycle guard errored:", err);
  process.exit(1);
});
