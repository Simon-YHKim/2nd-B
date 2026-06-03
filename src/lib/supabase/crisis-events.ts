// C3-adjacent: RED-zone crisis events log to a SEPARATE restricted-access table
// (crisis_events, migration 0012). Categorical info only — never raw user text.
// Per docs/research/batches/crisis-detection.md §"Logging policy".
//
// Like audit.ts, this module is restricted by ESLint + boundary script —
// only src/lib/llm/gemini.ts may import it. Direct access would let a
// component bypass the wrapper's required pre-pass + fixed-template return.

import { getSupabaseClient } from "./client";

export interface CrisisEventInsert {
  classifierConfidence: number;
  triggerCategories: string[];
  cssrsLevel: number | null;
  routingTemplateVersion: string;
  locale: "en" | "ko";
}

// crisis_events is RLS deny-all (0012, service-role-only by design), so a direct
// authenticated client INSERT is silently denied -- that dropped every client-side
// RED log (re-audit H3). Writes now go through the log_crisis_event SECURITY
// DEFINER RPC (0040), which writes server-side, hardcodes zone='red', and stamps
// user_id_hash from auth.uid() (never client input). The callAdvisor input-RED and
// web-lexicon paths short-circuit before the proxy, so this client RPC -- not a
// proxy-only write -- is what actually fills the ledger.
export async function insertCrisisEvent(meta: CrisisEventInsert): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("log_crisis_event", {
    p_classifier_confidence: meta.classifierConfidence,
    p_trigger_categories: meta.triggerCategories,
    p_cssrs_level: meta.cssrsLevel,
    p_routing_template_version: meta.routingTemplateVersion,
    p_locale: meta.locale,
  });
  if (error) throw error;
}
