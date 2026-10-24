import { CHAT_KEEP_TAG, composeExchangeBody, exchangeMarkdown, exchangeTopic, findPromptIndex, isKeepable } from "./keep-exchange";
import type { createChatSessionRegistry } from "./session-registry";
import type { ChatSessionToken, ChatWorkToken } from "./session-types";

type RegistryReader = Pick<ReturnType<typeof createChatSessionRegistry>, "getSessionSnapshot">;
type TurnIdentity = Readonly<{ turnId: string; sequence: number }>;
type RedEvidence = Readonly<{ kind: "turn-zone-red"; turnId: string }>;

/** Neither alternative authorizes AI reuse or acknowledges a durable hold. */
type AiReuseRequirement =
  | Readonly<{ state: "hold-required"; evidence: readonly RedEvidence[] }>
  | Readonly<{ state: "unconfirmed" }>;

export type KeptExchangePreparation =
  | Readonly<{ status: "stale" }>
  | Readonly<{ status: "invalid-pair"; code: "turn-identity" | "reply" | "exchange" }>
  | Readonly<{
    status: "prepared";
    subject: Readonly<ChatSessionToken & {
      snapshotRevision: number;
      operationId: string;
      exchangeId: string;
      reply: TurnIdentity;
      prompt: TurnIdentity | null;
    }>;
    // Deliberately not a CaptureInput: a future writer must accept the subject
    // and hold requirement together, rather than silently drop them.
    payload: Readonly<{ rawMd: string; kindOverride: "self_knowledge"; userTags: readonly string[] }>;
    aiReuse: AiReuseRequirement;
  }>;

const STALE = Object.freeze({ status: "stale" } as const);
function invalid(code: "turn-identity" | "reply" | "exchange"): KeptExchangePreparation {
  return Object.freeze({ status: "invalid-pair", code });
}

/** Dormant preparation only. No screen, storage, model or logging consumer.
 * Capture expectedRevision AFTER claimWork, which itself revises the snapshot.
 * The reader is the real registry; a prepared result is not a reusable lease.
 * Later async writes still need current ownership, consent and a server hold ACK.
 */
export function prepareKeptExchange(
  registry: RegistryReader,
  work: ChatWorkToken,
  replyTurnId: string,
  expectedRevision: number,
  options: Readonly<{ locale: "en" | "ko"; speaker: string }>,
): KeptExchangePreparation {
  let snapshot: ReturnType<RegistryReader["getSessionSnapshot"]>;
  try { snapshot = registry.getSessionSnapshot(work); } catch { return STALE; }
  if (!snapshot || snapshot.ownerId !== work.ownerId || snapshot.ownerEpoch !== work.ownerEpoch
    || snapshot.contentGeneration !== work.contentGeneration || snapshot.sessionId !== work.sessionId
    || snapshot.sessionGeneration !== work.sessionGeneration
    || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || snapshot.revision !== expectedRevision
    || work.kind !== "keep" || work.key !== replyTurnId || !snapshot.work.includes(work)) return STALE;

  const seen = new Set<string>();
  let previousSequence = -1;
  for (const turn of snapshot.turns) {
    if (!turn.id || seen.has(turn.id) || !turn.exchangeId
      || !Number.isSafeInteger(turn.sequence) || turn.sequence <= previousSequence) return invalid("turn-identity");
    seen.add(turn.id); previousSequence = turn.sequence;
  }
  const replyIndex = snapshot.turns.findIndex(turn => turn.id === replyTurnId);
  const reply = snapshot.turns[replyIndex];
  if (!reply || !isKeepable(reply)) return invalid("reply");
  const promptIndex = findPromptIndex(snapshot.turns, replyIndex);
  const prompt = promptIndex === null ? null : snapshot.turns[promptIndex];
  if (prompt && (prompt.exchangeId !== reply.exchangeId || prompt.sequence >= reply.sequence)) return invalid("exchange");

  // Read known verdicts from the full selected turns, before existing formatting
  // clips them. A GREEN-looking fixed reply cannot erase the paired RED input.
  const evidence = [prompt, reply].filter(turn => turn?.safetyZone === "red")
    .map(turn => Object.freeze({ kind: "turn-zone-red" as const, turnId: turn!.id }));
  const aiReuse: AiReuseRequirement = evidence.length
    ? Object.freeze({ state: "hold-required", evidence: Object.freeze(evidence) })
    : Object.freeze({ state: "unconfirmed" });
  const promptText = prompt?.text.trim() ?? null;
  const body = composeExchangeBody({ prompt: promptText, reply: reply.text, speaker: options.speaker }, options.locale);
  const rawMd = exchangeMarkdown(exchangeTopic(promptText, reply.text), body);
  return Object.freeze({
    status: "prepared",
    subject: Object.freeze({ ownerId: snapshot.ownerId, ownerEpoch: snapshot.ownerEpoch,
      contentGeneration: snapshot.contentGeneration, sessionId: snapshot.sessionId,
      sessionGeneration: snapshot.sessionGeneration, snapshotRevision: snapshot.revision,
      operationId: work.operationId, exchangeId: reply.exchangeId,
      reply: Object.freeze({ turnId: reply.id, sequence: reply.sequence }),
      prompt: prompt ? Object.freeze({ turnId: prompt.id, sequence: prompt.sequence }) : null }),
    payload: Object.freeze({ rawMd, kindOverride: "self_knowledge", userTags: Object.freeze([CHAT_KEEP_TAG]) }),
    aiReuse,
  });
}
