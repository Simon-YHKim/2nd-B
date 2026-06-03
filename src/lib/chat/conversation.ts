// Jarvis chat orchestrator.
//
//   1. Read today's chat_usage row for the user.
//   2. Check the tier limit (free 5, Soma 30, Cortex 80, Brain 250).
//   3. If allowed, build a system prompt with a compact wiki snapshot,
//      call callGemini (which enforces C1/C3/C9 automatically), and
//      atomically bump today's chat_usage.
//   4. If blocked, return a localized upgrade hint without calling Gemini.
//
// The wiki snapshot is the export prompt with body_md truncated so the
// chat fits in Gemini Flash's context window. Phase 1/2 wiki pages will
// populate the snapshot naturally; until then the snapshot is mostly the
// raw `sources` list, which already steers the model toward the user's
// inbox.

import { callGemini } from "@/lib/llm/gemini";
import type { GeminiResult } from "@/lib/llm/types";
import type { SubscriptionTier } from "@/lib/progression/entitlements";

import { CHAT_DAILY_LIMIT, checkChatLimit, kstDateToday } from "./limits";
import { exportUserWiki } from "../wiki/export";
import { ChatLimitExceededError, bumpChatUsageIfUnderCap, readChatUsage } from "./usage";

export interface SendMessageInput {
  userId: string;
  message: string;
  locale: "en" | "ko";
  tier: SubscriptionTier;
  mode?: "analytic" | "divergent";
  /**
   * Optional character voice instruction (from src/lib/chat/personas.ts).
   * When the user opens chat by tapping a village companion, this keeps the
   * reply in that character's voice while still grounding on the wiki.
   */
  personaHint?: string | null;
  // C10 safety: minor flag forwarded to callGemini for youth crisis routing.
  minor?: boolean;
}

export interface SendMessageBlocked {
  status: "blocked";
  reason: "limit_reached";
  limit: number;
  used: number;
  upgradeTo: SubscriptionTier | null;
  /** Localized hint string ready for direct display. */
  hint: string;
}

export interface SendMessageOk {
  status: "ok";
  reply: GeminiResult<string>;
  used: number;
  limit: number;
  remaining: number;
}

export type SendMessageResult = SendMessageBlocked | SendMessageOk;

const SYSTEM_PROMPT_HEADER = {
  en: "You are SecondB, the user's 2nd-Brain assistant. Reference the wiki pages and sources below; cite slugs via [[double-brackets]]. Keep replies under 4 sentences unless the user asks for depth.",
  ko: "당신은 사용자의 두번째 뇌 비서, 세컨비입니다. 아래 위키 페이지와 소스를 참고하고, 인용할 때는 [[슬러그]] 형식을 사용하세요. 사용자가 깊이 있는 답을 원하지 않으면 4문장 안으로 답하세요.",
};

const MODE_PROMPT = {
  analytic: {
    en: "Mode: Analytic. Ground the answer in the user's saved logs and wiki. Separate observed evidence from inference, then give one practical next step.",
    ko: "모드: Analytic. 사용자의 저장된 Log와 위키에 근거해 답하세요. 관찰된 근거와 추론을 구분하고, 실천 가능한 다음 한 걸음을 제안하세요.",
  },
  divergent: {
    en: "Mode: Divergent. Use the user's saved logs as a starting point, then deliberately try an unexpected outside lens. Mark it as a possibility, not a verdict, and look for a new route.",
    ko: "모드: Divergent. 사용자의 저장된 Log를 출발점으로 삼되, 의도적으로 낯선 외부 관점을 적용하세요. 단정하지 말고 가능성으로 제시하며 새로운 경로를 찾으세요.",
  },
} as const;

const BLOCKED_HINT = {
  en: (limit: number, upgrade: SubscriptionTier | null) =>
    upgrade
      ? `You've hit today's free chat limit (${limit}). Upgrade to ${upgrade.toUpperCase()} for more — limits reset at midnight KST.`
      : `You've hit today's chat limit (${limit}). Limits reset at midnight KST.`,
  ko: (limit: number, upgrade: SubscriptionTier | null) =>
    upgrade
      ? `오늘 채팅 한도(${limit}회)를 모두 사용했어요. ${upgrade.toUpperCase()} 플랜으로 업그레이드하면 더 많이 쓸 수 있어요 — 한도는 KST 자정에 초기화돼요.`
      : `오늘 채팅 한도(${limit}회)를 모두 사용했어요. 한도는 KST 자정에 초기화돼요.`,
};

export async function sendChatMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const day = kstDateToday();
  const limit = CHAT_DAILY_LIMIT[input.tier];

  // Atomic check-and-bump (codex R2): the RPC inserts/increments the row
  // ONLY if the existing count is below `limit`. Otherwise it raises
  // chat_limit_exceeded and we return a blocked result without ever
  // calling Gemini. This closes the TOCTOU race where N parallel callers
  // could all see used<limit and all bill an LLM call.
  //
  // Trade-off vs. the previous design: red-zone (crisis-routed) turns now
  // ALSO count against the daily quota. The alternative — bump after the
  // LLM call — would reopen the race. We accept the 1-count penalty on
  // crisis turns; a future PR can add a refund RPC if it matters.
  let newCount: number;
  try {
    newCount = await bumpChatUsageIfUnderCap(input.userId, limit, day);
  } catch (e) {
    if (e instanceof ChatLimitExceededError) {
      const used = await readChatUsage(input.userId, day);
      const check = checkChatLimit(input.tier, used);
      return {
        status: "blocked",
        reason: "limit_reached",
        limit: check.limit,
        used: check.used,
        upgradeTo: check.upgradeTo,
        hint: BLOCKED_HINT[input.locale](check.limit, check.upgradeTo),
      };
    }
    throw e;
  }

  // RAG context: compact wiki snapshot. Capped so the chat stays inside the
  // Gemini Flash context window even for users with hundreds of pages.
  const snapshot = await exportUserWiki(input.userId, {
    locale: input.locale,
    bodyCharLimit: 600,
    pageLimit: 50,
    sourceLimit: 100,
  });

  const mode = input.mode ?? "analytic";
  const personaLine = input.personaHint ? `${input.personaHint}\n\n` : "";
  const system = `${SYSTEM_PROMPT_HEADER[input.locale]}\n\n${MODE_PROMPT[mode][input.locale]}\n\n${personaLine}${snapshot.prompt}`;

  // C1/C3/C9 are enforced by callGemini. Red-zone short-circuit still
  // happens inside callGemini; we just no longer adjust the counter
  // afterwards because the bump already landed atomically above.
  const reply = await callGemini({
    userId: input.userId,
    locale: input.locale,
    purpose: "jarvis_chat",
    system,
    user: input.message,
    minor: input.minor,
  });

  return {
    status: "ok",
    reply,
    used: newCount,
    limit,
    remaining: Math.max(0, limit - newCount),
  };
}
