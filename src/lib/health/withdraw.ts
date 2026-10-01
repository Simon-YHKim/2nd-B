// Turning the health_import consent off from the privacy screen (PIPA §37③ · §38④).
//
// The consent is given with one tap on the import screen, so withdrawing it is one tap too,
// and it deletes what the consent let in: the health_samples rows and this phone's
// automatic-read marks. Order matters:
//
// 1. Read the stored prefs strictly. A failed read must not become "everything off", because
//    the save below writes the whole prefs object.
// 2. Save health_import=false. From then on 0128 refuses new rows from every device, so the
//    rows deleted next cannot be refilled by a read already on its way.
// 3. Make sure the consent_changes ledger has the revoke (savePrivacyPrefs skips it when its
//    own before-read falls back to the defaults).
// 4. Forget the automatic-read marks, so turning it on again needs the explicit tap.
// 5. Delete the rows metric by metric and judge the result by counting what is left: an RLS
//    delete that matched nothing still reports success.
//
// A failure after step 2 is not rolled back. The consent stays off and the screen offers to
// delete the rest again; every step is safe to repeat. Age plays no part here: withdrawing
// and deleting are open to every account.
import { isAbortError } from "../async/abort";
import { invalidateDomainLevels } from "../persona/load-domain-levels";
import type { PrivacyPrefs } from "../privacy/prefs";
import { countHealthSamples, deleteHealthSamplesOfMetric, deleteRemainingHealthSamples } from "../supabase/health";
import { recordConsentChanges, savePrivacyPrefs } from "../supabase/privacy";
import { latestConsentChange, readPrivacyPrefsStrict } from "../supabase/privacy-strict";
import { disarmHealthAutoRead } from "./auto-read";
import type { HealthMetricType } from "./HealthSource";

/** health_samples.metric_type (0049). One delete per metric keeps each statement short. */
export const WITHDRAW_METRICS: readonly HealthMetricType[] = ["steps", "workout", "sleep", "heart_rate"];

export interface HealthWithdrawDeps {
  /** Throws an abort error once the signed-in account is no longer the one that started. */
  assertCurrent: () => void;
  readPrefs: (ownerId: string) => Promise<PrivacyPrefs>;
  savePrefs: (ownerId: string, prefs: PrivacyPrefs) => Promise<void>;
  latestRevokeOrGrant: (ownerId: string) => Promise<"grant" | "revoke" | null>;
  recordChanges: (ownerId: string, before: PrivacyPrefs, after: PrivacyPrefs) => Promise<void>;
  disarm: (ownerId: string) => Promise<boolean>;
  deleteMetric: (ownerId: string, metric: HealthMetricType) => Promise<number>;
  deleteRest: (ownerId: string) => Promise<number>;
  count: (ownerId: string) => Promise<number>;
  invalidate: (ownerId: string) => void;
}

export type HealthWithdrawOutcome =
  /** The consent is off and no rows are left. `saved` is the prefs written now, null if it was already off. */
  | { kind: "done"; deleted: number; saved: PrivacyPrefs | null }
  /** The consent could not be read or saved. Nothing changed. */
  | { kind: "unchanged" }
  /** The consent is off but rows are left, or what is left could not be counted. */
  | { kind: "partial"; remaining: number | null; saved: PrivacyPrefs | null }
  /** The account changed on the way. The result belongs to nobody on screen. */
  | { kind: "aborted" };

export function healthWithdrawDeps(assertCurrent: () => void): HealthWithdrawDeps {
  return {
    assertCurrent,
    readPrefs: readPrivacyPrefsStrict,
    savePrefs: (ownerId, prefs) => savePrivacyPrefs(ownerId, prefs),
    latestRevokeOrGrant: (ownerId) => latestConsentChange(ownerId, "health_import"),
    recordChanges: recordConsentChanges,
    disarm: disarmHealthAutoRead,
    deleteMetric: deleteHealthSamplesOfMetric,
    deleteRest: deleteRemainingHealthSamples,
    count: countHealthSamples,
    invalidate: (ownerId) => invalidateDomainLevels(ownerId),
  };
}

export async function withdrawHealthImport(ownerId: string, deps: HealthWithdrawDeps): Promise<HealthWithdrawOutcome> {
  try {
    deps.assertCurrent();
    let before: PrivacyPrefs;
    try {
      before = await deps.readPrefs(ownerId);
    } catch (error) {
      if (isAbortError(error)) throw error;
      deps.assertCurrent();
      return { kind: "unchanged" };
    }
    deps.assertCurrent();

    let saved: PrivacyPrefs | null = null;
    if (before.health_import) {
      const after: PrivacyPrefs = { ...before, health_import: false };
      try {
        await deps.savePrefs(ownerId, after);
      } catch (error) {
        if (isAbortError(error)) throw error;
        deps.assertCurrent();
        return { kind: "unchanged" };
      }
      saved = after;
      deps.assertCurrent();
      try {
        if ((await deps.latestRevokeOrGrant(ownerId)) !== "revoke") await deps.recordChanges(ownerId, before, after);
      } catch {
        // Best effort, like recordConsentChanges itself: the ledger must not undo the withdrawal.
      }
      deps.assertCurrent();
    }

    await deps.disarm(ownerId);
    deps.assertCurrent();

    try {
      let deleted = 0;
      for (const metric of WITHDRAW_METRICS) {
        deleted += await deps.deleteMetric(ownerId, metric);
        deps.assertCurrent();
      }
      deleted += await deps.deleteRest(ownerId);
      deps.assertCurrent();
      const remaining = await deps.count(ownerId);
      deps.assertCurrent();
      deps.invalidate(ownerId);
      return remaining === 0 ? { kind: "done", deleted, saved } : { kind: "partial", remaining, saved };
    } catch (error) {
      if (isAbortError(error)) throw error;
      deps.invalidate(ownerId);
      let remaining: number | null = null;
      try {
        remaining = await deps.count(ownerId);
      } catch {
        remaining = null;
      }
      deps.assertCurrent();
      return { kind: "partial", remaining, saved };
    }
  } catch (error) {
    if (isAbortError(error)) return { kind: "aborted" };
    throw error;
  }
}

export type HealthCardMode =
  | { kind: "loading" }
  | { kind: "unknown" }
  | { kind: "on"; count: number | null }
  | { kind: "residue"; count: number }
  | { kind: "off"; locked: boolean };

/**
 * What the privacy screen's health card shows. Withdrawing is never age-gated: a consent
 * that is on, or rows that are left, always get the delete button. Only the "turn it on"
 * pointer is closed to accounts that are minors or whose age is not known.
 */
export function healthCardMode(input: {
  consent: boolean | "loading" | "error";
  count: number | null;
  minor: boolean;
}): HealthCardMode {
  if (input.consent === "loading") return { kind: "loading" };
  if (input.consent === "error") return { kind: "unknown" };
  if (input.consent) return { kind: "on", count: input.count };
  if (input.count !== null && input.count > 0) return { kind: "residue", count: input.count };
  return { kind: "off", locked: input.minor };
}
