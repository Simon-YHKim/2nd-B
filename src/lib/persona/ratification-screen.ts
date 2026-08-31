// Pure `/ratifications` orchestration.
//
// The screen is an owner-scoped, read-only projection of star_tier_history.
// Keeping the gate, request ticket, accepted-only filter, and locale time rules
// here makes those privacy/honesty boundaries executable without mounting RN.

import { buildRatificationLog, type RatificationEntry } from "./brightness-timeline";
import { loadTierObservationsResult, type TierObservationsResult } from "./load-tier-observations";

export type RatificationAuthGate =
  | "auth-loading"
  | "signed-out"
  | "profile-loading"
  | "profile-error"
  | "profile-incomplete"
  | "ready";

export interface RatificationAuthSnapshot {
  loading: boolean;
  userId: string | null;
  hasProfile: boolean | null;
  profileProbeFailed: boolean;
}

export function ratificationAuthGate(snapshot: RatificationAuthSnapshot): RatificationAuthGate {
  if (snapshot.loading) return "auth-loading";
  if (!snapshot.userId) return "signed-out";
  if (snapshot.profileProbeFailed) return "profile-error";
  if (snapshot.hasProfile === null) return "profile-loading";
  if (snapshot.hasProfile === false) return "profile-incomplete";
  return "ready";
}

type TierObservationReader = (ownerId: string) => Promise<TierObservationsResult>;

/** The gate lives inside the read boundary too, so a caller cannot query early by accident. */
export async function loadRatificationsForGate(
  gate: RatificationAuthGate,
  ownerId: string | null,
  read: TierObservationReader = loadTierObservationsResult,
): Promise<TierObservationsResult | null> {
  if (gate !== "ready" || !ownerId) return null;
  return read(ownerId);
}

export interface RatificationReadTicket {
  ownerId: string;
  requestId: number;
}

export type RatificationReadStatus = "idle" | "loading" | "error" | "timeout" | "ready";

export interface RatificationReadState {
  ownerId: string | null;
  requestId: number;
  status: RatificationReadStatus;
  /** `null` means no successful snapshot yet; `[]` is a genuine ready-empty snapshot. */
  entries: RatificationEntry[] | null;
}

export const initialRatificationReadState: RatificationReadState = {
  ownerId: null,
  requestId: 0,
  status: "idle",
  entries: null,
};

/** Begin a read without blanking a successful snapshot for the same owner. */
export function beginRatificationRead(
  previous: RatificationReadState,
  ticket: RatificationReadTicket,
): RatificationReadState {
  return {
    ownerId: ticket.ownerId,
    requestId: ticket.requestId,
    status: "loading",
    entries: previous.ownerId === ticket.ownerId ? previous.entries : null,
  };
}

/** Publish only into the exact owner/request state that began the read. */
export function finishRatificationRead(
  previous: RatificationReadState,
  ticket: RatificationReadTicket,
  result: TierObservationsResult,
): RatificationReadState {
  if (previous.ownerId !== ticket.ownerId || previous.requestId !== ticket.requestId)
    return previous;
  if (result.status === "ready") {
    return {
      ...previous,
      status: "ready",
      entries: buildRatificationLog(result.observations),
    };
  }
  return { ...previous, status: result.status };
}

export function canPublishRatificationRead(
  ticket: RatificationReadTicket,
  currentOwnerId: string | null,
  currentRequestId: number,
  mounted: boolean,
): boolean {
  return mounted && currentOwnerId === ticket.ownerId && currentRequestId === ticket.requestId;
}

export type RatificationFilter = "all" | "ratified" | "held" | "declined";

/** Only accepted observations exist in this persisted ledger. */
export function filterRatificationEntries(
  entries: readonly RatificationEntry[],
  filter: RatificationFilter,
  showUnchanged: boolean,
): RatificationEntry[] {
  if (filter === "held" || filter === "declined") return [];
  return entries.filter(
    (entry) => showUnchanged || entry.prevLevel === null || entry.prevLevel !== entry.level,
  );
}

export function ratificationSummary(entries: readonly RatificationEntry[]): {
  proposed: number;
  ratified: number;
  held: 0;
  declined: 0;
} {
  return {
    // Every landed acceptance came through a proposal/recompute, but the
    // persisted ledger contains no separate pending proposal rows.
    proposed: entries.length,
    ratified: entries.length,
    held: 0,
    declined: 0,
  };
}

export type RatificationOriginKey = "originRatify" | "originRebuild" | "originRecorded";

/** Allowlisted display projection; internal origins never reach UI/a11y. */
export function ratificationOriginKey(origin: string | null): RatificationOriginKey {
  if (origin === "ratify") return "originRatify";
  if (origin === "rebuild") return "originRebuild";
  return "originRecorded";
}

type TimeTranslator = (key: string, options?: { count?: number }) => string;

/** Locale-aware terse time label. Malformed database timestamps stay hidden. */
export function ratificationTimeLabel(
  iso: string,
  nowMs: number,
  locale: string,
  translate: TimeTranslator,
): string | null {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const minutes = Math.max(0, Math.floor((nowMs - then) / 60_000));
  if (minutes < 1) return translate("deepspace:time.now");
  if (minutes < 60) return translate("deepspace:time.minsAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate("deepspace:time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return translate("deepspace:time.daysAgo", { count: days });
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(then));
  } catch {
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(then));
  }
}
