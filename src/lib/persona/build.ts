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
import type { ValueId } from "./values-survey";
import type { StrengthId } from "./strengths-survey";
import type { MotivationNeedKey } from "./motivation-survey";
import { callGemini } from "../llm/gemini";
import { personaSynthesisSystem } from "./synthesis-prompt";
import { getSupabaseClient } from "../supabase/client";
import { isValidMbtiResult, type MbtiScores } from "./assessment-shapes";
import type { LadderLevel } from "./brightness";
import { soulCoreBrightness, type StarId } from "./stars";
import { deriveStarLevels } from "./star-levels";
import { loadEsmCount } from "./esm-count";
import { recordStarTiers } from "./record-star-tiers";

export interface PersonaTraits {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export type TraitsSource = "ipip" | "bfi" | "heuristic";

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

/** Map a source + observation count to a confidence estimate. A validated
 *  questionnaire (BFI-44 or IPIP-NEO-120) is high; heuristic journal_text scales
 *  with how many entries back it (≈5-10 independent observations ≈ reliable). */
export function traitConfidenceFor(source: TraitsSource, observationCount: number): TraitConfidence {
  if (isMeasuredSource(source)) return { source: "questionnaire", confidence: "high", observationCount: 1 };
  if (observationCount <= 0) return { source: "default", confidence: "low", observationCount: 0 };
  const confidence = observationCount >= 15 ? "high" : observationCount >= 5 ? "medium" : "low";
  return { source: "journal_text", confidence, observationCount };
}

/** True when traits came from a validated Big Five questionnaire (BFI-44 or
 *  IPIP-NEO-120) rather than the journal-text heuristic. */
export function isMeasuredSource(source: TraitsSource): boolean {
  return source === "bfi" || source === "ipip";
}

/** Display name of the instrument behind a measured traits source (null for the
 *  heuristic). IPIP-NEO-120 is the 120-item facet-level measure; BFI-44 the 44-item. */
export function instrumentLabel(source: TraitsSource): string | null {
  if (source === "ipip") return "IPIP-NEO-120";
  if (source === "bfi") return "BFI-44";
  return null;
}

export interface PersonaMbti {
  type: string;
  scores: MbtiScores;
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
  /** Per-star L1-L5 brightness derived from this card's signals (Phase A canon:
   *  stars.ts + brightness.ts). Optional so existing fixtures stay valid;
   *  buildPersona always sets it. */
  starLevels?: Record<StarId, LadderLevel>;
  /** Soul Core (북극성) aggregate brightness 0-1 from starLevels (D8). */
  soulCoreBrightness?: number;
  /** Resolvable evidence refs (0060): the `record:<id>` of the rows this card was
   *  actually built from (most-recent first, bounded). The SYSTEM's provenance —
   *  not the LLM's free-form citations — so a downstream tier change can cite real,
   *  openable records. Optional so existing fixtures stay valid; buildPersona sets it. */
  evidenceRefs?: string[];
  markdownExport: string;
}

export interface AuditResponseRow {
  id: string;
  prompt: string | null;
  body: string;
  created_at: string;
  tags: string[] | null;
}

const BFI_TRAIT_KEYS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;
type BfiTraitKey = (typeof BFI_TRAIT_KEYS)[number];
type BfiScores = Record<BfiTraitKey, number>;

function hasCompleteBfiScores(scores: Partial<BfiScores> | undefined): scores is BfiScores {
  return !!scores && BFI_TRAIT_KEYS.every((key) => Number.isFinite(scores[key]));
}

// Cap on how many record refs a card carries as evidence. Matches the write-
// boundary MAX_CITATIONS in record-star-tiers.ts so nothing is silently dropped
// downstream; keeps the persisted row small.
const EVIDENCE_REF_LIMIT = 8;

export const DEFAULT_TRAITS: PersonaTraits = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
};

// Per-trait keyword sets used for v1 heuristic scoring. Each hit nudges the
// corresponding trait up; the dampening factor keeps a single keyword from
// dominating. ASCII and Korean markers are checked SEPARATELY (mirroring
// detect-domain.ts): \b word boundaries are defined against \w=[A-Za-z0-9_], so
// Hangul has no boundary and \b-wrapped Korean can NEVER match — the Korean
// markers must be plain substring includes() instead, or the whole KR audience's
// heuristic Big Five silently stays pinned to the base value.
const TRAIT_KEYWORDS: Record<keyof PersonaTraits, { ascii: RegExp; korean: string[] }> = {
  // Length-driven; regex is a fallback that catches explicit curiosity cues.
  openness: { ascii: /\b(curious|imagine|new idea|wonder)\b/i, korean: ["호기심", "상상", "새로운", "궁금", "배우고"] },
  conscientiousness: { ascii: /\b(habit|routine|every day|discipline|plan)\b/i, korean: ["매일", "꾸준히", "루틴", "습관", "계획"] },
  // "we", "people", "friend"-style cues lift extraversion mildly.
  extraversion: { ascii: /\b(friend|together|party|met up|talked)\b/i, korean: ["친구", "만났", "모임", "어울"] },
  // Empathy / care cues for agreeableness.
  agreeableness: { ascii: /\b(help|kind|forgive|care for|sorry)\b/i, korean: ["도왔", "배려", "용서", "미안", "챙겼"] },
  // Distress markers for neuroticism (yellow-zone equivalents, not crisis).
  neuroticism: { ascii: /\b(anxious|worried|stressed|overwhelmed|lonely)\b/i, korean: ["불안", "걱정", "스트레스", "외로워", "지쳤"] },
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
    // Openness is length-driven above; skip its keyword match (avoids double-counting).
    if (key === "openness") continue;
    const { ascii, korean } = TRAIT_KEYWORDS[key];
    const hits = rows.filter((r) => ascii.test(r.body) || korean.some((k) => r.body.includes(k))).length;
    traits[key] = Math.min(0.95, 0.4 + hits * 0.12);
  }
  return traits;
}

// Exported for unit testing the locale-aware heuristic scorer (KO markers must
// match via substring, not \b regex). Not part of the public build API.
export const __test_scoreFromAnswers = scoreFromAnswers;

// Reads the memorize Engine's output and rolls it up into a {pattern_kind:
// count} histogram. Used to enrich the persona patterns dict beyond a
// single LLM summary string.
export async function loadMemorizedHistogram(
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
    const parsed = JSON.parse((data[0] as { body: string }).body);
    if (!isValidMbtiResult(parsed)) return null;
    return { type: parsed.type, scores: parsed.scores };
  } catch {
    return null;
  }
}

export async function loadLatestAttachment(
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

export async function loadLatestBfi(
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
      scores?: Partial<BfiScores>;
    };
    const s = parsed.scores;
    if (!hasCompleteBfiScores(s)) return null;
    return {
      openness: s.openness,
      conscientiousness: s.conscientiousness,
      extraversion: s.extraversion,
      agreeableness: s.agreeableness,
      neuroticism: s.neuroticism,
    };
  } catch {
    return null;
  }
}

export interface LoadedValues {
  /** Per-value 0-100 scores, sorted descending (highest first). */
  scores: { value: ValueId; score: number }[];
  /** 0..1 honest confidence stored with the self-report. */
  confidence: number;
}

export async function loadLatestValues(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<LoadedValues | null> {
  // Values self-report (values-survey.ts). The /values survey writes a record
  // tagged ["values", "assessment"] whose body carries { values_responses,
  // scores, confidence }. Mirrors loadLatestBfi: newest row, JSON.parse(body).
  const { data, error } = await supabase
    .from("records")
    .select("body, created_at")
    .eq("user_id", userId)
    .contains("tags", ["values", "assessment"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  try {
    const parsed = JSON.parse((data[0] as { body: string }).body) as {
      scores?: { value?: string; score?: number }[];
      confidence?: number;
    };
    if (!Array.isArray(parsed.scores) || parsed.scores.length === 0) return null;
    const scores = parsed.scores
      .filter(
        (s): s is { value: ValueId; score: number } =>
          !!s && typeof s.value === "string" && typeof s.score === "number" && Number.isFinite(s.score),
      )
      .map((s) => ({ value: s.value, score: s.score }));
    if (scores.length === 0) return null;
    // Newest-first already, but the writer sorts descending too — re-sort so a
    // hand-edited or legacy row can't render an out-of-order spectrum.
    scores.sort((a, b) => b.score - a.score);
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? parsed.confidence
        : 0;
    return { scores, confidence };
  } catch {
    return null;
  }
}

export interface LoadedStrengths {
  /** Per-strength 0-100 scores, sorted descending (highest first). */
  scores: { strength: StrengthId; score: number }[];
  /** 0..1 honest confidence stored with the self-report. */
  confidence: number;
}

export async function loadLatestStrengths(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<LoadedStrengths | null> {
  // Strengths self-report (strengths-survey.ts). The /strengths survey writes a
  // record tagged ["strengths", "assessment"] whose body carries {
  // strengths_responses, scores, confidence }. Mirrors loadLatestValues: newest
  // row, JSON.parse(body).
  const { data, error } = await supabase
    .from("records")
    .select("body, created_at")
    .eq("user_id", userId)
    .contains("tags", ["strengths", "assessment"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  try {
    const parsed = JSON.parse((data[0] as { body: string }).body) as {
      scores?: { strength?: string; score?: number }[];
      confidence?: number;
    };
    if (!Array.isArray(parsed.scores) || parsed.scores.length === 0) return null;
    const scores = parsed.scores
      .filter(
        (s): s is { strength: StrengthId; score: number } =>
          !!s && typeof s.strength === "string" && typeof s.score === "number" && Number.isFinite(s.score),
      )
      .map((s) => ({ strength: s.strength, score: s.score }));
    if (scores.length === 0) return null;
    // Newest-first already, but the writer sorts descending too — re-sort so a
    // hand-edited or legacy row can't render an out-of-order spectrum.
    scores.sort((a, b) => b.score - a.score);
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? parsed.confidence
        : 0;
    return { scores, confidence };
  } catch {
    return null;
  }
}

export interface LoadedMotivation {
  /** Per-SDT-need 0-100 scores (autonomy/competence/relatedness), sorted descending. */
  needs: { key: MotivationNeedKey; score: number }[];
  /** Intrinsic share of the intrinsic↔extrinsic balance, 0-100. */
  intrinsicPct: number;
  /** Extrinsic share, 0-100 (complement of intrinsicPct). */
  extrinsicPct: number;
  /** 0..1 honest confidence stored with the self-report. */
  confidence: number;
}

export async function loadLatestMotivation(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<LoadedMotivation | null> {
  // Motivation self-report (motivation-survey.ts). The /motivation survey writes
  // a record tagged ["motivation", "assessment"] whose body carries {
  // motivation_responses, needs, intrinsicPct, extrinsicPct, confidence }. Mirrors
  // loadLatestStrengths: newest row, JSON.parse(body).
  const { data, error } = await supabase
    .from("records")
    .select("body, created_at")
    .eq("user_id", userId)
    .contains("tags", ["motivation", "assessment"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  try {
    const parsed = JSON.parse((data[0] as { body: string }).body) as {
      needs?: { key?: string; score?: number }[];
      intrinsicPct?: number;
      extrinsicPct?: number;
      confidence?: number;
    };
    if (!Array.isArray(parsed.needs) || parsed.needs.length === 0) return null;
    const needs = parsed.needs
      .filter(
        (n): n is { key: MotivationNeedKey; score: number } =>
          !!n && typeof n.key === "string" && typeof n.score === "number" && Number.isFinite(n.score),
      )
      .map((n) => ({ key: n.key, score: n.score }));
    if (needs.length === 0) return null;
    // Newest-first already, but the writer sorts descending too — re-sort so a
    // hand-edited or legacy row can't render an out-of-order spectrum.
    needs.sort((a, b) => b.score - a.score);
    const intrinsicPct =
      typeof parsed.intrinsicPct === "number" && Number.isFinite(parsed.intrinsicPct)
        ? parsed.intrinsicPct
        : 50;
    const extrinsicPct =
      typeof parsed.extrinsicPct === "number" && Number.isFinite(parsed.extrinsicPct)
        ? parsed.extrinsicPct
        : 100 - intrinsicPct;
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? parsed.confidence
        : 0;
    return { needs, intrinsicPct, extrinsicPct, confidence };
  } catch {
    return null;
  }
}

export async function loadLatestIpip(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<{ openness: number; conscientiousness: number; extraversion: number; agreeableness: number; neuroticism: number; facets: Record<string, number> } | null> {
  // IPIP-NEO-120 (1-5 Likert) is the facet-level measure. /ipip-neo writes a record
  // tagged ["ipip_neo", ...] whose body carries the 5 domain means + 30 facet means.
  // Same 5 domains as BFI, so the domains feed the persona/lens identically; the 30
  // facets are the precision layer the facet lens renders.
  const { data, error } = await supabase
    .from("records")
    .select("body, created_at")
    .eq("user_id", userId)
    .contains("tags", ["ipip_neo"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  try {
    const parsed = JSON.parse((data[0] as { body: string }).body) as {
      domains?: Partial<Record<"openness" | "conscientiousness" | "extraversion" | "agreeableness" | "neuroticism", number>>;
      facets?: Record<string, number>;
    };
    const d = parsed.domains;
    const keys = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"] as const;
    if (!d || !keys.every((k) => typeof d[k] === "number" && Number.isFinite(d[k]))) return null;
    const facets: Record<string, number> = {};
    if (parsed.facets && typeof parsed.facets === "object") {
      for (const [k, v] of Object.entries(parsed.facets)) {
        if (typeof v === "number" && Number.isFinite(v)) facets[k] = v;
      }
    }
    return {
      openness: d.openness as number,
      conscientiousness: d.conscientiousness as number,
      extraversion: d.extraversion as number,
      agreeableness: d.agreeableness as number,
      neuroticism: d.neuroticism as number,
      facets,
    };
  } catch {
    return null;
  }
}

// D-26 backlog #5 — narrative summary cache + input windowing.
// The LLM summary used to be rebuilt on EVERY mount of persona / core-brain /
// iden (3+ identical flash calls minutes apart) with ALL audit_response bodies
// plus whole interview transcripts as input (unbounded token growth). The
// summary is now cached in personas.patterns keyed by a staleness signature
// (row count + newest created_at + locale), and its input is windowed.
const SUMMARY_SIG_VERSION = "v1";
const MAX_SUMMARY_ROWS = 120;
const MAX_SUMMARY_BODY_CHARS = 500;
// The edge proxy caps the `user` channel at 8000 chars (gemini-proxy
// MAX_USER_LEN) — an unbudgeted join would 413 on the web build and kill the
// whole persona build for heavy users. Budget with margin.
const MAX_SUMMARY_INPUT_CHARS = 7400;
// Explicit fetch bound for the records query. PostgREST silently truncates
// unbounded selects at the server's max_rows (default 1000); fetching
// newest-first with an explicit limit makes truncation keep the NEWEST rows,
// so the cache signature keeps moving as records are added.
const MAX_PERSONA_ROWS = 1000;

/** Staleness signature for the cached narrative summary. Pure (exported for
 *  tests). Any new/removed record or locale switch changes it. */
export function personaSummarySig(
  locale: "en" | "ko",
  rowCount: number,
  lastCreatedAt: string,
): string {
  return `${SUMMARY_SIG_VERSION}:${locale}:${rowCount}:${lastCreatedAt}`;
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
    .order("created_at", { ascending: false })
    .limit(MAX_PERSONA_ROWS);
  if (error) throw error;
  // Newest-first fetch (truncation-safe), restored to ascending for the
  // consumers below (numbering, values ranking, evidenceRefs slice(-N)).
  const rows = ((data ?? []) as AuditResponseRow[]).slice().reverse();

  // Big Five proxy: exclude drill-interview transcripts. They share
  // kind="audit_response" but carry the "interview" tag and pack a 50-turn
  // session into one multi-thousand-char body, which saturates the
  // length-driven openness heuristic in scoreFromAnswers. Scoring only the
  // short single-answer life-audit rows keeps avgLen representative. The full
  // rows set still feeds the narrative summary, values, and markdown below.
  const proxyRows = rows.filter((r) => !(r.tags ?? []).includes("interview"));
  let traits = scoreFromAnswers(proxyRows);
  let traitsSource: TraitsSource = "heuristic";

  // Prefer a validated Big Five questionnaire over the heuristic (1-5 → 0-1
  // normalize; both measure neuroticism directly, so no inversion — unlike the
  // older TIPI's emotional_stability). When both exist, IPIP-NEO-120 (120 items,
  // facet-level) outranks BFI-44 (44 items) for the same five domains.
  const [ipip, bfi] = await Promise.all([
    loadLatestIpip(supabase, userId),
    loadLatestBfi(supabase, userId),
  ]);
  const measured = ipip ?? bfi;
  if (measured) {
    const norm = (v: number) => Math.max(0, Math.min(1, (v - 1) / 4));
    traits = {
      openness: norm(measured.openness),
      conscientiousness: norm(measured.conscientiousness),
      extraversion: norm(measured.extraversion),
      agreeableness: norm(measured.agreeableness),
      neuroticism: norm(measured.neuroticism),
    };
    traitsSource = ipip ? "ipip" : "bfi";
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
  let summarySig: string | null = null;
  if (rows.length > 0) {
    // Input basis: interview transcripts excluded (like the trait heuristic);
    // fall back to the full set when ONLY interview rows exist, so the input
    // is never empty while records exist.
    const summaryBase = proxyRows.length > 0 ? proxyRows : rows;
    // Sign the basis actually summarized — signing ALL rows would force a
    // paid re-summarize on byte-identical input after every interview
    // session (interview rows are excluded from the input below).
    summarySig = personaSummarySig(
      locale,
      summaryBase.length,
      summaryBase[summaryBase.length - 1]?.created_at ?? "",
    );
    // Read-back cache: personas.patterns carries the last summary + its
    // signature. A fresh signature means no records changed since the last
    // build — reuse the summary and skip the LLM call entirely (this is what
    // turns the 3-screen mount storm into one call per data change).
    let cachedSummary: string | null = null;
    try {
      const { data: personaRow } = await supabase
        .from("personas")
        .select("patterns")
        .eq("user_id", userId)
        .eq("version", 1)
        .maybeSingle();
      const pat = (personaRow as { patterns?: Record<string, unknown> } | null)?.patterns;
      if (
        pat &&
        pat.__summary_sig === summarySig &&
        typeof pat.summary === "string" &&
        pat.summary.length > 0
      ) {
        cachedSummary = pat.summary;
      }
    } catch {
      // Cache read is best-effort — a miss just means one LLM call.
    }

    if (cachedSummary != null) {
      summaryText = cachedSummary;
    } else {
      // Input windowing: newest rows first under BOTH a row cap and a
      // character budget (the summary is a 2-3 sentence mirror, not an
      // archive read — and the proxy's 8000-char user cap would 413 an
      // unbudgeted join). Restored to ascending for the numbering.
      const picked: typeof summaryBase = [];
      let budget = MAX_SUMMARY_INPUT_CHARS;
      for (let i = summaryBase.length - 1; i >= 0 && picked.length < MAX_SUMMARY_ROWS; i--) {
        const r = summaryBase[i];
        const lineLen =
          (r.prompt ?? "(audit)").length + Math.min(r.body.length, MAX_SUMMARY_BODY_CHARS) + 16;
        if (lineLen > budget) break;
        budget -= lineLen;
        picked.push(r);
      }
      picked.reverse();
      const summaryInput = picked
        .map((r, i) => `${i + 1}. Q: ${r.prompt ?? "(audit)"}\n   A: ${r.body.slice(0, MAX_SUMMARY_BODY_CHARS)}`)
        .join("\n");
      // This still goes through callGemini, so C9 + C3 hold.
      const summaryRes = await callGemini({
        userId,
        locale,
        purpose: "persona_narrative",
        // Guide the synthesis toward an honest, grounded, balanced mirror (was
        // unguided). Trusted system channel; the entries still ride `user` and stay
        // crisis-scanned, so C9/C3 are unaffected.
        system: personaSynthesisSystem(locale),
        user: summaryInput,
        minor,
      });
      summaryText = summaryRes.text;
    }
  } else {
    summaryText =
      locale === "ko"
        ? "아직 글로 남긴 기록이 없어서 요약할 이야기가 없어요. 한 줄이라도 적으면 여기에 패턴이 보이기 시작해요."
        : "No written entries yet to summarize. Add even one and your patterns start to show here.";
  }

  const patterns: Record<string, string> = { summary: summaryText };
  // Cache key for the summary (double-underscore prefix: the persona screen
  // only renders `summary` and `top_*` keys, so this never reaches the UI).
  if (summarySig) patterns.__summary_sig = summarySig;
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
  const tc = traitConfidenceFor(traitsSource, isMeasuredSource(traitsSource) ? 1 : proxyRows.length);
  const traitConfidence: Record<keyof PersonaTraits, TraitConfidence> = {
    openness: tc, conscientiousness: tc, extraversion: tc, agreeableness: tc, neuroticism: tc,
  };

  // Resolvable provenance (0060): the record ids this card was actually built
  // from, newest-first and bounded. These are the SYSTEM's evidence refs — what
  // a ratified tier change cites — never the LLM's invented citation labels.
  const evidenceRefs = rows
    .slice(-EVIDENCE_REF_LIMIT)
    .reverse()
    .map((r) => `record:${r.id}`);

  const persona: PersonaCard = {
    version: 1,
    traits,
    traitsSource,
    traitConfidence,
    mbti,
    attachment,
    values: deriveValues(rows),
    patterns,
    evidenceRefs,
    markdownExport: renderMarkdown(traits, rows, summaryText, locale, topKinds, mbti, attachment, tc),
  };

  // Phase A: derive the seven-star L1-L5 levels + Soul Core (북극성) brightness
  // from the card's own signals (compute-on-build; persistence is a later unit
  // per D9). Deterministic + LLM-free - the INSTRUMENT layer decides the levels.
  const esmCount = await loadEsmCount(userId);
  persona.starLevels = deriveStarLevels(persona, esmCount);
  persona.soulCoreBrightness = soulCoreBrightness(persona.starLevels);
  // D9 (memo §10): persist this build's tiers so detectTierShift can later spot a
  // changed tendency. Fire-and-forget + best-effort - never blocks the build.
  void recordStarTiers(userId, persona.starLevels, "journal", { origin: "rebuild" });

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

export function deriveValues(rows: AuditResponseRow[]): string[] {
  // Frameworks of questions the user actually answered, ranked by how many of
  // each framework's questions they answered (descending). values[0] is then
  // the framework they engaged most — matching the "most-frequented" / top-fuel
  // framing in the persona center + self-portrait. Previously this returned
  // frameworks in AUDIT_QUESTIONS declaration order, so values[0] was just the
  // earliest-declared answered framework (pinned to sdt:autonomy for most
  // users) regardless of actual engagement. Declaration order breaks ties.
  const answeredIds = new Set(rows.map((r) => r.prompt ?? "").map(matchQuestionId));
  const counts = new Map<Framework, number>();
  const firstSeen = new Map<Framework, number>();
  let order = 0;
  for (const q of AUDIT_QUESTIONS) {
    if (!answeredIds.has(q.id)) continue;
    if (!counts.has(q.framework)) firstSeen.set(q.framework, order++);
    counts.set(q.framework, (counts.get(q.framework) ?? 0) + 1);
  }
  return [...counts.keys()].sort(
    (a, b) => (counts.get(b)! - counts.get(a)!) || (firstSeen.get(a)! - firstSeen.get(b)!),
  );
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
