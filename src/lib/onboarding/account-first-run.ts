// First-run screens (the welcome at /onboarding and the first-day review at
// /ttfv) open by themselves at most ONCE PER ACCOUNT, and the server decides that
// once (Q-261004-40, strict variant; docs/design/onboarding-server-261006.md,
// migration 0219).
//
// The rules this module keeps (design section 3):
//   P1  A screen opens by itself only with a server grant (claim_first_run). The
//       grant is one conditional UPDATE, so two tabs cannot both get it.
//   P2  When the server cannot answer, nothing opens by itself (fail-closed). A
//       signed-in account never reads the device flags (state.ts is for a
//       signed-out visitor only).
//   P3  Every answer is bound to the sign-in it was asked for: the JWT session_id
//       at the moment of asking. An RPC answer echoes the session_id the server
//       saw; a read is bracketed by the session before and after. An answer is
//       adopted only while that same owner and session are still current.
//   P4  "Once" is already on the server when the screen opens, so a later write
//       that fails or never arrives cannot open it again. There is no resend and
//       no outbox.
//   P5  A granted first-day review that could not show anything hands the grant
//       back (finish_first_run outcome not_shown, with the grant's receipt).
//       The receipt belongs to the ONE screen visit the home opened (it takes it
//       once, gate BA-02), and that visit hands it back only when it ends without
//       having shown anything (TTFVScreen, gate FR-01). A hand-back the server
//       applied lets a later home visit of the same sign-in ask again (gate
//       BA-01), as often as it is handed back (no cap, gate BA-08), but never
//       the home visit that is the return from that review: the person just
//       left it, and asking again there would pull them straight back in.
//       A hand-back made elsewhere (another tab) is learned by a fresh read on
//       a later focus (gate D7-01).
//
// Each request is sent once and never overlaps itself: a step that times out
// (8 seconds) stops the WAIT, not the request, and the next caller waits on the
// same in-flight request instead of sending another one. A claim that answers
// after its 8 seconds is not followed (the chance stays used, design 5.2 step 5).

import { useEffect, useState, useSyncExternalStore } from "react";

import { withTimeout } from "../async/with-timeout";
import { currentAccountOwner } from "../auth/account-epoch";
import { sessionIdFromAccessToken } from "../auth/auth-storage-schema";
import { getSupabaseClient } from "../supabase/client";

export type FirstRunKind = "onboarding" | "ttfv";
export type FirstRunRoute = "/onboarding" | "/ttfv";
/** What the home does: wait (loader), stay home, or open one first-run screen. */
export type FirstRunGate = "wait" | "home" | FirstRunRoute;
export type OnboardingOutcome = "completed" | "skipped";
export type TTFVOutcome = "shown" | "not_shown";

export interface FirstRunMarks {
  onboardingClaimedAt: string | null;
  onboardingCompletedAt: string | null;
  ttfvClaimedAt: string | null;
  ttfvSeenAt: string | null;
}

export interface FirstRunSessionKey {
  ownerId: string;
  /** The JWT `session_id`: stable across token refresh, new on every sign-in. */
  sessionId: string;
}

/** How long a home visit waits for any one step (design 5.2). */
export const FIRST_RUN_TIMEOUT_MS = 8_000;
/** Failed reads per sign-in (an in-flight read reserves one until it succeeds). */
export const FIRST_RUN_MAX_READS = 3;
/** Coalesce focus/foreground bursts while learning a grant held by another tab. */
export const FIRST_RUN_HELD_COOLDOWN_MS = 2_000;
/** The first-day window: the review opens by itself only within 24h of the welcome. */
export const FIRST_DAY_MS = 24 * 60 * 60 * 1000;

const FIRST_RUN_KINDS: readonly FirstRunKind[] = ["onboarding", "ttfv"];
const MARK_COLUMNS = "onboarding_claimed_at, onboarding_completed_at, ttfv_claimed_at, ttfv_seen_at";

/**
 * Pure: is `nowMs` still within the first day of `anchorISO`? False for a
 * missing/unparseable timestamp. A small clock-skew window in both directions is
 * tolerated; the server checks the window again with its own clock.
 */
export function isWithinFirstDay(anchorISO: string | null, nowMs: number): boolean {
  if (!anchorISO) return false;
  const t = Date.parse(anchorISO);
  if (!Number.isFinite(t)) return false;
  const delta = nowMs - t;
  return delta > -FIRST_DAY_MS && delta < FIRST_DAY_MS;
}

/** design 4.2 "[필요]": nobody has been granted the welcome and nobody finished it. */
export function onboardingNeeded(marks: FirstRunMarks): boolean {
  return marks.onboardingClaimedAt === null && marks.onboardingCompletedAt === null;
}

/** The first-day window anchor: the finish, or the grant when the finish never arrived. */
export function firstDayAnchor(marks: FirstRunMarks): string | null {
  return marks.onboardingCompletedAt ?? marks.onboardingClaimedAt;
}

/** design 4.2 "[열림]", with this device's clock as a pre-check (the server decides). */
export function ttfvOpen(marks: FirstRunMarks, nowMs: number): boolean {
  return (
    marks.ttfvSeenAt === null &&
    marks.ttfvClaimedAt === null &&
    isWithinFirstDay(firstDayAnchor(marks), nowMs)
  );
}

/**
 * The account already went through this first-run screen: the welcome was
 * finished (or skipped), or the review was on screen. A grant for it opens
 * nothing (gate BA-07).
 */
export function firstRunDone(marks: FirstRunMarks | null, kind: FirstRunKind): boolean {
  if (!marks) return false;
  return kind === "onboarding" ? marks.onboardingCompletedAt !== null : marks.ttfvSeenAt !== null;
}

function timestampOrNull(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  throw new Error(`First-run ${field} is not a timestamp`);
}

/** All four fields must be present: a response without them is not an answer. */
export function parseFirstRunMarks(row: unknown): FirstRunMarks {
  if (!row || typeof row !== "object") throw new Error("First-run marks were not returned");
  const record = row as Record<string, unknown>;
  for (const field of ["onboarding_claimed_at", "onboarding_completed_at", "ttfv_claimed_at", "ttfv_seen_at"]) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      throw new Error(`First-run ${field} was not returned`);
    }
  }
  return {
    onboardingClaimedAt: timestampOrNull(record.onboarding_claimed_at, "onboarding_claimed_at"),
    onboardingCompletedAt: timestampOrNull(record.onboarding_completed_at, "onboarding_completed_at"),
    ttfvClaimedAt: timestampOrNull(record.ttfv_claimed_at, "ttfv_claimed_at"),
    ttfvSeenAt: timestampOrNull(record.ttfv_seen_at, "ttfv_seen_at"),
  };
}

/**
 * A stored mark never goes back to NULL, except the first-day grant when its own
 * receipt hands it back. So a later answer fills, and only a hand-back clears.
 * An older answer that arrives after a hand-back can set the grant again; that
 * only keeps the review from opening (fail-closed), never opens it twice.
 */
export function mergeFirstRunMarks(
  previous: FirstRunMarks | null,
  next: FirstRunMarks,
  release = false,
): FirstRunMarks {
  if (!previous) return next;
  return {
    onboardingClaimedAt: next.onboardingClaimedAt ?? previous.onboardingClaimedAt,
    onboardingCompletedAt: next.onboardingCompletedAt ?? previous.onboardingCompletedAt,
    ttfvClaimedAt: release ? next.ttfvClaimedAt : next.ttfvClaimedAt ?? previous.ttfvClaimedAt,
    ttfvSeenAt: next.ttfvSeenAt ?? previous.ttfvSeenAt,
  };
}

/**
 * granted: the server granted it and the screen has not opened yet; entered: the
 * home opened the screen with it; visiting: the first-day screen visit the home
 * opened took the grant's receipt, so no other visit can have it; denied: no
 * grant (or no usable answer); lapsed: no answer in time, and a late answer is
 * not followed. A first-day grant its own visit handed back goes back to idle.
 */
type ClaimState = "idle" | "pending" | "granted" | "entered" | "visiting" | "denied" | "lapsed";
type ClaimReason = "granted" | "done" | "held" | "window" | "not_onboarded";

interface ClaimSlot {
  state: ClaimState;
  reason: ClaimReason | null;
  /** The request itself, until it settles (not until its wait times out). */
  inflight: Promise<boolean> | null;
}

/** A slot's state read through a function, so an await in between is not narrowed away. */
function claimStateOf(slot: ClaimSlot): ClaimState {
  return slot.state;
}

interface FirstRunSession {
  readonly key: FirstRunSessionKey;
  marks: FirstRunMarks | null;
  reads: number;
  reading: Promise<FirstRunMarks> | null;
  heldReadAt: number;
  claims: Record<FirstRunKind, ClaimSlot>;
  ttfvToken: string | null;
  finishing: Map<string, Promise<FirstRunMarks>>;
  /**
   * The review visit the home opened took its receipt, and no home visit has
   * been decided since: the next one is the return from that review (BA-08).
   */
  reviewReturnPending: boolean;
}

interface HomeVisit {
  ownerId: string;
  id: number;
  gate: FirstRunGate;
  /** The visit stayed home because nothing could be read, so a later entry may try again. */
  retryable: boolean;
  /** The decision's sign-in; a failed lookup keeps the published identity, if known. */
  sessionId: string | null;
  /** The published login this visit must keep across focus retries, when supplied by the home hook. */
  expectedSessionId?: string | null;
  rechecking: boolean;
}

interface VisitDecision {
  gate: FirstRunGate;
  retryable: boolean;
  sessionId: string | null;
  /** This visit was the return from the review the home opened (BA-08). */
  returning: boolean;
}

export interface FirstRunSnapshot {
  home: HomeVisit | null;
}

let session: FirstRunSession | null = null;
/** Failed session lookups, keyed by owner and published login (null when unknown). */
const unresolvedFailures = new Map<string, number>();
let home: HomeVisit | null = null;
let visitSeq = 0;
let snapshot: FirstRunSnapshot = { home: null };
const listeners = new Set<() => void>();

function publish(): void {
  snapshot = { home };
  for (const listener of listeners) listener();
}

export function subscribeFirstRun(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function firstRunSnapshot(): FirstRunSnapshot {
  return snapshot;
}

function warn(operation: string, error: unknown): void {
  if (typeof console !== "undefined") console.warn(`[first-run] ${operation} failed`, error);
}

function sameKey(a: FirstRunSessionKey, b: FirstRunSessionKey | null): boolean {
  return !!b && a.ownerId === b.ownerId && a.sessionId === b.sessionId;
}

/**
 * The sign-in this owner is in right now, or null: no session, another user's
 * session, an owner AuthContext has not published, or a token without a
 * session_id (P2: without it no answer can be bound, so nothing opens).
 */
export async function resolveFirstRunSession(ownerId: string): Promise<FirstRunSessionKey | null> {
  if (!ownerId || currentAccountOwner() !== ownerId) return null;
  const { data, error } = await withTimeout(
    getSupabaseClient().auth.getSession(),
    FIRST_RUN_TIMEOUT_MS,
    "First-run session",
  );
  if (error) return null;
  const current = data.session;
  if (!current || current.user.id !== ownerId || currentAccountOwner() !== ownerId) return null;
  const sessionId = sessionIdFromAccessToken(current.access_token);
  return sessionId ? { ownerId, sessionId } : null;
}

async function stillCurrent(s: FirstRunSession): Promise<boolean> {
  if (session !== s) return false;
  const now = await resolveFirstRunSession(s.key.ownerId);
  return session === s && sameKey(s.key, now);
}

/** The session record for this sign-in. A different sign-in starts empty. */
function sessionFor(key: FirstRunSessionKey): FirstRunSession {
  if (session && sameKey(key, session.key)) return session;
  session = {
    key,
    marks: null,
    reads: 0,
    reading: null,
    heldReadAt: -Infinity,
    claims: {
      onboarding: { state: "idle", reason: null, inflight: null },
      ttfv: { state: "idle", reason: null, inflight: null },
    },
    ttfvToken: null,
    finishing: new Map(),
    reviewReturnPending: false,
  };
  return session;
}

/** AuthContext's published login changed, even if the owner and focus did not. */
export function syncFirstRunSession(ownerId: string | null, sessionId: string | null): void {
  const key = ownerId && sessionId ? { ownerId, sessionId } : null;
  if (session && !sameKey(session.key, key)) session = null;
  if (home && (!key || home.ownerId !== key.ownerId || home.sessionId !== key.sessionId)) {
    home = null;
    publish();
  }
  if (key) sessionFor(key);
}

/**
 * `release`: this answer may clear the first-day grant (a hand-back, or a fresh
 * read the home asked for to learn one). Whatever the answer, a grant not yet
 * taken by a screen visit is closed once this sign-in learns the screen was
 * already gone through another way (a direct visit, another tab; gate BA-07).
 */
function adopt(s: FirstRunSession, marks: FirstRunMarks, release = false): void {
  s.marks = mergeFirstRunMarks(s.marks, marks, release);
  for (const kind of FIRST_RUN_KINDS) {
    const slot = s.claims[kind];
    if ((slot.state === "granted" || slot.state === "entered") && firstRunDone(s.marks, kind)) {
      slot.state = "denied";
      slot.reason = "done";
      if (kind === "ttfv") s.ttfvToken = null;
      if (home?.ownerId === s.key.ownerId && home.sessionId === s.key.sessionId && home.gate === `/${kind}`) {
        home = { ...home, gate: "home", retryable: false };
        publish();
      }
    }
  }
  // Only a definite held refusal can become claimable after an authoritative
  // hand-back. Errors and ambiguous/lapsed claims stay spent (P2/Q2).
  const review = s.claims.ttfv;
  if (release && review.state === "denied" && review.reason === "held" && ttfvOpen(s.marks, Date.now())) {
    review.state = "idle";
    review.reason = null;
  }
}

async function requestMarks(s: FirstRunSession, release: boolean): Promise<FirstRunMarks> {
  const { data, error } = await getSupabaseClient()
    .from("users")
    .select(MARK_COLUMNS)
    .eq("id", s.key.ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("First-run owner row was not found");
  const marks = parseFirstRunMarks(data);
  // A read carries no session of its own, so bracket it: the same sign-in
  // before (sessionFor) and after (here) means it was asked for this one.
  if (!(await stillCurrent(s))) throw new Error("First-run sign-in changed during the read");
  adopt(s, marks, release);
  return marks;
}

/**
 * Read once per sign-in (up to FIRST_RUN_MAX_READS on failure). `refresh` reads
 * again although the marks are known, to learn a first-day hand-back made
 * elsewhere (gate D7-01); successful reads do not spend the failure budget. Never
 * overlaps itself. Never rejects.
 */
async function ensureMarks(s: FirstRunSession, refresh = false): Promise<boolean> {
  if (s.marks && !refresh) return true;
  let inflight = s.reading;
  if (!inflight) {
    if (s.reads >= FIRST_RUN_MAX_READS) return false;
    s.reads += 1;
    inflight = requestMarks(s, refresh);
    s.reading = inflight;
    inflight.then(
      () => { s.reads -= 1; },
      (error) => warn("read", error),
    ).finally(() => {
      if (s.reading === inflight) s.reading = null;
    });
  }
  try {
    await withTimeout(inflight, FIRST_RUN_TIMEOUT_MS, "First-run marks");
    return session === s && !!s.marks;
  } catch {
    return false;
  }
}

interface ClaimAnswer {
  granted: boolean;
  reason: ClaimReason;
  token: string | null;
  sessionId: string | null;
  marks: FirstRunMarks;
}

/** Strict shape check of claim_first_run's answer. */
export function parseClaimAnswer(data: unknown): ClaimAnswer {
  if (!data || typeof data !== "object") throw new Error("First-run claim answer was not returned");
  const record = data as Record<string, unknown>;
  if (typeof record.granted !== "boolean") throw new Error("First-run claim answer has no grant");
  const reason = record.reason;
  if (reason !== "granted" && reason !== "done" && reason !== "held" && reason !== "window" && reason !== "not_onboarded") {
    throw new Error("First-run claim answer has no known reason");
  }
  if (record.granted !== (reason === "granted")) throw new Error("First-run claim reason disagrees with grant");
  const token = record.token ?? null;
  if (token !== null && typeof token !== "string") throw new Error("First-run claim receipt is not text");
  const sessionId = typeof record.session_id === "string" ? record.session_id : null;
  return { granted: record.granted, reason, token, sessionId, marks: parseFirstRunMarks(record.marks) };
}

interface FinishAnswer {
  /** The server changed the row: for a hand-back, the receipt matched the grant it held. */
  applied: boolean;
  sessionId: string | null;
  marks: FirstRunMarks;
}

export function parseFinishAnswer(data: unknown): FinishAnswer {
  if (!data || typeof data !== "object") throw new Error("First-run finish answer was not returned");
  const record = data as Record<string, unknown>;
  if (typeof record.applied !== "boolean") throw new Error("First-run finish answer has no result");
  const sessionId = typeof record.session_id === "string" ? record.session_id : null;
  return { applied: record.applied, sessionId, marks: parseFirstRunMarks(record.marks) };
}

async function requestClaim(s: FirstRunSession, kind: FirstRunKind): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc("claim_first_run", {
    p_user_id: s.key.ownerId,
    p_kind: kind,
  });
  if (error) throw error;
  const answer = parseClaimAnswer(data);
  if (kind === "ttfv" && answer.granted && !answer.token) throw new Error("First-run grant has no receipt");
  // P3: the server saw this sign-in, and it is still the one in use.
  if (answer.sessionId !== s.key.sessionId || !(await stillCurrent(s))) {
    throw new Error("First-run claim answered for another sign-in");
  }
  adopt(s, answer.marks);
  const slot = s.claims[kind];
  if (slot.state === "pending") {
    // BA-07: a grant for a screen this sign-in learned, while the claim was out,
    // was already gone through (a direct /ttfv showed the review) opens nothing.
    const usable = answer.granted && !firstRunDone(s.marks, kind);
    slot.state = usable ? "granted" : "denied";
    slot.reason = firstRunDone(s.marks, kind) ? "done" : answer.reason;
    if (usable && kind === "ttfv") s.ttfvToken = answer.token;
  }
  return slot.state === "granted";
}

/**
 * Ask once until an authoritative hand-back makes the slot idle again. A second
 * caller while the request is out waits on the same request. True only for a grant that came
 * back in time, for this sign-in.
 */
async function claim(s: FirstRunSession, kind: FirstRunKind): Promise<boolean> {
  const slot = s.claims[kind];
  if (slot.state === "granted") return true;
  if (slot.state !== "idle" && slot.state !== "pending") return false;
  let inflight = slot.inflight;
  if (!inflight) {
    slot.state = "pending";
    slot.reason = null;
    inflight = requestClaim(s, kind);
    slot.inflight = inflight;
    inflight.then(
      () => undefined,
      (error) => {
        // No answer we can use. The grant may have been stored anyway; it
        // stays used (P2, design Q2) rather than being asked for again.
        if (slot.state === "pending") slot.state = "denied";
        warn(`claim ${kind}`, error);
      },
    ).finally(() => {
      if (slot.inflight === inflight) slot.inflight = null;
    });
  }
  try {
    await withTimeout(inflight, FIRST_RUN_TIMEOUT_MS, `First-run claim ${kind}`);
  } catch {
    // Too late: a grant that arrives now is not followed (design 5.2 step 5).
    if (slot.state === "pending") slot.state = "lapsed";
    return false;
  }
  // Read the state afresh: the request settled while this waited.
  return session === s && claimStateOf(slot) === "granted";
}

/**
 * One home visit, start to decision (design 5.2): the sign-in, the marks (one
 * read), then the welcome's grant if it is needed, then the first-day review's
 * grant if it is open. Any failure ends at "home" with nothing opened.
 */
async function decideHomeVisit(ownerId: string, id: number, expectedSessionId?: string | null): Promise<VisitDecision> {
  let key: FirstRunSessionKey | null = null;
  try {
    key = await resolveFirstRunSession(ownerId);
  } catch (error) {
    warn("session", error);
  }
  // A replaced visit must not recreate the older sign-in's store after await.
  if (!home || home.id !== id || home.ownerId !== ownerId) {
    return { gate: "home", retryable: false, sessionId: null, returning: false };
  }
  if (expectedSessionId !== undefined && key && key.sessionId !== expectedSessionId) {
    return { gate: "home", retryable: false, sessionId: expectedSessionId, returning: false };
  }
  if (!key) {
    const failureKey = JSON.stringify([ownerId, expectedSessionId ?? null]);
    const failures = (unresolvedFailures.get(failureKey) ?? 0) + 1;
    unresolvedFailures.set(failureKey, failures);
    // No answer is not a different login: keep the published identity so the
    // failed visit shows home, and a later focus can retry within the same cap.
    return { gate: "home", retryable: failures < FIRST_RUN_MAX_READS, sessionId: expectedSessionId ?? null, returning: false };
  }
  const s = sessionFor(key);
  const sessionId = key.sessionId;
  // BA-08: the first home visit after the review visit the home opened is the
  // return from that review. It does not ask for the review again, even when the
  // review handed its grant back (any later visit may). Cleared once this
  // decision is applied (applyVisit), so a visit replaced before it lands keeps it.
  const returning = s.reviewReturnPending;
  const decided = (gate: FirstRunGate, retryable = false): VisitDecision => ({
    gate,
    retryable,
    sessionId,
    returning,
  });
  // A grant this sign-in already has but whose screen has not opened yet.
  if (s.claims.onboarding.state === "granted") return decided("/onboarding");
  if (s.claims.ttfv.state === "granted") return decided("/ttfv");

  if (!(await ensureMarks(s))) {
    return decided("home", session === s && !s.marks && s.reads < FIRST_RUN_MAX_READS);
  }
  if (session !== s || !s.marks) return decided("home");

  const welcome = s.claims.onboarding.state;
  if (onboardingNeeded(s.marks) && (welcome === "idle" || welcome === "pending")) {
    if (await claim(s, "onboarding")) return decided("/onboarding");
    // Not granted on this visit: another tab holds the welcome right now, or the
    // answer came too late. Do not chain into the first-day review on the same
    // visit (it would open beside, or before, a welcome still on screen); only a
    // welcome that is already finished lets this visit go on to it.
    if (session !== s || !s.marks || s.marks.onboardingCompletedAt === null) {
      return decided("home");
    }
  }

  const review = s.claims.ttfv.state;
  if (!returning && ttfvOpen(s.marks, Date.now()) && (review === "idle" || review === "pending")) {
    if (await claim(s, "ttfv")) return decided("/ttfv");
  }
  return decided("home");
}

function applyVisit(id: number, ownerId: string, result: VisitDecision): void {
  if (!home || home.id !== id || home.ownerId !== ownerId) return;
  // Only the sign-in the decision was made for (D7-02): after a new sign-in of
  // the same account, an older decision opens nothing.
  const s =
    session && session.key.ownerId === ownerId && session.key.sessionId === result.sessionId ? session : null;
  let { gate } = result;
  if (gate === "/onboarding" || gate === "/ttfv") {
    // The home is about to open this screen: the grant is spent on it now, so
    // the next home visit (after the screen) does not open it again. (A grant
    // for a screen already gone through never stays granted: adopt, BA-07.)
    const kind: FirstRunKind = gate === "/onboarding" ? "onboarding" : "ttfv";
    const slot = s ? s.claims[kind] : null;
    if (slot && slot.state === "granted") slot.state = "entered";
    else gate = "home";
  }
  if (s && result.returning) s.reviewReturnPending = false;
  home = { ...home, gate, retryable: gate === "home" && result.retryable, sessionId: result.sessionId };
  publish();
}

/** Start deciding this home visit (the home calls this on mount). The answer arrives through the snapshot. */
export function startFirstRunHomeVisit(ownerId: string, expectedSessionId?: string | null): void {
  if (!ownerId) return;
  const id = ++visitSeq;
  home = { ownerId, id, gate: "wait", retryable: false, sessionId: null, expectedSessionId, rechecking: false };
  publish();
  void decideHomeVisit(ownerId, id, expectedSessionId).then(
    (result) => applyVisit(id, ownerId, result),
    (error) => {
      warn("home visit", error);
      applyVisit(id, ownerId, { gate: "home", retryable: false, sessionId: expectedSessionId ?? null, returning: false });
    },
  );
}

/**
 * Could a home visit of this sign-in open a first-run screen now, going by what
 * it already knows? Synchronous and without a request: the cached marks and the
 * claim slots only. A denied or lapsed slot cannot ask here; only a fresh read
 * proving a normal held refusal was handed back can first make it idle (P2).
 */
function firstRunMayOpen(ownerId: string, nowMs: number): boolean {
  const s = session;
  if (!s || s.key.ownerId !== ownerId || !s.marks) return false;
  if (onboardingNeeded(s.marks) && s.claims.onboarding.state === "idle") return true;
  return ttfvOpen(s.marks, nowMs) && s.claims.ttfv.state === "idle";
}

/**
 * The first-day review is held by a grant this sign-in does not hold (another
 * tab or device has it) and is still in its window. That grant may since have
 * been handed back, which the cached marks never show (a stored grant goes back
 * to NULL here only through this sign-in's own hand-back or a fresh read, gate
 * D7-01). Only normal held refusals qualify alongside never-claimed idle slots.
 */
function reviewHeldElsewhere(s: FirstRunSession, nowMs: number): boolean {
  const marks = s.marks;
  return (
    !!marks &&
    (s.claims.ttfv.state === "idle" || (s.claims.ttfv.state === "denied" && s.claims.ttfv.reason === "held")) &&
    marks.ttfvSeenAt === null &&
    marks.ttfvClaimedAt !== null &&
    isWithinFirstDay(firstDayAnchor(marks), nowMs)
  );
}

/**
 * A focus that, going by what this sign-in knows, can open nothing still checks
 * two things it can only learn by asking. Off screen: no loader unless a new
 * visit starts.
 *   - The sign-in. The same account signed in again (a new session_id, the
 *     owner unchanged) does not change the owner the home is keyed by, so the
 *     older sign-in's decision is decided again for the new one (D7-02).
 *   - A first-day review held elsewhere. One fresh read per focus, with a short
 *     cooldown, adopts a hand-back as the server has it; when the
 *     review is open now, the visit is decided again (D7-01).
 */
function recheckHomeVisit(ownerId: string, id: number): void {
  const checking = home;
  if (!checking || checking.id !== id || checking.rechecking) return;
  checking.rechecking = true;
  const stillHome = (): boolean => !!home && home.id === id && home.ownerId === ownerId && home.gate === "home";
  void (async () => {
    const key = await resolveFirstRunSession(ownerId);
    const visit = home;
    if (!key || !visit || !stillHome()) return;
    if (visit.expectedSessionId !== undefined && visit.expectedSessionId !== key.sessionId) return;
    if (visit.sessionId !== key.sessionId) {
      startFirstRunHomeVisit(ownerId, visit.expectedSessionId);
      return;
    }
    const s = session;
    if (!s || !sameKey(key, s.key) || !reviewHeldElsewhere(s, Date.now())) return;
    if (Date.now() - s.heldReadAt < FIRST_RUN_HELD_COOLDOWN_MS) return;
    s.heldReadAt = Date.now();
    if (!(await ensureMarks(s, true)) || !stillHome()) return;
    if (firstRunMayOpen(ownerId, Date.now())) startFirstRunHomeVisit(ownerId, visit.expectedSessionId);
  })().catch((error) => warn("recheck", error)).finally(() => {
    checking.rechecking = false;
  });
}

/**
 * The home came back into view while it stayed mounted (focus, or the app came
 * to the front while the home is the screen). That is a new home visit (gate
 * BA-03): what an earlier visit decided ("held": another tab had the welcome;
 * a first-day grant since handed back) does not hold it home for good. It is
 * decided again when:
 *   - the last decision stayed home because nothing could be read (up to
 *     FIRST_RUN_MAX_READS failed reads a sign-in), or
 *   - what this sign-in already knows says a screen may open now, or
 *   - the last decision opened a screen (that grant is spent; a new decision
 *     must not open it again).
 * Otherwise nothing changes on screen (no loader), and recheckHomeVisit asks
 * off screen whether the sign-in changed or a review held elsewhere was handed
 * back. The rule that one visit does not go from a held welcome straight on to
 * the first-day review stays in decideHomeVisit. Returns whether a new visit
 * started now.
 */
export function refocusFirstRunHomeVisit(ownerId: string | null): boolean {
  if (!ownerId || !home || home.ownerId !== ownerId || home.gate === "wait") return false;
  if (home.gate === "home" && !home.retryable && !firstRunMayOpen(ownerId, Date.now())) {
    recheckHomeVisit(ownerId, home.id);
    return false;
  }
  startFirstRunHomeVisit(ownerId, home.expectedSessionId);
  return true;
}

/** The home left the screen: its decision does not outlive it. */
export function endFirstRunHomeVisit(ownerId: string): void {
  if (home && home.ownerId === ownerId) {
    home = null;
    publish();
  }
}

/** The home's decision for this owner, as the snapshot holds it. */
export function firstRunHomeGateFor(
  current: FirstRunSnapshot,
  ownerId: string | null,
  ready: boolean,
  sessionId?: string | null,
): FirstRunGate {
  if (!ready || !ownerId || !current.home || current.home.ownerId !== ownerId) return "wait";
  if (sessionId !== undefined && current.home.sessionId !== sessionId) return "wait";
  return current.home.gate;
}

/**
 * The home gate for a signed-in owner whose profile is ready. `drive` = this
 * component decides the visit (the home shell); without it the hook only reads
 * the same decision (the pending-import prompt), and never asks the server.
 */
export function useFirstRunHomeGate(ownerId: string | null, ready: boolean, sessionId: string | null, drive = false): FirstRunGate {
  const current = useSyncExternalStore(subscribeFirstRun, firstRunSnapshot, firstRunSnapshot);
  useEffect(() => {
    if (!drive) return;
    syncFirstRunSession(ownerId, sessionId);
    if (!ready || !ownerId) return;
    startFirstRunHomeVisit(ownerId, sessionId);
    return () => endFirstRunHomeVisit(ownerId);
  }, [drive, ready, ownerId, sessionId]);
  return firstRunHomeGateFor(current, ownerId, ready, sessionId);
}

/**
 * This sign-in's marks, read if they are not known yet. Null when they cannot be
 * known (no sign-in, no answer). For a screen that only needs to know, never to
 * claim: /onboarding opened directly.
 */
export async function loadFirstRunMarks(ownerId: string): Promise<FirstRunMarks | null> {
  const startedSession = session;
  let key: FirstRunSessionKey | null = null;
  try {
    key = await resolveFirstRunSession(ownerId);
  } catch (error) {
    warn("session", error);
  }
  if (!key) return null;
  if (session !== startedSession && (startedSession !== null || !sameKey(key, session?.key ?? null))) return null;
  const s = sessionFor(key);
  return (await ensureMarks(s)) && session === s ? s.marks : null;
}

/**
 * Has this signed-in owner finished the welcome? null while it is being read.
 * The first answer for an owner stays for the life of the screen: finishing the
 * welcome on this screen must not swap the closing slide for a redirect (the
 * screen leaves on its own), and a different owner gets a fresh answer.
 */
export function useAccountOnboardingComplete(ownerId: string | null, ready: boolean): boolean | null {
  const [answer, setAnswer] = useState<{ ownerId: string; complete: boolean } | null>(null);
  const settled = answer !== null && answer.ownerId === ownerId;
  useEffect(() => {
    if (!ready || !ownerId || settled) return;
    let alive = true;
    void loadFirstRunMarks(ownerId).then((marks) => {
      if (alive) setAnswer({ ownerId, complete: !!marks?.onboardingCompletedAt });
    });
    return () => {
      alive = false;
    };
  }, [ownerId, ready, settled]);
  if (!ownerId || !settled) return null;
  return answer.complete;
}

/**
 * Record how a first-run screen ended. One request per (kind, outcome, receipt)
 * at a time: a retry while the first is still out waits on it. Resolves true
 * only when the server stored it for this owner's current sign-in. Never rejects.
 */
export async function finishFirstRun(
  ownerId: string,
  kind: FirstRunKind,
  outcome: OnboardingOutcome | TTFVOutcome,
  token: string | null,
  expectedSessionId?: string | null,
): Promise<boolean> {
  const startedSession = session;
  let key: FirstRunSessionKey | null = null;
  try {
    key = await resolveFirstRunSession(ownerId);
  } catch (error) {
    warn("session", error);
  }
  if (!key || (expectedSessionId !== undefined && key.sessionId !== expectedSessionId)) return false;
  // getSession may have captured s1 before the published login changed to s2.
  // Do not recreate s1 or send its receipt under the newer login after await.
  if (session !== startedSession && (startedSession !== null || !sameKey(key, session?.key ?? null))) return false;
  const s = sessionFor(key);
  const flight = `${kind}:${outcome}:${token ?? ""}`;
  let inflight = s.finishing.get(flight);
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await getSupabaseClient().rpc("finish_first_run", {
        p_user_id: s.key.ownerId,
        p_kind: kind,
        p_outcome: outcome,
        p_token: token,
      });
      if (error) throw error;
      const answer = parseFinishAnswer(data);
      if (answer.sessionId !== s.key.sessionId || !(await stillCurrent(s))) {
        throw new Error("First-run finish answered for another sign-in");
      }
      adopt(s, answer.marks, outcome === "not_shown");
      if (kind === "ttfv" && outcome === "not_shown" && answer.applied) reopenFirstDay(s, token);
      return answer.marks;
    })();
    s.finishing.set(flight, inflight);
    inflight.then(
      () => undefined,
      (error) => warn(`finish ${kind} ${outcome}`, error),
    ).finally(() => {
      if (s.finishing.get(flight) === inflight) s.finishing.delete(flight);
    });
  }
  try {
    await withTimeout(inflight, FIRST_RUN_TIMEOUT_MS, `First-run finish ${kind}`);
    return session === s;
  } catch {
    return false;
  }
}

/**
 * The server applied a hand-back of the first-day grant this sign-in holds, with
 * that grant's own receipt (gate BA-01, FR-01): the slot may ask again on a later
 * home visit, every time it is handed back (gate BA-08), and the receipt is gone.
 * The home visit that is the return from that review does not ask (BA-08,
 * decideHomeVisit). A hand-back of any other grant (an older receipt, another
 * sign-in's) changes nothing here.
 */
function reopenFirstDay(s: FirstRunSession, token: string | null): void {
  const slot = s.claims.ttfv;
  if (!token || s.ttfvToken !== token || slot.state !== "visiting") return;
  s.ttfvToken = null;
  slot.state = "idle";
}

/**
 * The receipt of the first-day grant the home just opened /ttfv with, handed to
 * the ONE screen visit that takes it first: the visit the home opened (gate
 * BA-02). Every later take gets null, so a /ttfv opened any other way (its
 * address typed in, a reload, the screen opened again in the same app) has no
 * grant to hand back, even when the first visit showed content and its report
 * never reached the server.
 */
export function takeFirstRunTTFVToken(ownerId: string | null, sessionId?: string | null): string | null {
  if (sessionId !== undefined && session?.key.sessionId !== sessionId) {
    syncFirstRunSession(ownerId, sessionId);
    return null;
  }
  if (!ownerId || !session || session.key.ownerId !== ownerId) return null;
  const slot = session.claims.ttfv;
  if (slot.state !== "entered" || !session.ttfvToken) return null;
  slot.state = "visiting";
  // The next home visit decided is the return from this review (BA-08).
  session.reviewReturnPending = true;
  return session.ttfvToken;
}

export function __resetFirstRunForTests(): void {
  session = null;
  unresolvedFailures.clear();
  home = null;
  visitSeq = 0;
  snapshot = { home: null };
  listeners.clear();
}
