// The ops screens told users their writes had succeeded by saying nothing at all.
//
//   try {
//     await createMilestone(userId, domain, { title: "새 목표" });
//     ms.reload();
//   } catch {
//     /* surfaced on reload */
//   }
//
// The comment is false, and provably so: `ms.reload()` sits INSIDE the try, after the
// await. When the write throws, reload is never reached, so nothing is "surfaced on
// reload" or anywhere else. The user taps "+", no row appears, and the app is silent.
// Five writes behaved this way (add milestone, advance milestone, add ledger entry, add
// to reading shelf, add meal), across four screens.
//
// Two guards:
//   1. ops/screens.tsx must have ZERO empty catches. It is fixed; keep it fixed.
//   2. The "surfaced on reload" claim is banned repo-wide. If a catch really does surface
//      something elsewhere, the code has to show where -- a comment is not a mechanism.
//   3. A ratchet on the rest, so the count cannot grow while we work through them.

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** `} catch {` (or `catch (e) {`) whose body is empty or only comments. */
const EMPTY_CATCH = /\} catch(?: \([^)]*\))? \{\n((?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/\n|\s*\n)*)\s*\}/g;

/** Normalize CRLF: the repo checks out with CRLF on Windows, and a scanner that
 *  silently matches nothing still reports PASS -- which is worse than no scanner. */
const read = (f: string): string => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

function emptyCatches(file: string): number {
  return [...read(file).matchAll(EMPTY_CATCH)].length;
}

const UI_FILES = [...sources(join(ROOT, "src/app")), ...sources(join(ROOT, "src/screens"))];

describe("no silent save failures in the ops screens", () => {
  test("the scanner is actually reading files (not vacuously passing)", () => {
    expect(UI_FILES.length).toBeGreaterThan(50);
    expect(read(UI_FILES[0]!).length).toBeGreaterThan(0);
  });

  test("ops/screens.tsx has zero empty catches", () => {
    const f = join(ROOT, "src/screens/deepspace/ops/screens.tsx");
    expect(emptyCatches(f)).toBe(0);
  });

  test("each screen that can fail a write surfaces it", () => {
    const src = read(join(ROOT, "src/screens/deepspace/ops/screens.tsx"));
    // Four screens own a write: Reading, Milestones, Ledger, Meals.
    expect(src.match(/const \[saveErr, setSaveErr\] = useState\(false\);/g)?.length).toBe(4);
    // Five writes can fail.
    expect(src.match(/setSaveErr\(true\);/g)?.length).toBe(5);
    // And the banner is actually rendered, not just stored in state.
    expect(src.match(/<SaveErrorBanner text=\{c\.saveFailed\} \/>/g)?.length).toBe(4);
  });
});

describe('the "surfaced on reload" claim is banned', () => {
  // Scan catch BODIES, not whole files: the fix's own comments quote the old claim in
  // order to explain why it was false, and a file-wide grep would flag the explanation
  // along with the thing it explains. (It did, on the first run.)
  const CATCH_BODY = /\} catch(?: \([^)]*\))? \{([\s\S]*?)\n\s*\}/g;

  test("no catch claims an error is surfaced somewhere it is not", () => {
    const liars: string[] = [];
    for (const f of UI_FILES) {
      for (const [, body] of read(f).matchAll(CATCH_BODY)) {
        if (/surfaced (?:on|by) reload/i.test(body ?? "")) liars.push(relative(ROOT, f));
      }
    }
    // reload() lived inside the try in every instance, so it never ran on the failure
    // path. If a catch genuinely defers to another mechanism, point at the mechanism --
    // a comment is not a mechanism.
    expect(liars).toEqual([]);
  });
});

describe("empty-catch ratchet for the rest of the UI", () => {
  // 18 remain across src/app and src/screens as of 2026-07-14. They are NOT audited --
  // some are legitimate fire-and-forget (analytics, _layout boot paths) and some are
  // probably the same bug as the ops ones. This number may only go DOWN. When you fix a
  // batch, lower it; the failure message tells you the new count.
  const BUDGET = 18;

  test(`no more than ${BUDGET} empty catches in src/app + src/screens`, () => {
    const counts = UI_FILES.map((f) => [relative(ROOT, f), emptyCatches(f)] as const).filter(
      ([, n]) => n > 0,
    );
    const total = counts.reduce((sum, [, n]) => sum + n, 0);
    if (total > BUDGET) {
      throw new Error(
        `Empty catches grew to ${total} (budget ${BUDGET}). A catch that says nothing tells the user their action worked.\n` +
          counts.map(([f, n]) => `  ${n}x ${f}`).join("\n"),
      );
    }
    expect(total).toBeLessThanOrEqual(BUDGET);
  });
});
