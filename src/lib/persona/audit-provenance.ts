import { isTimeoutError, withTimeout } from "../async/with-timeout";
import { getSupabaseClient } from "../supabase/client";
import type { LadderLevel } from "./brightness";
import {
  parseTierKey,
  SEVEN_TIER_PREFIX,
} from "./seven-tier-history";
import { SEVEN_STARS, type SevenStarId } from "./seven-stars";

export const AUDIT_PROVENANCE_READ_TIMEOUT_MS = 8_000;

export interface AuditProvenanceRow {
  star_id: string;
  level: number;
  recorded_at: string;
  evidence_origin?: string | null;
  evidence_citations?: string[] | null;
}

export type AuditOrigin = "ratify" | "rebuild" | "recorded";

/** Keep database provenance values inside a closed, UI-safe label set. */
export function normalizeAuditOrigin(
  origin: string | null | undefined,
): AuditOrigin {
  switch (origin) {
    case "ratify":
      return "ratify";
    case "rebuild":
      return "rebuild";
    case "interview":
    case null:
    case undefined:
    default:
      return "recorded";
  }
}

/**
 * The screen-safe summary of one star. Citation identifiers intentionally do
 * not cross this boundary: the UI receives only their count.
 */
export interface AuditStarProvenance {
  starId: SevenStarId;
  level: LadderLevel;
  observations: number;
  citedObservations: number;
  citations: number;
  recordedAt: string;
  origin: AuditOrigin;
}

export type AuditProvenanceResult =
  | { kind: "ready"; entries: AuditStarProvenance[] }
  | { kind: "empty" }
  | { kind: "timeout" }
  | { kind: "error" };

interface WorkingStar {
  entry: AuditStarProvenance;
  latestMillis: number;
}

function isLadderLevel(level: number): level is LadderLevel {
  return Number.isInteger(level) && level >= 1 && level <= 5;
}

/**
 * Reduce the append-only ledger into one current, factual row per new star.
 * Old self-understanding axis ids and malformed `seven:*` values are ignored
 * through the canonical parser, never by prefix stripping alone.
 */
export function buildAuditProvenance(
  rows: readonly AuditProvenanceRow[],
): AuditStarProvenance[] {
  const byStar = new Map<SevenStarId, WorkingStar>();

  for (const row of rows) {
    const starId = parseTierKey(row.star_id);
    const recordedMillis = Date.parse(row.recorded_at);
    if (!starId || !isLadderLevel(row.level) || !Number.isFinite(recordedMillis)) {
      continue;
    }

    const citationCount = Array.isArray(row.evidence_citations)
      ? row.evidence_citations.length
      : 0;
    const citedObservation = citationCount > 0 ? 1 : 0;
    const existing = byStar.get(starId);
    if (!existing) {
      byStar.set(starId, {
        latestMillis: recordedMillis,
        entry: {
          starId,
          level: row.level,
          observations: 1,
          citedObservations: citedObservation,
          citations: citationCount,
          recordedAt: row.recorded_at,
          origin: normalizeAuditOrigin(row.evidence_origin),
        },
      });
      continue;
    }

    existing.entry.observations += 1;
    existing.entry.citedObservations += citedObservation;
    existing.entry.citations += citationCount;
    if (recordedMillis >= existing.latestMillis) {
      existing.latestMillis = recordedMillis;
      existing.entry.level = row.level;
      existing.entry.recordedAt = row.recorded_at;
      existing.entry.origin = normalizeAuditOrigin(row.evidence_origin);
    }
  }

  return SEVEN_STARS.flatMap((star) => {
    const found = byStar.get(star.id);
    return found ? [found.entry] : [];
  });
}

/** Read the current user's new-seven ledger without collapsing failures into empty. */
export async function loadAuditProvenance(
  userId: string,
  timeoutMs: number = AUDIT_PROVENANCE_READ_TIMEOUT_MS,
): Promise<AuditProvenanceResult> {
  try {
    const query = getSupabaseClient()
      .from("star_tier_history")
      .select("star_id, level, recorded_at, evidence_origin, evidence_citations")
      .eq("user_id", userId)
      .like("star_id", `${SEVEN_TIER_PREFIX}%`)
      .order("recorded_at", { ascending: true });
    const { data, error } = await withTimeout(
      query,
      timeoutMs,
      "audit provenance read",
    );
    if (error) return { kind: "error" };

    const entries = buildAuditProvenance(
      (data ?? []) as AuditProvenanceRow[],
    );
    return entries.length > 0 ? { kind: "ready", entries } : { kind: "empty" };
  } catch (error) {
    return isTimeoutError(error) ? { kind: "timeout" } : { kind: "error" };
  }
}
