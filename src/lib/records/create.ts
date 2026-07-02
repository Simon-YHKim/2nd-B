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
import { callAdvisor, callGemini, classifyRecordTextForCrisis } from "../llm/gemini";
import { canUsePremium, type SubscriptionTier } from "../progression/entitlements";
import { awardXpSafe, type XpAction } from "../progression/xp";
import { getSupabaseClient } from "../supabase/client";
import type { StructuredPayload } from "../capture/structured";
import { withDomainTag } from "./detect-domain";
import type { RecordFollowup } from "./followup";

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
  /**
   * Machine-readable form payload (0066): set by form-shaped captures (4W1H,
   * career 3C4P) alongside the flattened human body, so the system and the AI
   * can read the structure. Omitted = column stays null.
   */
  structured?: StructuredPayload;
}

export type { RecordedEvidence, RecordFollowup } from "./followup";

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

  // C9 (persona sim P1-1): the safety classifier is NOT a premium feature.
  // Saves that skip the LLM paths entirely — free-tier journal, advisor
  // toggle off, plain notes — used to skip crisis detection with them: a
  // minor could write a red-zone journal entry and get NO hotline while the
  // photo/OCR path classifies for every tier. Run the local lexicon
  // classifier (zero LLM cost) on every such save; on red, the same audited
  // routing as every LLM surface, surfaced as a fixed-template follow-up so
  // the screens' existing crisis-modal wiring fires unchanged. Best-effort:
  // a routing failure must not block the save.
  const llmPathWillClassify =
    args.withFollowup !== false &&
    (args.kind === "audit_response" || (args.kind === "journal" && advisorAllowed));
  if (!llmPathWillClassify) {
    try {
      const crisis = await classifyRecordTextForCrisis(
        args.body,
        args.locale,
        args.userId,
        args.minor === true,
      );
      if (crisis) {
        aiFollowup = { text: crisis.text, zone: "red", fixedTemplate: true };
      }
    } catch (e) {
      if (typeof console !== "undefined")
        console.warn("[records] crisis fallback classify failed", (e as Error).message);
    }
  }

  if (args.withFollowup !== false && args.kind !== "note") {
    if (args.kind === "journal" && !advisorAllowed) {
      // Entry still saves normally — only the AI follow-up is withheld.
      // (Crisis classification already ran above — it is not premium.)
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
        // The advisor call carried the crisis classification with it — when
        // the infrastructure fails, the LOCAL classifier must still run so a
        // red-zone entry never saves silently (same fallback as the
        // non-LLM paths above).
        try {
          const crisis = await classifyRecordTextForCrisis(
            args.body,
            args.locale,
            args.userId,
            args.minor === true,
          );
          if (crisis) aiFollowup = { text: crisis.text, zone: "red", fixedTemplate: true };
        } catch {
          /* best-effort — never block the save */
        }
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
        // Same safety fallback as the journal Advisor path: if the LLM path
        // fails before returning its C9 result, run the zero-cost local
        // classifier so red-zone audit answers do not save silently.
        try {
          const crisis = await classifyRecordTextForCrisis(
            args.body,
            args.locale,
            args.userId,
            args.minor === true,
          );
          if (crisis) aiFollowup = { text: crisis.text, zone: "red", fixedTemplate: true };
        } catch {
          /* best-effort — never block the save */
        }
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
      // Constellation layer A: tag the record with its life-domain slug at
      // insert (deterministic, no LLM) so the home's load-domain-levels can
      // group it. Detect from the user's own text (body + topic), not the AI
      // prompt; withDomainTag drops any user-forced domain:* tag first.
      tags: withDomainTag(args.tags, [args.body, args.topic].filter(Boolean).join("\n")),
      // 0066: machine-readable form payload for form-shaped captures.
      structured: args.structured ?? null,
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
    .select("id, kind, body, ai_followup, topic, summary, conclusion, tags, created_at, structured")
    .eq("user_id", userId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Read a single record by id (deep-space /record detail). RLS scopes to
// auth.uid(); the explicit user_id keeps the index-friendly WHERE first.
// Returns null when the id doesn't exist or isn't the caller's.
export async function getRecordById(userId: string, id: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("id, kind, body, ai_followup, topic, summary, conclusion, tags, created_at, structured")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
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
