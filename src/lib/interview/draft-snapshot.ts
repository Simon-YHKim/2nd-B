import type { Coverage, DrillLayer, LifePeriod } from "./probe";
import { isUneditedOpener, type OpenerSelection } from "./opener-selection";
import { HOTLINES, type HotlineId } from "../safety/lexicon";
import {
  copyInterviewDraftContent, INTERVIEW_DRAFT_MAX_BYTES, INTERVIEW_DRAFT_TTL_MS,
  validInterviewDraftOwner, type InterviewDraftTurn,
} from "./draft-codec";

/** Dormant v2 contract. The existing native v1 store does not read or write it. */
export interface InterviewStableSnapshot {
  turns: InterviewDraftTurn[];
  draft: string;
  openerSelection?: OpenerSelection;
  inputRevision: number;
  pendingLayer: DrillLayer | null;
  openers: string[];
  stuckStreak: number;
  abandoned: DrillLayer[];
  concreteOnly: boolean;
  phase: "active" | "ended" | "crisis-ended";
  // Explicit at the future writer, never inferred from a failed request or a null verdict.
  endReason: "user-stop" | "scene-complete" | "local-exhausted" | "crisis" | null;
  /** Observed route only, not a pending dialog or permission to re-publish it. */
  crisisHotline: HotlineId | null;
  notice: "drill.emptyAnswer" | "drill.dayLimit" | "drill.failed" | "drill.loopNote" | "drill.scaffoldNote" | null;
  coverage: { base: Coverage; current: Coverage; baseline: "confirmed" | "unconfirmed" };
}

export type InterviewPendingSnapshot = null | {
  kind: "request";
  requestId: string;
  submittedAnswer: string;
  inputRevision: number;
  before: InterviewStableSnapshot;
} | {
  kind: "save";
  status: "pending" | "unknown";
  intent: {
    requestId: string;
    sessionId: string;
    draftId: string;
    revision: number;
    contentGeneration: string;
    snapshot: InterviewStableSnapshot;
  };
};

export interface InterviewDraftSnapshot {
  v: 2;
  ownerId: string;
  draftId: string;
  revision: number;
  createdAt: number;
  expiresAt: number;
  contentGeneration: string;
  period: LifePeriod;
  uiLanguage: "ko" | "en" | "es" | "pt" | "id";
  conversationLocale: "ko" | "en";
  growthOrigin: boolean;
  state: InterviewStableSnapshot;
  pending: InterviewPendingSnapshot;
}

// Type-only product imports keep storage independent of the LLM module.
const periods: Record<LifePeriod, true> = {
  infancy: true, school: true, twenties: true, later: true, work: true, now: true,
};
const layers: Record<DrillLayer, true> = {
  fact: true, feeling: true, meaning: true, belief: true, echo: true,
};
const notices: readonly unknown[] = [null, "drill.emptyAnswer", "drill.dayLimit", "drill.failed", "drill.loopNote", "drill.scaffoldNote"];
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}
function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}
function id(value: unknown): value is string {
  return typeof value === "string" && validInterviewDraftOwner(value);
}
function layer(value: unknown): value is DrillLayer {
  return typeof value === "string" && Object.hasOwn(layers, value);
}
function matrix(value: unknown): value is Coverage {
  return object(value) && keys(value, Object.keys(periods)) && Object.keys(periods).every(period => {
    const row = value[period];
    return object(row) && keys(row, Object.keys(layers)) && Object.keys(layers).every(key => integer(row[key]));
  });
}
function state(value: unknown, root: Record<string, unknown>): value is InterviewStableSnapshot {
  if (!object(value) || !keys(value, ["turns", "draft", "openerSelection", "inputRevision", "pendingLayer", "openers",
    "stuckStreak", "abandoned", "concreteOnly", "phase", "endReason", "crisisHotline", "notice", "coverage"])) return false;
  // Reuse v1's strict turn validation, including missing/false/null distinctions.
  try {
    copyInterviewDraftContent({ period: root.period, locale: root.uiLanguage,
      growthOrigin: root.growthOrigin, phase: value.phase, turns: value.turns,
      draft: value.draft, openerSelection: value.openerSelection } as Parameters<typeof copyInterviewDraftContent>[0]);
  } catch { return false; }
  if (!["active", "ended", "crisis-ended"].includes(value.phase as string)
    || !integer(value.inputRevision) || !(value.pendingLayer === null || layer(value.pendingLayer))
    || !Array.isArray(value.openers) || !value.openers.every(item => typeof item === "string")
    || !integer(value.stuckStreak) || !Array.isArray(value.abandoned) || !value.abandoned.every(layer)
    || new Set(value.abandoned).size !== value.abandoned.length
    || typeof value.concreteOnly !== "boolean" || !notices.includes(value.notice)) return false;
  if (value.openerSelection !== undefined && !isUneditedOpener(value.openerSelection, value.draft as string,
    value.turns as InterviewDraftTurn[], value.openers)) return false;
  if (value.phase === "active" ? value.endReason !== null
    : value.pendingLayer !== null || value.openers.length !== 0
      || (value.phase === "crisis-ended" ? value.endReason !== "crisis"
        : !["user-stop", "scene-complete", "local-exhausted"].includes(value.endReason as string))) return false;
  if (value.phase === "crisis-ended"
    ? typeof value.crisisHotline !== "string" || !Object.hasOwn(HOTLINES, value.crisisHotline)
    : value.crisisHotline !== null) return false;
  const coverage = value.coverage;
  if (!object(coverage) || !keys(coverage, ["base", "current", "baseline"])
    || !["confirmed", "unconfirmed"].includes(coverage.baseline as string)
    || !matrix(coverage.base) || !matrix(coverage.current)) return false;
  const { base, current } = coverage;
  return Object.keys(periods).every(period => Object.keys(layers).every(key =>
    current[period as LifePeriod][key as DrillLayer] >= base[period as LifePeriod][key as DrillLayer]));
}
function pending(value: unknown, root: Record<string, unknown>): boolean {
  if (value === null) return true;
  if (!object(value)) return false;
  if (value.kind === "request") {
    return keys(value, ["kind", "requestId", "submittedAnswer", "inputRevision", "before"])
      && id(value.requestId) && typeof value.submittedAnswer === "string" && value.submittedAnswer.trim() !== ""
      && integer(value.inputRevision) && state(value.before, root) && value.before.phase === "active"
      && value.before.inputRevision === value.inputRevision
      && (root.state as InterviewStableSnapshot).inputRevision >= value.inputRevision;
  }
  if (value.kind !== "save" || !keys(value, ["kind", "status", "intent"])
    || !["pending", "unknown"].includes(value.status as string) || !object(value.intent)) return false;
  const intent = value.intent;
  return keys(intent, ["requestId", "sessionId", "draftId", "revision", "contentGeneration", "snapshot"])
    && id(intent.requestId) && id(intent.sessionId) && intent.draftId === root.draftId
    && integer(intent.revision, 1) && intent.revision <= (root.revision as number)
    && intent.contentGeneration === root.contentGeneration && state(intent.snapshot, root);
}

/** Reject incomplete, extra or oversized fields; never infer missing progress. */
export function decodeInterviewDraftSnapshot(raw: string, owner: string): InterviewDraftSnapshot {
  if (new TextEncoder().encode(raw).length > INTERVIEW_DRAFT_MAX_BYTES) throw new Error("interview_draft_too_large");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("interview_draft_invalid"); }
  if (!object(value) || !keys(value, ["v", "ownerId", "draftId", "revision", "createdAt", "expiresAt",
    "contentGeneration", "period", "uiLanguage", "conversationLocale", "growthOrigin", "state", "pending"])
    || value.v !== 2 || value.ownerId !== owner || !id(owner) || !id(value.draftId)
    || !integer(value.revision, 1) || !integer(value.createdAt) || !integer(value.expiresAt)
    || value.expiresAt !== value.createdAt + INTERVIEW_DRAFT_TTL_MS || !id(value.contentGeneration)
    || typeof value.period !== "string" || !Object.hasOwn(periods, value.period)
    || !["ko", "en", "es", "pt", "id"].includes(value.uiLanguage as string)
    || !["ko", "en"].includes(value.conversationLocale as string)
    || typeof value.growthOrigin !== "boolean" || !state(value.state, value) || !pending(value.pending, value)) {
    throw new Error("interview_draft_invalid");
  }
  return value as unknown as InterviewDraftSnapshot;
}

export function encodeInterviewDraftSnapshot(value: InterviewDraftSnapshot): string {
  const raw = JSON.stringify(value);
  decodeInterviewDraftSnapshot(raw, value.ownerId);
  return raw;
}
