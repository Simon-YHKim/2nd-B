// /me/<star> needs a confirmed read before it can say "empty" or choose Start.
// The home loaders deliberately fail soft; keep that separate behavior intact.
import { withTimeout, isTimeoutError } from "../async/with-timeout";
import { getSupabaseClient } from "../supabase/client";
import { DRILL_LAYERS, LIFE_PERIODS, emptyCoverage, type DrillLayer, type LifePeriod } from "../interview/probe";
import { coveredDrillLayers } from "../nav/me-star-route";
import { type LadderLevel } from "./brightness";
import { levelFromCells } from "./load-seven-levels";
import { NORTHSTAR_TAG } from "./northstar";
import { countFilledDetails, resolveProfileDetails } from "./profile-details";
import { profileStarLevel } from "./profile-star";
import { SEVEN_STARS, type SevenStarId } from "./seven-stars";
import { parseTierKey } from "./seven-tier-history";
import { starEntryStatus, type StarEntryStatus } from "./star-entry-tracks";

export const STAR_SUMMARY_TIMEOUT_MS = 10_000;

export interface StarSummary {
  cells: number;
  records: number;
  covered: DrillLayer[];
  entry: StarEntryStatus;
}

type ReadResult = { data: unknown; error: unknown };
function rows(result: ReadResult): Record<string, unknown>[] {
  if (result.error) throw result.error;
  if (!Array.isArray(result.data) || result.data.some((row) => !row || typeof row !== "object")) {
    throw new Error("Star summary rows were not returned");
  }
  return result.data as Record<string, unknown>[];
}

async function readSummary(userId: string, id: SevenStarId, period: LifePeriod, age: number | null): Promise<StarSummary> {
  if (!userId) throw new Error("Star summary owner is required");
  const db = getSupabaseClient();
  // Same sources and filters as loadCoverage / loadSevenLevels / loadProfileStarLevel.
  // Every result must succeed: an unread prerequisite cannot choose the earlier star.
  const [coverageRes, countRes, userRes, goalsRes, peersRes, ratifiedRes] = await Promise.all([
    db.from("interview_coverage").select("period, layer, answers").eq("user_id", userId),
    db.from("records").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("audit_period", period),
    db.from("users").select("id, display_name, birth_date, profile_details").eq("id", userId).maybeSingle(),
    db.from("records").select("id").eq("user_id", userId).contains("tags", [NORTHSTAR_TAG]),
    db.from("peer_invitations").select("id").eq("user_id", userId).eq("status", "accepted"),
    db.from("star_tier_history").select("star_id, level, evidence_origin, recorded_at").eq("user_id", userId)
      .eq("evidence_origin", "ratify").order("recorded_at", { ascending: false }),
  ]);
  const coverage = emptyCoverage();
  for (const row of rows(coverageRes)) {
    if (!(LIFE_PERIODS as readonly unknown[]).includes(row.period) || !(DRILL_LAYERS as readonly unknown[]).includes(row.layer)) continue;
    const n = Number(row.answers);
    if (!Number.isFinite(n) || n <= 0) continue;
    coverage[row.period as LifePeriod][row.layer as DrillLayer] = n;
  }
  if (countRes.error) throw countRes.error;
  if (!Number.isSafeInteger(countRes.count) || countRes.count === null || countRes.count < 0) {
    throw new Error("Star summary count was not returned");
  }
  if (userRes.error) throw userRes.error;
  const user = userRes.data;
  if (!user || user.id !== userId) throw new Error("Star summary owner row was not returned");
  if (!("profile_details" in user) ||
    (user.display_name !== null && typeof user.display_name !== "string") ||
    (user.birth_date !== null && typeof user.birth_date !== "string")) {
    throw new Error("Star summary profile fields were not returned");
  }
  const goals = rows(goalsRes).length;
  const peers = rows(peersRes).length;
  const levels = {} as Record<SevenStarId, LadderLevel>;
  for (const star of SEVEN_STARS) {
    levels[star.id] = star.period === null
      ? profileStarLevel({
        hasDisplayName: Boolean(user.display_name?.trim()),
        hasBirthDate: Boolean(user.birth_date),
        hasGoal: goals > 0,
        editedEntries: Math.max(0, goals - 1),
        outsideEntries: peers,
        filledDetails: countFilledDetails(resolveProfileDetails(user.profile_details)),
      })
      : levelFromCells(coveredDrillLayers(coverage[star.period]).length);
  }
  const seen = new Set<SevenStarId>();
  for (const row of rows(ratifiedRes)) {
    const starId = typeof row.star_id === "string" ? parseTierKey(row.star_id) : null;
    if (!starId || seen.has(starId)) continue;
    if (typeof row.level !== "number" || !Number.isFinite(row.level)) throw new Error("Star summary level was invalid");
    seen.add(starId);
    const level = Math.min(5, Math.max(1, Math.round(row.level))) as LadderLevel;
    if (level > levels[starId]) levels[starId] = level;
  }
  const covered = coveredDrillLayers(coverage[period]);
  return { covered, cells: covered.length, records: countRes.count, entry: starEntryStatus(id, levels, age) };
}

export function loadStarSummary(userId: string, id: SevenStarId, period: LifePeriod, age: number | null): Promise<StarSummary> {
  return withTimeout(readSummary(userId, id, period, age), STAR_SUMMARY_TIMEOUT_MS, "Star summary");
}

export function starSummaryReadErrorKey(error: unknown): "common:errors.network" | "common:errors.unknown" {
  // Supabase may return fetch failures as a resolved PostgREST error with an empty code.
  const fetchFailure = error && typeof error === "object" && "code" in error && error.code === "" &&
    "message" in error && typeof error.message === "string" && /failed to fetch|fetch failed|network request failed/i.test(error.message);
  return isTimeoutError(error) || error instanceof TypeError || fetchFailure ? "common:errors.network" : "common:errors.unknown";
}
