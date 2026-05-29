// SecondB presence state — pure derivation of what the home-screen mascot
// and bottom-right FAB should show, given how long the user has been idle
// and whether there's anything worth nudging about. Phase-E "SecondB FAB
// notification/chat_ready 트리거 + sleep-on-idle".
//
// Keeping this pure means the (untestable, visual) wiring in index.tsx can
// stay a thin shell over a single tested rule set.

export type SecondBFabState = "default" | "notification" | "chat_ready";
export type MascotRest = "idle" | "sleep";

export interface PresenceInput {
  /** ms since the last user interaction on the home screen. */
  idleMs: number;
  /** The mascot dozes off after this long with no interaction. */
  sleepAfterMs: number;
  /** SecondB has finished prepping a reply / context and invites a chat. */
  chatReady?: boolean;
  /** There's something new the user hasn't looked at (e.g. unseen center). */
  hasNotification?: boolean;
}

export interface Presence {
  fab: SecondBFabState;
  mascot: MascotRest;
}

/**
 * Resolve the SecondB presence.
 *
 * Priority for the FAB glyph: an explicit chat invite wins, then a pending
 * notification, otherwise the resting default.
 *
 * The mascot only dozes off once it's been idle past the threshold AND
 * there's nothing pending — we never want it asleep while it's also trying
 * to nudge the user.
 */
export function secondbPresence({
  idleMs,
  sleepAfterMs,
  chatReady = false,
  hasNotification = false,
}: PresenceInput): Presence {
  const fab: SecondBFabState = chatReady
    ? "chat_ready"
    : hasNotification
      ? "notification"
      : "default";

  const pending = chatReady || hasNotification;
  const mascot: MascotRest =
    !pending && idleMs >= sleepAfterMs ? "sleep" : "idle";

  return { fab, mascot };
}

/** Default idle threshold before the mascot dozes (ms). */
export const SLEEP_AFTER_MS = 20_000;
