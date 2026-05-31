// Evidence mapping for the Core Brain / 나의 중심 screen. Turns raw
// `records` rows into the CoreEvidenceShard shape the screen lists in its
// "이걸 만든 조각들" drawer (core-brain pack §5 / data_contract). Pure +
// tested so the type/route/label mapping is a single source of truth.

export type EvidenceType = "journal" | "capture" | "wiki" | "interview" | "audit" | "imagine";

export interface EvidenceShard {
  id: string;
  type: EvidenceType;
  title: string;
  dateLabel: string;
  route: string;
}

/** Map a records.kind (+ tags) to a user-facing evidence type. */
export function recordKindToType(kind: string, tags: string[] = []): EvidenceType {
  if (kind === "journal") return "journal";
  if (kind === "audit_response") return tags.includes("interview") ? "interview" : "audit";
  if (kind === "self_knowledge") return "capture";
  if (tags.includes("imagine")) return "imagine";
  if (tags.includes("wiki")) return "wiki";
  return "capture";
}

/** Route the user lands on when they open this kind of evidence. */
export function evidenceRoute(type: EvidenceType): string {
  switch (type) {
    case "journal": return "/journal";
    case "interview": return "/interview";
    case "audit": return "/audit";
    case "wiki": return "/wiki";
    case "imagine": return "/imagine";
    case "capture": return "/capture";
  }
}

const TYPE_LABEL: Record<"en" | "ko", Record<EvidenceType, string>> = {
  ko: { journal: "오늘의 조각", capture: "조각 담기", wiki: "지식 창고", interview: "스무고개", audit: "라이프 오딧", imagine: "공상" },
  en: { journal: "Journal", capture: "Capture", wiki: "Wiki", interview: "Interview", audit: "Life audit", imagine: "Imagine" },
};

export function evidenceTypeLabel(type: EvidenceType, locale: "en" | "ko"): string {
  return TYPE_LABEL[locale][type];
}

/** Short, locale-aware date label (e.g. "5월 12일" / "May 12"). */
export function evidenceDateLabel(iso: string, locale: "en" | "ko"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" });
}

export interface RawRecordRow {
  id: string;
  kind: string;
  topic: string | null;
  created_at: string;
  tags?: string[] | null;
}

/** Build an EvidenceShard from a raw record row. */
export function toEvidenceShard(row: RawRecordRow, locale: "en" | "ko"): EvidenceShard {
  const type = recordKindToType(row.kind, row.tags ?? []);
  const fallback = evidenceTypeLabel(type, locale);
  return {
    id: row.id,
    type,
    title: row.topic && row.topic.trim().length > 0 ? row.topic.trim() : fallback,
    dateLabel: evidenceDateLabel(row.created_at, locale),
    route: evidenceRoute(type),
  };
}

// --- sources (capture / imagine) -------------------------------------
// capture and imagine persist to the `sources` table (wiki RAG ingest
// path), NOT `records`. The Records screen reads both and merges them so
// a captured piece actually shows up where the user expects it. A source
// row carries its own id space; we tag the shard with `source:<id>` so
// the detail route can tell which table to open.

export interface RawSourceRow {
  id: string;
  kind: string;
  title: string | null;
  captured_at: string;
  tags?: string[] | null;
}

/** Map a sources.kind (+ tags) to a user-facing evidence type. */
export function sourceKindToType(kind: string, tags: string[] = []): EvidenceType {
  if (tags.includes("imagine")) return "imagine";
  if (kind === "self_knowledge") return "capture";
  // article / video / paper / reddit / code / ai_tool / inbox are all
  // external knowledge the user clipped → the wiki store.
  return "wiki";
}

/** Build an EvidenceShard from a raw source row (capture/imagine origin). */
export function sourceToEvidenceShard(row: RawSourceRow, locale: "en" | "ko"): EvidenceShard {
  const type = sourceKindToType(row.kind, row.tags ?? []);
  const fallback = evidenceTypeLabel(type, locale);
  return {
    id: row.id,
    type,
    title: row.title && row.title.trim().length > 0 ? row.title.trim() : fallback,
    dateLabel: evidenceDateLabel(row.captured_at, locale),
    route: evidenceRoute(type),
  };
}

export type ShardOrigin = "record" | "source";

/** An EvidenceShard plus which table it came from + its raw timestamp,
 *  so callers can merge the two streams and sort by recency. */
export interface OriginShard extends EvidenceShard {
  origin: ShardOrigin;
  /** ISO timestamp used for cross-table sort (records.created_at / sources.captured_at). */
  at: string;
}

/**
 * Merge records + sources into one recency-sorted list. Pure so the
 * Records screen stays a thin renderer and the merge is unit-tested.
 */
export function mergeEvidence(
  records: RawRecordRow[],
  sources: RawSourceRow[],
  locale: "en" | "ko",
): OriginShard[] {
  const fromRecords: OriginShard[] = records.map((r) => ({
    ...toEvidenceShard(r, locale),
    origin: "record",
    at: r.created_at,
  }));
  const fromSources: OriginShard[] = sources.map((s) => ({
    ...sourceToEvidenceShard(s, locale),
    origin: "source",
    at: s.captured_at,
  }));
  return [...fromRecords, ...fromSources].sort((a, b) => b.at.localeCompare(a.at));
}
