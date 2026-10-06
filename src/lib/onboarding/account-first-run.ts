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
//       BA-01), up to FIRST_RUN_MAX_GRANTS times.
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
/** Reads per sign-in. A failed read leaves the home without auto-entry; the next home entry may read again. */
export const FIRST_RUN_MAX_READS = 3;
/** The first-day window: the review opens by itself only within 24h of the welcome. */
export const FIRST_DAY_MS = 24 * 60 * 60 * 1000;
/**
 * First-day grants per sign-in. A grant its own visit handed back may be asked
 * for again on a later home visit (P5), but a review that keeps failing to load
 * must not keep pulling the home back to it: after this many grants the home
 * stays home for the rest of the sign-in (the same three tries as the reads).
 */
export const FIRST_RUN_MAX_GRANTS = 3;

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

interface ClaimSlot {
  state: ClaimState;
  /** The request itself, until it settles (not until its wait times out). */
  inflight: Promise<boolean> | null;
  /** Grants this sign-in received for this kind (FIRST_RUN_MAX_GRANTS). */
  grants: number;
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
  claims: Record<FirstRunKind, ClaimSlot>;
  ttfvToken: string | null;
  finishing: Map<string, Promise<FirstRunMarks>>;
}

interface HomeVisit {
  ownerId: string;
  id: number;
  gate: FirstRunGate;
  /** The visit stayed home because nothing could be read, so a later entry may try again. */
  retryable: boolean;
}

export interface FirstRunSnapshot {
  home: HomeVisit | null;
}

let session: FirstRunSession | null = null;
/** Read failures before any session was known (getSession failed), per owner. */
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
    claims: {
      onboarding: { state: "idle", inflight: null, grants: 0 },
      ttfv: { state: "idle", inflight: null, grants: 0 },
    },
    ttfvToken: null,
    finishing: new Map(),
  };
  return session;
}

function adopt(s: FirstRunSession, marks: FirstRunMarks, release = false): void {
  s.marks = mergeFirstRunMarks(s.marks, marks, release);
}

async function requestMarks(s: FirstRunSession): Promise<FirstRunMarks> {
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
  adopt(s, marks);
  return marks;
}

/** Read once per sign-in (up to FIRST_RUN_MAX_READS on failure). Never overlaps itself. Never rejects. */
async function ensureMarks(s: FirstRunSession): Promise<boolean> {
  if (s.marks) return true;
  let inflight = s.reading;
  if (!inflight) {
    if (s.reads >= FIRST_RUN_MAX_READS) return false;
    s.reads += 1;
    inflight = requestMarks(s);
    s.reading = inflight;
    inflight.then(
      () => undefined,
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
  token: string | null;
  sessionId: string | null;
  marks: FirstRunMarks;
}

/** Strict shape check of claim_first_run's answer. */
export function parseClaimAnswer(data: unknown): ClaimAnswer {
  if (!data || typeof data !== "object") throw new Error("First-run claim answer was not returned");
  const record = data as Record<string, unknown>;
  if (typeof record.granted !== "boolean") throw new Error("First-run claim answer has no grant");
  const token = record.token ?? null;
  if (token !== null && typeof token !== "string") throw new Error("First-run claim receipt is not text");
  const sessionId = typeof record.session_id === "string" ? record.session_id : null;
  return { granted: record.granted, token, sessionId, marks: parseFirstRunMarks(record.marks) };
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
    slot.state = answer.granted ? "granted" : "denied";
    if (answer.granted) slot.grants += 1;
    if (answer.granted && kind === "ttfv") s.ttfvToken = answer.token;
  }
  return slot.state === "granted";
}

/**
 * Ask for this kind's grant at most once per sign-in. A second caller while the
 * request is out waits on the same request. True only for a grant that came
 * back in time, for this sign-in.
 */
async function claim(s: FirstRunSession, kind: FirstRunKind): Promise<boolean> {
  const slot = s.claims[kind];
  if (slot.state === "granted") return true;
  if (slot.state !== "idle" && slot.state !== "pending") return false;
  let inflight = slot.inflight;
  if (!inflight) {
    slot.state = "pending";
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
async function decideHomeVisit(ownerId: string): Promise<{ gate: FirstRunGate; retryable: boolean }> {
  let key: FirstRunSessionKey | null = null;
  try {
    key = await resolveFirstRunSession(ownerId);
  } catch (error) {
    warn("session", error);
  }
  if (!key) {
    const failures = (unresolvedFailures.get(ownerId) ?? 0) + 1;
    unresolvedFailures.set(ownerId, failures);
    return { gate: "home", retryable: failures < FIRST_RUN_MAX_READS };
  }
  const s = sessionFor(key);
  // A grant this sign-in already has but whose screen has not opened yet.
  if (s.claims.onboarding.state === "granted") return { gate: "/onboarding", retryable: false };
  if (s.claims.ttfv.state === "granted") return { gate: "/ttfv", retryable: false };

  if (!(await ensureMarks(s))) {
    return { gate: "home", retryable: session === s && !s.marks && s.reads < FIRST_RUN_MAX_READS };
  }
  if (session !== s || !s.marks) return { gate: "home", retryable: false };

  const welcome = s.claims.onboarding.state;
  if (onboardingNeeded(s.marks) && (welcome === "idle" || welcome === "pending")) {
    if (await claim(s, "onboarding")) return { gate: "/onboarding", retryable: false };
    // Not granted on this visit: another tab holds the welcome right now, or the
    // answer came too late. Do not chain into the first-day review on the same
    // visit (it would open beside, or before, a welcome still on screen); only a
    // welcome that is already finished lets this visit go on to it.
    if (session !== s || !s.marks || s.marks.onboardingCompletedAt === null) {
      return { gate: "home", retryable: false };
    }
  }

  const review = s.claims.ttfv.state;
  if (ttfvOpen(s.marks, Date.now()) && (review === "idle" || review === "pending")) {
    if (await claim(s, "ttfv")) return { gate: "/ttfv", retryable: false };
  }
  return { gate: "home", retryable: false };
}

function applyVisit(id: number, ownerId: string, result: { gate: FirstRunGate; retryable: boolean }): void {
  if (!home || home.id !== id || home.ownerId !== ownerId) return;
  let { gate } = result;
  if (gate === "/onboarding" || gate === "/ttfv") {
    // The home is about to open this screen: the grant is spent on it now, so
    // the next home visit (after the screen) does not open it again.
    const kind: FirstRunKind = gate === "/onboarding" ? "onboarding" : "ttfv";
    const slot = session && session.key.ownerId === ownerId ? session.claims[kind] : null;
    if (slot && slot.state === "granted") slot.state = "entered";
    else gate = "home";
  }
  home = { ...home, gate, retryable: gate === "home" && result.retryable };
  publish();
}

/** Start deciding this home visit (the home calls this on mount). The answer arrives through the snapshot. */
export function startFirstRunHomeVisit(ownerId: string): void {
  if (!ownerId) return;
  const id = ++visitSeq;
  home = { ownerId, id, gate: "wait", retryable: false };
  publish();
  void decideHomeVisit(ownerId).then(
    (result) => applyVisit(id, ownerId, result),
    (error) => {
      warn("home visit", error);
      applyVisit(id, ownerId, { gate: "home", retryable: false });
    },
  );
}

/**
 * Could a home visit of this sign-in open a first-run screen now, going by what
 * it already knows? Synchronous and without a request: the cached marks and the
 * claim slots only. A denied or lapsed slot never asks again (P2).
 */
function firstRunMayOpen(ownerId: string, nowMs: number): boolean {
  const s = session;
  if (!s || s.key.ownerId !== ownerId || !s.marks) return false;
  if (onboardingNeeded(s.marks) && s.claims.onboarding.state === "idle") return true;
  return ttfvOpen(s.marks, nowMs) && s.claims.ttfv.state === "idle";
}

/**
 * The home came back into view while it stayed mounted (focus, or the app came
 * to the front while the home is the screen). That is a new home visit (gate
 * BA-03): what an earlier visit decided ("held": another tab had the welcome;
 * a first-day grant since handed back) does not hold it home for good. It is
 * decided again when:
 *   - the last decision stayed home because nothing could be read (up to
 *     FIRST_RUN_MAX_READS reads a sign-in), or
 *   - what this sign-in already knows says a screen may open now, or
 *   - the last decision opened a screen (that grant is spent; a new decision
 *     must not open it again).
 * Otherwise nothing changes on screen (no loader). The rule that one visit does
 * not go from a held welcome straight on to the first-day review stays in
 * decideHomeVisit. Returns whether a new visit started.
 */
export function refocusFirstRunHomeVisit(ownerId: string | null): boolean {
  if (!ownerId || !home || home.ownerId !== ownerId || home.gate === "wait") return false;
  if (home.gate === "home" && !home.retryable && !firstRunMayOpen(ownerId, Date.now())) return false;
  startFirstRunHomeVisit(ownerId);
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
): FirstRunGate {
  if (!ready || !ownerId || !current.home || current.home.ownerId !== ownerId) return "wait";
  return current.home.gate;
}

/**
 * The home gate for a signed-in owner whose profile is ready. `drive` = this
 * component decides the visit (the home shell); without it the hook only reads
 * the same decision (the pending-import prompt), and never asks the server.
 */
export function useFirstRunHomeGate(ownerId: string | null, ready: boolean, drive = false): FirstRunGate {
  const current = useSyncExternalStore(subscribeFirstRun, firstRunSnapshot, firstRunSnapshot);
  useEffect(() => {
    if (!drive || !ready || !ownerId) return;
    startFirstRunHomeVisit(ownerId);
    return () => endFirstRunHomeVisit(ownerId);
  }, [drive, ready, ownerId]);
  return firstRunHomeGateFor(current, ownerId, ready);
}

/**
 * This sign-in's marks, read if they are not known yet. Null when they cannot be
 * known (no sign-in, no answer). For a screen that only needs to know, never to
 * claim: /onboarding opened directly.
 */
export async function loadFirstRunMarks(ownerId: string): Promise<FirstRunMarks | null> {
  let key: FirstRunSessionKey | null = null;
  try {
    key = await resolveFirstRunSession(ownerId);
  } catch (error) {
    warn("session", error);
  }
  if (!key) return null;
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
): Promise<boolean> {
  let key: FirstRunSessionKey | null = null;
  try {
    key = await resolveFirstRunSession(ownerId);
  } catch (error) {
    warn("session", error);
  }
  if (!key) return false;
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
 * home visit, and the receipt is gone. A hand-back of any other grant (an older
 * receipt, another sign-in's) changes nothing here. After FIRST_RUN_MAX_GRANTS
 * grants the slot stays used for the rest of the sign-in.
 */
function reopenFirstDay(s: FirstRunSession, token: string | null): void {
  const slot = s.claims.ttfv;
  if (!token || s.ttfvToken !== token || slot.state !== "visiting") return;
  s.ttfvToken = null;
  slot.state = slot.grants < FIRST_RUN_MAX_GRANTS ? "idle" : "denied";
}

/**
 * The receipt of the first-day grant the home just opened /ttfv with, handed to
 * the ONE screen visit that takes it first: the visit the home opened (gate
 * BA-02). Every later take gets null, so a /ttfv opened any other way (its
 * address typed in, a reload, the screen opened again in the same app) has no
 * grant to hand back, even when the first visit showed content and its report
 * never reached the server.
 */
export function takeFirstRunTTFVToken(ownerId: string | null): string | null {
  if (!ownerId || !session || session.key.ownerId !== ownerId) return null;
  const slot = session.claims.ttfv;
  if (slot.state !== "entered" || !session.ttfvToken) return null;
  slot.state = "visiting";
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
