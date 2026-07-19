// C3: ai_audit_log INSERT helper.
// IMPORTANT: This module is restricted to import from src/lib/llm/gemini.ts
// only — enforced by ESLint (eslint.config.js) and scripts/check-llm-import-boundary.ts.
// Direct callers from screens/components would bypass the wrapper's safety
// classifier (C9). Use callGemini() instead.

import type { AuditMeta } from "../llm/types";
import { getSupabaseClient } from "./client";

export interface AiAuditInsert extends AuditMeta {
  userId: string;
}

// Writes go through the log_ai_audit SECURITY DEFINER RPC (migration 0038), not
// a direct table INSERT. The blanket authenticated INSERT policy was forgeable
// (re-audit A2): a client could spam or fabricate its own audit rows. The RPC
// stamps user_id := auth.uid() server-side and is the only authenticated write
// path; meta.userId is kept on the type for callers but is NOT trusted/sent.
// Prod web's authoritative row is still written server-side by gemini-proxy
// (service_role), which bypasses RLS and is unaffected by the policy removal.
export async function insertAiAuditLog(meta: AiAuditInsert): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("log_ai_audit", {
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
  });
  if (error) throw error;
}
