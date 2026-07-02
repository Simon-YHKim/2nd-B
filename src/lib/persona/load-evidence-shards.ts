// Load the openable "receipt" shards behind a set of evidence citations (0060):
// turn the `record:<id>` refs that back a persona proposal / tier-tendency change
// into EvidenceShards the UI can list and tap through to /record/[id]. This lets a
// user CHECK the mirror against the original — the structural anti-Barnum / anti-
// fabrication move (research 2026-06-28: citation correctness != faithfulness, so
// "grounded in your data" framing is not self-proving; showing the receipts is).
//
// Thin supabase read + the pure mapper (toEvidenceShard); returns [] on error so a
// read failure never blocks the screen. Mirrors load-tier-shifts.ts discipline.

import { getSupabaseClient } from "../supabase/client";
import {
  recordIdsFromCitations,
  toEvidenceShard,
  type EvidenceShard,
  type RawRecordRow,
} from "./evidence";

export async function loadEvidenceShards(
  citations: readonly string[],
  locale: "en" | "ko",
): Promise<EvidenceShard[]> {
  const ids = recordIdsFromCitations(citations);
  if (ids.length === 0) return [];
  try {
    const { data } = await getSupabaseClient()
      .from("records")
      .select("id, kind, topic, created_at, tags")
      .in("id", ids);
    const rows = (data ?? []) as RawRecordRow[];
    // Preserve citation order (most-relevant first), not DB order; drop any id
    // that didn't resolve to a row (deleted record → no dangling receipt).
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is RawRecordRow => r != null)
      .map((r) => toEvidenceShard(r, locale));
  } catch {
    return [];
  }
}
