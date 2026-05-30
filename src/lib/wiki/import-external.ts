// External self-knowledge import (user request #2). Two pure halves:
//
//   1. buildExtractionPrompt() — a copy-paste prompt the user hands to
//      *another* LLM (ChatGPT, Claude, Gemini, …) that has been interviewing
//      or analyzing them. It asks that LLM to dump everything it knows about
//      the user as ONE structured JSON block we can ingest. Also covers
//      pasting in a past personality/disposition test result.
//
//   2. INGEST_SYSTEM + parseIngestResult() — our own classifier prompt +
//      parser. We don't just store the blob: we run it through our analysis
//      structure (track + framework families + tags + section type) so the
//      imported material is classified, tagged, and indexed like any other
//      piece. Pure + tested so the taxonomy mapping is one source of truth.
//
// User-facing surfaces never expose "classifier / vector / index" wording.

export type ImportKind = "llm_interview" | "assessment_result" | "free_notes";

/** The categories our analysis structure sorts imported material into. These
 *  mirror the framework families already used across the app (persona/audit)
 *  so an import lands in the same buckets as in-app assessments. */
export const IMPORT_SECTIONS = [
  "trait", // disposition / personality (Big Five-ish)
  "value", // what matters to them (SDT / VIA-ish)
  "relationship", // attachment / how they relate
  "motivation", // drives, goals
  "context", // life facts, history, circumstances
  "preference", // tastes, likes
] as const;
export type ImportSection = (typeof IMPORT_SECTIONS)[number];

/**
 * Build the copy-paste prompt for the user to run in another LLM. `subjectName`
 * is optional (defaults to a neutral "the person I've been talking with").
 */
export function buildExtractionPrompt(locale: "en" | "ko", subjectName?: string): string {
  const who = subjectName?.trim();
  if (locale === "ko") {
    const subj = who ? `"${who}"` : "지금까지 나와 대화한 사람";
    return [
      `아래 지시에 따라 ${subj}에 대해 네가 알고 있는 내용을 하나의 JSON 블록으로 정리해줘.`,
      "이건 그 사람이 자기 이해를 쌓는 데 쓸 자료야. 추측은 줄이고, 대화에서 드러난 근거 위주로 적어줘.",
      "",
      "형식 (이 JSON 하나만 출력, 다른 말 없이):",
      "{",
      '  "summary": "3~5문장 인물 요약",',
      '  "items": [',
      '    { "section": "trait|value|relationship|motivation|context|preference",',
      '      "title": "짧은 제목",',
      '      "detail": "한두 문장 근거",',
      '      "confidence": "low|medium|high" }',
      "  ]",
      "}",
      "",
      "규칙:",
      "- 임상 진단·치료 표현은 쓰지 마. 성향과 패턴을 담담하게 묘사해.",
      "- 8~20개 항목. 근거 없는 단정은 confidence: low.",
      "- 한국어로 작성.",
    ].join("\n");
  }
  const subj = who ? `"${who}"` : "the person I've been talking with";
  return [
    `Summarize everything you know about ${subj} as ONE JSON block, following the schema below.`,
    "This will help that person build their own self-understanding. Favor evidence from our conversation over speculation.",
    "",
    "Format (output ONLY this JSON, no other text):",
    "{",
    '  "summary": "3-5 sentence portrait",',
    '  "items": [',
    '    { "section": "trait|value|relationship|motivation|context|preference",',
    '      "title": "short title",',
    '      "detail": "one or two sentences of evidence",',
    '      "confidence": "low|medium|high" }',
    "  ]",
    "}",
    "",
    "Rules:",
    "- Avoid medical or clinical-sounding wording. Describe dispositions and patterns plainly.",
    "- 8-20 items. Mark unsupported guesses as confidence: low.",
  ].join("\n");
}

/** System prompt for OUR classifier pass over pasted/imported material. */
export const INGEST_SYSTEM = [
  "You organize imported self-knowledge material into a fixed structure.",
  "The input may be: a JSON dump from another assistant, a pasted personality/disposition test result, or free notes.",
  "Return ONE JSON object, no other text:",
  "{",
  '  "summary": "2-4 sentence neutral summary in the input\'s language",',
  '  "track": "daily" | "pro",',
  '  "tags": [3-8 lowercase hyphen-separated tags, no # prefix],',
  '  "items": [ { "section": "trait|value|relationship|motivation|context|preference", "title": "...", "detail": "...", "confidence": "low|medium|high" } ]',
  "}",
  "Rules:",
  "- Avoid medical or clinical-sounding wording. Describe dispositions and patterns.",
  "- Never invent facts not present in the input; if thin, return fewer items.",
  "- `track` is 'pro' only when the material is clearly career/work-focused, else 'daily'.",
  "- Keep the summary and titles in the same language as the input.",
].join("\n");

export interface ImportItem {
  section: ImportSection;
  title: string;
  detail: string;
  confidence: "low" | "medium" | "high";
}

export interface IngestResult {
  summary: string;
  track: "daily" | "pro";
  tags: string[];
  items: ImportItem[];
}

function asSection(v: unknown): ImportSection {
  return (IMPORT_SECTIONS as readonly string[]).includes(v as string)
    ? (v as ImportSection)
    : "context";
}

function asConfidence(v: unknown): "low" | "medium" | "high" {
  return v === "low" || v === "high" ? v : "medium";
}

function normalizeTag(s: string): string {
  return s.trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-").replace(/[^a-z0-9가-힣-]/g, "");
}

/**
 * Parse the classifier's JSON reply into a typed, sanitized IngestResult.
 * Tolerant of a fenced ```json block and of partial/garbage output (falls back
 * to a single context item carrying the raw text so nothing is lost).
 */
export function parseIngestResult(raw: string, fallbackText = ""): IngestResult {
  const empty: IngestResult = {
    summary: "",
    track: "daily",
    tags: [],
    items: [],
  };
  let json: Record<string, unknown> | null = null;
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : raw;
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      json = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
    }
  } catch {
    json = null;
  }
  if (!json) {
    const text = fallbackText.trim() || raw.trim();
    if (text.length === 0) return empty;
    return {
      summary: text.slice(0, 280),
      track: "daily",
      tags: ["imported"],
      items: [{ section: "context", title: "가져온 자료", detail: text.slice(0, 500), confidence: "low" }],
    };
  }

  const rawItems = Array.isArray(json.items) ? json.items : [];
  const items: ImportItem[] = rawItems
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return {
        section: asSection(o.section),
        title: typeof o.title === "string" ? o.title.trim() : "",
        detail: typeof o.detail === "string" ? o.detail.trim() : "",
        confidence: asConfidence(o.confidence),
      };
    })
    .filter((it) => it.title.length > 0 || it.detail.length > 0)
    .slice(0, 40);

  const rawTags = Array.isArray(json.tags) ? json.tags : [];
  const tags = Array.from(
    new Set(
      rawTags
        .filter((t): t is string => typeof t === "string")
        .map(normalizeTag)
        .filter((t) => t.length > 0),
    ),
  ).slice(0, 8);
  // Always carry the "imported" tag so these pieces are findable as imports.
  if (!tags.includes("imported")) tags.unshift("imported");

  return {
    summary: typeof json.summary === "string" ? json.summary.trim() : "",
    track: json.track === "pro" ? "pro" : "daily",
    tags: tags.slice(0, 8),
    items,
  };
}

/** Render an IngestResult as markdown for storage via captureFromMarkdown, so
 *  the imported material enters the same knowledge layer / graph as any piece.
 *  Front-matter-free; the caller passes tags + track separately. */
export function renderIngestMarkdown(result: IngestResult, locale: "en" | "ko"): string {
  const ko = locale === "ko";
  const sectionLabel: Record<ImportSection, string> = ko
    ? { trait: "성향", value: "가치", relationship: "관계", motivation: "동기", context: "맥락", preference: "취향" }
    : { trait: "Trait", value: "Value", relationship: "Relationship", motivation: "Motivation", context: "Context", preference: "Preference" };
  const lines: string[] = [];
  lines.push(`# ${ko ? "외부에서 가져온 나의 조각" : "Imported self-knowledge"}`);
  if (result.summary) lines.push("", result.summary);
  // Group items by section in the canonical order.
  for (const section of IMPORT_SECTIONS) {
    const group = result.items.filter((it) => it.section === section);
    if (group.length === 0) continue;
    lines.push("", `## ${sectionLabel[section]}`);
    for (const it of group) {
      const conf = it.confidence === "high" ? "" : ` _(${it.confidence})_`;
      lines.push(`- **${it.title || sectionLabel[section]}** — ${it.detail}${conf}`);
    }
  }
  return lines.join("\n");
}
