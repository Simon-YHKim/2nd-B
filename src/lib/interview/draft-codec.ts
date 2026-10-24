import type { DrillLayer, InterviewTurn, LifePeriod } from "./probe";
import { isUneditedOpener, type OpenerSelection } from "./opener-selection";

export const INTERVIEW_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
// A storage limit, never a conversation length/end rule. Reject, do not truncate.
export const INTERVIEW_DRAFT_MAX_BYTES = 256 * 1024;
export const INTERVIEW_DRAFT_KEY_PREFIX = "interview.drafts.v1.";

// Exhaustive against the product types without loading the LLM module at runtime.
const periods: Record<LifePeriod, true> = {
  infancy: true, school: true, twenties: true, later: true, work: true, now: true,
};
const layers: Record<DrillLayer, true> = {
  fact: true, feeling: true, meaning: true, belief: true, echo: true,
};

// T36's neutral verdict must survive separately from false and missing.
export type InterviewDraftTurn = Omit<InterviewTurn, "answered"> & {
  answered?: boolean | null;
};

/** First storage unit only. UI hydration/coverage reconciliation is not wired. */
export interface InterviewDraftContent {
  period: LifePeriod;
  locale: "ko" | "en" | "es" | "pt" | "id";
  growthOrigin: boolean;
  phase: "active" | "ended" | "crisis-ended" | "save-pending" | "save-unknown";
  turns: InterviewDraftTurn[];
  draft: string;
  /** Keep an unsent chip's source across restart; missing means no known selection. */
  openerSelection?: OpenerSelection;
}

export interface InterviewDraft extends InterviewDraftContent {
  v: 1;
  ownerId: string;
  draftId: string;
  revision: number;
  createdAt: number;
  expiresAt: number;
}

export interface InterviewDraftVersion {
  draftId: string;
  revision: number;
}

export function validInterviewDraftOwner(owner: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(owner);
}

export function interviewDraftKey(owner: string): string {
  if (!validInterviewDraftOwner(owner)) throw new Error("interview_draft_invalid_owner");
  return `${INTERVIEW_DRAFT_KEY_PREFIX}${owner}`;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function keysOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validTurn(value: unknown): value is InterviewDraftTurn {
  if (!object(value) || !keysOnly(value, [
    "role", "text", "layer", "period", "sceneStart", "answered", "unsettled", "fromOpener",
  ])) return false;
  return (value.role === "interviewer" || value.role === "user")
    && typeof value.text === "string"
    && (value.fromOpener === undefined || (value.role === "user" && typeof value.fromOpener === "boolean"))
    && (value.layer === undefined || (typeof value.layer === "string" && Object.hasOwn(layers, value.layer)))
    && (value.period === undefined || (typeof value.period === "string" && Object.hasOwn(periods, value.period)))
    && (value.sceneStart === undefined || typeof value.sceneStart === "boolean")
    && (value.answered === undefined || value.answered === null || typeof value.answered === "boolean")
    && (value.unsettled === undefined || typeof value.unsettled === "boolean");
}

const contentKeys = ["period", "locale", "growthOrigin", "phase", "turns", "draft", "openerSelection"];
const envelopeKeys = [...contentKeys, "v", "ownerId", "draftId", "revision", "createdAt", "expiresAt"];

function validContent(value: Record<string, unknown>): boolean {
  return typeof value.period === "string" && Object.hasOwn(periods, value.period)
    && ["ko", "en", "es", "pt", "id"].includes(value.locale as string)
    && typeof value.growthOrigin === "boolean"
    && ["active", "ended", "crisis-ended", "save-pending", "save-unknown"].includes(value.phase as string)
    && Array.isArray(value.turns) && value.turns.every(validTurn)
    && typeof value.draft === "string"
    && (value.openerSelection === undefined || isUneditedOpener(value.openerSelection, value.draft, value.turns));
}

/** Detached, strict JSON snapshot: unknown fields (tokens/profile/etc.) are refused. */
export function copyInterviewDraftContent(value: InterviewDraftContent): InterviewDraftContent {
  if (!object(value) || !keysOnly(value, contentKeys) || !validContent(value)) {
    throw new Error("interview_draft_invalid");
  }
  const raw = JSON.stringify(value);
  if (new TextEncoder().encode(raw).length > INTERVIEW_DRAFT_MAX_BYTES) {
    throw new Error("interview_draft_too_large");
  }
  return JSON.parse(raw) as InterviewDraftContent;
}

export function decodeInterviewDraft(raw: string, owner: string): InterviewDraft {
  if (new TextEncoder().encode(raw).length > INTERVIEW_DRAFT_MAX_BYTES) {
    throw new Error("interview_draft_too_large");
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("interview_draft_invalid"); }
  if (!object(value) || !keysOnly(value, envelopeKeys) || !validContent(value)
    || value.v !== 1 || value.ownerId !== owner || !validInterviewDraftOwner(owner)
    || typeof value.draftId !== "string" || !validInterviewDraftOwner(value.draftId)
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1
    || !Number.isSafeInteger(value.createdAt) || (value.createdAt as number) < 0
    || !Number.isSafeInteger(value.expiresAt)
    || value.expiresAt !== (value.createdAt as number) + INTERVIEW_DRAFT_TTL_MS) {
    throw new Error("interview_draft_invalid");
  }
  return value as unknown as InterviewDraft;
}

export function encodeInterviewDraft(value: InterviewDraft): string {
  const raw = JSON.stringify(value);
  decodeInterviewDraft(raw, value.ownerId);
  return raw;
}

export function interviewDraftExpired(value: InterviewDraft, now: number): boolean {
  // A clock moved before creation cannot safely establish the seven-day age.
  return !Number.isSafeInteger(now) || now < value.createdAt || now >= value.expiresAt;
}
