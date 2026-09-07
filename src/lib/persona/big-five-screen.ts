import type { CreateRecordArgs } from "@/lib/records/create";

import {
  BFI_ITEMS,
  TRAIT_LABEL_EN,
  TRAIT_LABEL_KO,
  bfiMeanToPercent,
  scoreBfi,
  type BfiResponses,
} from "./bfi";

export type BfiLocale = "en" | "ko";

export const BFI_PAGE_SIZE = 5;
export const BFI_PAGE_COUNT = Math.ceil(BFI_ITEMS.length / BFI_PAGE_SIZE);

export function bfiPageIndices(page: number): number[] {
  const safePage = Math.max(0, Math.min(BFI_PAGE_COUNT - 1, Math.trunc(page)));
  const start = safePage * BFI_PAGE_SIZE;
  const end = Math.min(BFI_ITEMS.length, start + BFI_PAGE_SIZE);
  return Array.from({ length: end - start }, (_, offset) => start + offset);
}

// This is the existing BFI-44 five-point scale, moved out of the route so the
// legacy and PIXEL-CLAY renderers use one copy without changing its wording.
export const BFI_SCALE: readonly { value: number; en: string; ko: string }[] = [
  { value: 1, en: "Strongly disagree", ko: "전혀 아니다" },
  { value: 2, en: "Disagree", ko: "아니다" },
  { value: 3, en: "Neither", ko: "보통" },
  { value: 4, en: "Agree", ko: "그렇다" },
  { value: 5, en: "Strongly agree", ko: "매우 그렇다" },
];

const SURVEY_COPY = {
  en: {
    intro:
      'A validated self-report measure of the five main personality dimensions. Rate each "I see myself as someone who…" statement from 1 (strongly disagree) to 5 (strongly agree). No right answers. Split across 9 pages, 5 items each.',
    citation: "John, Donahue, & Kentle (1991) · public domain",
    instruction: 'How well does each statement describe you? "I see myself as someone who…"',
    failure: "Couldn't save. Your answers are still here; please try again.",
    exit: "Are you sure you want to exit? Your progress will not be saved.",
  },
  ko: {
    intro:
      '성격의 5가지 큰 축을 재는 검증된 자기보고 도구입니다. "이런 사람이다" 라는 문장에 1(전혀 아니다) ~ 5(매우 그렇다)로 답해 주세요. 정답은 없어요. 한 페이지에 5문항씩, 9페이지로 나눠집니다.',
    citation: "John, Donahue, & Kentle (1991) · public domain",
    instruction: "다음 문장이 당신과 얼마나 맞는지 골라주세요. 「나는 …」",
    failure: "저장하지 못했어요. 답변은 그대로 남아 있으니 다시 시도해 주세요.",
    exit: "정말 성격 검사를 종료하시겠습니까? 작성 중이던 답변이 저장되지 않고 사라집니다.",
  },
} as const;

export function bfiSurveyCopy(locale: BfiLocale) {
  return SURVEY_COPY[locale];
}

export interface LatestBfiMeans {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface BfiLensTraits {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export function mapLatestBfiToTraits(latest: LatestBfiMeans): BfiLensTraits {
  return {
    openness: bfiMeanToPercent(latest.openness),
    conscientiousness: bfiMeanToPercent(latest.conscientiousness),
    extraversion: bfiMeanToPercent(latest.extraversion),
    agreeableness: bfiMeanToPercent(latest.agreeableness),
    neuroticism: bfiMeanToPercent(latest.neuroticism),
  };
}

export type BfiLoadResult =
  | { status: "ready"; traits: BfiLensTraits }
  | { status: "empty" }
  | { status: "error" }
  | { status: "timeout" };

const TIMEOUT = Symbol("bfi-timeout");

export interface BfiReadGate {
  loading: boolean;
  userId: string | null;
  hasProfile: boolean | null;
  profileProbeFailed: boolean;
}

/** The profile answer must be confirmed before the records table is touched. */
export function bfiReadOwner(gate: BfiReadGate): string | null {
  if (
    gate.loading ||
    gate.userId === null ||
    gate.hasProfile !== true ||
    gate.profileProbeFailed
  ) {
    return null;
  }
  return gate.userId;
}

/**
 * Turn the single BFI read authority into explicit UI states. The rejected
 * value is intentionally discarded: database details never become screen or
 * accessibility state. Promise.race attaches a rejection observer to the
 * underlying read, so a late rejection after timeout is not unhandled.
 */
export async function loadBfiLensWithTimeout(
  load: () => Promise<LatestBfiMeans | null>,
  timeoutMs: number,
): Promise<BfiLoadResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const latest = await Promise.race([
      load(),
      new Promise<typeof TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
      }),
    ]);
    if (latest === TIMEOUT) return { status: "timeout" };
    if (latest === null) return { status: "empty" };
    return { status: "ready", traits: mapLatestBfiToTraits(latest) };
  } catch {
    return { status: "error" };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export type BfiLensSnapshot =
  | { status: "idle"; ownerId: null }
  | { status: "loading" | "error" | "timeout" | "empty"; ownerId: string }
  | { status: "ready"; ownerId: string; traits: BfiLensTraits };

/** Never render an owner's lens snapshot under a different session. */
export function visibleBfiLensSnapshot(
  snapshot: BfiLensSnapshot,
  activeOwnerId: string | null,
): BfiLensSnapshot {
  if (activeOwnerId === null) return { status: "idle", ownerId: null };
  if (snapshot.ownerId !== activeOwnerId) return { status: "loading", ownerId: activeOwnerId };
  return snapshot;
}

export interface BfiOwnerTicket {
  ownerId: string;
  generation: number;
}

/** Generation ticket for reads; only the newest request for the active owner settles. */
export class BfiOwnerRequestGuard {
  private generation = 0;
  private ownerId: string | null = null;

  begin(ownerId: string): BfiOwnerTicket {
    this.ownerId = ownerId;
    this.generation += 1;
    return { ownerId, generation: this.generation };
  }

  isCurrent(ticket: BfiOwnerTicket, activeOwnerId: string | null): boolean {
    return (
      activeOwnerId !== null &&
      ticket.ownerId === activeOwnerId &&
      ticket.ownerId === this.ownerId &&
      ticket.generation === this.generation
    );
  }

  settle(ticket: BfiOwnerTicket, activeOwnerId: string | null): boolean {
    if (!this.isCurrent(ticket, activeOwnerId)) return false;
    this.generation += 1;
    return true;
  }

  cancel(ticket: BfiOwnerTicket): void {
    if (ticket.ownerId === this.ownerId && ticket.generation === this.generation) {
      this.generation += 1;
    }
  }

  invalidate(): void {
    this.ownerId = null;
    this.generation += 1;
  }
}

export interface BfiSubmitTicket {
  ownerId: string;
  generation: number;
}

/** Ref-backed, same-frame-safe submit lock. React state is display only. */
export class BfiOwnerSubmitLock {
  private generation = 0;
  private active: BfiSubmitTicket | null = null;

  acquire(ownerId: string): BfiSubmitTicket | null {
    if (this.active !== null) return null;
    const ticket = { ownerId, generation: ++this.generation };
    this.active = ticket;
    return ticket;
  }

  isCurrent(ticket: BfiSubmitTicket, activeOwnerId: string | null): boolean {
    return (
      activeOwnerId !== null &&
      this.active !== null &&
      this.active.ownerId === ticket.ownerId &&
      this.active.generation === ticket.generation &&
      ticket.ownerId === activeOwnerId
    );
  }

  release(ticket: BfiSubmitTicket): void {
    if (
      this.active?.ownerId === ticket.ownerId &&
      this.active.generation === ticket.generation
    ) {
      this.active = null;
    }
  }

  invalidate(): void {
    this.active = null;
    this.generation += 1;
  }
}

/** Prevents a timer, modal callback and double tap from completing twice. */
export class OneShotGate {
  private used = false;
  private active = true;

  enter(): boolean {
    if (!this.active || this.used) return false;
    this.used = true;
    return true;
  }

  invalidate(): void {
    this.active = false;
  }
}

export type BfiOwnerSaveOutcome = "saved" | "failed" | "stale" | "locked" | "incomplete";

/**
 * The one write controller used by both skins. Acquisition and `write()` begin
 * synchronously, so two same-frame calls cannot both reach the database. A
 * successful ticket deliberately stays locked until its owner view unmounts;
 * only a current-owner failure releases it for retry.
 */
export async function saveBfiForOwner({
  ownerId,
  locale,
  responses,
  lock,
  getActiveOwnerId,
  onAcquired,
  write,
}: {
  ownerId: string;
  locale: BfiLocale;
  responses: BfiResponses;
  lock: BfiOwnerSubmitLock;
  getActiveOwnerId: () => string | null;
  onAcquired: () => void;
  write: (payload: CreateRecordArgs) => Promise<unknown>;
}): Promise<BfiOwnerSaveOutcome> {
  const payload = buildBfiRecordArgs(ownerId, locale, responses);
  if (payload === null) return "incomplete";
  if (getActiveOwnerId() !== ownerId) return "stale";

  const ticket = lock.acquire(ownerId);
  if (ticket === null) return "locked";

  try {
    onAcquired();
    await write(payload);
    if (!lock.isCurrent(ticket, getActiveOwnerId())) return "stale";
    return "saved";
  } catch {
    if (!lock.isCurrent(ticket, getActiveOwnerId())) return "stale";
    lock.release(ticket);
    return "failed";
  }
}

export type BfiOwnerCompletionOutcome = "completed" | "nudged" | "stale" | "duplicate";

/** Current-owner validation intentionally precedes one-shot consumption. */
export function completeBfiForOwner({
  ownerId,
  getActiveOwnerId,
  gate,
  consumeNudge,
  onNudge,
  onComplete,
}: {
  ownerId: string;
  getActiveOwnerId: () => string | null;
  gate: OneShotGate;
  consumeNudge: () => boolean;
  onNudge: () => void;
  onComplete: () => void;
}): BfiOwnerCompletionOutcome {
  if (getActiveOwnerId() !== ownerId) return "stale";
  if (!gate.enter()) return "duplicate";
  let shouldNudge = false;
  try {
    shouldNudge = consumeNudge();
  } catch {
    onComplete();
    return "completed";
  }
  if (shouldNudge) {
    onNudge();
    return "nudged";
  }
  onComplete();
  return "completed";
}

export type BfiOwnerRefreshOutcome = "complete" | "stale" | "locked";

/** Same-frame-safe profile retry; refresh rejection is a sanitized, retryable completion. */
export async function refreshBfiProfileForOwner({
  ownerId,
  lock,
  getActiveOwnerId,
  onAcquired,
  refresh,
}: {
  ownerId: string;
  lock: BfiOwnerSubmitLock;
  getActiveOwnerId: () => string | null;
  onAcquired: () => void;
  refresh: () => Promise<void>;
}): Promise<BfiOwnerRefreshOutcome> {
  if (getActiveOwnerId() !== ownerId) return "stale";
  const ticket = lock.acquire(ownerId);
  if (ticket === null) return "locked";

  try {
    onAcquired();
    await refresh();
  } catch {
    // AuthContext owns the probe-failure state. Raw errors stay out of UI/logs.
  }
  if (!lock.isCurrent(ticket, getActiveOwnerId())) return "stale";
  lock.release(ticket);
  return "complete";
}

/** Existing exact createRecord shape shared by legacy and PIXEL-CLAY renderers. */
export function buildBfiRecordArgs(
  userId: string,
  locale: BfiLocale,
  responses: BfiResponses,
): CreateRecordArgs | null {
  const result = scoreBfi(responses);
  if (!result.complete) return null;

  const labels = locale === "ko" ? TRAIT_LABEL_KO : TRAIT_LABEL_EN;
  const summary = result.scores
    .map((score) => `${labels[score.trait]}: ${score.score.toFixed(1)}/5`)
    .join("  ·  ");
  const top = [...result.scores].sort((a, b) => b.score - a.score)[0];
  const conclusion =
    locale === "ko"
      ? `오늘 가장 높은 점수: ${labels[top.trait]} (${top.score.toFixed(1)}/5)`
      : `Highest score today: ${labels[top.trait]} (${top.score.toFixed(1)}/5)`;

  return {
    userId,
    locale,
    kind: "note",
    body: JSON.stringify({ bfi_responses: responses, scores: result.byTrait }),
    topic: locale === "ko" ? "Big Five (BFI-44) 평가" : "Big Five (BFI-44) assessment",
    summary,
    conclusion,
    tags: ["big_five", "bfi", "assessment"],
    withFollowup: false,
  };
}
