// Capture Engine helper: inserts a journal/note/audit_response row and,
// optionally, calls the appropriate LLM entry for an AI follow-up.
//
//   kind === 'journal'        → callAdvisor (full RAG: safety + retrieve + evidence)
//   kind === 'audit_response' → callGemini (purpose: audit_qa, lighter)
//   kind === 'note'           → no AI call
//
// All AI calls route through src/lib/llm/gemini.ts so safety (C9) + audit (C3) hold.
// Every successful capture also awards quest XP (best-effort) — see award_xp RPC.

import { buildMemorizedPattern } from "../knowledge/engines";
import { callAdvisor, callGemini } from "../llm/gemini";
import { awardXpSafe, type XpAction } from "../progression/xp";
import { getSupabaseClient } from "../supabase/client";

export type RecordKind = "journal" | "note" | "audit_response";

export interface CreateRecordArgs {
  userId: string;
  locale: "en" | "ko";
  kind: RecordKind;
  body: string;
  prompt?: string;
  auditPeriod?: string;
  withFollowup?: boolean;
  // Per master blueprint: every entry should surface tags, topic,
  // summary, conclusion alongside the body. All optional — the LLM
  // follow-up (Phase 1 / Advisor) can fill them in later.
  topic?: string;
  summary?: string;
  conclusion?: string;
  tags?: string[];
}

export interface RecordedEvidence {
  title: string;
  doi: string | null;
  summary: string | null;
}

export interface RecordFollowup {
  text: string;
  zone: "green" | "yellow" | "red";
  fixedTemplate?: boolean;
  matchedBatches?: string[];
  evidence?: RecordedEvidence[];
}

export interface CreatedRecord {
  id: string;
  followup?: RecordFollowup;
}

// Quest XP action for each record kind. Capturing data is the core
// progression loop: audit answers drive Lv1→3, journals/notes drive beyond.
const XP_ACTION_FOR_KIND: Record<RecordKind, XpAction> = {
  journal: "journal",
  note: "note",
  audit_response: "audit_answer",
};

export async function createRecord(args: CreateRecordArgs): Promise<CreatedRecord> {
  const supabase = getSupabaseClient();

  let aiFollowup: RecordFollowup | null = null;
  if (args.withFollowup !== false && args.kind !== "note") {
    if (args.kind === "journal") {
      // Engine 4 Advisor flow: layered safety + Path A RAG.
      const res = await callAdvisor({
        userId: args.userId,
        userMessage: args.body,
        locale: args.locale,
      });
      const cappedText = res.text.length > 4000 ? res.text.slice(0, 4000) + "…" : res.text;
      aiFollowup = {
        text: cappedText,
        zone: res.zone,
        fixedTemplate: res.fixedTemplate,
        matchedBatches: res.matchedBatches.slice(0, 4),
        // Cap evidence stored on the row to keep ai_followup under 8 KB.
        evidence: res.evidence.slice(0, 3).map((e) => ({
          title: e.title.slice(0, 200),
          doi: e.doi,
          summary: e.summary ? e.summary.slice(0, 300) : null,
        })),
      };

      // Engine 6 (memorize): persist the observed pattern keyed by user.
      // Skip RED zone (handled separately via crisis_events, never co-located
      // with normal patterns) and skip fixed-template responses (which carry
      // no inference signal). Best-effort: never block UX on memorize.
      if (!res.fixedTemplate && res.zone !== "red") {
        try {
          const pattern = buildMemorizedPattern({
            userId: args.userId,
            matchedBatches: res.matchedBatches,
            triggers: res.triggers,
            text: `${args.body}\n\n${res.text}`,
            zone: res.zone,
          });
          await supabase.from("memorized_patterns").insert(pattern);
        } catch (e) {
          if (typeof console !== "undefined") console.warn("[memorize] insert failed", e);
        }
      }
    } else {
      // Audit response: lighter, no retrieval.
      const res = await callGemini({
        userId: args.userId,
        locale: args.locale,
        purpose: "audit_qa",
        user: args.body,
      });
      const cappedText = res.text.length > 4000 ? res.text.slice(0, 4000) + "…" : res.text;
      aiFollowup = { text: cappedText, zone: res.safety.zone };
    }
  }

  const { data, error } = await supabase
    .from("records")
    .insert({
      user_id: args.userId,
      kind: args.kind,
      audit_period: args.auditPeriod ?? null,
      prompt: args.prompt ?? null,
      body: args.body,
      ai_followup: aiFollowup,
      topic: args.topic ?? null,
      summary: args.summary ?? null,
      conclusion: args.conclusion ?? null,
      tags: args.tags ?? [],
    })
    .select("id")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  // Quest XP — best-effort, never blocks the capture. The server (award_xp
  // RPC) decides the amount from xp_rules; we only name the action.
  await awardXpSafe(XP_ACTION_FOR_KIND[args.kind]);

  return { id: data.id, followup: aiFollowup ?? undefined };
}

export async function listRecentRecords(userId: string, limit = 20) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("id, kind, body, ai_followup, topic, summary, conclusion, tags, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Delete a single record by id. RLS scopes to auth.uid(), so users can
// only delete their own rows; we still pass userId explicitly so the
// index-friendly WHERE fires first.
export async function deleteRecord(userId: string, recordId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("records")
    .delete()
    .eq("user_id", userId)
    .eq("id", recordId);
  if (error) throw error;
}

// Exact count of a user's records of one kind. Used by the free-tier usage
// gate (entitlements.checkUsage) so the 2-use limit is accurate regardless of
// how many other-kind records exist.
export async function countRecordsByKind(userId: string, kind: RecordKind): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("records")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind);
  if (error) throw error;
  return count ?? 0;
}
