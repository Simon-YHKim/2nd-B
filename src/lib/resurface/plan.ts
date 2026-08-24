// 꺼내기 렌즈의 **슬롯**. 무엇을 다시 보여줄지, 어떤 순서로.
//
// ── 왜 이 파일이 생겼나 ──────────────────────────────────────────────────────
//
// 일곱 렌즈 중 꺼내기만 `slot: "todo"` 였다. `digest_weekly` ·
// `ttfv_first_insight` 는 purpose 로 **선언만** 돼 있고 호출부가 0건이었고,
// 그래서 이 렌즈는 굽힐 것이 없는 추정기였다. 레지스트리의 규율은 분명하다 --
// **슬롯이 먼저고 렌즈가 나중이다.** 바꿀 것이 없는 추정기를 켜는 것이 원래
// 7개가 저질렀던 실수 그 자체다.
//
// 그런데 자리는 이미 있었다. `/digest`(오늘의 정리)가 추론된 링크를 띄우고
// 사용자가 비준한다. 없던 것은 **결정**이다 -- 그 화면은 `confidence DESC` 로
// 50개를 그냥 쏟아냈다. 고정 규칙은 결정이 아니다. 사람마다 굽힐 자리가 없다.
//
// ── 이 파일이 만드는 것 ──────────────────────────────────────────────────────
//
// `resurfaceOrder` — 다시 보여줄 항목들, 정해진 순서로. 이것이 꺼내기 렌즈가
// **독점하는 결정 필드**다. 다른 렌즈가 이 필드를 다투지 않는다(관문 ⑤).
//
// ── v1 규칙: 오래 매달린 것은 자리를 내준다 ──────────────────────────────────
//
// 신뢰도만으로 줄을 세우면 **높은 신뢰도인데 사용자가 계속 비준하지 않는 항목이
// 영원히 맨 위에 남는다.** 그러면 매일 같은 것을 보게 된다. 그건 "다시 보여주기"를
// 잘못한 것이고, 되묻기(loop-check)가 잡는 병 -- 새 틀 없는 반복 -- 과 같은 뿌리다.
//
// 그래서 대기한 시간으로 **감쇠**시킨다. 사라지지는 않는다(0 이 되지 않는 곡선).
// 자리만 내준다. 새 저장소는 만들지 않았다 -- `wiki_links.created_at` 이 이미 있고,
// "얼마나 오래 비준되지 않은 채 있었나" 는 "몇 번 보여줬는데 안 눌렀나" 의
// 충분한 대리값이다. 없는 테이블을 만들기 전에 있는 신호부터 쓴다.
//
// ── 아직 하지 않은 것 ────────────────────────────────────────────────────────
//
// **개인화는 아직 없다.** 이 규칙은 모두에게 같다. 그것이 이 단계의 정직한
// 상태다 -- 슬롯을 만들었을 뿐이고, 렌즈(사람마다 다른 추정)는 이 자리 위에
// 나중에 얹힌다. 적중을 재는 법은 이미 있다: 띄운 항목을 비준했는가 / 물렸는가 /
// 그냥 두었는가(`ratifyLink` · `rejectInferredLink`). LLM 이 필요 없다(관문 ③).

/** 한 번에 띄울 최대 개수.
 *
 *  예전에는 50개를 한꺼번에 쏟았다. 확인해야 할 것이 50개면 그건 검토가 아니라
 *  노역이고, 사람은 전부 무시하는 것으로 대응한다. 적게 묻는 쪽이 더 많이 답을 얻는다. */
export const RESURFACE_MAX = 5;

/** 대기 시간이 이만큼 지나면 점수가 절반이 된다. */
export const RESURFACE_HALFLIFE_DAYS = 14;

export interface ResurfaceCandidate {
  /** 안정적인 키. 같은 항목이 다시 오면 같은 값이어야 한다. */
  key: string;
  /** 시스템이 이미 갖고 있는 신뢰도 (0~1). */
  confidence: number;
  /** 이 항목이 대기하기 시작한 시각 (ISO). 모르면 방금 온 것으로 본다. */
  createdAt?: string | null;
}

export interface ResurfacePlan {
  /** ⚠ 꺼내기 렌즈가 **독점하는 결정 필드.** 다시 보여줄 항목들, 정해진 순서로. */
  resurfaceOrder: readonly string[];
  /** 그중 이번에 실제로 띄우는 개수. */
  shown: number;
}

/** 대기 시간에 따른 감쇠. 1 에서 시작해 반감기마다 절반, **0 이 되지는 않는다.** */
export function pendingDecay(ageDays: number, halfLifeDays = RESURFACE_HALFLIFE_DAYS): number {
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return 1;
  return 1 / (1 + ageDays / halfLifeDays);
}

function ageDaysOf(createdAt: string | null | undefined, now: Date): number {
  if (!createdAt) return 0;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now.getTime() - t) / 86_400_000);
}

/**
 * 무엇을 다시 보여줄지 정한다.
 *
 * 순수 함수다 -- 네트워크도 LLM 도 없다. 같은 입력이면 같은 순서가 나온다.
 * 그래야 "왜 이게 위에 있나" 에 답할 수 있고, 적중을 나중에 채점할 수 있다.
 */
export function planResurface(
  candidates: readonly ResurfaceCandidate[],
  now: Date = new Date(),
  max: number = RESURFACE_MAX,
): ResurfacePlan {
  const scored = candidates
    .filter((c) => typeof c.key === "string" && c.key.length > 0)
    .map((c, i) => ({
      key: c.key,
      i,
      score:
        (Number.isFinite(c.confidence) ? c.confidence : 0) *
        pendingDecay(ageDaysOf(c.createdAt, now)),
    }));
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.i - b.i));
  const order = scored.map((s) => s.key);
  return { resurfaceOrder: order, shown: Math.min(order.length, Math.max(0, max)) };
}
