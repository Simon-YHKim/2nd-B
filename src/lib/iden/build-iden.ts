// IDEN builder — Supabase/persona data -> IdenDoc (queue B).
//
// composeIdenDoc is PURE (a PersonaCard + counts + extras in, an IdenDoc out)
// and is where every honesty decision lives: a field is emitted only when real
// evidence backs it, with a truthful `source.kind` (spec §4: missing data is
// never faked). buildIdenDoc is the thin fetcher that pulls the persona and the
// live vault counts, then composes — mirroring wiki/context-pack's
// composeContextPack (pure, tested) + exportContextPack (fetcher) split.
//
// The AI summary is reused from the persona's already-guarded narrative
// (persona.patterns.summary, produced via callGemini under C1/C9/C3) — this
// builder adds no new LLM call. Output is canonical: pass locale "en" for the
// portable `.iden`, "ko" for a localized sheet (IDEN-SPEC §1/§7, C7 parity).

import { STYLE_LABEL } from "../persona/attachment";
import { labelFramework } from "../audit/frameworkLabels";
import { TYPE_NICKNAME } from "../persona/mbti";
import { buildPersona, type PersonaCard, type PersonaTraits } from "../persona/build";
import { getSupabaseClient } from "../supabase/client";
import type { IdenDoc, IdenField, IdenSource } from "./types";

type Locale = "en" | "ko";

// The "positive" Big Five facets surfaced as patterns. Neuroticism (shown as the
// non-clinical "Sensitivity" in the radar) is intentionally excluded here so a
// high score does not read as a headline "pattern" label.
type PatternTrait = "openness" | "conscientiousness" | "extraversion" | "agreeableness";
const PATTERN_TRAITS: PatternTrait[] = ["openness", "conscientiousness", "extraversion", "agreeableness"];

// Localized labels and value words. Field `key`s stay language-neutral (C7);
// only labels and shown values localize. Core node names stay English so the
// renderer's color map (keyed by Soul/Growth/Wisdom/Bond/Muse/Record) holds.
const L: Record<Locale, {
  traits: string; patterns: string; type: string; attachment: string;
  drivers: string; cores: string; contents: string;
  trait: Record<keyof PersonaTraits, string>;
  adj: Record<PatternTrait, string>;
  content: { sources: string; records: string; concepts: string };
  nameFallback: string; oneLinerFallback: string;
}> = {
  en: {
    traits: "Traits", patterns: "Patterns", type: "Type", attachment: "Attachment",
    drivers: "Drivers", cores: "Cores", contents: "Contents",
    trait: { openness: "Openness", conscientiousness: "Conscientiousness", extraversion: "Extraversion", agreeableness: "Agreeableness", neuroticism: "Sensitivity" },
    adj: { openness: "Inquisitive", conscientiousness: "Diligent", extraversion: "Outgoing", agreeableness: "Warm" },
    content: { sources: "Sources", records: "Records", concepts: "Concepts" },
    nameFallback: "You",
    oneLinerFallback: "Building a record of myself, to think with.",
  },
  ko: {
    traits: "특성", patterns: "패턴", type: "유형", attachment: "애착",
    drivers: "원동력", cores: "코어", contents: "콘텐츠",
    trait: { openness: "개방성", conscientiousness: "성실성", extraversion: "외향성", agreeableness: "친화성", neuroticism: "민감성" },
    adj: { openness: "탐구적", conscientiousness: "성실한", extraversion: "활달한", agreeableness: "따뜻한" },
    content: { sources: "소스", records: "기록", concepts: "개념" },
    nameFallback: "나",
    oneLinerFallback: "나를 기록으로 쌓아가는 중.",
  },
};

const PATTERN_THRESHOLD = 0.6;

export interface VaultCounts {
  sources: number;
  records: number;
  concepts: number;
}

export interface ComposeIdenOpts {
  /** Display name; no profile-name source exists yet, so falls back when absent. */
  name?: string | null;
  /** One-line self description; falls back to a neutral line when absent. */
  oneLiner?: string | null;
  counts: VaultCounts;
  /** Recurring topic tags for the contents donut (top-N kept). */
  topics?: string[];
  /** Real AI narrative; null/empty stays absent (never a fabricated summary). */
  summary?: string | null;
  /** ISO date; defaults to today. */
  generated?: string;
  /** Format version; defaults to "0.1". */
  iden?: string;
  locale?: Locale;
}

/** The leaf word of a framework label ("Self-Determination · Autonomy" -> "Autonomy"). */
function driverLabel(framework: string, locale: Locale): string {
  const full = labelFramework(framework, locale);
  const parts = full.split("·");
  return parts[parts.length - 1].trim();
}

function contentsField(label: string, data: Record<string, number>, topics?: string[]): IdenField {
  const base = { key: "contents", label, viz: "donut" as const, placement: "main" as const, source: { kind: "count" as const }, data };
  return topics && topics.length > 0 ? { ...base, topics } : base;
}

/**
 * Compose an IdenDoc from a PersonaCard + vault counts. Pure. Fields appear only
 * when backed by real evidence; each carries an honest `source.kind`.
 */
export function composeIdenDoc(persona: PersonaCard | null, opts: ComposeIdenOpts): IdenDoc {
  const locale: Locale = opts.locale ?? "en";
  const l = L[locale];
  const fields: IdenField[] = [];

  // --- traits + patterns: only with backing evidence ---
  if (persona) {
    const measured = persona.traitsSource === "bfi";
    const obs = persona.traitConfidence?.openness.observationCount ?? 0;
    if (measured || obs > 0) {
      const t = persona.traits;
      const src: IdenSource = measured ? { kind: "measured", instrument: "BFI-44" } : { kind: "derived" };
      fields.push({
        key: "traits",
        label: l.traits,
        viz: "radar",
        placement: "both",
        source: src,
        data: {
          [l.trait.openness]: t.openness,
          [l.trait.conscientiousness]: t.conscientiousness,
          [l.trait.extraversion]: t.extraversion,
          [l.trait.agreeableness]: t.agreeableness,
          [l.trait.neuroticism]: t.neuroticism,
        },
      });

      const patterns = PATTERN_TRAITS.map((k) => ({ k, v: t[k] }))
        .filter((x) => x.v >= PATTERN_THRESHOLD)
        .sort((a, b) => b.v - a.v)
        .slice(0, 3)
        .map((x) => l.adj[x.k]);
      if (patterns.length > 0) {
        fields.push({ key: "patterns", label: l.patterns, viz: "tags", placement: "main", source: src, data: patterns });
      }
    }
  }

  // --- type (MBTI) ---
  if (persona?.mbti?.type) {
    fields.push({ key: "type", label: l.type, viz: "badge", placement: "main", source: { kind: "assessment" }, data: persona.mbti.type });
  }

  // --- attachment (ECR-S) ---
  if (persona?.attachment?.style) {
    fields.push({
      key: "attachment",
      label: l.attachment,
      viz: "badge",
      placement: "main",
      source: { kind: "instrument", instrument: "ECR-S" },
      data: STYLE_LABEL[locale][persona.attachment.style],
    });
  }

  // --- drivers (top engaged value frameworks) ---
  const drivers = (persona?.values ?? []).slice(0, 3).map((v) => driverLabel(v, locale)).filter((d) => d.length > 0);
  if (drivers.length > 0) {
    fields.push({ key: "drivers", label: l.drivers, viz: "list", placement: "rail", source: { kind: "self_report" }, data: drivers });
  }

  // --- cores: the app's fixed pattern-core taxonomy (structural, always shown) ---
  fields.push({
    key: "cores",
    label: l.cores,
    viz: "node-graph",
    placement: "rail",
    source: { kind: "derived" },
    data: { center: "Soul", nodes: ["Growth", "Wisdom", "Bond", "Muse", "Record"] },
  });

  // --- contents: live vault counts (always shown, honest even at zero) ---
  fields.push(
    contentsField(
      l.contents,
      { [l.content.sources]: opts.counts.sources, [l.content.records]: opts.counts.records, [l.content.concepts]: opts.counts.concepts },
      opts.topics?.slice(0, 5),
    ),
  );

  const doc: IdenDoc = {
    iden: opts.iden ?? "0.1",
    name: opts.name?.trim() || l.nameFallback,
    generated: opts.generated ?? new Date().toISOString().slice(0, 10),
    oneLiner: opts.oneLiner?.trim() || l.oneLinerFallback,
    fields,
  };

  const summary = opts.summary?.trim();
  if (summary) {
    doc.summary = { text: summary, source: { kind: "ai_summary" } };
  }
  return doc;
}

// --- fetcher (thin orchestration; not unit-tested, like exportContextPack) ---

// buildPersona emits these honest "nothing to summarize yet" lines when the user
// has no written entries. They are not a real narrative, so the IDEN summary
// must stay absent rather than surface them as an AI interpretation.
const EMPTY_SUMMARY = /No written entries yet to summarize|아직 글로 남긴 기록이 없/;

function realSummary(persona: PersonaCard): string | null {
  const s = persona.patterns?.summary ?? "";
  return s.trim() && !EMPTY_SUMMARY.test(s) ? s : null;
}

/** A one-line "who" from measured identity signals, mirroring the self-portrait. */
function deriveOneLiner(persona: PersonaCard, locale: Locale): string | null {
  if (persona.mbti?.type) {
    const nick = TYPE_NICKNAME[locale][persona.mbti.type];
    return nick ? `${persona.mbti.type} · ${nick}` : persona.mbti.type;
  }
  if (persona.attachment?.style) return STYLE_LABEL[locale][persona.attachment.style];
  return null;
}

async function countRows(table: string, userId: string, eq?: { col: string; val: string }): Promise<number> {
  const supabase = getSupabaseClient();
  let q = supabase.from(table).select("*", { count: "exact", head: true }).eq("user_id", userId);
  if (eq) q = q.eq(eq.col, eq.val);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export interface BuildIdenOpts {
  locale?: Locale;
  /** C10: forwarded to buildPersona so a minor's crisis output routes correctly. */
  minor?: boolean;
  name?: string | null;
  /** Override the derived one-liner. */
  oneLiner?: string | null;
  topics?: string[];
  generated?: string;
  iden?: string;
}

/** Fetch the user's persona + vault counts and compose their IdenDoc. */
export async function buildIdenDoc(userId: string, opts: BuildIdenOpts = {}): Promise<IdenDoc> {
  const locale: Locale = opts.locale ?? "en";
  const [persona, sources, concepts, records] = await Promise.all([
    buildPersona(userId, locale, opts.minor ?? false),
    countRows("sources", userId),
    countRows("wiki_pages", userId, { col: "kind", val: "concept" }),
    countRows("records", userId),
  ]);

  return composeIdenDoc(persona, {
    name: opts.name ?? null,
    oneLiner: opts.oneLiner ?? deriveOneLiner(persona, locale),
    counts: { sources, records, concepts },
    topics: opts.topics,
    summary: realSummary(persona),
    generated: opts.generated,
    iden: opts.iden,
    locale,
  });
}
