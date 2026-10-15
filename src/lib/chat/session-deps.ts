import type { AccountOwnerLease } from "../auth/account-epoch";
import type { AuthenticatedAccountSessionLease, PendingAccountSessionLease } from "../auth/account-session-lease";
import type { LlmConsentErrorCode } from "../llm/boundary";
import type { CrisisObserver } from "../llm/types";
import type { publishCrisisNotice } from "../safety/crisis-notice";
import type { SendMessageInput, SendMessageResult, SendMessageOk } from "./conversation";
import type { ChatRetirementReason, ChatSessionSnapshot, ChatSessionToken } from "./session-types";

export interface ChatSendAdmission {
  readonly ready: boolean;
  readonly ordinaryAllowed: boolean;
  readonly locale: SendMessageInput["locale"];
  readonly minor: boolean | null;
  readonly tier: SendMessageInput["tier"];
  readonly displayName?: string | null;
  readonly personaHint?: string | null;
  /** No client-generated UUID stands in for a server turn reservation. */
  readonly recovery: "legacy" | "unavailable";
  readonly errors: Readonly<{
    request: string; presentation: string;
    consent_required: string; consent_check_unavailable: string;
  }>;
}

export type CapturedChatInput = SendMessageInput & {
  readonly session: AuthenticatedAccountSessionLease;
  readonly signal: AbortSignal;
  readonly onCrisisDetected: CrisisObserver;
};

/** C/D must implement the real captured transport and issued-write supervisor.
 * Creation starts no I/O, but may synchronously publish an owner/content change.
 * Retirement during construction has no completed handoff and returns false;
 * the returned supervisor is retired/released without authenticating or sending.
 * retire(true) acknowledges synchronous access fencing
 * and phase-aware cancellation/handoff, NOT a confirmed server write outcome.
 * Wipe preserves issued-write signals until settlement; owner/consent cancellation
 * keeps unconfirmed tickets in a metadata-only ledger. release cannot erase them. */
export interface ChatOperationSupervisor {
  readonly lease: PendingAccountSessionLease;
  send(input: CapturedChatInput): Promise<SendMessageResult>;
  /** Existing local RED audit/fixed result only: no quota or ordinary model call. */
  auditLocalRed(input: CapturedChatInput): Promise<SendMessageOk>;
  retire(reason: ChatRetirementReason): boolean;
  /** Releases the captured lease once, after the operation's finally. */
  release(): void;
}

export interface ChatSessionDeps {
  readAdmission(session: ChatSessionSnapshot): ChatSendAdmission;
  beginOperation(owner: AccountOwnerLease, session: ChatSessionToken, operationId: string): ChatOperationSupervisor;
  publishCrisisNotice: typeof publishCrisisNotice;
  /** Must identify the real LlmConsentError, never guess from error text. */
  consentError(error: unknown): LlmConsentErrorCode | null;
  holdThinking(): () => void;
}

export interface ChatSendOperation {
  readonly id: string;
  readonly exchangeId: string;
  readonly promptTurnId: string;
  readonly responseTurnId: string;
  readonly kind: "send" | "safety";
  readonly stage: "preparing" | "requesting" | "answered" | "settled";
  readonly outcome?: "reply" | "blocked" | "red" | "request-error" | "presentation-error";
  readonly retry: "none" | "legacy-explicit";
  readonly redNoticeEmitted: boolean;
}
export interface ChatControllerSnapshot {
  readonly sessionId: string;
  readonly revision: number;
  readonly send: ChatSendOperation | null;
  readonly safety: readonly ChatSendOperation[];
  readonly usage: Readonly<{ used: number; limit: number | null; remaining: number | null }> | null;
  readonly limitRefused: boolean;
  readonly upgradeTo: SendMessageInput["tier"] | null;
}
export interface ChatCompletionEvent {
  readonly session: ChatSessionToken;
  readonly operation: ChatSendOperation;
}
export interface ChatSendCommand {
  readonly session: ChatSessionToken;
  readonly text: string;
  readonly expectedDraftRevision: number;
  readonly retryExchangeId?: string;
}
export type ChatSendAcceptance =
  | { readonly accepted: true; readonly operationId: string; readonly exchangeId: string }
  | { readonly accepted: false; readonly reason: "stale" | "empty" | "busy" | "draft-changed" | "unavailable" | "retry-unavailable" };
