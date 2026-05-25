// Inference Engine v1: synthesize a coarse persona from audit_response
// records. v1 is intentionally lightweight — no LLM extraction yet, just
// frequency counting + length heuristics over the framework tags from
// AUDIT_QUESTIONS. The full extraction (LLM persona chat over the full
// record set) lands in Sprint 3 once we have ≥50 entries per user.

import { AUDIT_QUESTIONS, type Framework } from "../audit/questions";
import { callGemini } from "../llm/gemini";
import { getSupabaseClient } from "../supabase/client";

export interface PersonaTraits {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface PersonaCard {
  version: number;
  traits: PersonaTraits;
  values: string[];
  patterns: Record<string, string>;
  markdownExport: string;
}

interface AuditResponseRow {
  id: string;
  prompt: string | null;
  body: string;
  created_at: string;
}

const DEFAULT_TRAITS: PersonaTraits = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
};

// Lightweight heuristic: longer, more nuanced answers nudge openness up;
// answers mentioning routine/discipline keywords nudge conscientiousness up.
// This is NOT a validated assessment — it's a v1 placeholder until the
// LLM extraction path is live. The markdown export labels it as such.
function scoreFromAnswers(rows: AuditResponseRow[]): PersonaTraits {
  if (rows.length === 0) return DEFAULT_TRAITS;
  const traits: PersonaTraits = { ...DEFAULT_TRAITS };
  const avgLen = rows.reduce((s, r) => s + r.body.length, 0) / rows.length;
  // Longer answers → higher openness signal (more reflection)
  traits.openness = Math.min(0.95, 0.4 + avgLen / 600);
  // Keywords (Korean + English) → conscientiousness signal
  const consKeywords = /\b(habit|routine|every day|discipline|매일|꾸준히|루틴|습관)\b/i;
  const consHits = rows.filter((r) => consKeywords.test(r.body)).length;
  traits.conscientiousness = Math.min(0.95, 0.4 + consHits * 0.15);
  return traits;
}

export async function buildPersona(userId: string, locale: "en" | "ko"): Promise<PersonaCard> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("id, prompt, body, created_at")
    .eq("user_id", userId)
    .eq("kind", "audit_response")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as AuditResponseRow[];

  const traits = scoreFromAnswers(rows);

  // Pull one short narrative summary from the LLM wrapper (mock or live).
  // This still goes through callGemini, so C9 + C3 hold.
  const summaryInput = rows
    .map((r, i) => `${i + 1}. Q: ${r.prompt ?? "(audit)"}\n   A: ${r.body}`)
    .join("\n");
  const summaryRes = await callGemini({
    userId,
    locale,
    purpose: "persona_chat",
    user: summaryInput || "no entries yet",
  });

  const persona: PersonaCard = {
    version: 1,
    traits,
    values: deriveValues(rows),
    patterns: { summary: summaryRes.text },
    markdownExport: renderMarkdown(traits, rows, summaryRes.text, locale),
  };

  // Persist for later reuse (RAG export, etc).
  await supabase
    .from("personas")
    .upsert(
      {
        user_id: userId,
        version: 1,
        traits,
        values: persona.values,
        patterns: persona.patterns,
        markdown_export: persona.markdownExport,
      },
      { onConflict: "user_id,version" },
    );

  return persona;
}

function deriveValues(rows: AuditResponseRow[]): string[] {
  // Take frameworks of questions the user actually answered; deduplicate.
  const answeredIds = new Set(rows.map((r) => r.prompt ?? "").map(matchQuestionId));
  const frameworks = new Set<Framework>();
  for (const q of AUDIT_QUESTIONS) {
    if (answeredIds.has(q.id)) frameworks.add(q.framework);
  }
  return [...frameworks];
}

function matchQuestionId(prompt: string): string | null {
  for (const q of AUDIT_QUESTIONS) {
    if (q.prompt.en === prompt || q.prompt.ko === prompt) return q.id;
  }
  return null;
}

function renderMarkdown(
  traits: PersonaTraits,
  rows: AuditResponseRow[],
  summary: string,
  locale: "en" | "ko",
): string {
  const title = locale === "ko" ? "# 두번째 뇌 — 페르소나 v1" : "# 2nd-Brain — Persona v1";
  const intro =
    locale === "ko"
      ? "_이 카드는 라이프 오딧 응답을 기반으로 생성한 초기 자기 모델입니다. v1은 휴리스틱 + LLM 요약이며, 검증된 평가가 아닙니다._"
      : "_This card is a starter self-model from your life-audit responses. v1 uses heuristics + LLM summary; not a validated assessment._";
  const traitLines = Object.entries(traits)
    .map(([k, v]) => `- **${k}**: ${(v * 100).toFixed(0)} / 100`)
    .join("\n");
  const entries = rows
    .slice(0, 5)
    .map((r) => `> ${r.body.slice(0, 200)}${r.body.length > 200 ? "…" : ""}`)
    .join("\n\n");
  return `${title}\n\n${intro}\n\n## Traits (Big Five proxy)\n${traitLines}\n\n## Narrative\n${summary}\n\n## Source entries\n${entries}\n`;
}
