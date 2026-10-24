// An uncached display read. Legacy generation/history loaders keep their contract.
import { getSupabaseClient } from "../supabase/client";
import { DRILL_LAYERS, LIFE_PERIODS, emptyCoverage, type DrillLayer, type LifePeriod } from "../interview/probe";
import { levelFromCells, type SevenLevels } from "./load-seven-levels";
import { northStarBrightness, type HeadlineStarId } from "./north-star";
import { NORTHSTAR_TAG } from "./northstar";
import { profileStarLevel } from "./profile-star";
import { countFilledDetails, resolveProfileDetails } from "./profile-details";
import { SEVEN_STARS, type SevenStarId } from "./seven-stars";
import { parseTierKey } from "./seven-tier-history";
import type { LadderLevel } from "./brightness";

type ReadResult = { data: unknown; error: unknown };
function rows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data) || Array.from(data).some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("Brightness rows were not returned");
  }
  return data as Record<string, unknown>[];
}
function counts(data: unknown): number {
  const found = rows(data);
  if (found.some((row) => typeof row.id !== "string" || row.id.length === 0)) throw new Error("Brightness ids were invalid");
  return found.length;
}
function coverageFrom(data: unknown) {
  const coverage = emptyCoverage();
  for (const row of rows(data)) {
    if (typeof row.period !== "string" || !row.period || typeof row.layer !== "string" || !row.layer) {
      throw new Error("Brightness coverage identifiers were invalid");
    }
    if (!(LIFE_PERIODS as readonly unknown[]).includes(row.period) || !(DRILL_LAYERS as readonly unknown[]).includes(row.layer)) continue;
    const n = row.answers;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new Error("Brightness coverage was invalid");
    coverage[row.period as LifePeriod][row.layer as DrillLayer] = n;
  }
  return coverage;
}
function ratifiedFrom(data: unknown): Partial<Record<SevenStarId, LadderLevel>> {
  const out: Partial<Record<SevenStarId, LadderLevel>> = {};
  for (const row of rows(data)) {
    if (typeof row.star_id !== "string" || !row.star_id) throw new Error("Brightness ratified identifiers were invalid");
    const id = parseTierKey(row.star_id);
    if (!id || out[id] !== undefined) continue;
    if (typeof row.level !== "number" || !Number.isFinite(row.level)) throw new Error("Brightness ratified level was invalid");
    out[id] = Math.min(5, Math.max(1, Math.round(row.level))) as LadderLevel;
  }
  return out;
}

/** All five inputs must be confirmed before deriving brightness. No cache/fallback. */
export async function loadSevenLevelsStrict(userId: string, assertCurrent: () => void): Promise<SevenLevels> {
  if (!userId) throw new Error("Brightness owner is required");
  assertCurrent();
  const db = getSupabaseClient();
  const read = <T>(request: () => PromiseLike<ReadResult>, decode: (data: unknown) => T): Promise<T> =>
    Promise.resolve().then(() => {
      assertCurrent();
      // Invoke the thenable here: ownership is checked in the dispatch turn.
      return request().then((result) => {
        assertCurrent();
        if (result.error) throw result.error;
        return decode(result.data);
      });
    });
  const [coverage, profile, goals, peers, ratified] = await Promise.all([
    read(() => db.from("interview_coverage").select("period, layer, answers").eq("user_id", userId), coverageFrom),
    read(() => db.from("users").select("id, display_name, birth_date, profile_details").eq("id", userId).maybeSingle(), (data) => {
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Brightness profile was not returned");
      const user = data as Record<string, unknown>;
      if (user.id !== userId || !("profile_details" in user) ||
        (user.display_name !== null && typeof user.display_name !== "string") ||
        (user.birth_date !== null && typeof user.birth_date !== "string")) {
        throw new Error("Brightness profile fields were not returned");
      }
      return user;
    }),
    read(() => db.from("records").select("id").eq("user_id", userId).contains("tags", [NORTHSTAR_TAG]), counts),
    read(() => db.from("peer_invitations").select("id").eq("user_id", userId).eq("status", "accepted"), counts),
    read(() => db.from("star_tier_history").select("star_id, level, evidence_origin, recorded_at")
      .eq("user_id", userId).eq("evidence_origin", "ratify").order("recorded_at", { ascending: false }), ratifiedFrom),
  ]);
  assertCurrent();
  const levels = {} as Record<SevenStarId, LadderLevel>;
  for (const star of SEVEN_STARS) {
    levels[star.id] = star.period === null ? profileStarLevel({
      hasDisplayName: Boolean((profile.display_name as string | null)?.trim()),
      hasBirthDate: Boolean(profile.birth_date),
      hasGoal: goals > 0,
      editedEntries: Math.max(0, goals - 1),
      outsideEntries: peers,
      filledDetails: countFilledDetails(resolveProfileDetails(profile.profile_details)),
    }) : levelFromCells(DRILL_LAYERS.filter((layer) => coverage[star.period!][layer] > 0).length);
  }
  for (const [id, level] of Object.entries(ratified) as [SevenStarId, LadderLevel][]) if (level > levels[id]) levels[id] = level;
  const headline: Partial<Record<HeadlineStarId, LadderLevel>> = {};
  for (const star of SEVEN_STARS) if (star.id !== "profile") headline[star.id] = levels[star.id];
  assertCurrent();
  return { starLevels: levels, northStarBrightness: northStarBrightness(headline) };
}
