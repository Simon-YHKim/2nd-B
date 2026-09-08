// Which parts of `src/app/*.tsx` no shipped build draws.
//
// The shape is always the same:
//
//   if (isDeepSpaceUI()) return <TheShippedScreen />;
//   return <TheLegacyOne />;
//
// `UI_MODE` defaults to "deep-space" (src/lib/ui-mode.ts) and every delivery
// path sets it explicitly, so the second branch needs an operator to opt in with
// EXPO_PUBLIC_UI=legacy. Nothing ships that way, and the legacy component is
// therefore unreachable in practice.
//
// This module exists because two different guards need the same computation and
// found the same class independently:
//
//   legal citations       a legal document must not point a reader at a copy of
//                         the code no build runs (rounds 60/61/63 — three
//                         instances, each found by accident before this existed)
//   test/guard pins       a check that pins a symbol inside a dead span passes
//                         forever without guarding anything (ttl-work-b6's
//                         focus-refetch, untrusted, elevation and a11y pins)
//
// Extracted at ttl-work-b6's request so the second one can be built on the first
// rather than beside it.
import fs from "node:fs";
import path from "node:path";

/** `if (isDeepSpaceUI()) return <X />;` immediately followed by `return <Legacy />;` */
export const DELEGATION = /if \(isDeepSpaceUI\(\)\) return <\w+ \/>;\s*\r?\n\s*return <(\w+) \/>;/;

export interface DeadSpan {
  /** Repo-relative path, forward slashes. */
  file: string;
  /** The component that only renders under EXPO_PUBLIC_UI=legacy. */
  component: string;
  /** 1-based, inclusive. */
  from: number;
  to: number;
}

/**
 * Line span of a top-level `function Name(` up to its column-0 closing brace.
 *
 * Deliberately naive: this repo formats top-level declarations with the closing
 * brace in column 0, and a brace counter would have to understand strings,
 * template literals and JSX to do better. If the formatting convention ever
 * changes this returns null and the caller reports "no span" rather than a wrong
 * one — a checker that cannot see should say so, not guess.
 */
export function topLevelSpan(
  lines: readonly string[],
  name: string,
): { from: number; to: number } | null {
  const start = lines.findIndex(l => l.startsWith(`function ${name}(`));
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === "}") return { from: start + 1, to: i + 1 };
  }
  return null;
}

function tsxFiles(dir: string, root: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "__mocks__") continue;
      tsxFiles(full, root, out);
    } else if (/\.tsx$/.test(entry.name)) {
      out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return out;
}

/** Every legacy-only component span under `src/app`, with its file and name.
 *
 *  ⚠ A component is dead only when EVERY `return <Name />` for it is the
 *  delegation fallback. `audit.tsx` is why this check exists:
 *
 *      550   if (screener === "1") return <AuditLegacy />;   <-- escape hatch
 *      551   if (isDeepSpaceUI()) return <AuditDeepSpace />;
 *      552   return <AuditLegacy />;                          <-- fallback
 *
 *  Line 550 runs BEFORE the skin check, so `/audit?screener=1` reaches the
 *  legacy questionnaire in every build. Round 61 read only the delegation, called
 *  the questionnaire unreachable, and reverted a real crisis-hand-off fix on that
 *  basis. Matching one shape and stopping is how a checker ends up confidently
 *  wrong. */
export function deadRendererSpans(root: string): DeadSpan[] {
  const spans: DeadSpan[] = [];
  for (const rel of tsxFiles(path.join(root, "src", "app"), root)) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    const match = DELEGATION.exec(text);
    if (!match) continue;
    const component = match[1];
    const returns = text.match(new RegExp(`return <${component} />;`, "g")) ?? [];
    if (returns.length !== 1) continue; // reachable some other way
    const span = topLevelSpan(text.split(/\r?\n/), component);
    if (span) spans.push({ file: rel, component, ...span });
  }
  return spans;
}

/** Files under `src/app` that branch on the skin at all — the input this module
 *  claims to cover. Reported separately so a delegation shape the regex cannot
 *  parse shows up as a gap instead of silently shrinking the result. */
export function delegationCandidates(root: string): string[] {
  return tsxFiles(path.join(root, "src", "app"), root).filter(rel =>
    fs.readFileSync(path.join(root, rel), "utf8").includes("isDeepSpaceUI"),
  );
}
