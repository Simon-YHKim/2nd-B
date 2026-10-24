// Jarvis chat orchestrator.
//
//   1. Read today's chat_usage row for the user.
//   2. Check the daily limit (CHAT_DAILY_LIMIT in limits.ts; free 5 by default).
//   3. If allowed, build a system prompt with a compact wiki snapshot,
//      call callLlm (which enforces C1/C3/C9 automatically), and
//      atomically bump today's chat_usage.
//   4. If blocked, return a localized limit notice without calling the model.
//
// The wiki snapshot is the export prompt with body_md truncated so the
// chat fits in Gemini Flash's context window. Phase 1/2 wiki pages will
// populate the snapshot naturally; until then the snapshot is mostly the
// raw `sources` list, which already steers the model toward the user's
// inbox.

import { callLlm, classifyChatTextForCrisis } from "@/lib/llm/boundary";
import { tLocale } from "@/lib/i18n/text";
import { INJECTION_GUARD, sanitizeUntrusted } from "@/lib/llm/untrusted";
import { classifyInput, crisisHotlines } from "@/lib/safety/classifier";
import { promptSafeName } from "@/lib/persona/address";
import type { CrisisObserver, LlmResult } from "@/lib/llm/types";
import type { SubscriptionTier } from "@/lib/progression/entitlements";

import { CHAT_DAILY_LIMIT, checkChatLimit, kstDateToday } from "./limits";
import { loadStructuredContext } from "../records/load-structured";
import { loadProfileContext } from "../persona/profile-context";
import { exportUserWiki } from "../wiki/export";
import { formatRagPages, retrieveChatContext } from "./rag";
import { ChatLimitExceededError, bumpChatUsageIfUnderCap, readChatUsageDetail, type CapturedChatUsageExecution } from "./usage";
import { abortError, isAbortError, throwIfAborted } from "../async/abort";
import type { AuthenticatedAccountSessionLease } from "../auth/account-session-lease";
import { captureLiveOwnerCheck, withLiveOwnerSignal } from "../auth/live-owner-guard";

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
   * Optional persona voice instruction (rev2PersonaHint: 메타비 / 트위비; 세컨비는 null).
   * The legacy per-character roster (personas.ts, ?character=) that also fed this
   * left for E:/Legacy/2ndB on 2026-10-05 (Simon decision Q-261004-14 A).
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
  // C10 safety: minor flag forwarded to callLlm for youth crisis routing.
  minor?: boolean;
  /**
   * Prior turns of THIS conversation, oldest first (D-26 A1: 최근 6턴).
   * Component-local state in v1 — the screen passes its own turn list; only
   * the last HISTORY_MAX_TURNS are used, each clipped. History rides the
   * system channel fenced as untrusted. C9: each turn is re-classified here
   * and any red-zone turn is DROPPED before it reaches the prompt — a prior
   * crisis turn was withheld from the model when it was sent, and replaying
   * it through the system channel (which callLlm does NOT crisis-scan)
   * would silently re-egress it. Filtering at the engine, not trusting the
   * screen to pre-strip.
   */
  history?: ChatHistoryTurn[];
  /** Inactive captured path: all four fields are required together at runtime. */
  session?: AuthenticatedAccountSessionLease;
  signal?: AbortSignal;
  onCrisisDetected?: CrisisObserver;
  mutationObserver?: CapturedChatUsageExecution["observer"];
}

export interface SendMessageBlocked {
  status: "blocked";
  reason: "limit_reached";
  /** Null when the server rejects below the local cap without reporting its cap. */
  limit: number | null;
  used: number;
  upgradeTo: SubscriptionTier | null;
  /** Localized hint string ready for direct display. */
  hint: string;
}

export interface SendMessageOk {
  status: "ok";
  reply: LlmResult<string>;
  used: number | null; // Device-red guidance reads no quota; null is unknown.
  limit: number | null;
  remaining: number | null;
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
// check-mascot-voice / check-anti-anthro 는 **로케일 문자열** 만(personas.ts 는 10-05 퇴장)
// 스캔한다. 이 파일은 범위 밖이라 그 아동보호 가드는 건드리지 않았다. 런타임
// 출력을 붙잡는 것은 저 넷뿐이므로, 이 문장을 고칠 때 넷을 같이 지우지 말 것.
const SYSTEM_PROMPT_HEADER = {
  en: [
    "You are HustleK, this person's own manager and a pacemaker who walks alongside them: you read what they have recorded and help them from beside them.",
    "You may be warm and speak like a friend who knows them well. Warmth never licenses invention.",
    "Ground every statement in their records. Never assert a fact, trait, or number (including any psychometric score) that is not in them.",
    "Describe the pattern in the records, not a verdict about the person. Use calibrated language ('seems', 'in these records'), never certainty about who they are.",
    "You are not a medical or clinical service. Keep the language everyday; never diagnose, and never use clinical vocabulary.",
    "Never claim to know them better than they know themselves.",
    "Let the user choose what to share. Do not ask for secrets or press them to explain something they have declined to discuss.",
    "Answer the question directly in plain, conversational language. Avoid canned praise or empathy, promotional language, elaborate metaphors, and unnecessary summaries. Do not force a three-item list or end every reply with a question. Listen to what they have shared first; when empathy is needed, name the situation they actually described and offer honest, warm comfort and support. Do not put each sentence on its own line. Use a line break only between paragraphs, or to write list items or steps one per line.",
    "Distinguish saved records from what the person said in this conversation and from your own inference. Asking for help is not evidence of a positive trait, motivation, or willingness to change.",
    "When drafting a reply or suggesting a plan, do not invent a deadline, promise, or commitment for the person. Leave those choices to them.",
    "Reference the wiki pages and sources below; cite slugs via [[double-brackets]]. Keep replies under 4 sentences unless they ask for depth.",
  ].join(" "),
  ko: [
    "당신은 허슬케이, 이 사람의 개인 매니저이자 곁에서 함께 걷는 페이스메이커입니다. 이 사람이 남긴 기록을 읽고 곁에서 돕습니다.",
    "잘 아는 친구처럼 편하고 따뜻하게 말해도 됩니다. 다만 따뜻함이 지어내도 된다는 뜻은 아닙니다.",
    "모든 이야기는 이 사람의 기록에 근거합니다. 기록에 없는 사실이나 특성, 수치(심리 점수 포함)를 지어내지 마세요.",
    "사람에 대한 단정이 아니라 기록 속 패턴을 말하세요. '~로 보여', '이 기록들에서는' 처럼 신중한 표현을 쓰고, 그 사람이 누구인지 확신하듯 말하지 마세요.",
    "의료·임상·상담 서비스가 아닙니다. 일상적인 말을 쓰고, 진단하거나 임상 용어를 쓰지 마세요.",
    "그 사람이 스스로를 아는 것보다 더 잘 안다고 주장하지 마세요.",
    "무엇을 이야기할지는 사용자가 정합니다. 비밀을 말해 달라고 하거나, 말하지 않겠다는 내용을 거듭 캐묻지 마세요.",
    // 대화 답의 말투는 편한 반말 + 「브로」다(Simon 결정 2026-10-18 Q-261018-55 다). 10-02 B안
    // (사실 ~습니다 · 질문 ~나요?)은 화면 문구에 그대로 남고 대화 답에서만 뒤집었다. 페르소나
    // 지시문(rev2.meta/twi.systemHint)도 같은 말투로 맞췄다. 위기 고정 안내는 모델이 쓰지 않으므로
    // 이 줄과 무관하다. identity-prompt.test.ts 가 이 줄을 지킨다.
    "말투는 편한 반말을 씁니다. 인사나 할 일 정리처럼 가볍고 편한 대화에서는 '오우, 브로'·'좋아, 브로' 같은 호칭을 가끔 섞되, 매번 붙이지는 마세요. 사용자가 존댓말이나 다른 호칭을 원하거나 호칭을 싫어하면 바로 따르세요. 사용자가 많이 힘들거나 아프거나 위험한 이야기를 하면 농담과 호칭을 빼고 차분하게 말하세요.",
    "짧고 쉬운 일상어로 편안하게, 질문에 바로 답하세요. '당신'이라는 호칭은 번역투로 들리니 쓰지 마세요.",
    "'좋은 질문이에요', '소중한 이야기를 나눠주셔서 감사해요' 같은 상투적인 칭찬·공감, 과장, 추상적인 비유를 쓰지 마세요. 사용자가 털어놓은 이야기에 먼저 귀 기울이고, 공감이 필요하면 사용자가 실제로 말한 상황을 짚어 솔직하고 따뜻하게 위로와 지지를 전하세요.",
    "항상 세 가지 목록으로 정리하거나, 끝에 요약·다음 질문을 붙이지 마세요. 답에 필요한 경우에만 쓰세요. 문장마다 줄을 바꾸지 마세요. 줄바꿈은 문단을 나누거나, 목록·단계를 한 줄에 하나씩 적을 때만 씁니다.",
    "저장된 기록, 이번 대화에서 사용자가 말한 내용, 추측을 구분하세요. 도움을 요청했다는 사실만으로 성격·태도·변화 의지를 좋게 해석하지 마세요.",
    "답장 예시나 계획에 사용자가 정하지 않은 마감·약속·의무를 넣지 마세요. 언제 무엇을 할지는 사용자가 정합니다.",
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
// same callLlm path, so C9 (classifyInput) -> C3 (ai_audit_log) hold; the
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
    ko: "새 관점 모드: 사용자의 데이터에 근거하되, 전혀 다른 관점과 가정, 뜻밖의 가능성을 의도적으로 탐색하세요. 단정하지 말고, 확인된 사실이 아니라 하나의 관점이나 가정이라는 점이 문장 안에서 드러나게 쓰세요. 답변의 맨 끝에는 사용자가 기록할 수 있는 짧은 다음 걸음 후보를 최대 3개, 한 줄에 하나씩 '→ '로 시작해 적으세요.",
  },
};

// The limit bubble used to end with an upgrade pitch that named the next tier through a
// TIER_DISPLAY map ("Soma" / "Cortex" / "Brain"). Simon 2026-10-14 (Q-261014-24): keep only
// the limit sentence and the 요금제 보기 link under it. Those names were legacy anyway
// (people see 별바라기 · 항해자 · 북극성), so the map went with the pitch.
//
// docs/legal cites the actual export options, untrusted snapshot and system assembly below.
// Update those source anchors together when the call sites move.
// The next tier still travels in SendMessageResult.upgradeTo for the ai_limit_hit event
// (Q-261014-26); no sentence names it.

const BLOCKED_HINT = {
  en: (limit: number) =>
    `You've hit today's chat limit (${limit}). Limits reset at midnight KST.`,
  ko: (limit: number) =>
    `오늘 채팅 한도(${limit}회)를 모두 사용했어요. 한도는 KST 자정에 초기화돼요.`,
  // Called as BLOCKED_HINT[locale](limit) at both blocked returns of sendChatMessage below:
  // the pre-check on today's row, and a concurrent send that reached the known cap.
  // Neither passes the tier any more.
};

export interface ChatContext {
  structuredBlock: Awaited<ReturnType<typeof loadStructuredContext>>;
  profileLines: Awaited<ReturnType<typeof loadProfileContext>>;
  ragBlock: string | null;
  snapshot: Awaited<ReturnType<typeof exportUserWiki>>;
}

/** Reads context after the caller has passed its crisis and usage gates. */
export async function loadChatContext(
  input: SendMessageInput,
  execution: CapturedChatUsageExecution | null,
): Promise<ChatContext> {
  const stage = executionStage(execution, input.userId);
  // Context assembly (D-26 A1): try query-relevant retrieval first — embed the
  // message and pull the top-8 semantically relevant pages (RAG). On a hit the
  // prompt carries ONLY those pages plus a slim recent-sources list (~10x smaller
  // than the old whole-wiki dump, and better grounded). On any miss (no index
  // yet, embed failure) fall back to the legacy whole-wiki snapshot.
  // 0066: newest structured form captures (4W1H, career 3C4P) ride along so
  // the model reads the form data as structure, not prose. Small, fail-soft,
  // sanitized + fenced with the snapshot below.
  const structuredBlock = await stage(signal => execution ? loadStructuredContext(input.userId, 5, execution.session) : loadStructuredContext(input.userId, 5, undefined, signal));
  // Q-261007-05 (Simon 2026-10-07): 사용자가 채운 프로필 칸(대화명 제외) + 만 나이. Fail-soft.
  const profileLines = await stage(signal => execution ? loadProfileContext(input.userId, undefined, execution.session) : loadProfileContext(input.userId, undefined, undefined, signal));
  let ragBlock: string | null = null;
  try {
    const ragPages = await stage(() => retrieveChatContext(input.userId, input.message, input.locale, {
      k: 8,
      bodyCharLimit: 600,
      minor: input.minor,
      ...(execution ? { session: execution.session, signal: execution.session.signal } : {}),
    }));
    if (ragPages.length > 0) ragBlock = formatRagPages(ragPages, input.locale);
  } catch (error) {
    stage.assertCurrent();
    if (execution && isAbortError(error)) throw error;
    // fail-soft: RAG must never take chat down — fall back to the snapshot.
  }
  const snapshot = await stage(() => exportUserWiki(
    input.userId,
    ragBlock
      ? // RAG hit: pages come from retrieval; keep only a slim sources list so
        // "what did I clip" questions still see the inbox.
        { forAi: true, locale: input.locale, bodyCharLimit: 600, pageLimit: 0, sourceLimit: 40, includeSavedConversations: true }
      : { forAi: true, locale: input.locale, bodyCharLimit: 600, pageLimit: 50, sourceLimit: 100, includeSavedConversations: true },
    execution?.session, execution ? undefined : stage.assertCurrent,
  ));
  return { structuredBlock, profileLines, ragBlock, snapshot };
}

/** Pure assembly of the existing chat instructions and fenced context. */
export function assembleChatSystemPrompt(input: SendMessageInput, context: ChatContext): string {
  const { structuredBlock, profileLines, ragBlock, snapshot } = context;
  const personaLine = input.personaHint ? `${input.personaHint}\n\n` : "";
  const modeLine = `${MODE_INSTRUCTION[input.mode ?? "analytic"][input.locale]}\n\n`;
  // The wiki snapshot / RAG pages are untrusted user content (clipped page
  // bodies + source titles). Run them through sanitizeUntrusted, wrap in
  // <UNTRUSTED>, and prepend the injection-guard preamble so a clipped
  // "ignore previous instructions" cannot hijack the system prompt (mirrors
  // the Advisor path).
  // 프로필에는 자유 입력(좌우명 등)이 섞여 있어 위키와 같은 방식으로 씻어서 감싼다.
  const fencedProfile = profileLines.length > 0
    ? `<UNTRUSTED type="profile">\n${sanitizeUntrusted(profileLines.join("\n"))}\n</UNTRUSTED>\n`
    : "";
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
              `${t.role === "user" ? "User" : "HustleK"}: ${sanitizeUntrusted(t.text).slice(0, HISTORY_TURN_CHAR_LIMIT)}`,
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
  const addressLine = (safeName
    ? input.locale === "ko"
      ? `이 사람의 이름은 ${safeName} 입니다. 사용자가 다른 호칭이나 존댓말을 원하지 않으면 이름이나 '브로'로 부르고 '님'은 붙이지 마세요. 사용자의 요청과 힘든 순간에 호칭을 빼는 규칙이 이 줄보다 먼저입니다.\n\n`
      : `This person's name is ${safeName}. Address them as ${safeName}.\n\n`
    : "") + chatTurnToneLine(input);
  const guardLine = `${INJECTION_GUARD[input.locale]}\n\n`;
  const system = `${SYSTEM_PROMPT_HEADER[input.locale]}\n\n${crisisNumberRule(input.locale, input.minor)}\n\n${addressLine}${guardLine}${modeLine}${personaLine}${fencedProfile}${fencedRag}${fencedSnapshot}${fencedStructured}${fencedHistory}`;
  return system;
}

export async function sendChatMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const execution = capturedConversation(input);
  const stage = executionStage(execution, input.userId);
  const cut = await stage(() => answerDeviceRed(input, execution));
  if (cut) return cut;
  const day = kstDateToday();
  const limit = CHAT_DAILY_LIMIT[input.tier];

  // 0090: today's allowance includes any rewarded ad bonus.
  const readUsage = (signal?: AbortSignal) => execution ? readChatUsageDetail(input.userId, day, execution.session) : readChatUsageDetail(input.userId, day, undefined, signal);
  const { used: usedBefore, adBonus } = await stage(readUsage);
  const precheck = checkChatLimit(input.tier, usedBefore, adBonus);
  if (!precheck.allowed) {
    return {
      status: "blocked",
      reason: "limit_reached",
      limit: precheck.limit,
      used: precheck.used,
      upgradeTo: precheck.upgradeTo,
      hint: BLOCKED_HINT[input.locale](precheck.limit),
    };
  }
  const context = await stage(() => loadChatContext(input, execution));

  // Atomic check-and-bump (codex R2): the RPC inserts/increments the row
  // ONLY if the existing count is below `limit`. It remains the final gate
  // immediately before Gemini, so concurrent callers cannot overspend LLM
  // quota. The earlier read is only a no-cost preflight: if wiki export fails,
  // the user gets no reply but also does not lose a daily chat turn.
  //
  // A device-red turn never gets here: it was answered above, uncounted
  // (Q-261014-30; this replaces the old "red turns still count" trade-off).
  // A turn cut later (server gate, meaning check, output swap) is still counted.
  let newCount: number;
  try {
    newCount = await stage(signal => bumpChatUsageIfUnderCap(input.userId, limit, day, execution ?? undefined, signal));
  } catch (e) {
    execution?.session.assertCurrent();
    if (e instanceof ChatLimitExceededError) {
      const detail = await stage(readUsage);
      const check = checkChatLimit(input.tier, detail.used, detail.adBonus);
      // FORCE_TIER and a stale client tier do not change the server's cap.
      // Its rejection carries no cap value: when our local check still allows
      // sending, do not label that rejection as exhaustion of the local cap.
      return {
        status: "blocked",
        reason: "limit_reached",
        limit: check.allowed ? null : check.limit,
        used: check.used,
        upgradeTo: check.upgradeTo,
        hint: check.allowed
          ? tLocale(input.locale, "secondb", "serverLimitReached")
          : BLOCKED_HINT[input.locale](check.limit),
      };
    }
    throw e;
  }

  const system = assembleChatSystemPrompt(input, context);

  // C1/C3/C9 are enforced by callLlm, whose own red-zone short-circuit still
  // runs for every turn that gets here. Device-red input was already routed
  // above by the same boundary module, before any context read or bump.
  const reply = await stage(() => callLlm({
    userId: input.userId,
    locale: input.locale,
    purpose: "secondb_chat",
    system,
    user: input.message,
    minor: input.minor,
    ...(execution ? { session: execution.session, signal: execution.session.signal, onCrisisDetected: execution.onCrisisDetected } : {}),
  }));

  return {
    status: "ok",
    reply,
    used: newCount,
    limit,
    // `limit` is the tier cap WITHOUT today's rewarded-ad bonus: checkChatLimit
    // returns cap and allowance as separate fields on purpose (limits.ts), and
    // the server RPC gates on `count < cap + ad_bonus`. Recomputing remaining
    // from `limit` therefore understates it by exactly the bonus the user just
    // earned by watching an ad. Ask the one function that knows the allowance.
    remaining: checkChatLimit(input.tier, newCount, adBonus).remaining,
  };
}

// 모델이 직접 쓰는 답에도 번호 원칙을 지키게 한다 (Simon 결정 2026-10-11, Q-261011-11).
// 원칙은 2026-08-16 의 3레인이다: 스스로를 해치려는 이야기는 상담 전화, 그 이야기만으로는 112 를 붙이지 않고
// (타인의 위협이 함께 있으면 그 레인의 112 는 막지 않는다 - 독립 검토 NR-01),
// 119 는 몸이 지금 위급할 때만, 애매하면 상담 전화. 번호는 화면의 고정 안내와 같은 표
// (crisisHotlines)에서 가져온다 - 여기에 숫자를 따로 적으면 두 곳이 갈라진다.
// 입력 검사가 잡은 말은 여기까지 오지 않는다(고정 안내가 나간다). 이 줄은 검사를 지나
// 모델까지 온 말에 모델이 119 · 112 를 권하던 것을 바로잡는다.
// 파일 아래쪽에 둔다: 위쪽 줄 번호를 법무 문서(DPIA)가 인용하고 있어, 위에 끼우면 인용이 밀린다.
function crisisNumberRule(locale: "en" | "ko", minor: boolean | undefined): string {
  const numbers = crisisHotlines(locale, minor === true).map((line) => line.number);
  if (locale === "ko") {
    const lines = numbers.join(" 또는 ");
    return `스스로 삶을 끝내거나 자신을 해치려는 이야기가 나오면 ${lines}로 전화하도록 안내하세요. 그 이야기만을 이유로 112를 붙이지 마세요. 119는 이미 다쳤거나 약을 삼킨 것처럼 몸이 지금 위급할 때만 안내합니다. 어느 쪽인지 분명하지 않으면 ${lines}로 안내하세요. 확실하지 않은 전화번호는 지어내지 마세요.`;
  }
  const lines = numbers.join(" or ");
  return `If the person talks about ending their life or hurting themselves, point them to ${lines}. Do not add a police number for that reason alone. Point to the local emergency number only when their body is in danger right now, such as an injury or something already swallowed. If you cannot tell which it is, stay with ${lines}. Never make up a phone number.`;
}

// Q-261014-30 / Q-261015-82: one device-red verdict, one routing call, before
// any quota read, limit refusal or context read, without a bump.
// Quota is unknown here; callers retain their last verified usage display.
type CapturedConversationExecution = CapturedChatUsageExecution & { readonly onCrisisDetected: CrisisObserver };

async function answerDeviceRed(input: SendMessageInput, execution: CapturedConversationExecution | null): Promise<SendMessageOk | null> {
  const reply = await classifyChatTextForCrisis(input.message, input.locale, input.userId, input.minor,
    ...(execution ? [{ session: execution.session, signal: execution.session.signal, onCrisisDetected: execution.onCrisisDetected }] as const : []));
  if (!reply) return null;
  if (execution && (reply.safety.zone !== "red" || reply.audit.modelUsed !== "none-crisis-routed")) throw new Error("chat_local_red_result_invalid");
  return { status: "ok", reply, used: null, limit: null, remaining: null };
}

/** Strict C3 local-RED port. A missing/inconsistent local result cannot become an ordinary send. */
export async function auditChatLocalRed(input: SendMessageInput): Promise<SendMessageOk> {
  const execution = capturedConversation(input);
  if (!execution) throw new Error("chat_captured_execution_required");
  const result = await executionStage(execution)(() => answerDeviceRed(input, execution));
  if (!result) throw new Error("chat_local_red_result_missing");
  return result;
}

function capturedConversation(input: SendMessageInput): CapturedConversationExecution | null {
  const raw = input.session, source = input.mutationObserver, signal = input.signal, onCrisisDetected = input.onCrisisDetected;
  if (raw === undefined && source === undefined && signal === undefined && onCrisisDetected === undefined) return null;
  if (!raw || !source || !signal || typeof onCrisisDetected !== "function") throw new Error("chat_captured_execution_required");
  const { userId, epoch, assertCurrent, abort, release } = raw;
  const { owner: sourceOwner, ledger: sourceLedger, generation, operationId, stepId } = source;
  // Match the ledger's identifier contract before even read-only context can egress.
  const validId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9:_-]{1,160}$/.test(value);
  if (!sourceOwner || !sourceLedger || !validId(operationId) || !validId(stepId) ||
      typeof sourceOwner.isCurrent !== "function" || typeof sourceLedger.read !== "function" ||
      typeof sourceLedger.acquireMutation !== "function" || typeof sourceLedger.issueMutation !== "function" ||
      typeof sourceLedger.settleMutation !== "function" || typeof assertCurrent !== "function" ||
      typeof abort !== "function" || typeof release !== "function") throw new Error("chat_captured_observer_invalid");
  const owner = Object.freeze({ ownerId: sourceOwner.ownerId, epoch: sourceOwner.epoch, isCurrent: sourceOwner.isCurrent.bind(sourceOwner) });
  const ledger = Object.freeze({ read: sourceLedger.read.bind(sourceLedger), acquireMutation: sourceLedger.acquireMutation.bind(sourceLedger),
    issueMutation: sourceLedger.issueMutation.bind(sourceLedger), settleMutation: sourceLedger.settleMutation.bind(sourceLedger) });
  const observer = Object.freeze({ owner, ledger, generation, operationId, stepId });
  if (!input.userId || input.userId !== userId || owner.ownerId !== userId || owner.epoch !== epoch) throw new Error("chat_session_owner_mismatch");
  if (signal !== raw.signal) throw new Error("chat_session_signal_mismatch");
  const assertSession = assertCurrent.bind(raw), abortSession = abort.bind(raw), releaseSession = release.bind(raw);
  const fence = () => {
    throwIfAborted(signal); assertSession();
    if (!owner.isCurrent()) throw abortError();
    const content = ledger.read(owner);
    if (!Number.isSafeInteger(generation) || generation < 0 || content.generation !== generation || content.phase !== "open") throw abortError();
  };
  fence();
  const accessToken = raw.accessToken;
  fence();
  // Snapshot authority before the first await. Callers may later mutate their input,
  // observer or methods; that cannot replace the original ledger or crisis observer.
  // One original lease/token/signal; no authentication, release or subscription here.
  const session: AuthenticatedAccountSessionLease = Object.freeze({
    userId, epoch, signal,
    get accessToken() { fence(); return accessToken; },
    assertCurrent: fence, abort: abortSession, release: releaseSession,
  });
  return Object.freeze({ session, observer, onCrisisDetected });
}

function executionStage(execution: CapturedChatUsageExecution | null, ownerId?: string) {
  const assertCurrent = execution ? () => execution.session.assertCurrent() : captureLiveOwnerCheck(ownerId ?? "");
  return Object.assign(async <T,>(operation: (signal?: AbortSignal) => Promise<T>): Promise<T> => {
    assertCurrent();
    let result: T;
    try { result = execution ? await operation() : await withLiveOwnerSignal(assertCurrent, undefined, operation); }
    catch (error) { assertCurrent(); throw error; }
    assertCurrent();
    return result;
  }, { assertCurrent });
}

// 이번 턴에만 붙는 말투 보정(Q-261018-55 다 · 리뷰 #2632 r1). 항상 켜진 말투 줄(SYSTEM_PROMPT_HEADER)은
// 이번 입력이 노랑(임상 어휘가 섞인 무거운 이야기)인지, 바로 앞 답에 이미 「브로」가 있었는지 모른다.
// 그 둘은 여기서 정해 이번 답에만 알린다. 한국어 대화 답에만 해당한다(반말 · 「브로」는 한국어 말투다).
function chatTurnToneLine(input: SendMessageInput): string {
  if (input.locale !== "ko") return "";
  const yellow = (["ko", "en"] as const).some((l) => classifyInput(input.message, l, { minor: input.minor }).zone === "yellow");
  if (yellow) return "이번 답에는 농담을 하지 말고, 이름과 '브로'를 포함한 어떤 호칭도 붙이지 말고 차분하게 말하세요.\n\n";
  const lastReply = [...(input.history ?? [])].reverse().find((turn) => turn.role === "assistant");
  if (lastReply?.text.includes("브로")) return "바로 앞 답에 이미 '브로'를 썼습니다. 이번 답에는 '브로'를 쓰지 마세요.\n\n";
  return "";
}
