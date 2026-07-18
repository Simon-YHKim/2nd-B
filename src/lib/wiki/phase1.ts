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
import { containsForbiddenLexicon } from "../safety/classifier";
import { VILLAGE_LABEL, type VillageId } from "../graph/relatedness";

// §1 ingest categories = the Pattern Core domains (graph tier-2). Derived from
// VILLAGE_LABEL so the enum stays in lockstep with the graph model (DRY).
const INGEST_CATEGORIES = Object.keys(VILLAGE_LABEL) as VillageId[];
// relevance below this ⇒ keep=false (drop candidate). Tunable; eng review A4.
const RELEVANCE_KEEP_THRESHOLD = 2;

export interface Phase1Result {
  summary: string;
  entities: string[];
  concepts: string[];
  questions: string[];
  // §1 ingest normalization, folded into the same pass (eng review A1/A4 — no
  // separate Gemini call). All optional for backward-compat with __phase1__
  // rows written before these fields existed.
  /** One Pattern Core domain (graph tier-2). */
  category?: VillageId;
  /** 3-7 short tags; clinical terms stripped post-generation (eng review C3). */
  tags?: string[];
  /** 1-5: usefulness for the reader's self-understanding and growth. */
  relevance?: number;
  /** false only for spam / ads / no personal value (drop candidate). */
  keep?: boolean;
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
    category: { type: "STRING", format: "enum", enum: INGEST_CATEGORIES },
    tags: { type: "ARRAY", items: { type: "STRING" } },
    relevance: { type: "INTEGER" },
    keep: { type: "BOOLEAN" },
  },
  required: ["summary", "entities", "concepts", "questions", "category", "tags", "relevance", "keep"],
} as const;

const SYSTEM_PROMPT = {
  en:
    "You are a careful reading assistant. Read the source markdown and emit JSON with: a 3-5 sentence summary, an `entities` array (people / orgs / works named in the text), a `concepts` array (3-7 abstract ideas the text develops), and a `questions` array of exactly 4 reflection prompts the reader can sit with. Also classify the source into exactly one `category` from: work, relation, knowledge, records, taste, rhythm. Suggest 3-7 short `tags`. Give a `relevance` integer from 1 to 5 for how useful this is for the reader's self-understanding and growth, and a `keep` boolean that is false only for spam, ads, or content with no personal value. Use the reader's locale.",
  ko:
    "당신은 신중한 독해 보조자입니다. 소스 마크다운을 읽고 다음 JSON을 만들어 주세요: 3-5문장 요약, 본문에 등장한 사람/조직/저작물의 `entities` 배열, 본문이 다루는 3-7개의 추상 개념 `concepts` 배열, 그리고 독자가 음미할 수 있는 정확히 4개의 성찰 질문 `questions` 배열. 또한 소스를 work, relation, knowledge, records, taste, rhythm 중 정확히 하나의 `category`로 분류하고, 3-7개의 짧은 `tags`를 제안하세요. 독자의 자기 이해와 성장에 얼마나 유용한지 `relevance`를 1에서 5 사이 정수로, 그리고 스팸·광고·개인적 가치가 전혀 없는 콘텐츠일 때만 false인 `keep` 불리언을 함께 주세요. 독자의 언어에 맞춰 답하세요.",
};

/**
 * Best-effort JSON extraction from the LLM reply. Live Gemini honors the
 * responseSchema so the reply is already JSON; offline-preview mode returns
 * the templated string. For offline preview we synthesize a fallback so the
 * UI can render something while no live model is connected.
 */
function parsePhase1Reply(
  text: string,
  locale: "en" | "ko",
): Omit<Phase1Result, "generated_at" | "model"> | null {
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
        const isString = (s: unknown): s is string => typeof s === "string";
        // §1 ingest fields are tolerant: absent/invalid ⇒ undefined, so replies
        // from before this schema (and mock mode) still parse.
        const category =
          isString(parsed.category) && (INGEST_CATEGORIES as string[]).includes(parsed.category)
            ? (parsed.category as VillageId)
            : undefined;
        // Strip any tag carrying a clinical term — schema can't enum-constrain a
        // free-text array, so the lexicon guard runs post-generation (C3).
        const tags = (Array.isArray(parsed.tags) ? parsed.tags.filter(isString) : []).filter(
          (t: string) => containsForbiddenLexicon(t, locale).length === 0,
        );
        const relevance =
          typeof parsed.relevance === "number" && Number.isFinite(parsed.relevance)
            ? Math.min(5, Math.max(1, Math.round(parsed.relevance)))
            : undefined;
        const keep =
          typeof parsed.keep === "boolean"
            ? parsed.keep
            : relevance === undefined
              ? true
              : relevance >= RELEVANCE_KEEP_THRESHOLD;
        return {
          summary: parsed.summary,
          entities: parsed.entities.filter(isString),
          concepts: parsed.concepts.filter(isString),
          questions: parsed.questions.filter(isString),
          category,
          tags,
          relevance,
          keep,
        };
      }
    } catch {
      // fall through to mock stub
    }
  }
  return null;
}

// Offline-preview fallback for the summarize step. Returned when no live model
// is connected so the reflection questions still render. The text reads as
// ordinary product copy; the internal "offline preview / no live model" marker
// stays in this comment only.
function mockStub(title: string, locale: "en" | "ko"): Omit<Phase1Result, "generated_at" | "model"> {
  return locale === "ko"
    ? {
        summary: `지금은 오프라인 미리보기예요. "${title}"의 요약은 온라인으로 연결하면 생성됩니다.`,
        entities: [],
        concepts: [],
        questions: [
          "이 글에서 가장 강하게 남은 한 문장은 무엇인가요?",
          "당신의 삶에서 이 글의 어떤 부분이 가장 가깝게 느껴지나요?",
          "동의하지 않거나 의심이 드는 지점이 있다면 어디인가요?",
          "오늘 이후 작은 행동 하나로 옮길 수 있는 것은 무엇인가요?",
        ],
        tags: [],
        relevance: 3,
        keep: true,
      }
    : {
        summary: `This is an offline preview. The summary of "${title}" will be generated once you go online.`,
        entities: [],
        concepts: [],
        questions: [
          "What single sentence stayed with you from this piece?",
          "Where does this piece feel closest to your own life right now?",
          "Where do you find yourself disagreeing or doubtful?",
          "What is one small action you could carry forward today?",
        ],
        tags: [],
        relevance: 3,
        keep: true,
      };
}

export interface RunPhase1Input {
  userId: string;
  sourceId: string;
  locale: "en" | "ko";
  /** From AuthContext.isMinor at the call site; routes the youth crisis hotline
   *  if the model output trips the safety classifier. Defaults to adult. */
  minor?: boolean;
}

export async function runPhase1(input: RunPhase1Input): Promise<Phase1Result> {
  const source = await getSource(input.userId, input.sourceId);
  if (!source) throw new Error(`No source row for id=${input.sourceId}`);

  const body = await downloadRawClipping(source.storage_path);
  const env = getEnv();

  const reply = await callGemini({
    userId: input.userId,
    locale: input.locale,
    purpose: "source_ingest",
    minor: input.minor,
    system: SYSTEM_PROMPT[input.locale],
    user: `Title: ${source.title}\n\n${body}`,
    model: "flash",
    responseSchema: env.EXPO_PUBLIC_LLM_MODE === "mock" ? undefined : (PHASE1_SCHEMA as Record<string, unknown>),
  });

  const parsed = parsePhase1Reply(reply.text, input.locale) ?? mockStub(source.title, input.locale);

  const result: Phase1Result = {
    ...parsed,
    generated_at: new Date().toISOString(),
    model: reply.audit.modelUsed,
  };

  // Persist to sources.frontmatter.__phase1__ so the inbox/detail UI can
  // render it without re-running the LLM.
  // Re-read the frontmatter immediately before writing. The multi-second callGemini
  // above is a wide window in which another writer (e.g. promote-pending clearing
  // _storage_pending after a successful re-upload) may have changed
  // sources.frontmatter; spreading the pre-LLM snapshot would resurrect the keys
  // they cleared and re-mark the source storage-pending forever (audit wave-3
  // concurrency fix). Merging into a fresh read shrinks the race to the tiny
  // read->write gap instead of the whole LLM latency.
  const supabase = getSupabaseClient();
  const fresh = await getSource(input.userId, input.sourceId);
  const baseFrontmatter = fresh?.frontmatter ?? source.frontmatter;
  const nextFrontmatter = { ...baseFrontmatter, __phase1__: result };
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
