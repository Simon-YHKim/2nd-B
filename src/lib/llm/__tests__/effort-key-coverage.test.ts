// Which effort rungs can actually be REACHED on each vendor, and therefore
// which OPENAI_API_KEY__<EFFORT> / ANTHROPIC_API_KEY__<EFFORT> keys have to
// exist. REQ-260823-03 §4, the half that does not need an API probe.
//
// ── WHY THIS IS A TEST AND NOT A NOTE ────────────────────────────────────────
//
// Key resolution (D-27) tries, in order:
//   1. {PREFIX}_API_KEY__{MODELSLUG}__{EFFORT}   combo
//   2. {PREFIX}_API_KEY__{EFFORT}                effort tier
//   3. {PREFIX}_API_KEY                          base
//
// Step 3 always succeeds. So raising a purpose ceiling to a rung nobody
// provisioned a key for does not fail - the call works and its spend quietly
// reattributes to the base key. The axis the whole D-27 scheme exists to
// measure goes blank for that traffic, and nothing anywhere says so. That is
// the failure this file converts into a build error.
//
// The reachable set is computed from the proxy ceilings rather than from the
// client's PHASE2_EFFORT, because the ceiling is what actually decides: a
// client can ask for max on every call and a ceiling of 'high' makes that a
// 'high' call, with a 'high' key.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

/** Every effort a call can end up clamped to on this proxy. */
function reachableEfforts(rel: string): string[] {
  const src = read(rel);
  const block = src.match(/const PURPOSE_EFFORT_MAX: Record<string, string> = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error(`${rel}: PURPOSE_EFFORT_MAX 을 못 찾았다`);
  const values = new Set<string>();
  for (const m of block[1].matchAll(/^\s*[a-z_]+: '([^']+)'/gm)) values.add(m[1]);
  // The ceiling an UNSEATED purpose gets. Reachable too - claude-proxy has no
  // allowlist, so unseated purposes are served rather than refused.
  const dflt =
    src.match(/DEFAULT_EFFORT_CEILING = '(\w+)'/) ?? src.match(/PURPOSE_EFFORT_MAX\[purpose\] \?\? '(\w+)'/);
  if (dflt) values.add(dflt[1]);
  return [...values].sort();
}

// The provisioned key sets, as of 2026-08-23. Changing a ceiling without
// changing this list is exactly the silent reattribution described above, so
// the list lives next to the assertion that uses it.
//
//   OpenAI     base + __NONE __LOW __MEDIUM __HIGH   (console, 2026-08-23)
//   Anthropic  base + __MAX                          (deliberate two-key design:
//                                                     everything else attributes
//                                                     to base, which is the
//                                                     decision Simon made when
//                                                     Anthropic became opus-only)
//   xAI        base only                             (no effort keys issued yet)
const PROVISIONED = {
  openai: ["high", "low", "medium", "none"],
  anthropic: ["max"],
  xai: [] as string[],
} as const;

describe("openai: the provisioned keys cover every reachable rung", () => {
  const reachable = reachableEfforts("supabase/functions/openai-proxy/index.ts");

  test("the reachable set is exactly what the console provisioned", () => {
    // If this fails after a ceiling change, the fix is one of two things and
    // the choice is deliberate: provision OPENAI_API_KEY__<NEW> and add it
    // here, or put the ceiling back. Do not just widen the list - that is the
    // silent-reattribution outcome written down as if it were intended.
    expect(reachable).toEqual([...PROVISIONED.openai].sort());
  });

  test("nothing on OpenAI can clamp above high", () => {
    // Which is why __XHIGH and __MAX were not needed and are not missing.
    expect(reachable).not.toContain("xhigh");
    expect(reachable).not.toContain("max");
  });
});

describe("anthropic: two keys by design, and the rest attribute to base", () => {
  const reachable = reachableEfforts("supabase/functions/claude-proxy/index.ts");

  test("max is reachable, which is what ANTHROPIC_API_KEY__MAX is for", () => {
    expect(reachable).toContain("max");
  });

  test("the rungs below max have no key of their own, deliberately", () => {
    // Recorded rather than fixed. Anthropic is opus-only and low-frequency
    // now, so a per-rung breakdown buys little; the split that matters is
    // "max versus everything else", and that is exactly the two keys issued.
    const unkeyed = reachable.filter((e) => !(PROVISIONED.anthropic as readonly string[]).includes(e));
    expect(unkeyed).toEqual(["high", "low", "medium", "xhigh"]);
  });
});

describe("xai: everything attributes to the base key", () => {
  test("no effort key is provisioned, and none is reachable that would need one", () => {
    const reachable = reachableEfforts("supabase/functions/xai-proxy/index.ts");
    expect(PROVISIONED.xai).toEqual([]);
    // Nothing routes to xai by default, so this is a statement about what an
    // operator would be signing up for rather than about live traffic.
    expect(reachable).toEqual(["high", "low", "medium"]);
  });
});

describe("the fallback that makes a missing key invisible", () => {
  test("pickApiKey falls through to the base key rather than failing", () => {
    // The reason all of the above is a test. If a missing effort key threw,
    // this file would be unnecessary.
    const src = read("supabase/functions/_shared/axis-key-name.ts");
    expect(src).toMatch(/usedCombo: false/);
    expect(src).toContain("baseKey");
  });

  test("and the proxies log when they fall back", () => {
    // Not silent at runtime - but a warning in an edge log is not something
    // anyone reads on a schedule, which is why the coverage is pinned here too.
    for (const rel of ["supabase/functions/openai-proxy/index.ts", "supabase/functions/claude-proxy/index.ts"]) {
      expect(read(rel)).toMatch(/combo key .* absent/);
    }
  });
});
