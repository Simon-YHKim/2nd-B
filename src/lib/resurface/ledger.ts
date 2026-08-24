// 꺼내기 채점 원장의 쓰기·읽기 (resurface_ledger, 0145).
//
// 개인화의 선행 작업이다. 슬롯(plan.ts)은 live 지만 규칙이 전원 동일한데,
// 사람별로 감쇠·순서를 배우려면 먼저 **무엇을 보여줬고 사용자가 어떻게
// 했는가**가 남아야 한다. 지금까지는 셋 다 관측 불가였다 — 승인은 시점이
// 없고, 거절은 DELETE 라 흔적이 0 이고, 노출은 화면 메모리에만 있었다.
//
// ⚠ 전부 fail-soft 다. 원장 실패가 화면(/digest)이나 판정(ratify/reject)을
// 막으면 채점 도구가 제품을 부수는 꼴이다 — 기록은 최선 노력, 판정이 우선.
//
// '무시'는 여기 없다. (shown 이후 판정 없음) 으로 score.ts 가 파생한다 —
// 관측 불가능한 것을 이벤트로 쓰는 척 하지 않는다.

import { getSupabaseClient } from "../supabase/client";

export type ResurfaceEvent = "shown" | "ratified" | "rejected";

export interface ResurfaceLedgerRow {
  from_page: string;
  to_page: string;
  event: ResurfaceEvent;
  shown_rank: number | null;
  created_at: string;
}

/** 오늘 화면에 실제로 뜬 목록을 남긴다. 순위(0=맨 위)도 함께 — 위에 떴는데
 *  무시됐다는 것과 아래 떠서 못 봤다는 것은 다른 신호다. */
export async function recordResurfaceShown(
  userId: string,
  shown: readonly { fromPage: string; toPage: string; rank: number }[],
): Promise<void> {
  if (!userId || shown.length === 0) return;
  try {
    await getSupabaseClient().from("resurface_ledger").insert(
      shown.map((s) => ({
        user_id: userId,
        from_page: s.fromPage,
        to_page: s.toPage,
        event: "shown" as const,
        shown_rank: s.rank,
      })),
    );
  } catch {
    // 기록 실패는 화면을 막지 않는다.
  }
}

/** 판정을 남긴다. 판정 자체(ratifyLink/rejectInferredLink)가 성공한 뒤에만
 *  부를 것 — 실패한 판정을 성공으로 적으면 채점이 거짓이 된다. */
export async function recordResurfaceDecision(
  userId: string,
  fromPage: string,
  toPage: string,
  event: "ratified" | "rejected",
): Promise<void> {
  if (!userId) return;
  try {
    await getSupabaseClient().from("resurface_ledger").insert({
      user_id: userId,
      from_page: fromPage,
      to_page: toPage,
      event,
      shown_rank: null,
    });
  } catch {
    // 판정은 이미 끝났다. 기록 실패로 사용자를 막지 않는다.
  }
}

/** 채점용 읽기. 실패하면 빈 목록 — 점수를 지어내는 것보다 낫다. */
export async function loadResurfaceLedger(userId: string): Promise<ResurfaceLedgerRow[]> {
  if (!userId) return [];
  try {
    const { data } = await getSupabaseClient()
      .from("resurface_ledger")
      .select("from_page, to_page, event, shown_rank, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(2000);
    return (data ?? []) as ResurfaceLedgerRow[];
  } catch {
    return [];
  }
}
