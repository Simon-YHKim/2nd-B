// C10 (task B1): read & write users.privacy_prefs for the settings toggle.
//
// fetchPrivacyPrefs is fail-soft: the settings screen must still render before
// the 0032 migration is applied to a given environment (the privacy_prefs
// column may not exist yet), so any read error resolves to the privacy-by-
// design defaults (everything OFF). savePrivacyPrefs throws so the screen can
// revert an optimistic toggle and surface the failure.

import { getSupabaseClient } from "./client";
import { recordHealthImportConsent } from "./consent";
import { resolvePrivacyPrefs, PRIVACY_PREF_KEYS, type PrivacyPrefs } from "../privacy/prefs";
import { publishPrivacyPrefsIntent, publishPrivacyPrefsSaved, publishPrivacyPrefsSaveFailed } from "../privacy/pref-changes";

export async function fetchPrivacyPrefs(userId: string): Promise<PrivacyPrefs> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("users")
      .select("privacy_prefs")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    const stored = (data?.privacy_prefs as Record<string, unknown> | null | undefined) ?? null;
    return resolvePrivacyPrefs(stored);
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[privacy] prefs load failed; using defaults", (e as Error).message);
    }
    return resolvePrivacyPrefs(null);
  }
}

/** A switch-drawing read: `ok: false` means the prefs could not be read, not that they are off. */
export type PrivacyPrefsRead = { ok: true; prefs: PrivacyPrefs } | { ok: false };

/**
 * r3as F-04: the read a settings switch is drawn from. fetchPrivacyPrefs above resolves
 * every failure to all-off defaults - the right posture for a gate (cannot read -> do not
 * act) and the wrong one for a switch: the settings screen would show OFF to a user whose
 * saved value is ON, and a tap would then save ON instead of withdrawing. This keeps
 * "could not read" apart so the caller can draw no value and offer a retry instead.
 */
export async function readPrivacyPrefs(userId: string): Promise<PrivacyPrefsRead> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("users")
      .select("privacy_prefs")
      .eq("id", userId)
      .maybeSingle();
    if (error) return prefsReadFailed("query_error");
    const stored = (data?.privacy_prefs as Record<string, unknown> | null | undefined) ?? null;
    return { ok: true, prefs: resolvePrivacyPrefs(stored) };
  } catch {
    return prefsReadFailed("request_failed");
  }
}

/**
 * r3as2 R3AS2-04: the chat screen runs readPrivacyPrefs right before every automatic save, so
 * this line is written to the device log on a hot path. A remote error message is not ours to
 * copy there - an SDK or a proxy can put request detail in it - so only a fixed category is.
 */
function prefsReadFailed(category: "query_error" | "request_failed"): PrivacyPrefsRead {
  if (typeof console !== "undefined") {
    console.warn("[privacy] prefs read failed; no value is shown as saved", category);
  }
  return { ok: false };
}

export interface SavePrivacyPrefsOptions {
  /** Stamped onto the consent_records row when a sensitive-data pref is granted. */
  locale?: "en" | "ko";
}

/**
 * PR #1814 redesign C2: a save's round trips, up to its commit. If they throw, nobody can tell
 * whether the write landed, so `failed` runs before the rethrow - a listener that took the
 * intent (the chat autosave consent store takes a withdrawal at once) must not keep it as saved.
 */
async function untilCommitted<T>(failed: () => void, roundTrips: () => Promise<T>): Promise<T> {
  try {
    return await roundTrips();
  } catch (e) {
    failed();
    throw e;
  }
}

export async function savePrivacyPrefs(
  userId: string,
  prefs: PrivacyPrefs,
  options: SavePrivacyPrefsOptions = {},
): Promise<void> {
  const supabase = getSupabaseClient();
  // PR #1814 redesign C2: announce before the first round trip, so a withdrawal this whole object
  // carries (chat_autosave false) is taken before either request leaves (see pref-changes.ts).
  const intent = publishPrivacyPrefsIntent(userId, prefs);
  const before = await untilCommitted(
    () => publishPrivacyPrefsSaveFailed(intent),
    async () => {
      // D-3: snapshot the before-state so we can append a consent-change row per
      // toggled key after the write. fetchPrivacyPrefs is fail-soft (never throws),
      // so this can't block the save; a read miss resolves to all-off defaults.
      const snapshot = await fetchPrivacyPrefs(userId);
      const { error } = await supabase.from("users").update({ privacy_prefs: prefs }).eq("id", userId);
      if (error) throw error;
      return snapshot;
    },
  );
  // r3as H1: tell still-mounted screens what was just written (the chat screen stays in
  // the Stack behind /privacy), before the best-effort ledger append below.
  publishPrivacyPrefsSaved(userId, prefs, intent);
  // Append only AFTER a successful write (a failed save recorded no consent
  // change). Best-effort and never rethrows, so the change ledger can't break
  // the settings save.
  await recordConsentChanges(userId, before, prefs);
  // H9: health/activity data is PIPA §23 민감정보, and the privacy policy says we
  // process it "별도 동의를 받아" — under a SEPARATE consent. That consent row was
  // only ever written by the import screen's opt-in flow; the /privacy toggle
  // (health_import is in VISIBLE_PRIVACY_KEYS) wrote a consent_changes 'grant'
  // and nothing else. So a user could turn sensitive-data processing on from
  // settings and leave no record of the separate consent the policy promises.
  //
  // Writing it HERE rather than in the two settings screens means every current
  // and future path through the single save choke point is covered. It is
  // idempotent in practice: the ledger is append-only and this fires only on the
  // false -> true edge, not on every save.
  if (before.health_import === false && prefs.health_import === true) {
    // Age band is not read from the client: minors cannot reach this edge at all.
    // health_import is seeded false and clamped for minors server-side (0050) and
    // is absent from MINOR_PROMOTABLE_KEYS, and 0128 now rejects their rows at the
    // database. Reaching a health_import grant means an adult account.
    await recordHealthImportConsent({
      userId,
      ageBand: "adult",
      minorTier: "adult",
      locale: options.locale ?? "en",
    });
  }
}

/**
 * r3as F-01: save ONE key over the prefs stored right now, not over the caller's copy.
 *
 * savePrivacyPrefs writes whatever whole object it is handed. A settings screen hands it
 * the object it loaded, so a later save wrote that stale object back over a withdrawal
 * made from another device or tab and brought it back to life - and because `before` is
 * read fresh, the ledger diff even logged a grant nobody gave. Here the caller names the
 * key and the value; what is written is the latest stored prefs with only that key
 * changed, so the ledger diff can only ever contain that key.
 *
 * What this does NOT close: a withdrawal that lands between this read and this write is
 * still overwritten. Closing that needs an owner-bound RPC that changes the key
 * atomically on the server (PR #1814 server follow-up). This narrows the window from
 * "since the screen loaded" to one round trip.
 *
 * A failed read throws instead of falling back to defaults: merging one key into all-off
 * defaults would be a save that quietly turns every other key off. Keys this build does
 * not know are kept as stored.
 */
export async function savePrivacyPref(
  userId: string,
  key: keyof PrivacyPrefs,
  value: boolean,
  options: SavePrivacyPrefsOptions = {},
): Promise<PrivacyPrefs> {
  const supabase = getSupabaseClient();
  const change: Partial<PrivacyPrefs> = {};
  change[key] = value;
  // PR #1814 redesign C2: as in savePrivacyPrefs, the intent goes out before the read below.
  const intent = publishPrivacyPrefsIntent(userId, change);
  const { before, written } = await untilCommitted(
    () => publishPrivacyPrefsSaveFailed(intent),
    async () => {
      const { data, error: readError } = await supabase
        .from("users")
        .select("privacy_prefs")
        .eq("id", userId)
        .maybeSingle();
      if (readError) throw readError;
      const raw: unknown = data?.privacy_prefs;
      const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const next = { ...stored, [key]: value };
      const { error } = await supabase.from("users").update({ privacy_prefs: next }).eq("id", userId);
      if (error) throw error;
      return { before: resolvePrivacyPrefs(stored), written: next };
    },
  );
  const after = resolvePrivacyPrefs(written);
  publishPrivacyPrefsSaved(userId, after, intent); // r3as H1, as in savePrivacyPrefs
  // Same ledger rows and sensitive-data record as savePrivacyPrefs, on the same edges.
  await recordConsentChanges(userId, before, after);
  if (key === "health_import" && before.health_import === false && after.health_import === true) {
    // As in savePrivacyPrefs: minors cannot reach this edge (server clamp 0050, not in
    // MINOR_PROMOTABLE_KEYS, 0128 rejects their rows), so the record is an adult one.
    await recordHealthImportConsent({
      userId,
      ageBand: "adult",
      minorTier: "adult",
      locale: options.locale ?? "en",
    });
  }
  return after;
}

/**
 * D-3: append the optional-consent transitions from a privacy-prefs save to the
 * append-only consent_changes ledger (migration 0062) — one row per changed key,
 * event_type 'grant' (false -> true) or 'revoke' (true -> false). This closes
 * the PIPA §37 (동의 철회) / GDPR Art.7(3) withdrawal-record gap: consent_records
 * only logs GRANTs at sign-up, so turning a pref OFF previously left no trace.
 *
 * Best-effort: a lost row is an accountability gap (surfaced at error level for
 * monitoring, mirroring recordConsentBestEffort) but must never break the
 * settings save, so every failure is caught here and not rethrown. Request
 * metadata (ip/ua) is intentionally omitted client-side — data minimization; the
 * columns stay NULL, matching the consent_records nullable contract.
 */
export async function recordConsentChanges(
  userId: string,
  before: PrivacyPrefs,
  after: PrivacyPrefs,
): Promise<void> {
  const rows = PRIVACY_PREF_KEYS.filter((key) => before[key] !== after[key]).map((key) => ({
    user_id: userId,
    pref_key: key,
    event_type: after[key] ? ("grant" as const) : ("revoke" as const),
  }));
  if (rows.length === 0) return;
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("consent_changes").insert(rows);
    if (error) throw error;
  } catch (e) {
    if (typeof console !== "undefined") {
      console.error("[consent] change-ledger append failed", (e as Error).message);
    }
  }
}
