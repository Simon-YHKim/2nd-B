import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { currentPrivacyChange, subscribePrivacyChanges } from "../privacy/changes";
import { fetchPrivacyPrefs } from "../supabase/privacy";
import { chatAutosaveAllowed } from "./autosave";

/** A mounted chat's consent and account fence; no backlog is retained for later grants. */
export function createChatAutosaveSession(
  ownerId: string,
  turnCount: () => number,
  onConsent: (enabled: boolean) => void,
) {
  const lease = captureAccountOwnerLease(ownerId);
  let active = true;
  let enabled = false;
  let revision = 0;
  let firstAllowedIndex = turnCount();
  const attempted = new Set<number>();
  const pending = new Set<AbortController>();
  const current = () => active && lease?.isCurrent() === true;
  const setConsent = (next: boolean) => {
    revision += 1;
    if (next && !enabled) firstAllowedIndex = turnCount();
    enabled = next;
    if (!next) for (const controller of pending) controller.abort();
    onConsent(next);
  };
  const unsubscribePrivacy = subscribePrivacyChanges((change) => {
    if (change.ownerId !== ownerId || !current()) return;
    if (typeof change.prefs.chat_autosave === "boolean") setConsent(change.prefs.chat_autosave);
  });
  const unsubscribeAccount = subscribeAccountTransition(() => {
    if (!current()) setConsent(false);
  });

  return {
    async hydrate(): Promise<void> {
      const prior = currentPrivacyChange(ownerId);
      const observed = revision;
      const prefs = await fetchPrivacyPrefs(ownerId);
      if (!current() || observed !== revision || currentPrivacyChange(ownerId) !== prior) return;
      setConsent(prior?.prefs.chat_autosave !== false && chatAutosaveAllowed(prefs.chat_autosave));
    },
    async save(index: number, keep: (signal: AbortSignal) => Promise<boolean>, firstTurnIndex = index): Promise<boolean> {
      if (!current() || !enabled || firstTurnIndex < firstAllowedIndex || attempted.has(index)) return false;
      attempted.add(index);
      const controller = new AbortController();
      pending.add(controller);
      const observed = revision;
      let saved = false;
      try {
        // Re-read immediately before starting capture; another tab/device may have withdrawn.
        const prefs = await fetchPrivacyPrefs(ownerId);
        if (!current() || controller.signal.aborted || observed !== revision || !enabled) return false;
        if (!chatAutosaveAllowed(prefs.chat_autosave)) { setConsent(false); return false; }
        saved = await keep(controller.signal);
        return saved;
      } finally {
        pending.delete(controller);
        if (!saved) attempted.delete(index);
      }
    },
    stop(): void {
      active = false;
      for (const controller of pending) controller.abort();
      unsubscribePrivacy(); unsubscribeAccount();
    },
  };
}
