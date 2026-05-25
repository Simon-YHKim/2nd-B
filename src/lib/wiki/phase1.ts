// Phase 1: summarize + extract entities/concepts + emit 4 reflection questions.
//
// Per handoff v3 §5: "Phase 1 — 원본 읽기(raw 불변) → 요약(핵심 주장·엔티티·개념)
// → 사용자에게 4개 성찰 질문 → 답변 대기".
//
// Phase 1 reads an ingested source (Storage-backed), calls Gemini through
// the single wrapper (C1/C3/C9 intact), and persists the result on
// sources.frontmatter under a reserved `__phase1__` key. The capture screen
// and inbox detail surface read it from there.
//
// LLM mode handling — the wrapper's mock mode returns a deterministic
// templated reply; we parse a JSON fallback when the mock string isn't
// structured, so the orchestration is exercisable end-to-end without a
// Gemini connection. With real Gemini (live mode or via gemini-proxy
// Edge Function) the same code path produces the structured output.

import { callGemini } from "@/lib/llm/gemini";
import { getEnv } from "@/lib/env";

import { getSource } from "./queries";
import { downloadRawClipping } from "./storage";
import { getSupabaseClient } from "../supabase/client";

export interface Phase1Result {
  summary: string;
  entities: string[];
  concepts: string[];
  questions: string[];
  generated_at: string;
  model: string;
}

const PHASE1_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    entities: { type: "ARRAY", items: { type: "STRING" } },
    concepts: { type: "ARRAY", items: { type: "STRING" } },
    questions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["summary", "entities", "concepts", "questions"],
} as const;

const SYSTEM_PROMPT = {
  en:
    "You are a careful reading assistant. Read the source markdown and emit JSON with: a 3-5 sentence summary, an `entities` array (people / orgs / works named in the text), a `concepts` array (3-7 abstract ideas the text develops), and a `questions` array of exactly 4 reflection prompts the reader can sit with. Use the reader's locale.",
  ko:
    "당신은 신중한 독해 보조자입니다. 소스 마크다운을 읽고 다음 JSON을 만들어 주세요: 3-5문장 요약, 본문에 등장한 사람/조직/저작물의 `entities` 배열, 본문이 다루는 3-7개의 추상 개념 `concepts` 배열, 그리고 독자가 음미할 수 있는 정확히 4개의 성찰 질문 `questions` 배열. 독자의 언어에 맞춰 답하세요.",
};

/**
 * Best-effort JSON extraction from the LLM reply. Live Gemini honors the
 * responseSchema so the reply is already JSON; mock mode returns the
 * templated string. For mock we synthesize a stub so the UI can render
 * something while no real LLM is wired.
 */
function parsePhase1Reply(text: string): Omit<Phase1Result, "generated_at" | "model"> | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        typeof parsed.summary === "string" &&
        Array.isArray(parsed.entities) &&
        Array.isArray(parsed.concepts) &&
        Array.isArray(parsed.questions)
      ) {
        return {
          summary: parsed.summary,
          entities: parsed.entities.filter((s: unknown): s is string => typeof s === "string"),
          concepts: parsed.concepts.filter((s: unknown): s is string => typeof s === "string"),
          questions: parsed.questions.filter((s: unknown): s is string => typeof s === "string"),
        };
      }
    } catch {
      // fall through to mock stub
    }
  }
  return null;
}

function mockStub(title: string, locale: "en" | "ko"): Omit<Phase1Result, "generated_at" | "model"> {
  return locale === "ko"
    ? {
        summary: `[MOCK] "${title}"의 요약은 Gemini 키가 연결된 뒤 생성됩니다. 지금은 자리표시자입니다.`,
        entities: [],
        concepts: [],
        questions: [
          "이 글에서 가장 강하게 남은 한 문장은 무엇인가요?",
          "당신의 삶에서 이 글의 어떤 부분이 가장 가깝게 느껴지나요?",
          "동의하지 않거나 의심이 드는 지점이 있다면 어디인가요?",
          "오늘 이후 작은 행동 하나로 옮길 수 있는 것은 무엇인가요?",
        ],
      }
    : {
        summary: `[MOCK] Summary of "${title}" will be generated once a Gemini key is configured. This is a placeholder.`,
        entities: [],
        concepts: [],
        questions: [
          "What single sentence stayed with you from this piece?",
          "Where does this piece feel closest to your own life right now?",
          "Where do you find yourself disagreeing or doubtful?",
          "What is one small action you could carry forward today?",
        ],
      };
}

export interface RunPhase1Input {
  userId: string;
  sourceId: string;
  locale: "en" | "ko";
}

export async function runPhase1(input: RunPhase1Input): Promise<Phase1Result> {
  const source = await getSource(input.userId, input.sourceId);
  if (!source) throw new Error(`No source row for id=${input.sourceId}`);

  const body = await downloadRawClipping(source.storage_path);
  const env = getEnv();

  const reply = await callGemini({
    userId: input.userId,
    locale: input.locale,
    purpose: "knowledge_lookup",
    system: SYSTEM_PROMPT[input.locale],
    user: `Title: ${source.title}\n\n${body}`,
    model: "flash",
    responseSchema: env.EXPO_PUBLIC_LLM_MODE === "mock" ? undefined : (PHASE1_SCHEMA as Record<string, unknown>),
  });

  const parsed = parsePhase1Reply(reply.text) ?? mockStub(source.title, input.locale);

  const result: Phase1Result = {
    ...parsed,
    generated_at: new Date().toISOString(),
    model: reply.audit.modelUsed,
  };

  // Persist to sources.frontmatter.__phase1__ so the inbox/detail UI can
  // render it without re-running the LLM.
  const supabase = getSupabaseClient();
  const nextFrontmatter = { ...source.frontmatter, __phase1__: result };
  const { error } = await supabase
    .from("sources")
    .update({ frontmatter: nextFrontmatter })
    .eq("id", input.sourceId)
    .eq("user_id", input.userId);
  if (error) throw error;

  return result;
}

/** Read the cached Phase 1 result if it exists on the source row. */
export function readPhase1(frontmatter: Record<string, unknown>): Phase1Result | null {
  const raw = (frontmatter as { __phase1__?: unknown }).__phase1__;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.summary === "string" &&
    Array.isArray(r.entities) &&
    Array.isArray(r.concepts) &&
    Array.isArray(r.questions) &&
    typeof r.generated_at === "string" &&
    typeof r.model === "string"
  ) {
    return r as unknown as Phase1Result;
  }
  return null;
}
