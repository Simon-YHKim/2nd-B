// Release version arithmetic: the one place in the repo that decides what a
// version string means.
//
// Why it lives here and not in src/lib/notices/version.ts: the notice gate
// (which builds may see a row) and the release policy (does this release owe
// users a popup) are different questions that happen to share one comparison.
// Two copies of a version comparator in the same feature is the bug nobody
// finds - "0.10.0" < "0.9.0" is only wrong in the copy you forgot about. So
// src/lib/notices/version.ts delegates here.
//
// Import direction is fixed: notices/ and scripts/ may import release/, never
// the reverse. This module imports nothing at all, which is what keeps
// check:cycles at zero.

/** Numeric release segments, padded to three. Prerelease and build metadata
 *  ("1.2.3-beta.1+sha") are discarded before parsing, matching the semver spec's
 *  rule that they do not participate in precedence for our purposes here.
 *  Returns null for anything that is not "1", "1.2" or "1.2.3" shaped. */
export function parseSemver(value: string): [number, number, number] | null {
  const core = value.trim().split(/[-+]/)[0] ?? "";
  if (core === "") return null;
  const parts = core.split(".");
  if (parts.length === 0 || parts.length > 3) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^[0-9]+$/.test(part)) return null;
    numbers.push(Number(part));
  }
  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0];
}

/** -1 / 0 / 1, or null when either side is unparseable. Missing segments count
 *  as 0, so "1.2" === "1.2.0". */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;
  for (let index = 0; index < 3; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l < r) return -1;
    if (l > r) return 1;
  }
  return 0;
}

/** How a release is classified, which is what decides whether it owes users a
 *  notice. See docs/RELEASE-PROCESS.md for the judgement rules behind the
 *  number itself. */
export type ReleaseClass = "major" | "minor" | "patch";

/**
 * Classify `next` relative to `previous`.
 *
 * Returns null when either version is unparseable, or when `next` is not
 * actually ahead of `previous`. A caller that gets null has no release to
 * announce, which is a different situation from a release that is deliberately
 * silent - the script reports the two differently.
 */
export function classifyRelease(previous: string, next: string): ReleaseClass | null {
  const from = parseSemver(previous);
  const to = parseSemver(next);
  if (!from || !to) return null;
  if (compareSemver(next, previous) !== 1) return null;
  if (to[0] !== from[0]) return "major";
  if (to[1] !== from[1]) return "minor";
  return "patch";
}

/**
 * Does this release class require a popup notice?
 *
 * Only `major` does. This is the whole policy in one line, and it is
 * deliberately strict semver rather than a heuristic: docs/RELEASE-PROCESS.md
 * makes the human decide the NUMBER ("does this change how the app is used?"),
 * and the number then mechanically decides the notice. A rule that tried to
 * infer intent from a diff would be arguable at exactly the moment it matters.
 *
 * Consequence worth knowing before 1.0.0: on a 0.y.z line the major segment
 * never moves, so nothing auto-classifies as major. That is not an oversight -
 * see the "0.x" section of docs/RELEASE-PROCESS.md, which requires either a
 * 1.0.0 cut or an explicit --force-major with a written reason.
 */
export function noticeRequired(release: ReleaseClass | null): boolean {
  return release === "major";
}
