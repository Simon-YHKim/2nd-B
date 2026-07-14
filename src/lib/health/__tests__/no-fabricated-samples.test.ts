// 정직한 밝기 is the invariant this product rests on: a star's brightness must reflect
// what the user actually put in. The health import path broke it.
//
// dds-import-inbox-screens.tsx used to do:
//
//   const samples = native && (await native.requestPermission()) === "granted"
//     ? await native.read(range)
//     : mockSamplesForRange(range);        // <-- 9,000 steps, 7h sleep, 30min workout
//   await ingestHealthSamples(userId, samples, ...);
//   setHealthDone(true);                   // <-- and it said "reflected"
//
// So a user who tapped "connect Apple Health" and then DENIED the OS permission got
// fabricated samples written as their own data, and a success message. Those rows are
// not filtered anywhere downstream: lib/persona/load-domain-levels.ts reads
// health_samples to compute the 건강 domain star's level, and lib/health/ingest.ts
// auto-completes routines from them. The star got brighter from data that never existed.
//
// The fixtures themselves are fine and useful -- for TESTS. This guard just keeps them
// out of anything a user can reach.

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..");

// The layers a user actually renders. lib/ is deliberately NOT here: the registry
// (lib/health/registry.ts) legitimately registers mockHealthSource so a developer can
// select it explicitly -- what must never happen is a SCREEN reaching for it silently.
const UI_DIRS = ["src/app", "src/screens", "src/components"];

const FABRICATORS = ["mockSamplesForRange", "mockHealthSource", "health/sources/mock"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no fabricated health samples in the UI layer", () => {
  const files = UI_DIRS.flatMap((d) => sourceFiles(join(ROOT, d)));

  test("the UI layer exists (guard is not vacuously passing)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  test("no screen, route, or component references the health mock", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // Ignore this invariant's own explanation in a comment: only flag real code by
      // requiring the symbol outside a `//` line.
      const codeLines = src
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"));
      const code = codeLines.join("\n");
      const hit = FABRICATORS.find((sym) => code.includes(sym));
      if (hit) offenders.push(`${relative(ROOT, file)} references ${hit}`);
    }
    expect(offenders).toEqual([]);
  });
});
