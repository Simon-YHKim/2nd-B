// Capture Engine helper: inserts a journal/note/audit_response row and,
// optionally, calls the appropriate LLM entry for an AI follow-up.
//
//   kind === 'journal'        → callAdvisor (full RAG: safety + retrieve + evidence)
//   kind === 'audit_response' → callGemini (purpose: audit_qa, lighter)
//   kind === 'note'           → no AI call
//
// All AI calls route through src/lib/llm/gemini.ts so safety (C9) + audit (C3) hold.

import { callAdvisor, callGemini } from "../llm/gemini";
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
    })
    .select("id")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");

  return { id: data.id, followup: aiFollowup ?? undefined };
}

export async function listRecentRecords(userId: string, limit = 20) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("id, kind, body, ai_followup, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
