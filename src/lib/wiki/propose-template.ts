// AI proposes a NEW clipper format for material that doesn't fit the 8 canonical
// templates (2026-06-01 directive: "사용자의 새로운 자료에 대해 형식을 추가로
// 생성해서 서버에 공유"). The proposal anchors on one of the 8 base kinds (so the
// stored source.kind stays valid) and adds a named format plus the semantic props
// the classifier can fill for future material of that kind.
//
// Pure builder + parser (tested); proposeClipperTemplate is the thin callGemini
// orchestrator so C1/C3/C9 are enforced there. The parser is defensive and
// C-vocabulary-guarded: a proposal carrying clinical/medical wording is dropped
// (returns null) so a forbidden term can never reach the shared template store.

import { callGemini } from "../llm/gemini";
import { containsForbiddenLexicon } from "../safety/classifier";
import {
  CLIPPER_TEMPLATE_LIST,
  TARGET_CATEGORIES,
  type ClipperAiProperty,
  type TargetCategory,
} from "./clipper-templates";
import { detectClipperKind } from "./clipper-kind";
import { toSlug } from "./slug";
import { SOURCE_KINDS, type SourceKind } from "./types";
import { sanitizeTag } from "./tags";

export interface ProposedClipperTemplate {
  slug: string;
  baseKind: SourceKind;
  name: { en: string; ko: string };
  what: { en: string; ko: string };
  defaultTags: string[];
  targetCategory: TargetCategory | "";
  aiProperties: ClipperAiProperty[];
}

/** Build the propose-a-new-format prompt. Pure → deterministic. */
export function buildProposeTemplatePrompt(
  content: string,
  url: string | null,
  locale: "en" | "ko",
): { system: string; user: string } {
  const kinds = CLIPPER_TEMPLATE_LIST.map((t) => t.kind).join(", ");
  const system =
    locale === "ko"
      ? [
          "사용자가 2nd-Brain에 담은 자료가 기존 8개 클리퍼 형식 중 어디에도 잘 맞지 않습니다.",
          "이 자료 같은 부류를 위한 새로운 '형식'을 제안하세요. JSON만 출력합니다. JSON 외 텍스트 금지.",
          "",
          `base_kind는 다음 8개 중 가장 가까운 하나여야 합니다: ${kinds}`,
          "임상·의료 용어는 절대 쓰지 마세요. 중립적이고 일상적인 표현만 사용합니다.",
          "",
          "JSON 형식:",
          '{ "slug": "kebab-식별자",',
          '  "base_kind": 위 8개 중 하나,',
          '  "name": { "en": "짧은 영어 이름", "ko": "짧은 한글 이름" },',
          '  "what": { "en": "one line", "ko": "한 줄 설명" },',
          '  "defaultTags": [2-4개, 소문자 하이픈, # 없이],',
          '  "targetCategory": "concepts" | "entities" | "projects",',
          '  "aiProperties": [ { "name": "kebab-key", "type": "text"|"multitext"|"number", "describe": { "en": "...", "ko": "..." } } ]  (1-3개) }',
          "",
          `자료 URL: ${url ?? "(없음)"}`,
        ].join("\n")
      : [
          "The material the user clipped does not fit any of the 8 existing clipper formats well.",
          "Propose a NEW reusable format for material like this. Return strict JSON only. No prose outside the JSON.",
          "",
          `base_kind must be the closest of these 8: ${kinds}`,
          "Never use clinical or medical vocabulary. Keep it neutral and everyday.",
          "",
          "JSON shape:",
          '{ "slug": "kebab-identifier",',
          '  "base_kind": one of the 8,',
          '  "name": { "en": "short English name", "ko": "short Korean name" },',
          '  "what": { "en": "one line", "ko": "one line in Korean" },',
          '  "defaultTags": [2-4 strings, lowercase, hyphenated, no # prefix],',
          '  "targetCategory": "concepts" | "entities" | "projects",',
          '  "aiProperties": [ { "name": "kebab-key", "type": "text"|"multitext"|"number", "describe": { "en": "...", "ko": "..." } } ]  (1-3 items) }',
          "",
          `Material URL: ${url ?? "(none)"}`,
        ].join("\n");
  return { system, user: content.trim().slice(0, 4000) };
}

function asPair(v: unknown): { en: string; ko: string } {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    en: typeof o.en === "string" ? o.en.trim().slice(0, 120) : "",
    ko: typeof o.ko === "string" ? o.ko.trim().slice(0, 120) : "",
  };
}

function parseAiProps(v: unknown): ClipperAiProperty[] {
  if (!Array.isArray(v)) return [];
  const out: ClipperAiProperty[] = [];
  for (const raw of v.slice(0, 3)) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const name = typeof o.name === "string" ? sanitizeTag(o.name) : "";
    if (name.length === 0) continue;
    const type: ClipperAiProperty["type"] =
      o.type === "multitext" || o.type === "number" ? o.type : "text";
    const d = (o.describe ?? {}) as Record<string, unknown>;
    out.push({
      name,
      type,
      describe: {
        en: typeof d.en === "string" ? d.en.slice(0, 160) : "",
        ko: typeof d.ko === "string" ? d.ko.slice(0, 160) : "",
      },
    });
  }
  return out;
}

/**
 * Parse + sanitize the LLM reply into a ProposedClipperTemplate. Pure → tested.
 * Returns null when the reply is unusable (bad JSON, no name) or when it carries
 * clinical/medical wording (C-vocabulary) — the caller then simply offers no
 * proposal, so a forbidden term never reaches the shared store.
 */
export function parseProposedTemplate(raw: string, fallbackKind: SourceKind): ProposedClipperTemplate | null {
  let parsed: Record<string, unknown>;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }

  const name = asPair(parsed.name);
  const what = asPair(parsed.what);
  // A format with no name is useless.
  if (name.en.length === 0 && name.ko.length === 0) return null;

  const baseKind: SourceKind = SOURCE_KINDS.includes(parsed.base_kind as SourceKind)
    ? (parsed.base_kind as SourceKind)
    : fallbackKind;

  const targetCategory: TargetCategory | "" = TARGET_CATEGORIES.includes(parsed.targetCategory as TargetCategory)
    ? (parsed.targetCategory as TargetCategory)
    : "";

  const defaultTags = Array.isArray(parsed.defaultTags)
    ? parsed.defaultTags
        .map((t) => sanitizeTag(String(t)))
        .filter((t) => t.length > 0 && t.length <= 32)
        .slice(0, 6)
    : [];

  const aiProperties = parseAiProps(parsed.aiProperties);

  const slugSeed =
    typeof parsed.slug === "string" && parsed.slug.trim().length > 0 ? parsed.slug : name.en || name.ko;
  const slug = toSlug(slugSeed).slice(0, 48) || toSlug(name.ko) || "custom-format";

  // C-vocabulary gate: drop the whole proposal if any surface text is clinical.
  const surface = [
    name.en,
    name.ko,
    what.en,
    what.ko,
    ...defaultTags,
    ...aiProperties.flatMap((p) => [p.name, p.describe.en, p.describe.ko]),
  ].join(" \n ");
  if (containsForbiddenLexicon(surface, "en").length > 0 || containsForbiddenLexicon(surface, "ko").length > 0) return null;

  return { slug, baseKind, name, what, defaultTags, targetCategory, aiProperties };
}

/**
 * Ask the AI to propose a new clipper format for a captured piece. The
 * URL-derived kind is the baseline + fallback. Returns null in mock mode, on a
 * bad reply, or when the proposal is filtered by the C-vocabulary gate — so the
 * caller can always treat a null as "no new format to offer."
 */
export async function proposeClipperTemplate(
  userId: string,
  content: string,
  url: string | null,
  locale: "en" | "ko",
): Promise<ProposedClipperTemplate | null> {
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;
  const baselineKind: SourceKind = url ? detectClipperKind(url) : "inbox";
  const { system, user } = buildProposeTemplatePrompt(trimmed, url, locale);
  const reply = await callGemini({ userId, locale, purpose: "clipper_template_propose", system, user });
  return parseProposedTemplate(reply.text, baselineKind);
}
