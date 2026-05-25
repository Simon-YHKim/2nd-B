// C3-adjacent: RED-zone crisis events log to a SEPARATE restricted-access table
// (crisis_events, migration 0012). Categorical info only — never raw user text.
// Per docs/research/batches/crisis-detection.md §"Logging policy".
//
// Like audit.ts, this module is restricted by ESLint + boundary script —
// only src/lib/llm/gemini.ts may import it. Direct access would let a
// component bypass the wrapper's required pre-pass + fixed-template return.

import { getSupabaseClient } from "./client";

export interface CrisisEventInsert {
  userIdHash: string;
  zone: "red";
  classifierConfidence: number;
  triggerCategories: string[];
  cssrsLevel: number | null;
  routingTemplateVersion: string;
  locale: "en" | "ko";
}

export async function insertCrisisEvent(meta: CrisisEventInsert): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("crisis_events").insert({
    user_id_hash: meta.userIdHash,
    zone: meta.zone,
    classifier_confidence: meta.classifierConfidence,
    trigger_categories: meta.triggerCategories,
    cssrs_level: meta.cssrsLevel,
    routing_template_version: meta.routingTemplateVersion,
    locale: meta.locale,
  });
  if (error) throw error;
}
