// T40: accounting candidates are independent of answer selection and notices.
import type { LlmResult } from "../llm/types";
import type { TurnTicket } from "./turn-result-state";

export type SwapCandidate = Readonly<{ ticket: TurnTicket; reservationId: string; auditId: string }>;
export type SwapUsageCursor = Readonly<{ ownerId: string; ownerEpoch: number; day: string; sequence: number }>;
export type SwapUsage = SwapUsageCursor & Readonly<{ used: number; adBonus?: number; deadline: number }>;
export type SwapSettlement = Readonly<{
  candidate: SwapCandidate;
  status: "pending" | "confirmed" | "unresolved" | "expired" | "stale";
  calls: number;
  refundedCount?: number;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** SQL int, including zero. Neither a decrement nor a guessed local count. */
export function isRefundCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
}

export function createSwapCandidate(ticket: TurnTicket, receipt: Readonly<{ turnId: string | null }>, reply: LlmResult): SwapCandidate | null {
  const evidence = reply.outputSwap;
  if (reply.safety.zone !== "red" || !evidence || !receipt.turnId
    || evidence.reservationId !== receipt.turnId || !UUID.test(receipt.turnId) || !UUID.test(evidence.auditId)) return null;
  return Object.freeze({ ticket: Object.freeze({ ...ticket }), reservationId: receipt.turnId, auditId: evidence.auditId });
}

/** A NULL candidate cannot consume a different audit's chance on this reservation. */
export function swapCandidateKey(candidate: SwapCandidate): string {
  return JSON.stringify([candidate.ticket.ownerId, candidate.ticket.ownerEpoch, candidate.reservationId, candidate.auditId]);
}

export function canUseSwapUsage(value: SwapUsage, current: SwapUsageCursor, ownerCurrent: boolean, now: number): boolean {
  return ownerCurrent && value.ownerId === current.ownerId && value.ownerEpoch === current.ownerEpoch
    && value.day === current.day && value.sequence === current.sequence && now < value.deadline;
}
