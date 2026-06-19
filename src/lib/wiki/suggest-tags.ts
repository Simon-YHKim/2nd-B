// Suggested tags for an inbox source, drawn from its cached Phase 1 extraction.
//
// Phase 1 (runPhase1) already produces a `tags` array on
// sources.frontmatter.__phase1__. The inbox triage card surfaces the ones the
// source doesn't already carry, so the user can accept them with one tap before
// promoting. No LLM call here — this is a pure read over cached output; the
// inbox screen runs Phase 1 on demand when there's no cache yet.

import { readPhase1 } from "./phase1";
import type { SourceRow } from "./types";

/**
 * Phase-1 tags the source doesn't already have, deduped (case-insensitive),
 * trimmed, and capped. Empty when there's no cached Phase 1 or nothing new.
 */
export function suggestedTags(
  source: Pick<SourceRow, "tags" | "frontmatter">,
  max = 6,
): string[] {
  const phase1 = readPhase1(source.frontmatter);
  const cached = phase1?.tags ?? [];
  if (cached.length === 0) return [];

  const have = new Set(source.tags.map((t) => t.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cached) {
    const tag = raw.trim();
    if (tag.length === 0) continue;
    const key = tag.toLowerCase();
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}
