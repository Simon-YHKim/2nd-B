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
import { canUsePremium, type SubscriptionTier } from "../progression/entitlements";
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
  // C10 safety: forwarded to callAdvisor/callGemini so a minor's crisis
  // routing uses the youth hotline. From AuthContext.isMinor at the call site.
  minor?: boolean;
  /**
   * Caller's subscription tier. When provided, the journal Advisor follow-up
   * is entitlement-checked (canUsePremium, Brain floor) — defense in depth
   * behind the capture-screen gate, since this is the only client path that
   * reaches callAdvisor. Omitted = legacy callers keep their behavior. The
   * audit_response follow-up (Lv1-3 core loop) is never tier-gated.
   */
  tier?: SubscriptionTier;
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
  // Premium gate (Brain floor): the Advisor follow-up is the marginal-cost
  // surface; when the caller names its tier, enforce the entitlement here
  // too so a stale/bypassed toggle can't reach callAdvisor.
  const advisorAllowed = args.tier === undefined || canUsePremium("advisor", args.tier);
  if (args.withFollowup !== false && args.kind !== "note") {
    if (args.kind === "journal" && !advisorAllowed) {
      // Entry still saves normally — only the AI follow-up is withheld.
    } else if (args.kind === "journal") {
      // Engine 4 Advisor flow: layered safety + Path A RAG.
      // Best-effort by contract ("Entry still saves normally — only the AI
      // follow-up is withheld"): crisis paths come BACK as fixed-template
      // RESULTS (never thrown), so anything that throws here is an
      // infrastructure or entitlement failure (e.g. the proxy's server-side
      // 403 when the client tier was stale/forced) — the user's entry must
      // still save without a follow-up, never fail the whole submit.
      try {
        const res = await callAdvisor({
          userId: args.userId,
          userMessage: args.body,
          locale: args.locale,
          minor: args.minor,
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
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[records] advisor follow-up failed; saving without it", (e as Error).message);
      }
    } else {
      // Audit response: lighter, no retrieval. Same best-effort contract as
      // the Advisor branch — a follow-up failure (rate limit, proxy error)
      // must not lose the user's typed answer.
      try {
        const res = await callGemini({
          userId: args.userId,
          locale: args.locale,
          purpose: "audit_qa",
          user: args.body,
          minor: args.minor,
        });
        const cappedText = res.text.length > 4000 ? res.text.slice(0, 4000) + "…" : res.text;
        aiFollowup = { text: cappedText, zone: res.safety.zone };
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[records] audit follow-up failed; saving without it", (e as Error).message);
      }
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

// How far back the streak query looks, in days. A streak longer than this is
// truncated, which is acceptable: the UI shows the active run, not lifetime.
const STREAK_WINDOW_DAYS = 90;

export async function listRecentRecords(userId: string, limit = 500) {
  const supabase = getSupabaseClient();
  // Window the query to a wide date range rather than the most-recent N rows.
  // The old 20-row cap saturated on engaged users: 20+ records over a day or
  // two crowded out older capture days, so the daily-capture streak collapsed
  // to 1 even with a long run. A ~90-day window keeps every distinct capture
  // day in the result. Any record kind counts (streak.ts: "at least one record
  // was created"); computeStreak de-dupes by KST day-key.
  const sinceIso = new Date(Date.now() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("records")
    .select("id, kind, body, ai_followup, topic, summary, conclusion, tags, created_at")
    .eq("user_id", userId)
    .gte("created_at", sinceIso)
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
