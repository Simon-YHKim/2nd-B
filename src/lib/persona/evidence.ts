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
