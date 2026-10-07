// Android share -> /capture: signed in only (Simon 2026-10-07, Q-261005-05).
//
// A share from the Android share sheet fills the capture input only when the
// person is signed in, the profile is complete, and no password reset or
// encrypted-storage recovery is under way (nor the first-run avatar setup,
// which also redirects away from /capture). In any other state the share is
// dropped: this module keeps no shared text, never brings a share back later,
// and never hands one to whoever signs in next. The person sees one line that
// says the share was not added (components/capture/ShareRefusedNotice.tsx).
//
// How the rule is held without keeping the text:
//   - src/app/+native-intent.ts rewrites each share link to
//     /capture?text=&title=&shareDelivery=<id> (./share-intent.ts) and registers
//     the id here. The registry holds ids and verdicts only, never text. A
//     shareDelivery param on any other incoming link is made unreadable there,
//     so only an id this module issued can open a share.
//   - The first time the account state is known after a share arrives, its
//     verdict is decided once (settleShareDeliveries, run by ShareDeliverySync
//     in the root layout, which stays mounted under every gate): accepted for
//     that account, or refused. The wait is only for the state being read
//     (session, recovery marker, profile, avatar check); each of those reads
//     has its own time limit. A failed profile probe is an answer, not a
//     wait: the share is refused, so a later retry cannot pick it up.
//   - A share that is waiting or accepted belongs to the account it arrived
//     under. If the published account changes (A -> B, or A -> signed out;
//     lib/auth/account-epoch.ts) before it is used, it is refused. So is an
//     accepted share whose account later stops being allowed to fill (password
//     reset, sign-out, profile change): it does not wait for the account to
//     come back.
//   - The capture screen reads the shared params only for a delivery that is
//     accepted for the account on screen and still allowed now
//     (nativeShareGate), and marks it filled the moment it puts the text in the
//     input. A filled delivery is never read again, so the same id cannot fill
//     twice. A refused, filled or unknown delivery is stripped from the route
//     unread; a refusal the screen decides itself also shows the line, once.
//
// What it is not: not storage (memory only, ids only), not a resume, not an
// owner hand-off. The gates it reads (IntroGate, the C10 profile gate, the
// recovery lock) are untouched; it only adds "do not fill" on top of them.
//
// Known and left (Simon 2026-10-07): two shares that arrive before the app has
// read the first one leave only the second (Android keeps one intent; gate
// W5-R3-01). A link that arrives before React Native is ready is dropped, as
// on main (config-plugins/withAndroidShareTarget.js).

import { isAccountTransitionPending, onAccountOwnerChange } from "../auth/account-epoch";
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

/**
 * accepted: may fill the capture input for `owner`, once.
 * filled:   the capture screen put it in the input. Never read again.
 * refused:  dropped; the one-line notice was raised for it.
 */
export type ShareDeliveryVerdict =
  | { kind: "accepted"; owner: string }
  | { kind: "filled" }
  | { kind: "refused" };

const REFUSED: ShareDeliveryVerdict = { kind: "refused" };

/**
 * What a share arriving now would get. null while the state is still being
 * read (session, recovery marker or profile loading, avatar check running):
 * the decision waits for that read to finish.
 */
export function verdictForAuth(auth: ShareDeliveryAuth): ShareDeliveryVerdict | null {
  // Unreadable encrypted storage: nobody can be told apart, so nothing is filled.
  if (auth.storageRecoveryRequired) return REFUSED;
  if (!auth.recoveryReady) return null;
  // A password reset owns navigation (IntroGate sends every route to /reset-password).
  if (auth.recoveryUserId !== null || auth.recoveryPendingGlobal) return REFUSED;
  const gate = profileGate(auth);
  // A failed profile probe is not known to be complete. It waits for a retry
  // the person has to press, so it is refused rather than held (gate SHARE-A1-01).
  if (gate === "signed-out" || gate === "profile-incomplete" || gate === "profile-error") return REFUSED;
  // auth-loading, profile-loading: wait.
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
  /**
   * Route values that no entry holds (an id that left the window, an id never
   * issued, a malformed value) and whose refusal was already announced or
   * needs none. Ids and route values only, never text. At most
   * SHARE_DELIVERY_MAX_TRACKED.
   */
  readonly announced: readonly string[];
  /** Goes up once per change that refused at least one share. */
  readonly refusedNoticeSeq: number;
  /** The refusedNoticeSeq the notice was last dismissed at. */
  readonly noticeDismissedSeq: number;
}

const INITIAL_STATE: ShareDeliveryState = {
  entries: [],
  announced: [],
  refusedNoticeSeq: 0,
  noticeDismissedSeq: 0,
};

let state: ShareDeliveryState = INITIAL_STATE;
let nextId = 1;
const listeners = new Set<() => void>();
let stopOwnerWatch: (() => void) | null = null;

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

/** Waiting or accepted: not used yet, still bound to the account it arrived under. */
function isOpen(entry: ShareDeliveryEntry): boolean {
  return entry.verdict === null || entry.verdict.kind === "accepted";
}

/** Refuses every open delivery. Returns whether any was open. */
function refuseOpenDeliveries(): boolean {
  if (!state.entries.some(isOpen)) return false;
  publish({
    ...state,
    entries: state.entries.map((entry) => (isOpen(entry) ? { id: entry.id, verdict: REFUSED } : entry)),
    refusedNoticeSeq: state.refusedNoticeSeq + 1,
  });
  return true;
}

/**
 * The published account changed away from a known account (A -> B, A -> signed
 * out). AuthContext calls noteResolvedOwner() before it publishes the new
 * account, so this runs before any screen can render B with A's share (gate
 * SG-01). The first account after boot (signed out -> A) is not a change of
 * owner: a share that arrived during boot waits for it.
 */
function watchAccountOwner(): void {
  if (stopOwnerWatch !== null) return;
  stopOwnerWatch = onAccountOwnerChange((change) => {
    if (change.previousOwner === null) return;
    refuseOpenDeliveries();
  });
}

/** A share link just arrived (src/app/+native-intent.ts). Returns its id. */
export function registerShareDelivery(): number {
  watchAccountOwner();
  const id = nextId;
  nextId += 1;
  const all = [...state.entries, { id, verdict: null }];
  const kept = all.slice(-SHARE_DELIVERY_MAX_TRACKED);
  // An id that leaves the window after it was refused or filled needs no new
  // line if its route shows up later. One that leaves while open was never
  // answered, so the screen still announces it.
  const settled = all
    .slice(0, all.length - kept.length)
    .filter((entry) => !isOpen(entry))
    .map((entry) => String(entry.id));
  publish({
    ...state,
    entries: kept,
    announced: settled.length > 0 ? [...state.announced, ...settled].slice(-SHARE_DELIVERY_MAX_TRACKED) : state.announced,
  });
  return id;
}

/**
 * Decides every share still waiting, once, from the account state now, and
 * refuses an accepted one whose account may no longer fill. A refusal raises
 * the one-line notice. Returns whether anything changed.
 */
export function settleShareDeliveries(auth: ShareDeliveryAuth): boolean {
  if (!state.entries.some(isOpen)) return false;
  // An account switch is under way; the owner watch decides when it lands.
  if (isAccountTransitionPending()) return false;
  const now = verdictForAuth(auth);
  if (now === null) return false;
  let changed = false;
  let refused = false;
  const entries = state.entries.map((entry): ShareDeliveryEntry => {
    const verdict = entry.verdict;
    if (verdict === null) {
      changed = true;
      if (now.kind === "refused") refused = true;
      return { id: entry.id, verdict: now };
    }
    if (verdict.kind !== "accepted") return entry;
    if (now.kind === "accepted" && now.owner === verdict.owner) return entry;
    // Accepted, then the account lost the right to fill (or changed): dropped
    // for good, not held until it comes back (gate SHARE-A1-01).
    changed = true;
    refused = true;
    return { id: entry.id, verdict: REFUSED };
  });
  if (!changed) return false;
  publish({
    ...state,
    entries,
    refusedNoticeSeq: refused ? state.refusedNoticeSeq + 1 : state.refusedNoticeSeq,
  });
  return true;
}

/**
 * The capture screen put this delivery's text in the input for `owner`. From
 * now on the id reads as used: the same route, a remount after a gate, or a
 * new link carrying it cannot fill again (gate SHARE-A1-02).
 */
export function markShareDeliveryFilled(rawDeliveryParam: unknown, owner: string): boolean {
  const id = parseShareDeliveryId(rawDeliveryParam);
  if (id === null) return false;
  const target = state.entries.find((entry) => entry.id === id);
  if (target?.verdict?.kind !== "accepted" || target.verdict.owner !== owner) return false;
  publish({
    ...state,
    entries: state.entries.map((entry) => (entry.id === id ? { id, verdict: { kind: "filled" } } : entry)),
  });
  return true;
}

/**
 * The capture screen is dropping a share it may not read (nativeShareGate said
 * "refused"). Raises the one-line notice once per delivery unless the share
 * was already answered: refused by the settle (notice already raised), or
 * filled (it was added). Returns whether the notice went up (gate SHARE-A1-03).
 *
 * `routeValue` is the shareDelivery param as a string (an array param
 * stringified), so a repeated render of the same route cannot raise it twice.
 */
export function refuseShareDelivery(routeValue: string): boolean {
  const id = parseShareDeliveryId(routeValue);
  const entry = id === null ? undefined : state.entries.find((candidate) => candidate.id === id);
  if (entry !== undefined) {
    // Waiting: not the screen's call. Refused: announced. Filled: it was added.
    if (entry.verdict?.kind !== "accepted") return false;
    publish({
      ...state,
      entries: state.entries.map((candidate) => (candidate.id === id ? { id: candidate.id, verdict: REFUSED } : candidate)),
      refusedNoticeSeq: state.refusedNoticeSeq + 1,
    });
    return true;
  }
  if (state.announced.includes(routeValue)) return false;
  publish({
    ...state,
    announced: [...state.announced, routeValue].slice(-SHARE_DELIVERY_MAX_TRACKED),
    refusedNoticeSeq: state.refusedNoticeSeq + 1,
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
 *   - "pending": not decided yet, or accepted while the account state is being
 *     read again. Do not read the params, do not strip them.
 *   - "refused": refused, filled already, for another account, no longer
 *     allowed, or an id this app run never issued. Do not read the params;
 *     strip them.
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
  const decided = entry.verdict;
  // Not decided yet: wait for the settle, never guess from the account on
  // screen (gate SG-01).
  if (decided === null) return "pending";
  if (decided.kind !== "accepted") return "refused";
  if (decided.owner !== auth.userId) return "refused";
  const now = verdictForAuth(auth);
  if (now === null) return "pending";
  if (now.kind !== "accepted") return "refused";
  return "allowed";
}

export function __resetShareDeliveriesForTests(): void {
  state = INITIAL_STATE;
  nextId = 1;
  listeners.clear();
  stopOwnerWatch?.();
  stopOwnerWatch = null;
}
