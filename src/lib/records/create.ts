// Capture Engine helper: inserts a journal/note/audit_response row and,
// optionally, calls the Gemini wrapper for an AI follow-up question.
// All AI calls route through callGemini() so safety (C9) + audit (C3) hold.

import { callGemini } from "../llm/gemini";
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

export interface CreatedRecord {
  id: string;
  followup?: { text: string; zone: "green" | "yellow" | "red" };
}

export async function createRecord(args: CreateRecordArgs): Promise<CreatedRecord> {
  const supabase = getSupabaseClient();

  let aiFollowup: { text: string; zone: "green" | "yellow" | "red" } | null = null;
  if (args.withFollowup !== false && args.kind !== "note") {
    const purpose = args.kind === "audit_response" ? "audit_qa" : "journal_reflect";
    const res = await callGemini({
      userId: args.userId,
      locale: args.locale,
      purpose,
      user: args.body,
    });
    aiFollowup = { text: res.text, zone: res.safety.zone };
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
