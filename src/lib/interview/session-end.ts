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
//   2. 한 장면이 끝났다 -- `nextMove` 의 장면 규칙(probe.ts)과 화면의 판정 경로(interview.tsx).
//      다섯 층이 모두 인정됐을 때, 또는 한 층에서 세 번 못 답했을 때(모르겠어요 · 모델이 그
//      층으로 인정하지 않음)다.
//      ⚠ 2026-10-06 QA 261005 R2F-09: 여기 "이 결정과 무관하게 그대로"라고 적혀 있던 장면 규칙에는
//      **장면당 답 8개 상한**이 있었다. 이 줄의 "답의 개수로는 끝내지 않는다"와 어긋났고,
//      두 층에서 막혔다 회복한 사람은 울림(L5)을 묻기도 전에 8답에서 끝났다. 그 상한은 걷어냈다.
//      판정을 받는 호출은 한 층에서 세 번을 넘지 않는다 -- 인정받지 못한 답 두 번 뒤의 세 번째는
//      인정되거나 대화를 끝낸다(원래 있던 규칙, 이번에 바꾸지 않았다). 마지막 층도 같아서
//      장면 하나의 판정 호출은 다섯 층 x 3 = 15회가 상한이다. 장면 완료는 마지막 판정이 인정일
//      때만이다 -- 판정 전 답을 미리 세어 울림 칸이 빈 채 끝나던 길은 막았다(게이트 LAST-01).
//      판정을 못 받은 호출(오류 · 위험 신호)은 이 셈 밖이고, 예전에는 8답 상한이 함께 끊던 것을
//      이제는 아래 서버 몫이 끊는다(사용자가 다시 보낼 때만 한 번씩 부른다). 오류로 판정을 못 받은
//      답은 `unsettled` 로 표시해 진전으로도 "사실만" 4답 셈으로도 세지 않고, 같은 층을 다시
//      묻는다(게이트 LAST-02).
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
// 둘 다 "하루 한도에 닿았다"는 같은 뜻이라 같은 끝맺음으로 받는다.
//
// ⚠ 끝맺음 안내(`drill.dayLimit`)는 **재개 시각도, 받은 질문 수도 말하지 않는다**
// (게이트 F2049-03, 2026-10-05). 두 카운터는 하루를 다르게 끊는다 -- 목적별 몫은
// KST 자정, 지출 한도는 UTC 자정(KST 09:00)이다. KST 08:50 에 지출 한도로 거절돼도
// 10분 뒤 풀리고, 다른 나라 사용자에게 KST 자정은 "내일"이 아니다. 그리고 목적별 몫은
// 질문을 받은 횟수가 아니다 -- openai-proxy 는 몫을 먼저 쓰고 지출 · 처리량을 나중에
// 보며, 처리량 거절의 환불은 지출 카운터만 돌려준다. 실패한 요청도 몫을 쓴다.
// 그래서 안내는 "하루 사용 한도에 닿았다 · 나중에 이어서"까지만 말한다. 시각을 말하려면
// 어느 카운터인지와 그 경계를 사용자 시간대로 바꿔 보여 줘야 하는데, 그건 이 판정 밖이다.
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
//
// ⚠ **"모르겠어요"와 너무 짧은 답은 답으로 세지 않는다** (게이트 F2049-02, 2026-10-05).
// 화면은 그런 답을 모델에 보내지 않고 고정 발판 질문으로 받는다. 처음에는 사용자
// 턴이면 무엇이든 0 으로 돌렸는데, 그러면 "모르겠어요 → 건너뛰기"를 번갈아 누르는
// 것만으로 매번 0 이 됐다 -- 건너뛰기가 새 장면을 열며 막힘 횟수도 지우므로 발판 종료에도
// 안 닿고, 모델도 안 불러 서버 한도에도 안 닿는다. 대화 배열만 끝없이 커진다.
// 그래서 어느 사용자 턴이 "로컬에서 받은 답이 아닌 답"인지는 **화면이 정한다** -- 화면이
// 모델에 보낼지 정할 때 쓰는 판정과 같은 것을 넘겨야 한다(`isLocalNonAnswer`). 그 턴은
// 질문 수에 더하지도, 셈을 0 으로 돌리지도 않고 건너뛴다.

/** 답 없이 연달아 붙을 수 있는 질문 수. 씨앗 질문 하나 + 건너뛰기 열한 번까지.
 *  값은 예전 `MAX_TURNS` 의 12 를 그대로 옮겼다. 바뀐 것은 무엇을 세느냐다. */
export const MAX_UNANSWERED_PROMPTS = 12;

/** 이 화면이 부르는 LLM 목적. 프록시의 목적별 거절은 이 이름을 `feature` 로 돌려준다. */
export const INTERVIEW_PURPOSE = "interview_probe";

type GuardTurn = { role: "interviewer" | "user" };

/**
 * 마지막 실질 답 뒤로 연달아 붙은 질문 수. 실질 답이 하나도 없으면 전체 질문 수다.
 *
 * `isLocalNonAnswer` 가 true 인 사용자 턴(화면이 모델 없이 발판으로 받은 답)은 셈을
 * 0 으로 돌리지 않는다. 판정을 일부러 필수로 받는다 -- 빠뜨리면 위 교대 반복이 다시 열린다.
 */
export function unansweredPromptRun<T extends GuardTurn>(
  turns: readonly T[],
  isLocalNonAnswer: (turn: T) => boolean,
): number {
  let run = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.role === "user") {
      if (isLocalNonAnswer(turn)) continue;
      break;
    }
    run += 1;
  }
  return run;
}

/** 모델을 부르지 않고 질문을 더 붙이면 안 되는가(건너뛰기 · 사실만). */
export function localPromptsExhausted<T extends GuardTurn>(
  turns: readonly T[],
  isLocalNonAnswer: (turn: T) => boolean,
): boolean {
  return unansweredPromptRun(turns, isLocalNonAnswer) >= MAX_UNANSWERED_PROMPTS;
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
