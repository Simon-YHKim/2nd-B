import type { LlmConsentErrorCode } from "../llm/boundary";
import type { AccountOwnerLease } from "../auth/account-epoch";
import type { Rev2PersonaId } from "./rev2-personas";

export interface ChatTurn {
  role: "user" | "secondb";
  text: string;
  /** In-memory bubble input with citation markers; never used for copy/history/capture. */
  citationText?: string;
  /** Speaker at send time; absent only on older in-memory turns. */
  persona?: Rev2PersonaId;
  /** Slugs the reply cited — rendered as small source chips. */
  chips?: string[];
  /** 트위비 next-step candidates (P5f) — trailing → lines lifted from the reply. */
  branches?: string[];
  /** Client-generated line (greeting, limit hint, error) — NOT a model reply.
   *  Excluded from the conversation history sent back to the model so it isn't
   *  mis-grounded as something SecondB actually said. */
  synthetic?: boolean;
  consentError?: LlmConsentErrorCode;
  /** On a line that says the reply failed: the message it was for. Sending that message again
   *  may get an answer (no response, a server error, a deadline), so the line offers it (Z40).
   *  Absent on a consent refusal: sending again cannot change that. */
  retryText?: string;
  safetyZone?: "green" | "yellow" | "red";
  /** Guidance is shown once by the app host; its fixed text is never a bubble or model history. */
  crisisNotice?: true;
}

export type ChatMode = "analytic" | "divergent";


export interface ChatSessionToken {
  readonly ownerId: string;
  readonly ownerEpoch: number;
  readonly contentGeneration: number;
  readonly sessionId: string;
  readonly sessionGeneration: number;
}

export type SessionTurn = Readonly<Omit<ChatTurn, "chips" | "branches">> & {
  readonly id: string;
  readonly exchangeId: string;
  readonly sequence: number;
  readonly chips?: readonly string[];
  readonly branches?: readonly string[];
};

export interface ChatContextIntent {
  readonly fromNode: string | null;
  readonly mode: ChatMode;
  readonly persona: Rev2PersonaId;
  readonly seed: string;
}

export type ChatWorkKind = "send" | "safety" | "keep" | "plan";
export interface ChatWorkToken extends ChatSessionToken {
  readonly operationId: string;
  readonly kind: ChatWorkKind;
  readonly key: string;
}
export type ChatRetirementReason = "account" | "replaced" | "cleared" | "content-wipe" | "disposed";

export interface ChatSessionSnapshot extends ChatSessionToken {
  readonly revision: number;
  readonly turns: readonly SessionTurn[];
  readonly mode: ChatMode;
  readonly persona: Rev2PersonaId;
  readonly context: Readonly<{ fromNode: string | null }>;
  readonly work: readonly ChatWorkToken[];
}
// A separate external store: typing must not notify the message-list subscription.
export interface ChatDraftSnapshot { readonly text: string; readonly revision: number }

interface EntryBase {
  readonly entryId: string;
  readonly ownerEpoch: number;
  readonly contentGeneration: number;
  readonly bindingRevision: number;
}
export type ChatEntryBinding = EntryBase & (
  | { readonly state: "active"; readonly sessionId: string; readonly intentConsumed: true }
  | { readonly state: "replacement-pending"; readonly expectedSessionId: string;
      readonly expectedGeneration: number; readonly intent: ChatContextIntent }
  | { readonly state: "retired"; readonly retiredSessionId: string | null;
      readonly reason: "replaced" | "cleared" | "content-wipe"; readonly intentConsumed: true }
);

/** Structural CAS, deliberately independent of draft and ordinary reply revisions. */
export interface ChatEntryChoice {
  readonly ownerId: string;
  readonly ownerEpoch: number;
  readonly contentGeneration: number;
  readonly entryId: string;
  readonly bindingRevision: number;
  readonly expectedSessionId: string | null;
  readonly expectedGeneration: number;
}
export interface ChatEntrySnapshot {
  readonly binding: ChatEntryBinding;
  /** Pending and retired routes never receive the active session's body. */
  readonly session: ChatSessionSnapshot | null;
  readonly choice: ChatEntryChoice;
}

/** D3/D4 supply this synchronous boundary before any screen activation.
 * This module cannot confirm issued writes or open a wipe on its own. */
export interface ChatContentState {
  readonly generation: number;
  readonly phase: "open" | "blocked" | "needs-explicit-start";
  readonly wipeId: string | null;
}
export interface ChatContentBoundary {
  read(owner: AccountOwnerLease): ChatContentState;
  /** Before the first delete I/O, the producer must observe every ACK. */
  subscribe(owner: AccountOwnerLease, listener: () => boolean): () => void;
  /** Synchronous CAS: invoke commit exactly once only after drain/core proof.
   * Only a synchronous true confirms the new binding. False/throw keeps the producer closed.
   * Opening does not synchronously notify boundary subscribers.
   * Unknown writes never allow this call to open the boundary. */
  startAfterWipe(
    owner: AccountOwnerLease, expected: ChatContentState,
    commit: (opened: ChatContentState) => boolean,
  ): boolean;
}
