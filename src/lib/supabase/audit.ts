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

export async function insertAiAuditLog(meta: AiAuditInsert): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("ai_audit_log").insert({
    user_id: meta.userId,
    prompt_hash: meta.promptHash,
    output_hash: meta.outputHash,
    model_used: meta.modelUsed,
    vertex_backend: meta.vertexBackend,
    safety_zone: meta.safetyZone,
    latency_ms: meta.latencyMs,
  });
  if (error) throw error;
}
