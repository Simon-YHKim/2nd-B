// Turning the health_import consent off from the privacy screen (PIPA §37③ · §38④).
//
// The consent is given with one tap on the import screen, so withdrawing it is one tap too,
// and it deletes what the consent let in: the health_samples rows and this phone's
// automatic-read marks. Order matters:
//
// 1. Read the stored prefs strictly. A failed read must not become "everything off", because
//    the save below writes the whole prefs object.
// 2. Save health_import=false, handing that strict read to savePrivacyPrefs as the "before" so
//    the consent_changes ledger records exactly this revoke (its own fail-soft before-read
//    would drop the revoke and log a false grant for every other consent that is on). From
//    then on 0128 refuses new rows from every device, so the rows deleted next cannot be
//    refilled by a read already on its way. When the save reports an error, read again: the
//    update may have landed with only the response lost.
// 3. Forget the automatic-read marks, so turning it on again needs the explicit tap.
// 4. Delete metric by metric. A metric whose single delete fails (a statement timeout on a big
//    account) is deleted again a week of samples per statement, oldest first.
// 5. Judge the result by counting what is left: an RLS delete that matched nothing still
//    reports success.
//
// A failure after step 2 is not rolled back. The consent stays off and the screen offers to
// delete the rest again; every step is safe to repeat. Age plays no part here: withdrawing
// and deleting are open to every account.
import { isAbortError } from "../async/abort";
import { invalidateDomainLevels } from "../persona/load-domain-levels";
import type { PrivacyPrefs } from "../privacy/prefs";
import {
  countHealthSamples,
  deleteHealthSamplesOfMetric,
  deleteHealthSamplesOfMetricByWeek,
  deleteRemainingHealthSamples,
} from "../supabase/health";
import { savePrivacyPrefs } from "../supabase/privacy";
import { readPrivacyPrefsStrict } from "../supabase/privacy-strict";
import { forgetHealthAutoReadMarks } from "./auto-read";
import type { HealthMetricType } from "./HealthSource";

/** health_samples.metric_type (0049). One delete per metric keeps each statement smaller. */
export const WITHDRAW_METRICS: readonly HealthMetricType[] = ["steps", "workout", "sleep", "heart_rate"];

export interface HealthWithdrawDeps {
  /** Throws an abort error once the signed-in account is no longer the one that started. */
  assertCurrent: () => void;
  readPrefs: (ownerId: string) => Promise<PrivacyPrefs>;
  savePrefs: (ownerId: string, prefs: PrivacyPrefs, before: PrivacyPrefs) => Promise<void>;
  disarm: (ownerId: string) => Promise<boolean>;
  deleteMetric: (ownerId: string, metric: HealthMetricType) => Promise<number>;
  deleteMetricByWeek: (ownerId: string, metric: HealthMetricType, assertCurrent: () => void) => Promise<number>;
  deleteRest: (ownerId: string) => Promise<number>;
  count: (ownerId: string) => Promise<number>;
  invalidate: (ownerId: string) => void;
}

export type HealthWithdrawOutcome =
  /** The consent is off and no rows are left. `prefs` is what the server now holds. */
  | { kind: "done"; deleted: number; prefs: PrivacyPrefs }
  /** The consent is off but rows are left, or what is left could not be counted. */
  | { kind: "partial"; remaining: number | null; prefs: PrivacyPrefs }
  /** Nothing changed: the prefs could not be read, or a re-read shows the consent still on. */
  | { kind: "unchanged"; prefs: PrivacyPrefs | null }
  /** The save reported an error and the re-read failed too: the consent may or may not be off. */
  | { kind: "uncertain" }
  /** The account changed on the way. The result belongs to nobody on screen. */
  | { kind: "aborted" };

export function healthWithdrawDeps(assertCurrent: () => void): HealthWithdrawDeps {
  return {
    assertCurrent,
    readPrefs: readPrivacyPrefsStrict,
    savePrefs: (ownerId, prefs, before) => savePrivacyPrefs(ownerId, prefs, { before }),
    disarm: forgetHealthAutoReadMarks,
    deleteMetric: deleteHealthSamplesOfMetric,
    deleteMetricByWeek: deleteHealthSamplesOfMetricByWeek,
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
      return { kind: "unchanged", prefs: null };
    }
    deps.assertCurrent();

    let current = before;
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
        if (reread.health_import) return { kind: "unchanged", prefs: reread };
        current = reread;
      }
      deps.assertCurrent();
    }

    await deps.disarm(ownerId);
    deps.assertCurrent();

    let deleted = 0;
    try {
      for (const metric of WITHDRAW_METRICS) {
        try {
          deleted += await deps.deleteMetric(ownerId, metric);
        } catch (error) {
          if (isAbortError(error)) throw error;
          deps.assertCurrent();
          deleted += await deps.deleteMetricByWeek(ownerId, metric, deps.assertCurrent);
        }
        deps.assertCurrent();
      }
      deleted += await deps.deleteRest(ownerId);
      deps.assertCurrent();
      const remaining = await deps.count(ownerId);
      deps.assertCurrent();
      deps.invalidate(ownerId);
      return remaining === 0 ? { kind: "done", deleted, prefs: current } : { kind: "partial", remaining, prefs: current };
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
      // Every row may be gone with only a response lost: a count of 0 is a success.
      if (remaining === 0) return { kind: "done", deleted, prefs: current };
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
