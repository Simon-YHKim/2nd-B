// Rising-interest detection for /trends (SCREEN_TREE_SPEC §3 트렌드).
// Pure + deterministic: given the user's own recent records (tags + created_at),
// compare each tag's frequency in the recent window vs the prior window of equal
// length and surface the ones that climbed. No LLM, no new table — it reads the
// records the user already captured. The screen turns each into a "담기 → /capture"
// suggestion (propose only; nothing is applied automatically).

import { stripSystemTags } from "../persona/domain-stars";

export interface RecordTagRow {
  tags: string[];
  created_at: string;
  /** records.kind. It is how stripSystemTags tells the app's own interview /
   *  voice / todo tags from the same words the user typed; unknown keeps them. */
  kind?: string | null;
}

export interface RisingInterest {
  /** Display tag (first-seen casing). */
  tag: string;
  /** Count in the recent window. */
  recent: number;
  /** Count in the prior window of equal length. */
  prior: number;
  /** recent - prior (always > 0 for returned rows). */
  delta: number;
}

const MAX_RESULTS = 6;

/**
 * Rank tags whose frequency rose from the prior window to the recent window.
 * Windows are [now-windowDays, now] (recent) and [now-2*windowDays, now-windowDays)
 * (prior). Tags are matched case-insensitively but reported in their first-seen
 * casing. Returns at most 6, sorted by delta desc, then recent desc, then name.
 */
export function rankRisingInterests(
  rows: RecordTagRow[],
  now: Date,
  windowDays = 7,
): RisingInterest[] {
  const span = windowDays * 24 * 60 * 60 * 1000;
  const recentStart = now.getTime() - span;
  const priorStart = now.getTime() - 2 * span;

  const recent = new Map<string, number>();
  const prior = new Map<string, number>();
  const display = new Map<string, string>();

  for (const row of rows) {
    const ts = new Date(row.created_at).getTime();
    if (Number.isNaN(ts)) continue;
    const bucket = ts >= recentStart ? recent : ts >= priorStart ? prior : null;
    if (!bucket) continue;
    // The reserved domain: tag rides on every record, and the app writes other
    // scaffolding tags too (first_light, interview, entry-ui:*). Exclude them all
    // so none can masquerade as a rising "interest" the user is told they care about.
    // The record's kind decides whether a bare "interview" or "todo" is the app's
    // marker or a topic the user chose (gate SG-01 / BL-01).
    for (const raw of stripSystemTags(row.tags ?? [], { kind: row.kind })) {
      const trimmed = (raw ?? "").trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!display.has(key)) display.set(key, trimmed);
      bucket.set(key, (bucket.get(key) ?? 0) + 1);
    }
  }

  const out: RisingInterest[] = [];
  for (const [key, recentCount] of recent) {
    const priorCount = prior.get(key) ?? 0;
    const delta = recentCount - priorCount;
    if (delta > 0) out.push({ tag: display.get(key) ?? key, recent: recentCount, prior: priorCount, delta });
  }
  out.sort((a, b) => b.delta - a.delta || b.recent - a.recent || a.tag.localeCompare(b.tag));
  return out.slice(0, MAX_RESULTS);
}
