// Client wrapper for the award_xp RPC (db/migrations/0019). The server decides
// the XP amount from xp_rules; the client only names the action. Never block
// UX on an XP failure -- awarding is best-effort decoration on the real write.

import { getSupabaseClient } from "../supabase/client";

export type XpAction =
  | "audit_answer"
  | "ai_followup_answer"
  | "journal"
  | "note"
  | "self_context_entry"
  | "persona_created"
  | "rag_export_first";

export interface XpAwardResult {
  awarded: number;
  totalXp: number;
  level: number;
  duplicate: boolean;
}

export async function awardXp(action: XpAction): Promise<XpAwardResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("award_xp", { p_action: action });
  if (error) throw error;
  const d = (data ?? {}) as {
    awarded?: number;
    total_xp?: number;
    level?: number;
    duplicate?: boolean;
  };
  return {
    awarded: d.awarded ?? 0,
    totalXp: d.total_xp ?? 0,
    level: d.level ?? 1,
    duplicate: d.duplicate ?? false,
  };
}

// Best-effort variant: swallows errors (logs a warning) and returns null.
// Use at call sites where a lost XP award must never break the user flow.
export async function awardXpSafe(action: XpAction): Promise<XpAwardResult | null> {
  try {
    return await awardXp(action);
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[xp] award failed", action, e);
    return null;
  }
}
