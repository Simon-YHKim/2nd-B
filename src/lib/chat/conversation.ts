// Jarvis chat orchestrator.
//
//   1. Read today's chat_usage row for the user.
//   2. Check the tier limit (free 2, Soma 30, Cortex 80, Brain 250).
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
import { INJECTION_GUARD, sanitizeUntrusted } from "@/lib/llm/untrusted";
import { classifyInput } from "@/lib/safety/classifier";
import { promptSafeName } from "@/lib/persona/address";
import type { GeminiResult } from "@/lib/llm/types";
import type { SubscriptionTier } from "@/lib/progression/entitlements";

import { CHAT_DAILY_LIMIT, checkChatLimit, kstDateToday } from "./limits";
import { loadStructuredContext } from "../records/load-structured";
import { exportUserWiki } from "../wiki/export";
import { formatRagPages, retrieveChatContext } from "./rag";
import { ChatLimitExceededError, bumpChatUsageIfUnderCap, readChatUsageDetail } from "./usage";

/** One prior exchange line. `assistant` is the model's own earlier reply. */
export interface ChatHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

// D-26 A1: conversation window. 6 turns (~3 exchanges) is enough for
// pronoun/thread continuity without growing the prompt unboundedly; each
// turn's text is clipped so one long paste can't blow the budget.
const HISTORY_MAX_TURNS = 6;
const HISTORY_TURN_CHAR_LIMIT = 500;

export interface SendMessageInput {
  userId: string;
  message: string;
  locale: "en" | "ko";
  tier: SubscriptionTier;
  /**
   * 사용자가 온보딩에서 넣은 표시 이름. 있으면 세컨비가 이름으로 부른다.
   * 화면은 이미 "허슬케이님" 이라 하는데 모델만 "당신" 이라 하면 어색하다.
   *
   * 이 값은 **시스템 프롬프트 안**에 들어가므로, 원문이 아니라
   * promptSafeName 을 통과한 것만 넘길 것 (지시문 자리에 들어가는 사용자 입력).
   */
  displayName?: string | null;
  /**
   * Optional character voice instruction (from src/lib/chat/personas.ts).
   * When the user opens chat by tapping a village companion, this keeps the
   * reply in that character's voice while still grounding on the wiki.
   */
  personaHint?: string | null;
  /**
   * SecondB conversation mode (worldview v-final). "analytic" (default) grounds
   * analysis + advice in the user's data; "divergent" stays data-grounded but
   * explores radically different angles and new possibilities. Both still run
   * the full C9 -> C3 -> gemini.ts path; the mode only shapes the system prompt
   * (Divergent is a mode, never a safety bypass).
   */
  mode?: "analytic" | "divergent";
  // C10 safety: minor flag forwarded to callGemini for youth crisis routing.
  minor?: boolean;
  /**
   * Prior turns of THIS conversation, oldest first (D-26 A1: 최근 6턴).
   * Component-local state in v1 — the screen passes its own turn list; only
   * the last HISTORY_MAX_TURNS are used, each clipped. History rides the
   * system channel fenced as untrusted. C9: each turn is re-classified here
   * and any red-zone turn is DROPPED before it reaches the prompt — a prior
   * crisis turn was withheld from the model when it was sent, and replaying
   * it through the system channel (which callGemini does NOT crisis-scan)
   * would silently re-egress it. Filtering at the engine, not trusting the
   * screen to pre-strip.
   */
  history?: ChatHistoryTurn[];
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

// The flagship head-tap chat runs on this header (rev2 secondb persona hint is
// null, so no per-persona line overrides it). It is the voice contract, so it
// carries the same honesty / pattern-not-verdict / calibrated / anti-anthro
// invariants that personaSynthesisSystem and assembleAdvisorPrompt already
// encode (2026-07-05 audit): SecondB is a synthesis of the user's own records,
// NOT a 비서/assistant/companion (PRD: 종합, not 비서; register: 관찰해 말한다).
// Framing only; rides the TRUSTED system channel so C9/C3 are unaffected.
// 세컨비의 정체성.
//
// 2026-08-15 이전에는 "비서나 동반자, 친구가 아니라 자기 자신의 종합" 이라고
// 못박혀 있었다. Simon 이 그 불변식을 뒤집기로 승인했고(CLAUDE.md 기록),
// 제품 의도는 "친구 같은 상담 + 개인 비서" 다. 그래서 정체성 문장을 다시 썼다.
//
// **완화한 것은 거리감뿐이다.** 아래 넷은 그대로 유효하고, 오히려 더 명시적으로
// 적었다 - 따뜻해질수록 지어내기 쉬워지기 때문이다:
//   1. 기록에 없는 사실·특성·수치를 지어내지 않는다
//   2. 사람에 대한 단정이 아니라 기록 속 패턴을 말한다
//   3. 임상·진단 어휘를 쓰지 않는다 (src/lib/safety/lexicon.ts)
//   4. 그 사람이 스스로를 아는 것보다 더 잘 안다고 주장하지 않는다
//
// check-mascot-voice / check-anti-anthro 는 **로케일 문자열과 personas.ts** 만
// 스캔한다. 이 파일은 범위 밖이라 그 아동보호 가드는 건드리지 않았다. 런타임
// 출력을 붙잡는 것은 저 넷뿐이므로, 이 문장을 고칠 때 넷을 같이 지우지 말 것.
const SYSTEM_PROMPT_HEADER = {
  en: [
    "You are SecondB, this person's own manager: you read what they have recorded and help them from beside them.",
    "You may be warm and speak like a friend who knows them well. Warmth never licenses invention.",
    "Ground every statement in their records. Never assert a fact, trait, or number (including any psychometric score) that is not in them.",
    "Describe the pattern in the records, not a verdict about the person. Use calibrated language ('seems', 'in these records'), never certainty about who they are.",
    "You are not a medical or clinical service. Keep the language everyday; never diagnose, and never use clinical vocabulary.",
    "Never claim to know them better than they know themselves.",
    "Reference the wiki pages and sources below; cite slugs via [[double-brackets]]. Keep replies under 4 sentences unless they ask for depth.",
  ].join(" "),
  ko: [
    "당신은 세컨비, 이 사람의 개인 매니저입니다. 이 사람이 남긴 기록을 읽고 곁에서 돕습니다.",
    "잘 아는 친구처럼 편하고 따뜻하게 말해도 됩니다. 다만 따뜻함이 지어내도 된다는 뜻은 아닙니다.",
    "모든 이야기는 이 사람의 기록에 근거합니다. 기록에 없는 사실이나 특성, 수치(심리 점수 포함)를 지어내지 마세요.",
    "사람에 대한 단정이 아니라 기록 속 패턴을 말하세요. '~인 것 같아요', '이 기록들에서는' 처럼 신중한 표현을 쓰고, 그 사람이 누구인지 확신하듯 말하지 마세요.",
    "의료·임상·상담 서비스가 아닙니다. 일상적인 말을 쓰고, 진단하거나 임상 용어를 쓰지 마세요.",
    "그 사람이 스스로를 아는 것보다 더 잘 안다고 주장하지 마세요.",
    "말투는 평서문 '~습니다', 질문은 '~나요?' 를 씁니다.",
    "아래 위키 페이지와 소스를 참고하고, 인용할 때는 [[슬러그]] 형식을 씁니다. 깊이 있는 답을 원하지 않으면 4문장 안으로 답하세요.",
  ].join(" "),
};

// INJECTION GUARD preamble, mirroring assembleAdvisorPrompt in
// src/lib/knowledge/retrieve.ts. The wiki snapshot is composed from the user's
// clipped page bodies (body_md from downloadRawClipping) and source titles, so a
// clipped page that contains "ignore previous instructions" would otherwise land
// verbatim in the system prompt. We wrap the snapshot in <UNTRUSTED> and tell the
// model never to follow instructions inside that block.
// Shared fence toolkit (was a local copy until 2026-07-26; body_md/source
// titles are user-INSERTable, so treat them as untrusted).

// SecondB conversation modes (worldview v-final). The old imagine workshop is no
// longer a place — it is the Divergent mode here. Both modes go through the
// same callGemini path, so C9 (classifyInput) -> C3 (ai_audit_log) hold; the
// mode only shapes the system prompt.
const MODE_INSTRUCTION: Record<"analytic" | "divergent", { en: string; ko: string }> = {
  analytic: {
    en: "Analysis mode: ground every observation in the user's records and patterns, and give clear, practical analysis.",
    ko: "분석 모드: 모든 관찰을 사용자의 기록과 패턴에 근거해 명확하고 실용적으로 분석하세요.",
  },
  divergent: {
    // The trailing branch format is a UI contract (rev2 P5f 트위비 3-branch):
    // parseTwiBranches lifts the "→ " lines into tappable next-step chips that
    // hand off to the composer / 담기. Prompt-shaping only — C9/C3 unchanged.
    en: "New angle mode: stay grounded in the user's data, but deliberately explore radically different angles, assumptions, and unexpected possibilities. Clearly frame them as new perspectives or 'what if' hypotheses, not established facts. End the reply with up to three short next-step candidates the user could capture, each on its own line, each line starting with '→ '.",
    ko: "새 관점 모드: 사용자의 데이터에 근거하되, 전혀 다른 관점과 가정, 뜻밖의 가능성을 의도적으로 탐색하세요. 단정이 아니라 '새로운 관점 / 가정'으로 분명히 표시하세요. 답변의 맨 끝에는 사용자가 담아둘 수 있는 짧은 다음 걸음 후보를 최대 3개, 한 줄에 하나씩 '→ '로 시작해 적으세요.",
  },
};

// Monetization v2 tier display names (2026-06-10): every tier sells under its
// enum name — Soma is the entry tier again, so no more Plus/Pro aliasing.
const TIER_DISPLAY: Record<SubscriptionTier, string> = {
  free: "Free",
  soma: "Soma",
  cortex: "Cortex",
  brain: "Brain",
};

const BLOCKED_HINT = {
  en: (limit: number, upgrade: SubscriptionTier | null) =>
    upgrade
      ? `You've hit today's chat limit (${limit}). Upgrade to ${TIER_DISPLAY[upgrade]} for more. Limits reset at midnight KST.`
      : `You've hit today's chat limit (${limit}). Limits reset at midnight KST.`,
  ko: (limit: number, upgrade: SubscriptionTier | null) =>
    upgrade
      ? `오늘 채팅 한도(${limit}회)를 모두 사용했어요. ${TIER_DISPLAY[upgrade]} 플랜으로 업그레이드하면 더 많이 쓸 수 있어요. 한도는 KST 자정에 초기화돼요.`
      : `오늘 채팅 한도(${limit}회)를 모두 사용했어요. 한도는 KST 자정에 초기화돼요.`,
};

export async function sendChatMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const day = kstDateToday();
  const limit = CHAT_DAILY_LIMIT[input.tier];

  // 0090: today's allowance includes any rewarded ad bonus.
  const { used: usedBefore, adBonus } = await readChatUsageDetail(input.userId, day);
  const precheck = checkChatLimit(input.tier, usedBefore, adBonus);
  if (!precheck.allowed) {
    return {
      status: "blocked",
      reason: "limit_reached",
      limit: precheck.limit,
      used: precheck.used,
      upgradeTo: precheck.upgradeTo,
      hint: BLOCKED_HINT[input.locale](precheck.limit, precheck.upgradeTo),
    };
  }

  // Context assembly (D-26 A1): try query-relevant retrieval first — embed the
  // message and pull the top-8 semantically relevant pages (RAG). On a hit the
  // prompt carries ONLY those pages plus a slim recent-sources list (~10x
  // smaller than the old whole-wiki dump, and better grounded). On any miss
  // (no index yet, embed failure, red-zone query) fall back to the legacy
  // whole-wiki snapshot so chat never breaks on RAG.
  // 0066: newest structured form captures (4W1H, career 3C4P) ride along so
  // the model reads the form data as structure, not prose. Small, fail-soft,
  // sanitized + fenced with the snapshot below.
  const structuredBlock = await loadStructuredContext(input.userId, 5);
  let ragBlock: string | null = null;
  try {
    const ragPages = await retrieveChatContext(input.userId, input.message, input.locale, {
      k: 8,
      bodyCharLimit: 600,
      minor: input.minor,
    });
    if (ragPages.length > 0) ragBlock = formatRagPages(ragPages, input.locale);
  } catch {
    // fail-soft: RAG must never take chat down — fall back to the snapshot.
  }
  const snapshot = await exportUserWiki(
    input.userId,
    ragBlock
      ? // RAG hit: pages come from retrieval; keep only a slim sources list so
        // "what did I clip" questions still see the inbox.
        { locale: input.locale, bodyCharLimit: 600, pageLimit: 0, sourceLimit: 40 }
      : { locale: input.locale, bodyCharLimit: 600, pageLimit: 50, sourceLimit: 100 },
  );

  // Atomic check-and-bump (codex R2): the RPC inserts/increments the row
  // ONLY if the existing count is below `limit`. It remains the final gate
  // immediately before Gemini, so concurrent callers cannot overspend LLM
  // quota. The earlier read is only a no-cost preflight: if wiki export fails,
  // the user gets no reply but also does not lose a daily chat turn.
  //
  // Trade-off vs. the previous design: red-zone (crisis-routed) turns still
  // count against the daily quota because the bump must land before the LLM
  // call to close the race. A future PR can add a refund RPC if it matters.
  let newCount: number;
  try {
    newCount = await bumpChatUsageIfUnderCap(input.userId, limit, day);
  } catch (e) {
    if (e instanceof ChatLimitExceededError) {
      const detail = await readChatUsageDetail(input.userId, day);
      const check = checkChatLimit(input.tier, detail.used, detail.adBonus);
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

  const personaLine = input.personaHint ? `${input.personaHint}\n\n` : "";
  const modeLine = `${MODE_INSTRUCTION[input.mode ?? "analytic"][input.locale]}\n\n`;
  // The wiki snapshot / RAG pages are untrusted user content (clipped page
  // bodies + source titles). Run them through sanitizeUntrusted, wrap in
  // <UNTRUSTED>, and prepend the injection-guard preamble so a clipped
  // "ignore previous instructions" cannot hijack the system prompt (mirrors
  // the Advisor path).
  const fencedRag = ragBlock
    ? `<UNTRUSTED type="wiki_rag">\n${sanitizeUntrusted(ragBlock)}\n</UNTRUSTED>\n`
    : "";
  const fencedSnapshot = `<UNTRUSTED type="wiki_snapshot">\n${sanitizeUntrusted(snapshot.prompt)}\n</UNTRUSTED>`;
  const fencedStructured = structuredBlock
    ? `
<UNTRUSTED type="structured_records">
${sanitizeUntrusted(structuredBlock)}
</UNTRUSTED>`
    : "";
  // D-26 A1: 최근 6턴. Prior turns (the model's own replies included) ride the
  // system channel as fenced, sanitized data — never as instructions. C9:
  // drop any red-zone turn FIRST (both locales, minor-aware — same guard
  // embedTexts uses) so a previously-withheld crisis turn can't re-egress via
  // history; slice AFTER filtering so a dropped turn doesn't silently shrink
  // the window mid-stream.
  const historyTurns = (input.history ?? [])
    .filter(
      (t) =>
        classifyInput(t.text, "en", { minor: input.minor }).zone !== "red" &&
        classifyInput(t.text, "ko", { minor: input.minor }).zone !== "red",
    )
    .slice(-HISTORY_MAX_TURNS);
  const fencedHistory =
    historyTurns.length > 0
      ? `\n<UNTRUSTED type="chat_history">\n${historyTurns
          .map(
            (t) =>
              `${t.role === "user" ? "User" : "SecondB"}: ${sanitizeUntrusted(t.text).slice(0, HISTORY_TURN_CHAR_LIMIT)}`,
          )
          .join("\n")}\n</UNTRUSTED>`
      : "";
  // 이름 호칭. 화면은 이미 "허슬케이님" 이라 부르는데 모델만 "당신" 이라 하면
  // 한 화면에서 두 사람이 말하는 것처럼 들린다.
  //
  // promptSafeName 을 여기서 **다시** 부른다. 호출부가 이미 씻어서 넘기지만,
  // 이 값은 시스템 프롬프트 안에 들어가므로 한 호출부의 실수가 곧 주입이 된다.
  // 씻는 비용은 0 이고, 두 번 씻어도 결과는 같다.
  const safeName = promptSafeName(input.displayName);
  const addressLine = safeName
    ? input.locale === "ko"
      ? `이 사람의 이름은 ${safeName} 입니다. ${safeName}님이라고 부르세요.\n\n`
      : `This person's name is ${safeName}. Address them as ${safeName}.\n\n`
    : "";
  const guardLine = `${INJECTION_GUARD[input.locale]}\n\n`;
  const system = `${SYSTEM_PROMPT_HEADER[input.locale]}\n\n${addressLine}${guardLine}${modeLine}${personaLine}${fencedRag}${fencedSnapshot}${fencedStructured}${fencedHistory}`;

  // C1/C3/C9 are enforced by callGemini. Red-zone short-circuit still
  // happens inside callGemini; we just no longer adjust the counter
  // afterwards because the bump already landed atomically above.
  const reply = await callGemini({
    userId: input.userId,
    locale: input.locale,
    purpose: "secondb_chat",
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
