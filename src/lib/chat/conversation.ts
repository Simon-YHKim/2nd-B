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

import { checkChatLimit, kstDateToday } from "./limits";
import { exportUserWiki } from "../wiki/export";
import { bumpChatUsage, readChatUsage } from "./usage";

export interface SendMessageInput {
  userId: string;
  message: string;
  locale: "en" | "ko";
  tier: SubscriptionTier;
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
  en: "You are Jarvis, the user's 2nd-Brain assistant. Reference the wiki pages and sources below; cite slugs via [[double-brackets]]. Keep replies under 4 sentences unless the user asks for depth.",
  ko: "당신은 사용자의 두번째 뇌 비서, 자비스입니다. 아래 위키 페이지와 소스를 참고하고, 인용할 때는 [[슬러그]] 형식을 사용하세요. 사용자가 깊이 있는 답을 원하지 않으면 4문장 안으로 답하세요.",
};

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
  const used = await readChatUsage(input.userId, day);
  const check = checkChatLimit(input.tier, used);

  if (!check.allowed) {
    return {
      status: "blocked",
      reason: "limit_reached",
      limit: check.limit,
      used: check.used,
      upgradeTo: check.upgradeTo,
      hint: BLOCKED_HINT[input.locale](check.limit, check.upgradeTo),
    };
  }

  // RAG context: compact wiki snapshot. Capped so the chat stays inside the
  // Gemini Flash context window even for users with hundreds of pages.
  const snapshot = await exportUserWiki(input.userId, {
    locale: input.locale,
    bodyCharLimit: 600,
    pageLimit: 50,
    sourceLimit: 100,
  });

  const system = `${SYSTEM_PROMPT_HEADER[input.locale]}\n\n${snapshot.prompt}`;

  // C1/C3/C9 are enforced by callGemini. Red-zone input is short-circuited
  // BEFORE the network call (and before usage is bumped — we don't punish
  // safety-routed turns against the user's daily quota).
  const reply = await callGemini({
    userId: input.userId,
    locale: input.locale,
    purpose: "jarvis_chat",
    system,
    user: input.message,
  });

  // Only bump if Gemini actually engaged. Red-zone responses come back with
  // audit.modelUsed='none-crisis-routed'; we let those through free.
  if (reply.audit.modelUsed !== "none-crisis-routed") {
    try {
      await bumpChatUsage(input.userId, day);
    } catch (e) {
      // Counting failure shouldn't fail the chat — the reply has already
      // happened. Surface via console; next call will read stale `used`.
      if (typeof console !== "undefined") console.warn("[chat] bumpChatUsage failed", (e as Error).message);
    }
  }

  return {
    status: "ok",
    reply,
    used: used + 1,
    limit: check.limit,
    remaining: Math.max(0, check.limit - (used + 1)),
  };
}
