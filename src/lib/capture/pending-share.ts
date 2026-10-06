// A share that reached /capture before anyone could take it (gate FIN-01, 2026-10-06).
//
// The Android share sheet (src/app/+native-intent.ts) and the PWA Web Share
// Target open /capture?text=&title= (the PWA also sends url=). When nobody is
// signed in, the capture route redirects to /sign-in, and when the signed-in
// account has no profile yet, the global C10 gate (IntroGate in
// src/app/_layout.tsx) redirects to /complete-profile. Both redirects dropped
// the shared text: the screen that reads it never mounted. Neither gate is
// loosened here. Instead this module keeps the share in this JS runtime's
// memory while those screens run, and gives the home screen a /capture link
// that carries it again once the person is signed in with a complete profile
// (./use-pending-share.ts wires both ends).
//
// What it is not:
//   - Not storage. Memory only. A process death, a full web reload (an OAuth
//     redirect on the web) or PENDING_SHARE_TTL_MS drops it. Nothing reaches
//     disk before an account exists. After the resume the capture screen keeps
//     the text the way it keeps any share (its per-account on-device draft).
//   - Not a save. The resume opens the capture screen with the text in its
//     input, as a share does for someone already signed in. No record is
//     created until the person presses save, and that save runs the safety
//     classifier (C9) as before.
//   - Not shared between accounts. A share kept while signed out is claimed by
//     the first account that signs in after it, and one kept for a signed-in
//     account without a profile belongs to that account. After that, any owner
//     change (a sign-out or another account) drops it, so it never reaches a
//     second account. The owner comes from account-epoch.ts, which publishes
//     every change before React sees it.
//   - Not a way to steer the screen. Only url/text/title are read, and the
//     resume link carries one text param, so mode/tag/entry/coach in a crafted
//     link do not survive the hand-off.

import {
  currentAccountOwner,
  onAccountOwnerChange,
  type AccountOwnerChange,
} from "../auth/account-epoch";
import { profileGate, type ProfileGateSnapshot } from "../auth/profile-probe";
import {
  SHARE_TEXT_MAX_CHARS,
  SHARE_TITLE_MAX_CHARS,
  captureHrefForSharedIntent,
  clipSharedField,
} from "./share-intent";
import { normalizeSharedCaptureParams } from "./share-params";

/** How long a kept share waits for sign-in, profile completion and the first home screen. */
export const PENDING_SHARE_TTL_MS = 30 * 60 * 1000;

/**
 * The most the resume carries. The longest single Android share after
 * normalizeSharedCaptureParams is a capped title, a blank line and a capped
 * text, so one share always fits. A longer crafted link is cut with the same
 * marker the share caps use, and a further share that would push the total
 * past this is refused (the shares already kept stay as they were).
 */
export const PENDING_SHARE_MAX_CHARS = SHARE_TITLE_MAX_CHARS + 2 + SHARE_TEXT_MAX_CHARS;

const CHUNK_SEPARATOR = "\n\n";

type ParamValue = string | string[] | undefined;

export interface SharedRouteParams {
  url?: ParamValue;
  text?: ParamValue;
  title?: ParamValue;
}

export type SharedRouteDecision =
  /** Not a share on /capture, or an auth state no redirect acts on (loading, probe failure). */
  | { kind: "none" }
  /** A signed-in account with a profile: the capture screen takes it as usual. */
  | { kind: "ready"; key: string }
  /** A redirect is about to replace the capture screen: keep the share for `owner`. */
  | { kind: "hold"; key: string; content: string; owner: string | null };

/**
 * What the root layout should do with the route it is on. `key` is the
 * delivery identity normalizeSharedCaptureParams gives the capture screen.
 */
export function decideSharedRoute(
  pathname: string,
  params: SharedRouteParams,
  auth: ProfileGateSnapshot,
): SharedRouteDecision {
  if (pathname !== "/capture") return { kind: "none" };
  const shared = normalizeSharedCaptureParams({ url: params.url, text: params.text, title: params.title });
  if (shared === null) return { kind: "none" };
  const gate = profileGate(auth);
  if (gate === "ready") return { kind: "ready", key: shared.key };
  if (gate === "signed-out") return { kind: "hold", key: shared.key, content: shared.content, owner: null };
  if (gate === "profile-incomplete") {
    return { kind: "hold", key: shared.key, content: shared.content, owner: auth.userId };
  }
  return { kind: "none" };
}

interface PendingShare {
  /** Normalized share contents, oldest first. */
  chunks: string[];
  /** The account it belongs to. null until the first sign-in claims it. */
  owner: string | null;
  /** When the latest chunk was kept (ms). */
  heldAt: number;
}

let pending: PendingShare | null = null;
let stopWatchingOwner: (() => void) | null = null;

function dropPendingShare(): void {
  pending = null;
  stopWatchingOwner?.();
  stopWatchingOwner = null;
}

function handleOwnerChange(change: AccountOwnerChange): void {
  if (pending === null) return;
  if (pending.owner === null) {
    // Kept while signed out: the account that signs in next is the person who
    // was asked to sign in to keep it.
    if (change.owner !== null) pending.owner = change.owner;
    return;
  }
  if (change.owner !== pending.owner) dropPendingShare();
}

function joinedLength(chunks: readonly string[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.length, 0) + CHUNK_SEPARATOR.length * Math.max(0, chunks.length - 1);
}

/**
 * Keeps `content` for `owner` (null = signed out). Returns true when the share
 * is kept, including when the same content already is. Refuses when the owner
 * the caller saw is not the one account-epoch has published (React lags it by
 * a render during a sign-in or sign-out), and when the total would pass
 * PENDING_SHARE_MAX_CHARS.
 */
export function holdPendingShare(content: string, owner: string | null, now: number = Date.now()): boolean {
  if (currentAccountOwner() !== owner) return false;
  const chunk = clipSharedField(content, PENDING_SHARE_MAX_CHARS);
  if (chunk.length === 0) return false;
  if (pending !== null) {
    const expired = now - pending.heldAt > PENDING_SHARE_TTL_MS;
    const otherOwner = pending.owner !== null && pending.owner !== owner;
    if (expired || otherOwner) dropPendingShare();
  }
  if (pending === null) {
    pending = { chunks: [], owner, heldAt: now };
    stopWatchingOwner = onAccountOwnerChange(handleOwnerChange);
  } else if (pending.owner === null && owner !== null) {
    pending.owner = owner;
  }
  if (pending.chunks.includes(chunk)) return true;
  const separator = pending.chunks.length > 0 ? CHUNK_SEPARATOR.length : 0;
  if (joinedLength(pending.chunks) + separator + chunk.length > PENDING_SHARE_MAX_CHARS) return false;
  pending.chunks.push(chunk);
  pending.heldAt = now;
  return true;
}

/**
 * Hands the kept share to `userId` once, as a /capture link the capture screen
 * reads back exactly (captureHrefForSharedIntent). Returns null, and forgets
 * the share, when there is none, it expired, or it belongs to another account.
 */
export function takePendingShareHref(userId: string, now: number = Date.now()): string | null {
  const held = pending;
  if (held === null) return null;
  dropPendingShare();
  if (now - held.heldAt > PENDING_SHARE_TTL_MS) return null;
  if (held.owner !== null && held.owner !== userId) return null;
  try {
    return captureHrefForSharedIntent({ text: held.chunks.join(CHUNK_SEPARATOR), title: "" });
  } catch {
    // A lone surrogate cannot be percent-encoded. Opening an empty capture
    // screen would look like the share arrived and was blank.
    return null;
  }
}

export type PendingShareWatcher = (
  pathname: string,
  params: SharedRouteParams,
  auth: ProfileGateSnapshot,
) => void;

/**
 * The root layout's view of the current route, one per layout mount. It keeps
 * a share a redirect is about to drop, except a delivery it already saw while
 * an account with a profile was signed in: that one went to that account's
 * capture screen, and if the route is still on screen when the account signs
 * out, keeping it would hand it to the next account.
 */
export function createPendingShareWatcher(): PendingShareWatcher {
  let shownToAccount: string | null = null;
  return (pathname, params, auth) => {
    const decision = decideSharedRoute(pathname, params, auth);
    if (decision.kind === "ready") {
      shownToAccount = decision.key;
      return;
    }
    if (decision.kind !== "hold" || decision.key === shownToAccount) return;
    holdPendingShare(decision.content, decision.owner);
  };
}

/** Diagnostic view for tests: what is kept, for whom, since when. */
export function pendingShareSnapshot(): { content: string; owner: string | null; heldAt: number } | null {
  if (pending === null) return null;
  return { content: pending.chunks.join(CHUNK_SEPARATOR), owner: pending.owner, heldAt: pending.heldAt };
}

/** Test-only reset for this module singleton. */
export function __resetPendingShareForTests(): void {
  dropPendingShare();
}
