import { decodeInterviewDraft, interviewDraftExpired, INTERVIEW_DRAFT_MAX_BYTES, type InterviewDraft } from "./draft-codec";
import { decodeInterviewDraftSnapshot, type InterviewDraftSnapshot } from "./draft-snapshot";

/** Ephemeral read ticket. Epochs are compared within this process, never persisted. */
export interface InterviewRestoreContext {
  ownerId: string;
  accountEpoch: number;
  viewGeneration: number;
  inputRevision: number;
  content: { status: "confirmed"; generation: string } | { status: "unconfirmed" | "wipe-pending" };
}

export type InterviewRestoreResult =
  | { status: "stale" | "unconfirmed" | "invalid" | "expired" | "empty" }
  | { status: "legacy-body-only"; draft: InterviewDraft }
  | { status: "quarantined"; draft: InterviewDraftSnapshot }
  | { status: "restored"; draft: InterviewDraftSnapshot;
      next: "resume-choice" | "ended" | "request-unconfirmed" | "save-unconfirmed" };

/**
 * Synchronous, detached preparation only. No storage, SDK, server, model or UI effects.
 * The consumer must recheck its owner/ticket at its own commit boundary. Even a
 * restored snapshot is local observation, not verified server credit or save authority.
 */
export function prepareInterviewDraftRestore(
  raw: string | null,
  captured: InterviewRestoreContext,
  current: InterviewRestoreContext,
  now: number,
): InterviewRestoreResult {
  if (captured.ownerId !== current.ownerId || captured.accountEpoch !== current.accountEpoch
    || captured.viewGeneration !== current.viewGeneration || captured.inputRevision !== current.inputRevision) {
    return { status: "stale" };
  }
  if (captured.content.status !== "confirmed" || current.content.status !== "confirmed") {
    return { status: "unconfirmed" };
  }
  if (captured.content.generation !== current.content.generation) return { status: "stale" };
  if (raw === null) return { status: "empty" };
  if (new TextEncoder().encode(raw).length > INTERVIEW_DRAFT_MAX_BYTES) return { status: "invalid" };
  let version: unknown;
  try { version = (JSON.parse(raw) as { v?: unknown } | null)?.v; } catch { return { status: "invalid" }; }
  if (version === 1) {
    try {
      const draft = decodeInterviewDraft(raw, current.ownerId);
      if (interviewDraftExpired(draft, now)) return { status: "expired" };
      // v1 has neither a content generation nor sufficient continuation state.
      // Its text may be recovered; its phases/turn flags never authorize a resume/save.
      return { status: "legacy-body-only", draft };
    } catch { return { status: "invalid" }; }
  }
  try {
    const draft = decodeInterviewDraftSnapshot(raw, current.ownerId);
    if (!Number.isSafeInteger(now) || now < draft.createdAt || now >= draft.expiresAt) return { status: "expired" };
    if (draft.contentGeneration !== current.content.generation) return { status: "quarantined", draft };
    // Stopped/crisis-ended state wins even if a request was outstanding at exit.
    const next = draft.pending?.kind === "save" ? "save-unconfirmed"
      : draft.state.phase !== "active" ? "ended"
        : draft.pending?.kind === "request" ? "request-unconfirmed" : "resume-choice";
    return { status: "restored", draft, next };
  } catch { return { status: "invalid" }; }
}
