// Live brightness for the seventh home star (`profile`), the layer-A sibling of
// load-domain-levels.ts.
//
// The slot this replaced (뮤지엄) was pinned at a hardcoded L4 forever: one of
// the seven stars was always lit and never moved, so it taught the user nothing.
// This reads three real signals instead, and every one of them is a count of
// something the user did — no LLM, no inference, per the brightness-honesty rule.
//
//   users.display_name / birth_date   what they told us about themselves
//   records tagged northstar_sentence  what they said they are aiming at
//   peer_invitations status=accepted   what somebody else said about them
//
// Only the third can open L5 (see profile-star.ts). That is the design: a star
// about how you are read should not max out with nobody having read you.
//
// Failure is silent and dark, never fabricated. Each read degrades independently
// so one missing table cannot blank the star or invent a level for it.
import { getSupabaseClient } from "../supabase/client";
import { type LadderLevel } from "./brightness";
import { NORTHSTAR_TAG } from "./northstar";
import { profileStarLevel } from "./profile-star";
import { countFilledDetails, resolveProfileDetails } from "./profile-details";

async function fetchProfileStarLevel(userId: string): Promise<LadderLevel> {
  const supabase = getSupabaseClient();
  const [userRes, goalRes, peerRes] = await Promise.all([
    supabase.from("users").select("display_name, birth_date, profile_details").eq("id", userId).maybeSingle(),
    // Every northstar revision is its own row (saveNorthstar appends, it never
    // overwrites), so this count is literally "how many times they have sharpened
    // the sentence" — the closest honest proxy for tending the profile.
    supabase.from("records").select("id").eq("user_id", userId).contains("tags", [NORTHSTAR_TAG]),
    // 'accepted' is what peer-respond stamps when an informant actually answers
    // (0110). Sent-but-unanswered invitations must not count: asking is not
    // being seen.
    supabase.from("peer_invitations").select("id").eq("user_id", userId).eq("status", "accepted"),
  ]);

  const user = (userRes.data ?? {}) as {
    display_name?: string | null;
    birth_date?: string | null;
    profile_details?: unknown;
  };
  const goals = ((goalRes.data ?? []) as unknown[]).length;

  return profileStarLevel({
    hasDisplayName: Boolean(user.display_name?.trim()),
    hasBirthDate: Boolean(user.birth_date),
    hasGoal: goals > 0,
    // The first northstar sentence IS the goal slot above; only the revisions
    // after it are additional coverage. Counting the same sentence twice would
    // hand a brand-new account a free tier.
    editedEntries: Math.max(0, goals - 1),
    outsideEntries: ((peerRes.data ?? []) as unknown[]).length,
    // 0132: 생활 정보에서 채운 칸. resolveProfileDetails 를 지나므로 컬럼에
    // 무엇이 들어 있든 계약에 맞는 것만 세어진다 - 아무 키나 넣어 별을
    // 밝히는 길을 막는다.
    filledDetails: countFilledDetails(resolveProfileDetails(user.profile_details)),
  });
}

// ── Per-user TTL cache + in-flight dedup ───────────────────────────────
// Same shape as loadDomainLevels: this runs on every home mount, and none of the
// three signals changes second-to-second.
const CACHE_TTL_MS = 45_000;

const cache = new Map<string, { expiresAt: number; value: LadderLevel }>();
const inflight = new Map<string, Promise<LadderLevel>>();

/** Cached, deduped read of the profile star's L1~L5. */
export function loadProfileStarLevel(userId: string): Promise<LadderLevel> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);

  const pending = inflight.get(userId);
  if (pending) return pending;

  const promise = fetchProfileStarLevel(userId).then(
    (value) => {
      if (inflight.get(userId) === promise) {
        cache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, value });
        inflight.delete(userId);
      }
      return value;
    },
    (err) => {
      if (inflight.get(userId) === promise) inflight.delete(userId);
      throw err;
    },
  );
  inflight.set(userId, promise);
  return promise;
}

/** Drop the cached level so the next read refetches (profile edit, sign-out). */
export function invalidateProfileStarLevel(userId?: string): void {
  if (userId === undefined) {
    cache.clear();
    inflight.clear();
    return;
  }
  cache.delete(userId);
  inflight.delete(userId);
}
