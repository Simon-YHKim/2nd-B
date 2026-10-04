// 인터뷰가 끝나는 길 (Simon 결정 2026-10-05: Q-261004-24 + 12턴 상한 해제).
//
// ── 무엇이 바뀌었나 ─────────────────────────────────────────────────────
// 화면에 `MAX_TURNS = 12` 가 있었다(#1342). 사용자 답이 12개가 되면 대화를 끊었고,
// 주석은 그 이유를 "비용과 피로"라고 적었다. Simon: "12턴 상한이 왜 있는거지?
// 사용자의 딥한 내용은 언제까지 해야하는지 알수 없지 않을까? 12턴 제한 없애."
// 같은 결정에서 "등급이 목표에 닿으면 멈춘다"(`drill-stop.ts`)도 접었다. 그 규칙은
// 2026-07-05(#745) 이후 배선된 적이 없고, 파일은 E:/Legacy/2ndB 로 옮겼다.
//
// 그래서 **답의 개수로는 끝내지 않는다.** 대화가 끝나는 길은 셋이다:
//   1. 사용자가 끝낸다 -- "여기까지" 버튼, 거절하는 답(`answerDisposition`).
//   2. 한 장면을 다 팠다 -- `nextMove` 의 장면 규칙(probe.ts, 이 결정과 무관하게 그대로).
//   3. 오늘 몫을 다 썼다 -- 서버가 하루 한도로 거절했다. **오류가 아니라 끝맺음이다.**
//
// ── 비용은 서버가 막는다 ───────────────────────────────────────────────
// 클라이언트 상한은 우회되면 그만이라 비용 경계가 될 수 없다. 프록시 넷
// (openai · claude · gemini · xai)이 같은 카운터 두 개를 쓰고, 넘으면 429 를 돌려준다:
//
//   - 목적별 하루 몫 `consume_llm_proxy_purpose_quota` (0185, KST 하루 기준).
//     interview_probe 는 free 20 · soma 50 · cortex 100 · brain 250.
//     본문 `{ error: "purpose_limit_exceeded", feature: <purpose> }`.
//   - 사용자별 하루 지출 한도 `bump_gemini_spend` (세 벤더 공용, UTC 하루 기준).
//     본문 `{ error: "daily_limit_exceeded" }`.
//
// 프록시는 목적별 몫을 먼저 본다. 그래서 인터뷰에서는 대개 그쪽이 먼저 닿는다.
// 둘 다 "오늘은 더 못 한다"는 같은 뜻이라 같은 끝맺음으로 받는다.
//
// ⚠ 같은 429 라도 `llm_capacity_exceeded`(전역 동시 처리량)는 하루 한도가 아니다.
// 잠시 뒤면 풀리므로 여전히 "다시 시도" 오류다. 그걸 "내일 이어서"라고 말하면 거짓이다.
// 본문을 못 읽는 429 도 같은 이유로 오류로 남긴다 -- 근거 없이 "내일"을 말하지 않는다.
//
// ── 로컬 안전장치 ──────────────────────────────────────────────────────
// "건너뛰기"와 "사실만"은 모델을 부르지 않고 질문을 하나 더 붙인다. 서버 한도에
// 닿지 않는 길이라 연달아 누르기만 하면 대화가 끝없이 길어진다. 그것만 여기서 막는다.
//
// 세는 것은 **답 없이 연달아 붙은 질문 수**다. 답을 하나라도 하면 0 으로 돌아간다.
// 예전 검사는 대화 전체의 질문 수를 셌다. 그러면 긴 대화 끝에서 건너뛰기 한 번이
// 대화를 끊는다 -- 12턴 상한이 이름만 바꿔 남는 셈이라 그렇게 두지 않았다.

/** 답 없이 연달아 붙을 수 있는 질문 수. 씨앗 질문 하나 + 건너뛰기 열한 번까지.
 *  값은 예전 `MAX_TURNS` 의 12 를 그대로 옮겼다. 바뀐 것은 무엇을 세느냐다. */
export const MAX_UNANSWERED_PROMPTS = 12;

/** 이 화면이 부르는 LLM 목적. 프록시의 목적별 거절은 이 이름을 `feature` 로 돌려준다. */
export const INTERVIEW_PURPOSE = "interview_probe";

/** 마지막 사용자 답 뒤로 연달아 붙은 질문 수. 답이 하나도 없으면 전체 질문 수다. */
export function unansweredPromptRun(turns: readonly { role: "interviewer" | "user" }[]): number {
  let run = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === "user") break;
    run += 1;
  }
  return run;
}

/** 모델을 부르지 않고 질문을 더 붙이면 안 되는가(건너뛰기 · 사실만). */
export function localPromptsExhausted(turns: readonly { role: "interviewer" | "user" }[]): boolean {
  return unansweredPromptRun(turns) >= MAX_UNANSWERED_PROMPTS;
}

/**
 * 프록시 거절이 "오늘 몫을 다 썼다"인지 가린다. 상태 코드와 본문만 보는 순수 판정이다.
 *
 * - `daily_limit_exceeded` 는 목적과 무관한 공용 한도라 그대로 받는다.
 * - `purpose_limit_exceeded` 는 **이 목적의** 몫일 때만 받는다. 다른 목적의 몫이
 *   찼다는 거절을 이 대화의 끝으로 읽지 않는다.
 */
export function isDayLimitRefusal(status: unknown, body: unknown, purpose: string): boolean {
  if (status !== 429) return false;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const { error, feature } = body as { error?: unknown; feature?: unknown };
  if (error === "daily_limit_exceeded") return true;
  return error === "purpose_limit_exceeded" && feature === purpose;
}

type ResponseLike = {
  status?: unknown;
  clone?: () => { json?: () => Promise<unknown> };
  json?: () => Promise<unknown>;
};

/**
 * `callLlm` 이 던진 오류에서 프록시 응답을 꺼내 `isDayLimitRefusal` 로 판정한다.
 *
 * functions-js 의 `FunctionsHttpError` 도, 캡처 세션 경로의 오류도 거절한 Response 를
 * `error.context` 에 둔다(`supabase/captured-session-client.ts`). 경계 모듈은 429 본문을
 * 읽지 않고 그대로 던진다. 본문은 **clone 으로** 읽는다 -- 같은 오류를 다른 처리가
 * 이어서 읽을 수 있어야 하고, 원본 본문을 써 버리면 그 처리가 빈손이 된다.
 * 못 읽으면 false 다. 그때는 오류로 남는다.
 */
export async function readDayLimitRefusal(error: unknown, purpose: string): Promise<boolean> {
  if (!error || typeof error !== "object") return false;
  const ctx = (error as { context?: unknown }).context;
  if (!ctx || typeof ctx !== "object") return false;
  const res = ctx as ResponseLike;
  if (res.status !== 429) return false;
  try {
    const target = typeof res.clone === "function" ? res.clone() : res;
    if (typeof target.json !== "function") return false;
    return isDayLimitRefusal(res.status, await target.json(), purpose);
  } catch {
    return false;
  }
}
