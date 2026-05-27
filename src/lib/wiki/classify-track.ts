// LLM-driven classifier for capture entries.
//
// Per user directive (2026-05-27): "사용자가 데이터를 입력할 때 LLM이
// 해시태그로 분류, 사용자가 설정/수정 가능". This module takes the raw
// body the user is about to save and asks Gemini for two things at once:
//   1. wiki_track — "daily" (personal life) or "pro" (career-related)
//   2. tags — 3–7 hashtag-style strings (lowercase, hyphen-separated)
//
// The result is a *suggestion*. The capture screen presents both as
// editable chips and a track toggle, so the user keeps the final word.

import { callGemini } from "../llm/gemini";

export type WikiTrack = "daily" | "pro";

export interface ClassifyResult {
  track: WikiTrack;
  tags: string[];
  summary: string;
}

const SYSTEM_PROMPT_EN = [
  "You classify short snippets the user just captured into their 2nd-Brain.",
  "Return strict JSON only. No prose outside the JSON.",
  "",
  "JSON shape:",
  '{ "track": "daily" | "pro",',
  '  "tags": [3-7 strings, lowercase, hyphen-separated, no # prefix],',
  '  "summary": "one short sentence in the user\'s language" }',
  "",
  "Rules for `track`:",
  "  - 'daily' = personal life, hobbies, casual reading, relationships, health notes",
  "  - 'pro' = career/work/study, technical references, professional knowledge",
  "  - When mixed or unclear, lean toward 'daily'.",
].join("\n");

const SYSTEM_PROMPT_KO = [
  "사용자가 방금 2nd-Brain에 저장하려는 짧은 글을 분류합니다.",
  "JSON만 출력하세요. JSON 외 다른 텍스트 금지.",
  "",
  "JSON 형식:",
  '{ "track": "daily" | "pro",',
  '  "tags": [3-7개 문자열, 소문자, 하이픈 연결, # 접두사 없이],',
  '  "summary": "사용자 언어로 한 줄 요약" }',
  "",
  "track 규칙:",
  "  - 'daily' = 일상·취미·관계·건강 기록 등 직업과 무관한 글",
  "  - 'pro' = 커리어·업무·전공·기술 참고·전문 지식",
  "  - 섞이거나 모호하면 'daily'.",
].join("\n");

export async function classifyCapture(
  userId: string,
  body: string,
  locale: "en" | "ko",
): Promise<ClassifyResult> {
  const trimmed = body.trim().slice(0, 4000);
  if (trimmed.length === 0) {
    return { track: "daily", tags: [], summary: "" };
  }
  const reply = await callGemini({
    userId,
    locale,
    purpose: "capture_classify",
    system: locale === "ko" ? SYSTEM_PROMPT_KO : SYSTEM_PROMPT_EN,
    user: trimmed,
  });

  // Defensive parsing — extract the first JSON block from the reply, then
  // sanitize each field. A bad-shaped reply degrades to a safe default.
  try {
    const match = reply.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no_json");
    const parsed = JSON.parse(match[0]) as Partial<ClassifyResult>;
    const track: WikiTrack = parsed.track === "pro" ? "pro" : "daily";
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .slice(0, 7)
          .map((t) => String(t).trim().toLowerCase().replace(/^#+/, "").replace(/[^a-z0-9가-힣\-]+/g, "-"))
          .filter((t) => t.length > 0 && t.length <= 32)
      : [];
    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : "";
    return { track, tags, summary };
  } catch {
    return { track: "daily", tags: [], summary: "" };
  }
}
