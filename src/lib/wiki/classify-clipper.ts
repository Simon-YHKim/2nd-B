// AI clipper classifier (2026-06-01 directive: "AI가 내용을 읽고 clipper 형식
// 대로 분류"). One Gemini call reads the captured content + URL and returns the
// clipper KIND plus the semantic frontmatter the templates expect — replacing
// the older {track, tags, summary} classifier with a clipper-aware one.
//
// Pure prompt builder + parser (tested) keep the LLM-free logic a single source
// of truth; classifyClipper is the thin orchestrator that calls callGemini
// (so C1/C3/C9 are enforced there). A bad-shaped reply degrades to safe
// defaults anchored on the URL-derived kind, so a capture never fails to save.

import { callGemini } from "../llm/gemini";
import { detectClipperKind } from "./clipper-kind";
import {
  CLIPPER_TEMPLATES,
  CLIPPER_TEMPLATE_LIST,
  TARGET_CATEGORIES,
  type TargetCategory,
} from "./clipper-templates";
import { listAccessibleTemplates } from "./template-queries";
import { SOURCE_KINDS, type SourceKind } from "./types";

export type WikiTrack = "daily" | "pro";

export interface ClipperClassification {
  kind: SourceKind;
  track: WikiTrack;
  targetCategory: TargetCategory | "";
  /** 0..1 — how relevant this is to the user's work/life. */
  simonRelevance: number;
  tags: string[];
  summary: string;
  actionableTakeaway: string;
  /** Kind-specific frontmatter props (only the keys the template declares). */
  props: Record<string, string | string[]>;
}

function sanitizeTag(t: string): string {
  return String(t)
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9가-힣\-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A shared/community format name is untrusted input that gets embedded into every
// OTHER user's classify prompt, so strip newlines + structural characters and cap
// the length to defuse stored prompt-injection before it reaches the model.
function safeFormatLabel(s: string): string {
  return String(s)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\p{L}\p{N} ._/-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/** Build the classify prompt for a candidate kind. Pure → deterministic. */
export function buildClipperPrompt(
  baselineKind: SourceKind,
  content: string,
  url: string | null,
  locale: "en" | "ko",
  customFormats: readonly { name: string; baseKind: SourceKind }[] = [],
): { system: string; user: string } {
  const tmpl = CLIPPER_TEMPLATES[baselineKind];
  const kindMenu = CLIPPER_TEMPLATE_LIST.map(
    (t) => `  - ${t.kind}: ${locale === "ko" ? t.what.ko : t.what.en}`,
  ).join("\n");
  // Community / user-added formats (migration 0027) appear as hints so the AI can
  // map novel material onto the closest base kind. They never widen the set of
  // kinds it may return — only the 8 canonical kinds are valid output. A shared
  // name is untrusted (it reaches every user), so each label is sanitized + capped
  // to defuse stored prompt-injection.
  const customLines = customFormats
    .map((c) => ({ label: safeFormatLabel(c.name), baseKind: c.baseKind }))
    .filter((c) => c.label.length > 0)
    .map((c) => `  - ${c.label} (${c.baseKind})`);
  const customMenu =
    customLines.length > 0
      ? "\n" +
        (locale === "ko" ? "커뮤니티/내 추가 형식 (참고용):" : "Community / your added formats (reference):") +
        "\n" +
        customLines.join("\n")
      : "";
  const propLines = tmpl.aiProperties.length
    ? tmpl.aiProperties
        .map((p) => `    "${p.name}": ${locale === "ko" ? p.describe.ko : p.describe.en}`)
        .join("\n")
    : `    (none)`;

  const system =
    locale === "ko"
      ? [
          "사용자가 2nd-Brain에 담은 웹 자료를 Obsidian 클리퍼 형식으로 분류합니다.",
          "JSON만 출력하세요. JSON 외 텍스트 금지.",
          "",
          "kind 후보 (가장 잘 맞는 하나):",
          kindMenu + customMenu,
          "",
          "JSON 형식:",
          '{ "kind": 위 후보 중 하나,',
          '  "track": "daily" | "pro"  (일상이면 daily, 일·전문이면 pro),',
          '  "targetCategory": "concepts" | "entities" | "projects",',
          '  "simonRelevance": 0~1 사이 숫자,',
          '  "tags": [3-7개 소문자 하이픈, # 없이],',
          '  "summary": "한 줄 요약",',
          '  "actionableTakeaway": "여기서 바로 적용할 한 가지",',
          '  "props": {',
          propLines,
          "  } }",
          "",
          `자료 URL: ${url ?? "(없음)"}`,
        ].join("\n")
      : [
          "Classify the web material the user clipped into their 2nd-Brain using the Obsidian clipper kinds.",
          "Return strict JSON only. No prose outside the JSON.",
          "",
          "Candidate kinds (pick the single best fit):",
          kindMenu + customMenu,
          "",
          "JSON shape:",
          '{ "kind": one of the candidates,',
          '  "track": "daily" | "pro"  (personal = daily, work/professional = pro),',
          '  "targetCategory": "concepts" | "entities" | "projects",',
          '  "simonRelevance": number between 0 and 1,',
          '  "tags": [3-7 strings, lowercase, hyphen-separated, no # prefix],',
          '  "summary": "one short sentence",',
          '  "actionableTakeaway": "one thing to apply from this",',
          '  "props": {',
          propLines,
          "  } }",
          "",
          `Material URL: ${url ?? "(none)"}`,
        ].join("\n");

  return { system, user: content.trim().slice(0, 4000) };
}

/** Parse + sanitize the LLM reply into a ClipperClassification. Pure → tested.
 *  Anchors every field on a safe default keyed off the URL-derived kind. */
export function parseClipperResult(raw: string, fallbackKind: SourceKind): ClipperClassification {
  const safe = (kind: SourceKind): ClipperClassification => ({
    kind,
    track: "daily",
    targetCategory: CLIPPER_TEMPLATES[kind].targetCategoryDefault,
    simonRelevance: 0,
    tags: [],
    summary: "",
    actionableTakeaway: "",
    props: {},
  });

  let parsed: Record<string, unknown>;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return safe(fallbackKind);
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return safe(fallbackKind);
  }

  const kind: SourceKind = SOURCE_KINDS.includes(parsed.kind as SourceKind)
    ? (parsed.kind as SourceKind)
    : fallbackKind;
  const tmpl = CLIPPER_TEMPLATES[kind];

  const track: WikiTrack = parsed.track === "pro" ? "pro" : "daily";
  const targetCategory: TargetCategory | "" = TARGET_CATEGORIES.includes(parsed.targetCategory as TargetCategory)
    ? (parsed.targetCategory as TargetCategory)
    : tmpl.targetCategoryDefault;

  let simonRelevance = typeof parsed.simonRelevance === "number" ? parsed.simonRelevance : 0;
  if (!Number.isFinite(simonRelevance)) simonRelevance = 0;
  simonRelevance = Math.max(0, Math.min(1, simonRelevance));

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.slice(0, 7).map(sanitizeTag).filter((t) => t.length > 0 && t.length <= 32)
    : [];
  const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : "";
  const actionableTakeaway =
    typeof parsed.actionableTakeaway === "string" ? parsed.actionableTakeaway.slice(0, 200) : "";

  // Only keep props the template declares, in their declared type.
  const props: Record<string, string | string[]> = {};
  const rawProps = (parsed.props ?? {}) as Record<string, unknown>;
  for (const p of tmpl.aiProperties) {
    const v = rawProps[p.name];
    if (v == null) continue;
    if (p.type === "multitext") {
      const arr = Array.isArray(v) ? v.map((x) => String(x).trim()) : String(v).split(",").map((x) => x.trim());
      const cleaned = arr.filter((x) => x.length > 0).slice(0, 8);
      if (cleaned.length) props[p.name] = cleaned;
    } else {
      const s = String(v).trim().slice(0, 200);
      if (s.length) props[p.name] = s;
    }
  }

  return { kind, track, targetCategory, simonRelevance, tags, summary, actionableTakeaway, props };
}

/** Classify a captured piece into the clipper format. URL-derived kind is the
 *  baseline + fallback; the AI may refine it and fills the semantic props. */
export async function classifyClipper(
  userId: string,
  content: string,
  url: string | null,
  locale: "en" | "ko",
): Promise<ClipperClassification> {
  const baselineKind: SourceKind = url ? detectClipperKind(url) : "inbox";
  const trimmed = content.trim();
  if (trimmed.length === 0) return parseClipperResult("", baselineKind);

  // Surface the user's own + community-shared formats (migration 0027) so the
  // classifier is aware of them. Fail-open: if the table is missing/offline we
  // just fall back to the bundled 8 canonical kinds.
  let customFormats: { name: string; baseKind: SourceKind }[] = [];
  try {
    const templates = await listAccessibleTemplates(userId);
    customFormats = templates
      .map((t) => ({
        name: (locale === "ko" ? t.name.ko : t.name.en) || t.name.en || t.name.ko || t.slug,
        baseKind: t.baseKind,
      }))
      .slice(0, 12);
  } catch {
    // table not applied yet / offline — bundled kinds are enough.
  }

  const { system, user } = buildClipperPrompt(baselineKind, trimmed, url, locale, customFormats);
  const reply = await callGemini({ userId, locale, purpose: "clipper_classify", system, user });
  return parseClipperResult(reply.text, baselineKind);
}
