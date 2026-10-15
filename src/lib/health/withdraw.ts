// Turning the health_import consent off from the privacy screen (PIPA §37③ · §38④).
//
// The consent is given with one tap on the import screen, so withdrawing it is one tap too,
// and it deletes what the consent let in: the health_samples rows and this phone's
// automatic-read marks. Order matters:
//
// 1. Read the stored prefs strictly. A failed read must not become "everything off", because
//    the save below writes the whole prefs object.
// 2. Save health_import=false, handing that strict read to savePrivacyPrefs as the "before" so
//    the consent_changes ledger records exactly this revoke. From then on 0128 refuses new rows
//    from every device. When the save reports an error, read again: the update may have landed
//    with only the response lost. A save that timed out may still land later, so a re-read that
//    still shows the consent on is "not known", never "nothing changed".
// 3. As soon as the consent is known to be off, say so (onConsentOff). The screen's other
//    toggles save the whole prefs object, so they must start from this copy before they are
//    unlocked; the deletes below do not touch the prefs and can run on behind that.
// 4. Make sure the ledger holds the revoke. The save's own ledger write is best effort and a
//    lost response skips it entirely.
// 5. Forget the automatic-read marks, so turning it on again needs the explicit tap.
// 6. Delete metric by metric. A metric whose single delete fails (a statement timeout on a big
//    account) is deleted again a week of samples per statement, oldest first.
// 7. Judge the result by counting what is left: an RLS delete that matched nothing still
//    reports success. The number deleted is only shown when every step answered.
//
// Every request has its own deadline (healthWithdrawDeps), so one that never answers fails its
// step instead of holding the flow. A failure after step 2 is not rolled back: the consent
// stays off and the screen offers to delete the rest again; every step is safe to repeat. Age
// plays no part here: withdrawing and deleting are open to every account.
import { isAbortError } from "../async/abort";
import { isTimeoutError, withTimeout } from "../async/with-timeout";
import { invalidateDomainLevels } from "../persona/load-domain-levels";
import type { PrivacyPrefs } from "../privacy/prefs";
import {
  countHealthSamples,
  deleteHealthSamplesOfMetric,
  deleteHealthSamplesOfMetricByWeek,
  deleteRemainingHealthSamples,
} from "../supabase/health";
import { recordConsentChanges, savePrivacyPrefs } from "../supabase/privacy";
import { latestConsentChange, readPrivacyPrefsStrict } from "../supabase/privacy-strict";
import { forgetHealthAutoReadMarks } from "./auto-read";
import type { HealthMetricType } from "./HealthSource";

/** health_samples.metric_type (0049). One delete per metric keeps each statement smaller. */
export const WITHDRAW_METRICS: readonly HealthMetricType[] = ["steps", "workout", "sleep", "heart_rate"];

/** Each request gets this long. Above the 8 s statement timeout, so a slow delete fails on the server first. */
export const WITHDRAW_REQUEST_DEADLINE_MS = 20_000;

export interface HealthWithdrawDeps {
  /** Throws an abort error once the signed-in account is no longer the one that started. */
  assertCurrent: () => void;
  readPrefs: (ownerId: string) => Promise<PrivacyPrefs>;
  savePrefs: (ownerId: string, prefs: PrivacyPrefs, before: PrivacyPrefs) => Promise<void>;
  /** Called once, as soon as the consent is known to be off, with the prefs the server holds. */
  onConsentOff: (prefs: PrivacyPrefs) => void;
  /** Writes the revoke to the ledger unless its newest health_import row already is one. */
  ensureRevoke: (ownerId: string, before: PrivacyPrefs) => Promise<void>;
  disarm: (ownerId: string) => Promise<boolean>;
  deleteMetric: (ownerId: string, metric: HealthMetricType) => Promise<number>;
  deleteMetricByWeek: (ownerId: string, metric: HealthMetricType, assertCurrent: () => void) => Promise<number>;
  deleteRest: (ownerId: string) => Promise<number>;
  count: (ownerId: string) => Promise<number>;
  invalidate: (ownerId: string) => void;
}

export type HealthWithdrawOutcome =
  /** The consent is off and no rows are left. `exact` is false when a lost answer may hide part of `deleted`. */
  | { kind: "done"; deleted: number; exact: boolean; prefs: PrivacyPrefs }
  /** The consent is off but rows are left, or what is left could not be counted. */
  | { kind: "partial"; remaining: number | null; prefs: PrivacyPrefs }
  /** Nothing changed: the prefs could not be read, or the save was refused and the consent is still on. */
  | { kind: "unchanged"; prefs: PrivacyPrefs | null }
  /** The save may or may not land: it timed out or errored and the re-read could not settle it. */
  | { kind: "uncertain" }
  /** The account changed on the way. The result belongs to nobody on screen. */
  | { kind: "aborted" };

const bounded = <T>(work: PromiseLike<T>, label: string): Promise<T> => withTimeout(work, WITHDRAW_REQUEST_DEADLINE_MS, label);

export function healthWithdrawDeps(
  assertCurrent: () => void,
  onConsentOff: (prefs: PrivacyPrefs) => void = () => undefined,
): HealthWithdrawDeps {
  return {
    assertCurrent,
    readPrefs: (ownerId) => bounded(readPrivacyPrefsStrict(ownerId), "health_withdraw_read"),
    savePrefs: (ownerId, prefs, before) => bounded(savePrivacyPrefs(ownerId, prefs, { before }), "health_withdraw_save"),
    onConsentOff,
    ensureRevoke: async (ownerId, before) => {
      const latest = await bounded(latestConsentChange(ownerId, "health_import"), "health_withdraw_ledger");
      if (latest === "revoke") return;
      await bounded(recordConsentChanges(ownerId, before, { ...before, health_import: false }), "health_withdraw_ledger");
    },
    disarm: forgetHealthAutoReadMarks,
    deleteMetric: (ownerId, metric) => bounded(deleteHealthSamplesOfMetric(ownerId, metric), "health_withdraw_delete"),
    deleteMetricByWeek: (ownerId, metric, current) =>
      deleteHealthSamplesOfMetricByWeek(ownerId, metric, current, WITHDRAW_REQUEST_DEADLINE_MS),
    deleteRest: (ownerId) => bounded(deleteRemainingHealthSamples(ownerId), "health_withdraw_delete"),
    count: (ownerId) => bounded(countHealthSamples(ownerId), "health_withdraw_count"),
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
      return { kind: "unchanged", prefs: null };
    }
    deps.assertCurrent();

    let current = before;
    let changed = false;
    if (before.health_import) {
      const after: PrivacyPrefs = { ...before, health_import: false };
      try {
        await deps.savePrefs(ownerId, after, before);
        current = after;
      } catch (error) {
        if (isAbortError(error)) throw error;
        deps.assertCurrent();
        let reread: PrivacyPrefs;
        try {
          reread = await deps.readPrefs(ownerId);
        } catch (readError) {
          if (isAbortError(readError)) throw readError;
          deps.assertCurrent();
          return { kind: "uncertain" };
        }
        deps.assertCurrent();
        // A save that timed out can still land after this read; only a refused save is "unchanged".
        if (reread.health_import) return isTimeoutError(error) ? { kind: "uncertain" } : { kind: "unchanged", prefs: reread };
        current = reread;
      }
      changed = true;
      deps.assertCurrent();
    }

    deps.onConsentOff(current);
    if (changed) {
      try {
        await deps.ensureRevoke(ownerId, before);
      } catch (error) {
        if (isAbortError(error)) throw error;
        // Best effort, like the save's own ledger write: the ledger must not undo the withdrawal.
      }
      deps.assertCurrent();
    }

    await deps.disarm(ownerId);
    deps.assertCurrent();

    let deleted = 0;
    let exact = true;
    try {
      for (const metric of WITHDRAW_METRICS) {
        try {
          deleted += await deps.deleteMetric(ownerId, metric);
        } catch (error) {
          if (isAbortError(error)) throw error;
          deps.assertCurrent();
          // The failed delete may have landed with only its answer lost.
          exact = false;
          deleted += await deps.deleteMetricByWeek(ownerId, metric, deps.assertCurrent);
        }
        deps.assertCurrent();
      }
      deleted += await deps.deleteRest(ownerId);
      deps.assertCurrent();
      const remaining = await deps.count(ownerId);
      deps.assertCurrent();
      deps.invalidate(ownerId);
      return remaining === 0 ? { kind: "done", deleted, exact, prefs: current } : { kind: "partial", remaining, prefs: current };
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
      // Every row may be gone with only an answer lost: a count of 0 is a success, of unknown size.
      if (remaining === 0) return { kind: "done", deleted, exact: false, prefs: current };
      return { kind: "partial", remaining, prefs: current };
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
  | { kind: "residue"; count: number | null }
  | { kind: "off"; locked: boolean };

/**
 * What the privacy screen's health card shows. Withdrawing is never age-gated: a consent
 * that is on, rows that are left, or rows that could not be counted always get the delete
 * button. Only the "turn it on" pointer is closed to minors and accounts of unknown age.
 * `count` is "loading" until the count request answers and null when it failed.
 */
export function healthCardMode(input: {
  consent: boolean | "loading" | "error";
  count: number | null | "loading";
  minor: boolean;
}): HealthCardMode {
  if (input.consent === "loading") return { kind: "loading" };
  if (input.consent === "error") return { kind: "unknown" };
  if (input.consent) return { kind: "on", count: input.count === "loading" ? null : input.count };
  if (input.count === "loading") return { kind: "loading" };
  if (input.count === null) return { kind: "residue", count: null };
  if (input.count > 0) return { kind: "residue", count: input.count };
  return { kind: "off", locked: input.minor };
}
