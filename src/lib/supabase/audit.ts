// C3: ai_audit_log INSERT helper.
// IMPORTANT: This module is restricted to import from src/lib/llm/boundary.ts
// only — enforced by ESLint (eslint.config.js) and scripts/check-llm-import-boundary.ts.
// Direct callers from screens/components would bypass the wrapper's safety
// classifier (C9). Use callLlm() instead.

import type { AuditMeta } from "../llm/types";
import { getSupabaseClient } from "./client";
import { rpcWithCapturedSession } from "./captured-session-client";

export interface AiAuditInsert extends AuditMeta {
  userId: string;
}

// Same bound and alphabet as the 0179 CHECK / RPC guard on outbox_event_id.
// Checked here so a malformed key fails locally and never costs a round trip.
const OUTBOX_EVENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function assertOutboxEventId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !OUTBOX_EVENT_ID.test(value)) {
    throw new Error("invalid_audit_outbox_event_id");
  }
}

// Writes go through the log_ai_audit SECURITY DEFINER RPC (migration 0038), not
// a direct table INSERT. The blanket authenticated INSERT policy was forgeable
// (re-audit A2): a client could spam or fabricate its own audit rows. The RPC
// stamps user_id := auth.uid() server-side and is the only authenticated write
// path; meta.userId is kept on the type for callers but is NOT trusted/sent.
// Prod web's authoritative row is still written server-side by gemini-proxy
// (service_role), which bypasses RLS and is unaffected by the policy removal.
//
// outboxEventId (0179, hardened by 0181): the audit-write outbox passes its
// entry id so a retry after a committed-but-unacknowledged write lands on the
// same (user_id, outbox_event_id) row instead of a second one. The server
// stamps the owner from auth.uid(), so the key cannot address another user's
// row. There is deliberately NO fallback to log_ai_audit on failure: once a
// keyed write may have committed, an unkeyed retry is exactly the duplicate
// this key exists to prevent. The row stays queued instead.
export async function insertAiAuditLog(
  meta: AiAuditInsert,
  accessToken?: string,
  signal?: AbortSignal,
  outboxEventId?: string,
): Promise<void> {
  if (outboxEventId !== undefined) assertOutboxEventId(outboxEventId);
  const args = {
    p_prompt_hash: meta.promptHash,
    p_output_hash: meta.outputHash,
    p_model_used: meta.modelUsed,
    p_vertex_backend: meta.vertexBackend,
    p_safety_zone: meta.safetyZone,
    p_latency_ms: meta.latencyMs,
    // 0095 enrichment (0073 axes): purpose + vendor + effort, NULL when the
    // call had none (e.g. crisis rows without a call context). Sent explicitly
    // so PostgREST always matches the 9-arg signature — which is why the 0095
    // migration must be APPLIED BEFORE this client ships (server first; a
    // stalled row just waits in the audit-write outbox until then).
    p_purpose: meta.purpose ?? null,
    p_reasoning_vendor: meta.reasoningProvider ?? null,
    p_reasoning_effort: meta.effort ?? null,
  };
  const name = outboxEventId === undefined ? "log_ai_audit" : "log_ai_audit_once";
  const body = outboxEventId === undefined ? args : { p_outbox_event_id: outboxEventId, ...args };
  const { error } = accessToken
    ? await rpcWithCapturedSession(name, body, accessToken, signal)
    : await getSupabaseClient().rpc(name, body);
  if (error) throw error;
}
