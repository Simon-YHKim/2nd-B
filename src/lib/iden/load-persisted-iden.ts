import { getSupabaseClient } from "../supabase/client";
import type { IdenDoc, IdenField, IdenSummary, ScoreMap } from "./types";

type Locale = "en" | "ko";

export interface LoadPersistedIdenOpts {
  locale?: Locale;
  /** Stable override for tests and deterministic exports. */
  generated?: string;
}

export type IdenSession =
  | { userId: string; status: "loading" | "empty" | "error"; doc: null }
  | { userId: string; status: "ready"; doc: IdenDoc };

type PersistedIdenLoader = (
  userId: string,
  opts: LoadPersistedIdenOpts,
) => Promise<IdenDoc | null>;

/**
 * Owns the request generation for a user-keyed snapshot session. A later
 * account switch, retry, or focus read invalidates every earlier response.
 */
export function createIdenSessionController(args: {
  load: PersistedIdenLoader;
  onChange: (session: IdenSession | null) => void;
}) {
  let activeRequestId: number | null = null;
  let nextRequestId = 0;

  return {
    load(userId: string, opts: LoadPersistedIdenOpts) {
      const requestId = ++nextRequestId;
      activeRequestId = requestId;
      args.onChange({ userId, status: "loading", doc: null });
      const promise = args
        .load(userId, opts)
        .then((doc) => {
          if (activeRequestId !== requestId) return;
          args.onChange(
            doc
              ? { userId, status: "ready", doc }
              : { userId, status: "empty", doc: null },
          );
        })
        .catch(() => {
          if (activeRequestId === requestId) {
            args.onChange({ userId, status: "error", doc: null });
          }
        });
      return { requestId, promise };
    },
    cancel(requestId: number) {
      if (activeRequestId === requestId) activeRequestId = null;
    },
    clear() {
      activeRequestId = null;
      args.onChange(null);
    },
  };
}

const EXPORT_ROW_FIELDS: Record<string, string[]> = {
  northstar: [],
  bigfive: ["traits"],
  domains: ["contents", "drivers"],
};

/** Pure projection from the current screen rows to its exportable document. */
export function visibleIdenDocForExport(
  doc: IdenDoc,
  excludedRows: readonly string[],
): IdenDoc {
  const droppedFields = new Set<string>();
  for (const rowId of excludedRows) {
    for (const key of EXPORT_ROW_FIELDS[rowId] ?? []) droppedFields.add(key);
  }
  const { summary: _hiddenSummary, ...visibleDoc } = doc;
  return {
    ...visibleDoc,
    oneLiner: excludedRows.includes("northstar") ? "" : doc.oneLiner,
    fields: doc.fields.filter((field) => !droppedFields.has(field.key)),
  };
}

interface PersistedPersonaRow {
  traits: unknown;
  values: unknown;
  patterns: unknown;
  created_at: string;
  version: number;
}

const NORTHSTAR_TAG = "northstar_sentence";
const TRAIT_KEYS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;
const EMPTY_SUMMARY = /No written entries yet to summarize|아직 글로 남긴 기록이 없/;

const COPY = {
  en: {
    name: "You",
    traits: "Traits",
    values: "Grounded signals",
    contents: "Contents",
    traitLabels: ["Openness", "Conscientiousness", "Extraversion", "Agreeableness", "Sensitivity"],
    countLabels: ["Sources", "Records", "Concepts"],
  },
  ko: {
    name: "나",
    traits: "특성",
    values: "근거 신호",
    contents: "콘텐츠",
    traitLabels: ["개방성", "성실성", "외향성", "친화성", "민감성"],
    countLabels: ["소스", "기록", "개념"],
  },
} as const;

function persistedTraits(value: unknown, locale: Locale): ScoreMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const scores = TRAIT_KEYS.map((key) => row[key]);
  if (!scores.every((score) => typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1)) {
    return null;
  }
  // Old rebuilds persisted a neutral 0.5 card even when an account had no
  // evidence. Without persisted provenance that row cannot honestly be shown.
  if (scores.every((score) => score === 0.5)) return null;
  const numericScores = scores as number[];
  return Object.fromEntries(
    COPY[locale].traitLabels.map((label, index) => [label, numericScores[index]]),
  ) as ScoreMap;
}

function persistedValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3);
}

function persistedSummary(value: unknown): IdenSummary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const summary = (value as Record<string, unknown>).summary;
  if (typeof summary !== "string") return undefined;
  const text = summary.trim();
  if (!text || EMPTY_SUMMARY.test(text)) return undefined;
  return { text, source: { kind: "ai_summary" } };
}

function throwOnError(results: Array<{ error: unknown }>): void {
  for (const result of results) {
    if (result.error) throw result.error;
  }
}

/**
 * Load the latest already-persisted IDEN inputs. This path is deliberately
 * SELECT-only: screen lifecycle events must never rebuild a persona, call an
 * LLM, consume usage, or write a cache row.
 */
export async function loadPersistedIden(
  userId: string,
  opts: LoadPersistedIdenOpts = {},
): Promise<IdenDoc | null> {
  const locale = opts.locale ?? "en";
  const supabase = getSupabaseClient();
  const [userRes, personaRes, northstarRes, sourcesRes, recordsRes, conceptsRes] = await Promise.all([
    supabase.from("users").select("display_name").eq("id", userId).maybeSingle(),
    supabase
      .from("personas")
      .select("traits, values, patterns, created_at, version")
      .eq("user_id", userId)
      .eq("version", 1)
      .maybeSingle(),
    supabase
      .from("records")
      .select("body, created_at")
      .eq("user_id", userId)
      .contains("tags", [NORTHSTAR_TAG])
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("sources").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("records").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("wiki_pages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "concept"),
  ]);

  throwOnError([userRes, personaRes, northstarRes, sourcesRes, recordsRes, conceptsRes]);

  const persona = personaRes.data as PersistedPersonaRow | null;
  const northstar = (northstarRes.data?.[0] ?? null) as { body?: string | null; created_at?: string | null } | null;
  const oneLiner = northstar?.body?.trim() ?? "";
  const traits = persistedTraits(persona?.traits, locale);
  const values = persistedValues(persona?.values);
  const summary = persistedSummary(persona?.patterns);
  const counts = {
    sources: sourcesRes.count ?? 0,
    records: recordsRes.count ?? 0,
    concepts: conceptsRes.count ?? 0,
  };
  const hasVaultRows = counts.sources + counts.records + counts.concepts > 0;

  if (!oneLiner && !traits && values.length === 0 && !summary && !hasVaultRows) return null;

  const fields: IdenField[] = [];
  if (traits) {
    fields.push({
      key: "traits",
      label: COPY[locale].traits,
      viz: "radar",
      placement: "both",
      // `personas` does not persist the questionnaire provenance. Calling the
      // scores "measured Big Five" here would overstate what this read proves.
      source: { kind: "derived" },
      data: traits,
    });
  }
  if (values.length > 0) {
    fields.push({
      key: "drivers",
      label: COPY[locale].values,
      viz: "list",
      placement: "rail",
      source: { kind: "derived" },
      data: values,
    });
  }
  if (hasVaultRows) {
    const [sourcesLabel, recordsLabel, conceptsLabel] = COPY[locale].countLabels;
    fields.push({
      key: "contents",
      label: COPY[locale].contents,
      viz: "donut",
      placement: "main",
      source: { kind: "count" },
      data: {
        [sourcesLabel]: counts.sources,
        [recordsLabel]: counts.records,
        [conceptsLabel]: counts.concepts,
      },
    });
  }

  const user = userRes.data as { display_name?: string | null } | null;
  const doc: IdenDoc = {
    iden: "0.1",
    name: user?.display_name?.trim() || COPY[locale].name,
    generated: opts.generated ?? new Date().toISOString().slice(0, 10),
    oneLiner,
    fields,
  };
  if (summary) doc.summary = summary;
  return doc;
}
