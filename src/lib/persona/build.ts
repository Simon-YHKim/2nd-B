// Inference Engine v1: synthesize a coarse persona from audit_response
// records + TIPI Big Five assessments. v1 is intentionally lightweight —
// no LLM extraction yet, just frequency counting + length heuristics over
// the framework tags from AUDIT_QUESTIONS, with TIPI scores layered on top
// when present. The full extraction (LLM persona chat over the full record
// set) lands in Sprint 3 once we have ≥50 entries per user.
//
// TIPI scores (1-7) are normalized to 0-1 and OVERRIDE the heuristic
// trait estimates when a TIPI assessment exists — direct measurement beats
// keyword inference. The most recent TIPI run wins (handles repeated
// assessments). emotional_stability ↔ neuroticism is inverted.

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

export type TraitsSource = "bfi" | "heuristic";

// Per-trait provenance + confidence (SOKA: accuracy comes from knowing WHICH
// source a trait estimate rests on and HOW MANY observations back it). v1 uses
// one source globally, but the structure is per-trait so future layers (ESM,
// behavioral traces) can diverge confidence by trait. Powers anti-Barnum,
// evidence-framed copy ("from N entries · medium confidence").
export interface TraitConfidence {
  source: "questionnaire" | "journal_text" | "default";
  confidence: "low" | "medium" | "high";
  observationCount: number;
}

/** Map a source + observation count to a confidence estimate. Validated
 *  questionnaire (BFI) is high; heuristic journal_text scales with how many
 *  entries back it (≈5-10 independent observations ≈ reliable). */
export function traitConfidenceFor(source: TraitsSource, observationCount: number): TraitConfidence {
  if (source === "bfi") return { source: "questionnaire", confidence: "high", observationCount: 1 };
  if (observationCount <= 0) return { source: "default", confidence: "low", observationCount: 0 };
  const confidence = observationCount >= 15 ? "high" : observationCount >= 5 ? "medium" : "low";
  return { source: "journal_text", confidence, observationCount };
}

export interface PersonaMbti {
  type: string;
  scores: Record<"E" | "I" | "S" | "N" | "T" | "F" | "J" | "P", number>;
}

export interface PersonaAttachment {
  style: "secure" | "preoccupied" | "dismissing" | "fearful";
  anxiety: number;
  avoidance: number;
}

export interface PersonaCard {
  version: number;
  traits: PersonaTraits;
  /** Where `traits` came from — direct TIPI measurement or keyword heuristic. */
  traitsSource: TraitsSource;
  /** Per-trait provenance + confidence (SOKA). v1: uniform across traits.
   *  Optional so existing PersonaCard fixtures stay valid; buildPersona always sets it. */
  traitConfidence?: Record<keyof PersonaTraits, TraitConfidence>;
  /** Latest MBTI 16-type result if the user has taken the screener. */
  mbti: PersonaMbti | null;
  /** Latest ECR-S attachment result if available. */
  attachment: PersonaAttachment | null;
  values: string[];
  patterns: Record<string, string>;
  markdownExport: string;
}

interface AuditResponseRow {
  id: string;
  prompt: string | null;
  body: string;
  created_at: string;
  tags: string[] | null;
}

const DEFAULT_TRAITS: PersonaTraits = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
};

// Per-trait keyword sets used for v1 heuristic scoring. Each hit nudges the
// corresponding trait up; the dampening factor keeps a single keyword from
// dominating. KO and EN markers share a regex so the same scorer handles
// both locales.
const TRAIT_KEYWORDS: Record<keyof PersonaTraits, RegExp> = {
  // Length-driven; regex is a fallback that catches explicit curiosity cues.
  openness: /\b(curious|imagine|new idea|wonder|호기심|상상|새로운|궁금|배우고)\b/i,
  conscientiousness: /\b(habit|routine|every day|discipline|plan|매일|꾸준히|루틴|습관|계획)\b/i,
  // "we", "people", "friend"-style cues lift extraversion mildly.
  extraversion: /\b(friend|together|party|met up|talked|친구|만났|모임|어울)\b/i,
  // Empathy / care cues for agreeableness.
  agreeableness: /\b(help|kind|forgive|care for|sorry|도왔|배려|용서|미안|챙겼)\b/i,
  // Distress markers for neuroticism (yellow-zone equivalents — not crisis).
  neuroticism: /\b(anxious|worried|stressed|overwhelmed|lonely|불안|걱정|스트레스|외로워|지쳤)\b/i,
};

// Lightweight heuristic: longer answers nudge openness up; per-trait keyword
// hits nudge the matched trait up. v1 placeholder — full LLM extraction lands
// in Sprint 3 (≥50 entries per user). Markdown export labels it as such.
function scoreFromAnswers(rows: AuditResponseRow[]): PersonaTraits {
  if (rows.length === 0) return DEFAULT_TRAITS;
  const traits: PersonaTraits = { ...DEFAULT_TRAITS };
  const avgLen = rows.reduce((s, r) => s + r.body.length, 0) / rows.length;
  traits.openness = Math.min(0.95, 0.4 + avgLen / 600);
  for (const key of Object.keys(TRAIT_KEYWORDS) as (keyof PersonaTraits)[]) {
    const pattern = TRAIT_KEYWORDS[key];
    const hits = rows.filter((r) => pattern.test(r.body)).length;
    // Skip openness here — already set above. Skipping avoids double-counting.
    if (key === "openness") continue;
    traits[key] = Math.min(0.95, 0.4 + hits * 0.12);
  }
  return traits;
}

// Reads the memorize Engine's output and rolls it up into a {pattern_kind:
// count} histogram. Used to enrich the persona patterns dict beyond a
// single LLM summary string.
async function loadMemorizedHistogram(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("memorized_patterns")
    .select("pattern_kind")
    .eq("user_id", userId)
    .limit(500);
  if (error) {
    if (typeof console !== "undefined") console.warn("[persona] memorized read failed", error);
    return {};
  }
  const hist: Record<string, number> = {};
  for (const row of data ?? []) {
    const kind = (row as { pattern_kind: string }).pattern_kind;
    hist[kind] = (hist[kind] ?? 0) + 1;
  }
  return hist;
}

async function loadLatestMbti(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<PersonaMbti | null> {
  const { data, error } = await supabase
    .from("records")
    .select("body, created_at")
    .eq("user_id", userId)
    .contains("tags", ["mbti", "assessment"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  try {
    const parsed = JSON.parse((data[0] as { body: string }).body) as {
      type?: string;
      scores?: Record<"E" | "I" | "S" | "N" | "T" | "F" | "J" | "P", number>;
    };
    if (typeof parsed.type !== "string" || parsed.type.length !== 4 || !parsed.scores) return null;
    return { type: parsed.type, scores: parsed.scores };
  } catch {
    return null;
  }
}

async function loadLatestAttachment(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<PersonaAttachment | null> {
  const { data, error } = await supabase
    .from("records")
    .select("body, created_at")
    .eq("user_id", userId)
    .contains("tags", ["attachment", "ecr"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  try {
    const parsed = JSON.parse((data[0] as { body: string }).body) as {
      style?: PersonaAttachment["style"];
      anxiety?: number;
      avoidance?: number;
    };
    if (
      !parsed.style ||
      typeof parsed.anxiety !== "number" ||
      typeof parsed.avoidance !== "number"
    ) {
      return null;
    }
    return { style: parsed.style, anxiety: parsed.anxiety, avoidance: parsed.avoidance };
  } catch {
    return null;
  }
}

async function loadLatestBfi(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<{ openness: number; conscientiousness: number; extraversion: number; agreeableness: number; neuroticism: number } | null> {
  // BFI-44 (1-5 Likert) is the primary Big Five measure. Scores written by
  // /big-five carry tags ["big_five", "bfi", "assessment"]; we match on "bfi".
  const { data, error } = await supabase
    .from("records")
    .select("body, created_at")
    .eq("user_id", userId)
    .contains("tags", ["bfi"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  try {
    const parsed = JSON.parse((data[0] as { body: string }).body) as {
      scores?: { openness?: number; conscientiousness?: number; extraversion?: number; agreeableness?: number; neuroticism?: number };
    };
    const s = parsed.scores;
    if (!s || typeof s.openness !== "number") return null;
    return {
      openness: s.openness,
      conscientiousness: s.conscientiousness ?? 0,
      extraversion: s.extraversion ?? 0,
      agreeableness: s.agreeableness ?? 0,
      neuroticism: s.neuroticism ?? 0,
    };
  } catch {
    return null;
  }
}

export async function buildPersona(
  userId: string,
  locale: "en" | "ko",
  // C10: forwarded to callGemini so a minor's crisis output-swap routes to the
  // youth hotline (KO 1388 + 109), not adult-only. Defaults to adult routing.
  minor = false,
): Promise<PersonaCard> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("id, prompt, body, created_at, tags")
    .eq("user_id", userId)
    .eq("kind", "audit_response")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as AuditResponseRow[];

  // Big Five proxy: exclude drill-interview transcripts. They share
  // kind="audit_response" but carry the "interview" tag and pack a 50-turn
  // session into one multi-thousand-char body, which saturates the
  // length-driven openness heuristic in scoreFromAnswers. Scoring only the
  // short single-answer life-audit rows keeps avgLen representative. The full
  // rows set still feeds the narrative summary, values, and markdown below.
  const proxyRows = rows.filter((r) => !(r.tags ?? []).includes("interview"));
  let traits = scoreFromAnswers(proxyRows);
  let traitsSource: TraitsSource = "heuristic";

  // If a BFI-44 assessment exists, prefer it (1-5 → 0-1 normalize). BFI
  // measures neuroticism directly so no inversion is needed (unlike the
  // older TIPI which used emotional_stability).
  const bfi = await loadLatestBfi(supabase, userId);
  if (bfi) {
    const norm = (v: number) => Math.max(0, Math.min(1, (v - 1) / 4));
    traits = {
      openness: norm(bfi.openness),
      conscientiousness: norm(bfi.conscientiousness),
      extraversion: norm(bfi.extraversion),
      agreeableness: norm(bfi.agreeableness),
      neuroticism: norm(bfi.neuroticism),
    };
    traitsSource = "bfi";
  }

  const [memorized, mbti, attachment] = await Promise.all([
    loadMemorizedHistogram(supabase, userId),
    loadLatestMbti(supabase, userId),
    loadLatestAttachment(supabase, userId),
  ]);

  // Pull one short narrative summary from the LLM wrapper (mock or live).
  // Data-truth: only summarize when there are actual written entries. With no
  // audit/journal rows there is nothing to summarize, so we skip the LLM call
  // entirely and surface an honest empty message instead of letting the model
  // invent a generic (Barnum) persona from a "no entries yet" prompt. Traits,
  // MBTI, and attachment still surface from their own assessments above; only
  // this narrative slot is gated. (Also avoids a needless paid call.)
  let summaryText: string;
  if (rows.length > 0) {
    const summaryInput = rows
      .map((r, i) => `${i + 1}. Q: ${r.prompt ?? "(audit)"}\n   A: ${r.body}`)
      .join("\n");
    // This still goes through callGemini, so C9 + C3 hold.
    const summaryRes = await callGemini({
      userId,
      locale,
      purpose: "persona_chat",
      user: summaryInput,
      minor,
    });
    summaryText = summaryRes.text;
  } else {
    summaryText =
      locale === "ko"
        ? "아직 글로 남긴 기록이 없어서 요약할 이야기가 없어요. 한 줄이라도 적으면 여기에 패턴이 보이기 시작해요."
        : "No written entries yet to summarize. Add even one and your patterns start to show here.";
  }

  const patterns: Record<string, string> = { summary: summaryText };
  // Surface the top-3 memorized pattern kinds as their own patterns entries
  // so the persona screen can show "you've been writing about attachment
  // (8x), career (3x)" beneath the LLM summary.
  const topKinds = Object.entries(memorized)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  for (const [kind, count] of topKinds) {
    patterns[`top_${kind}`] = `${count}`;
  }

  // Per-trait confidence (SOKA). v1 uses one source globally, so all traits
  // share it; observationCount = BFI run (1) or the journal rows behind the
  // heuristic. Surfaced in markdown + available to UI for evidence framing.
  const tc = traitConfidenceFor(traitsSource, traitsSource === "bfi" ? 1 : proxyRows.length);
  const traitConfidence: Record<keyof PersonaTraits, TraitConfidence> = {
    openness: tc, conscientiousness: tc, extraversion: tc, agreeableness: tc, neuroticism: tc,
  };

  const persona: PersonaCard = {
    version: 1,
    traits,
    traitsSource,
    traitConfidence,
    mbti,
    attachment,
    values: deriveValues(rows),
    patterns,
    markdownExport: renderMarkdown(traits, rows, summaryText, locale, topKinds, mbti, attachment, tc),
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
  topKinds: [string, number][] = [],
  mbti: PersonaMbti | null = null,
  attachment: PersonaAttachment | null = null,
  tc: TraitConfidence | null = null,
): string {
  const title = locale === "ko" ? "# 두번째 뇌 — 페르소나 v1" : "# 2nd-Brain — Persona v1";
  const intro =
    locale === "ko"
      ? "_이 카드는 라이프 오딧 응답을 기반으로 생성한 초기 자기 모델입니다. v1은 휴리스틱 + LLM 요약이며, 검증된 평가가 아닙니다._"
      : "_This card is a starter self-model from your life-audit responses. v1 uses heuristics + LLM summary; not a validated assessment._";
  const traitLines = Object.entries(traits)
    .map(([k, v]) => `- **${k}**: ${(v * 100).toFixed(0)} / 100`)
    .join("\n");
  const confWord = (c: TraitConfidence["confidence"]) =>
    locale === "ko" ? (c === "high" ? "높음" : c === "medium" ? "보통" : "낮음") : c;
  const srcWord = (s: TraitConfidence["source"]) =>
    s === "questionnaire"
      ? locale === "ko" ? "검사 응답" : "questionnaire"
      : s === "journal_text"
        ? locale === "ko" ? "기록 분석" : "journal entries"
        : locale === "ko" ? "기본값" : "default";
  const confidenceNote = tc
    ? locale === "ko"
      ? `\n\n_추정 근거: ${srcWord(tc.source)} · 신뢰도 ${confWord(tc.confidence)} (관찰 ${tc.observationCount}건). 판단이 아니라 기록에서 보이는 패턴입니다._`
      : `\n\n_Basis: ${srcWord(tc.source)} · ${confWord(tc.confidence)} confidence (${tc.observationCount} observations). Patterns seen in your records, not a verdict._`
    : "";
  const entries = rows
    .slice(0, 5)
    .map((r) => `> ${r.body.slice(0, 200)}${r.body.length > 200 ? "…" : ""}`)
    .join("\n\n");
  const patternsSection = topKinds.length
    ? `\n\n## ${locale === "ko" ? "관찰된 패턴" : "Observed patterns"}\n` +
      topKinds.map(([k, n]) => `- ${k}: ${n}${locale === "ko" ? "회 관찰" : "× observed"}`).join("\n")
    : "";
  const mbtiSection = mbti
    ? `\n\n## MBTI\n- ${locale === "ko" ? "유형" : "Type"}: **${mbti.type}**`
    : "";
  const attachmentSection = attachment
    ? `\n\n## ${locale === "ko" ? "애착 스타일" : "Attachment style"}\n` +
      `- ${locale === "ko" ? "스타일" : "Style"}: **${attachment.style}**\n` +
      `- ${locale === "ko" ? "불안" : "Anxiety"}: ${attachment.anxiety.toFixed(1)} / 7\n` +
      `- ${locale === "ko" ? "회피" : "Avoidance"}: ${attachment.avoidance.toFixed(1)} / 7`
    : "";
  return `${title}\n\n${intro}\n\n## Traits (Big Five proxy)\n${traitLines}${confidenceNote}${mbtiSection}${attachmentSection}${patternsSection}\n\n## Narrative\n${summary}\n\n## Source entries\n${entries}\n`;
}
