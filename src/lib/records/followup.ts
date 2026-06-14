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

export interface AdvisorFollowupViewModel {
  text: string;
  zone: RecordFollowup["zone"];
  fixedTemplate: boolean;
  evidence: RecordedEvidence[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max = 4000): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() + "..." : trimmed;
}

function cleanNullableText(value: unknown, max: number): string | null {
  const text = cleanText(value, max);
  return text.length > 0 ? text : null;
}

function cleanEvidence(value: unknown): RecordedEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const title = cleanText(item.title, 200);
      if (!title) return null;
      return {
        title,
        doi: cleanNullableText(item.doi, 120),
        summary: cleanNullableText(item.summary, 300),
      };
    })
    .filter((item): item is RecordedEvidence => item !== null)
    .slice(0, 3);
}

export function normalizeRecordFollowup(value: unknown): RecordFollowup | null {
  if (!isRecord(value)) return null;
  const text = cleanText(value.text);
  const zone = value.zone;
  if (!text || (zone !== "green" && zone !== "yellow" && zone !== "red")) return null;
  const matchedBatches = Array.isArray(value.matchedBatches)
    ? value.matchedBatches.filter((batch): batch is string => typeof batch === "string").slice(0, 4)
    : undefined;
  return {
    text,
    zone,
    fixedTemplate: value.fixedTemplate === true ? true : undefined,
    matchedBatches,
    evidence: cleanEvidence(value.evidence),
  };
}

export function advisorFollowupViewModel(value: unknown): AdvisorFollowupViewModel | null {
  const followup = normalizeRecordFollowup(value);
  if (!followup) return null;
  const fixedTemplate = followup.fixedTemplate === true;
  return {
    text: followup.text,
    zone: followup.zone,
    fixedTemplate,
    evidence: followup.zone === "red" || fixedTemplate ? [] : followup.evidence ?? [],
  };
}
