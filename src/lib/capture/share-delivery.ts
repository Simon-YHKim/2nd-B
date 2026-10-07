// Android share -> /capture: signed in only (Simon 2026-10-07, Q-261005-05).
//
// A share from the Android share sheet fills the capture input only when the
// person is signed in, the profile is complete, and no password reset or
// encrypted-storage recovery is under way (nor the first-run avatar setup,
// which also redirects away from /capture). In any other state the share is
// dropped: this module keeps no shared text, never brings a share back later,
// and never hands one to whoever signs in next. The next screen shows one line
// that says the share was not added (components/capture/ShareRefusedNotice.tsx).
//
// How the rule is held without keeping the text:
//   - src/app/+native-intent.ts rewrites each share link to
//     /capture?text=&title=&shareDelivery=<id> (./share-intent.ts) and registers
//     the id here. The registry holds ids and verdicts only, never text.
//   - The first time the account state is known after a share arrives, its
//     verdict is decided once (settleShareDeliveries, run by ShareDeliverySync
//     in the root layout, which stays mounted under every gate): accepted for
//     that account, or refused.
//   - The capture screen reads the shared params only for a delivery that is
//     accepted for the account on screen and still allowed now
//     (nativeShareGate). A refused or unknown delivery is stripped from the
//     route unread. So a share that met a redirect (sign-in, profile,
//     password reset) cannot fill /capture later, even if its route survives.
//
// What it is not: not storage (memory only, ids only), not a resume, not an
// owner hand-off. The gates it reads (IntroGate, the C10 profile gate, the
// recovery lock) are untouched; it only adds "do not fill" on top of them.
//
// Known and left (Simon 2026-10-07): two shares that arrive before the app has
// read the first one leave only the second (Android keeps one intent; gate
// W5-R3-01). A link that arrives before React Native is ready is dropped, as
// on main (config-plugins/withAndroidShareTarget.js).

import { profileGate, type ProfileGateSnapshot } from "../auth/profile-probe";
import type { AvatarFirstRunDecision } from "../avatar/first-run-store";

/** The route param that marks a /capture link as an Android share delivery. */
export const SHARE_DELIVERY_PARAM = "shareDelivery";

/** How many delivery ids are remembered. Older ones read as unknown (refused). */
export const SHARE_DELIVERY_MAX_TRACKED = 16;

/**
 * The account state IntroGate (src/app/_layout.tsx) routes on, as useAuth()
 * publishes it, plus AvatarSetupGate's answer for the capture route: a first
 * run without an avatar is sent to /avatar-studio before /capture renders.
 */
export interface ShareDeliveryAuth extends ProfileGateSnapshot {
  recoveryReady: boolean;
  recoveryUserId: string | null;
  recoveryPendingGlobal: boolean;
  storageRecoveryRequired: boolean;
  /** avatarFirstRunDecision(userId, hasProfile, "capture", snapshot). */
  avatarSetup: AvatarFirstRunDecision;
}

export type ShareDeliveryVerdict = { kind: "accepted"; owner: string } | { kind: "refused" };

const REFUSED: ShareDeliveryVerdict = { kind: "refused" };

/**
 * What a share arriving now would get. null while the state is not known yet
 * (session, recovery marker or profile still loading, or a failed profile probe
 * that the person can retry): the decision waits for an answer.
 */
export function verdictForAuth(auth: ShareDeliveryAuth): ShareDeliveryVerdict | null {
  // Unreadable encrypted storage: nobody can be told apart, so nothing is filled.
  if (auth.storageRecoveryRequired) return REFUSED;
  if (!auth.recoveryReady) return null;
  // A password reset owns navigation (IntroGate sends every route to /reset-password).
  if (auth.recoveryUserId !== null || auth.recoveryPendingGlobal) return REFUSED;
  const gate = profileGate(auth);
  if (gate === "signed-out" || gate === "profile-incomplete") return REFUSED;
  // auth-loading, profile-loading, profile-error: wait.
  if (gate !== "ready" || !auth.userId) return null;
  // First run without an avatar: the setup redirect replaces /capture.
  if (auth.avatarSetup === "setup") return REFUSED;
  if (auth.avatarSetup === "hold") return null;
  return { kind: "accepted", owner: auth.userId };
}

export interface ShareDeliveryEntry {
  readonly id: number;
  /** null until the account state is known after the share arrived. */
  readonly verdict: ShareDeliveryVerdict | null;
}

export interface ShareDeliveryState {
  /** Oldest first, at most SHARE_DELIVERY_MAX_TRACKED. */
  readonly entries: readonly ShareDeliveryEntry[];
  /** Goes up once per settle that refused at least one share. */
  readonly refusedNoticeSeq: number;
  /** The refusedNoticeSeq the notice was last dismissed at. */
  readonly noticeDismissedSeq: number;
}

const INITIAL_STATE: ShareDeliveryState = { entries: [], refusedNoticeSeq: 0, noticeDismissedSeq: 0 };

let state: ShareDeliveryState = INITIAL_STATE;
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: ShareDeliveryState): void {
  state = next;
  for (const listener of [...listeners]) listener();
}

/** useSyncExternalStore snapshot. A new object on every change, never mutated. */
export function shareDeliveryState(): ShareDeliveryState {
  return state;
}

export function subscribeShareDeliveries(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A share link just arrived (src/app/+native-intent.ts). Returns its id. */
export function registerShareDelivery(): number {
  const id = nextId;
  nextId += 1;
  const entries = [...state.entries, { id, verdict: null }].slice(-SHARE_DELIVERY_MAX_TRACKED);
  publish({ ...state, entries });
  return id;
}

/**
 * Decides every share still waiting, once, from the account state now. A
 * refusal raises the one-line notice. Returns whether anything changed.
 */
export function settleShareDeliveries(auth: ShareDeliveryAuth): boolean {
  if (!state.entries.some((entry) => entry.verdict === null)) return false;
  const verdict = verdictForAuth(auth);
  if (verdict === null) return false;
  const entries = state.entries.map((entry) => (entry.verdict === null ? { id: entry.id, verdict } : entry));
  publish({
    ...state,
    entries,
    refusedNoticeSeq: verdict.kind === "refused" ? state.refusedNoticeSeq + 1 : state.refusedNoticeSeq,
  });
  return true;
}

export function shareRefusedNoticeVisible(snapshot: ShareDeliveryState): boolean {
  return snapshot.refusedNoticeSeq > snapshot.noticeDismissedSeq;
}

/** Hides the notice raised at `seq`. A later refusal shows it again. */
export function dismissShareRefusedNotice(seq: number): void {
  if (seq <= state.noticeDismissedSeq) return;
  publish({ ...state, noticeDismissedSeq: Math.min(seq, state.refusedNoticeSeq) });
}

/** `shareDelivery` as the router hands it over. Anything but one plain positive integer is null. */
export function parseShareDeliveryId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9][0-9]{0,8}$/.test(raw)) return null;
  return Number(raw);
}

/**
 * What the capture screen may do with the shared params on its route.
 *   - "not-native": no shareDelivery param. Not an Android share delivery, so
 *     the screen behaves as before (the PWA share target on the web, a plain link).
 *   - "allowed": accepted for this account and allowed now. Fill the input.
 *   - "pending": not decided yet, or decided but not allowed this instant. Do not
 *     read the params, do not strip them.
 *   - "refused": refused, for another account, or an id this app run never
 *     issued. Do not read the params; strip them.
 */
export type NativeShareGate = "not-native" | "allowed" | "pending" | "refused";

export function nativeShareGate(
  snapshot: ShareDeliveryState,
  rawDeliveryParam: unknown,
  auth: ShareDeliveryAuth,
): NativeShareGate {
  if (rawDeliveryParam === undefined) return "not-native";
  const id = parseShareDeliveryId(rawDeliveryParam);
  if (id === null) return "refused";
  const entry = snapshot.entries.find((candidate) => candidate.id === id);
  if (entry === undefined) return "refused";
  const now = verdictForAuth(auth);
  const decided = entry.verdict ?? now;
  if (decided === null) return "pending";
  if (decided.kind === "refused") return "refused";
  if (decided.owner !== auth.userId) return "refused";
  // Accepted for this account. It fills only while the account may fill now.
  if (now === null || now.kind === "refused") return "pending";
  return "allowed";
}

export function __resetShareDeliveriesForTests(): void {
  state = INITIAL_STATE;
  nextId = 1;
  listeners.clear();
}
