// Friendly rendering for assessment records (MBTI / Big Five / ECR-attachment).
// These persist their result as a JSON body in `records`, so the record-detail
// screen would otherwise show the user a raw JSON dump. summarizeAssessmentBody
// turns that JSON into readable label/value lines; it returns null for plain
// text bodies (journal, audit, capture) so those render unchanged.

export interface AssessmentLine {
  k: string;
  v: string;
}
export interface AssessmentSummary {
  label: string;
  lines: AssessmentLine[];
}

function fmt(n: number): string {
  // 1 decimal, trimming a trailing .0 (4 -> "4", 2.5 -> "2.5").
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const BFI_KEYS = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"] as const;
const BFI_LABEL: Record<"en" | "ko", Record<(typeof BFI_KEYS)[number], string>> = {
  ko: { openness: "개방성", conscientiousness: "성실성", extraversion: "외향성", agreeableness: "우호성", neuroticism: "신경성" },
  en: { openness: "Openness", conscientiousness: "Conscientiousness", extraversion: "Extraversion", agreeableness: "Agreeableness", neuroticism: "Neuroticism" },
};

function hasAnyBfiKey(scores: Record<string, unknown>): boolean {
  return BFI_KEYS.some((k) => k in scores);
}

function hasCompleteBfiScores(scores: Record<string, unknown>): boolean {
  return BFI_KEYS.every((k) => Number.isFinite(scores[k]));
}

/**
 * Turn an assessment record body into friendly summary lines, or null when the
 * body is not a structured assessment (plain journal/audit text renders as-is).
 */
export function summarizeAssessmentBody(
  body: string | null | undefined,
  locale: "en" | "ko",
): AssessmentSummary | null {
  if (!body) return null;
  const trimmed = body.trim();
  if (!trimmed.startsWith("{")) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const scores = o.scores && typeof o.scores === "object" ? (o.scores as Record<string, unknown>) : o;

  // MBTI: { type: "INTJ", scores: { E, I, S, N, T, F, J, P } }
  if (typeof o.type === "string" && o.scores && typeof o.scores === "object" && "E" in (o.scores as object)) {
    return {
      label: locale === "ko" ? "MBTI 결과" : "MBTI result",
      lines: [{ k: locale === "ko" ? "유형" : "Type", v: String(o.type) }],
    };
  }

  // Big Five: { scores: { openness, ... } } or flat { openness, ... }
  if (hasCompleteBfiScores(scores)) {
    return {
      label: locale === "ko" ? "Big Five 결과" : "Big Five result",
      lines: BFI_KEYS.map((k) => ({ k: BFI_LABEL[locale][k], v: fmt(scores[k] as number) })),
    };
  }
  if (hasAnyBfiKey(scores)) return null;

  // ECR-S attachment: { style, anxiety, avoidance }
  if (typeof o.style === "string" && (typeof o.anxiety === "number" || typeof o.avoidance === "number")) {
    const lines: AssessmentLine[] = [{ k: locale === "ko" ? "유형" : "Style", v: String(o.style) }];
    if (typeof o.anxiety === "number") lines.push({ k: locale === "ko" ? "불안" : "Anxiety", v: fmt(o.anxiety) });
    if (typeof o.avoidance === "number") lines.push({ k: locale === "ko" ? "회피" : "Avoidance", v: fmt(o.avoidance) });
    return { label: locale === "ko" ? "애착 유형 결과" : "Attachment result", lines };
  }

  // Unknown structured body: render scalar fields readably rather than raw JSON.
  const lines: AssessmentLine[] = Object.entries(o)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .slice(0, 8)
    .map(([k, v]) => ({ k, v: String(v) }));
  if (lines.length === 0) return null;
  return { label: locale === "ko" ? "구조화된 결과" : "Structured result", lines };
}
