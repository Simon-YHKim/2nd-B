// Serializes /privacy preference saves and applies the external-analytics gate
// MONOTONICALLY. Two guarantees the inline /privacy code could not make on its own:
//
//   1. Opt-out is immediate. The moment the user turns external_analytics off,
//      the analytics gate is set false synchronously, before any save resolves.
//   2. No stale OR failed completion can re-enable analytics. On a SUCCESSFUL
//      save the gate reconciles from the LATEST committed pref (never the value
//      captured when the save was queued), so an older in-flight save can't flip
//      analytics back on. A FAILED save never reconciles the gate, so a failed
//      opt-out's optimistic revert (which flips the pref back on) cannot re-enable
//      it either. Consent turns ON only via a successful opt-in or a trusted load.
//
// Saves are chained so the whole-object writes (savePrivacyPrefs replaces the
// entire privacy_prefs object) land in submission order. Extracted from
// privacy.tsx so this async ordering is unit-testable without rendering the screen.

export interface PrivacySaveSubmission {
  /** Persist the latest prefs (privacy.tsx passes a closure over prefsRef). */
  save: () => Promise<void>;
  /** True when this toggle just turned external_analytics OFF. */
  optOut: boolean;
  /** Roll back the optimistic UI on a failed save (privacy.tsx React state). */
  onError: () => void;
}

export interface PrivacySaveQueueDeps {
  /** Apply the analytics consent gate (module-level setAnalyticsConsent). */
  applyAnalyticsConsent: (on: boolean) => void;
  /** Read the LATEST committed external_analytics pref (e.g. prefsRef.current). */
  latestAnalyticsOn: () => boolean;
}

export interface PrivacySaveQueue {
  submit(submission: PrivacySaveSubmission): void;
  /** Resolves when every queued save has settled. Test/teardown helper. */
  idle(): Promise<void>;
}

export function createPrivacySaveQueue(deps: PrivacySaveQueueDeps): PrivacySaveQueue {
  let chain: Promise<void> = Promise.resolve();
  return {
    submit({ save, optOut, onError }) {
      // (1) Monotonic opt-out: apply OFF immediately so no in-flight completion
      // can re-enable analytics after the user has turned it off.
      if (optOut) deps.applyAnalyticsConsent(false);
      chain = chain
        .catch(() => {})
        .then(async () => {
          try {
            await save();
            // (2a) On SUCCESS reconcile from the LATEST committed pref, never a
            // stale captured value, so an older completion applies current state.
            deps.applyAnalyticsConsent(deps.latestAnalyticsOn());
          } catch {
            // (2b) On FAILURE never reconcile the gate: a failed opt-out's
            // optimistic revert flips the pref back on, but the immediate opt-out
            // above keeps analytics off. A failed write must not re-enable consent.
            onError();
          }
        });
    },
    idle() {
      return chain.catch(() => {});
    },
  };
}
