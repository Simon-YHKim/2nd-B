// The splash gate has to open even when the locale chunk never answers.
//
// #1626 put the root layout behind `useI18nReady()` so a beta locale paints in
// its own language instead of flashing EN keys. The gate was opened by
//
//     ensureLocalePack(lng).catch(() => {}).then(settleInitialPack)
//
// which handles a chunk that REJECTS, and nothing else. A web chunk fetch that
// connects and then never answers neither resolves nor rejects: `.catch` never
// runs, `.then` never runs, and the app sits on `<InlineLoader />` for the rest
// of the session. Nothing else bounded it either -- `src/lib/i18n/**` had no
// setTimeout, Promise.race or AbortController anywhere.
//
// The comment on the gate said "so the root gate can never hang". That was the
// belief, not the behaviour. It is corrected where it sits, in index.ts.
//
// HOW NARROW: en/ko settle synchronously (their packs ride the entry bundle),
// so only es/pt/id can reach this path, and in practice only on web -- native
// resolves the same dynamic import from inside the bundle with no network step
// (judgement from how Metro bundles, not a measurement). The narrowness is why
// it was never reported, which is NOT evidence that it is safe: #1626 has never
// reached a user on any platform. Web live is the 2026-09-02 build and the
// Android build is 2026-09-01, both older than the change.
//
// WHY A LATE CHUNK STILL REPAINTS: opening the gate on timeout and leaving the
// user in EN would trade a rare infinite loader for a common wrong-language
// session -- any connection slower than the bound would lose its language for
// the whole session, which is worse for more people. The chunk is not
// abandoned when the gate opens, only un-awaited; when it lands, the same
// promise attaches its bundles, and this asks mounted consumers to re-render.
//
// It deliberately does NOT force that repaint with `changeLanguage()`. The
// `languageChanged` handler persists the locale as an explicit preference, and
// a DETECTED locale must never be persisted -- initI18n is explicit about that.
// So the repaint travels on its own event, added to `bindI18n` beside the
// address-variable one that exists for exactly this reason.

/** i18next event emitted when a timed-out pack attaches after the gate opened. */
export const LOCALE_PACK_ATTACHED_EVENT = "localePackAttached";

/**
 * How long the first paint may wait for a lazy locale chunk.
 *
 * The auth bootstrap uses 8s, but that timeout sits behind an already-painted
 * screen; this one holds the entire first paint, so a user stares at a bare
 * loader for its whole duration. 4s is long enough for a locale chunk on a slow
 * connection and short enough that a wedged fetch does not strand the session.
 * Overshooting is cheap here precisely because a late chunk still repaints.
 */
export const LOCALE_PACK_GATE_TIMEOUT_MS = 4000;

export interface PackGateOptions {
  /** The pack load. May resolve, reject, or never settle at all. */
  load: Promise<unknown>;
  /** Opens the gate. Called exactly once, whichever way this ends. */
  settle: () => void;
  /** Called if the pack attaches AFTER the gate was opened by timeout. */
  onLateAttach?: () => void;
  /** Override for tests. */
  timeoutMs?: number;
}

/**
 * Open the gate when the pack settles, or when `timeoutMs` elapses -- whichever
 * happens first, and unconditionally one of the two.
 *
 * Resolves once the gate is open. Never rejects: a failed pack is a fallback to
 * EN, not an error the caller can act on.
 */
export function openGateWhenSettledOrTimedOut({
  load,
  settle,
  onLateAttach,
  timeoutMs = LOCALE_PACK_GATE_TIMEOUT_MS,
}: PackGateOptions): Promise<void> {
  let opened = false;
  const open = (): void => {
    if (opened) return;
    opened = true;
    settle();
  };

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (opened) return;
      open();
      resolve();
      // Not abandoned, just un-awaited: if the chunk lands later its bundles
      // attach through this same promise, so ask consumers to repaint then.
      void Promise.resolve(load).then(
        () => onLateAttach?.(),
        () => {
          // Rejected after the gate already opened. EN is already on screen and
          // is the correct end state, so there is nothing to repaint.
        },
      );
    }, timeoutMs);

    const settleNow = (): void => {
      clearTimeout(timer);
      open();
      resolve();
    };
    // Both arms open the gate: a rejected chunk means EN, which is a real
    // answer, not a reason to keep waiting.
    void Promise.resolve(load).then(settleNow, settleNow);
  });
}
