// 회상(star2) 별의 등급을 **실제 인터뷰 커버리지**에서 만든다.
//
// 그 전까지 이 별은 이렇게 정해졌다(`star-levels.ts`):
//
//     card.patterns 에 `top_*` 키가 하나라도 있으면 L2, 아니면 L1
//
// 그 키는 저널 패턴 추출에서 나오는 것이고 **인터뷰와 아무 상관이 없다.**
// 즉 회상 별은 회상을 재고 있지 않았다 -- 7렌즈 감사에서 걸린 "행이 들어왔는가를
// 구인으로 착각" 과 같은 병이다. 정작 그걸 재려고 만든 `narrativeStarLevel` 은
// 호출부가 0건이었고, 이유는 커버리지가 어디에도 저장되지 않았기 때문이다(0143 이 고침).
//
// 분모는 **그 사람에게 해당되는 시기**다(`periodsForAge`). 25 로 고정하면 스물다섯
// 살은 채울 수 없는 칸 때문에 구조적으로 불리해진다.

import { getSupabaseClient } from "../supabase/client";
import { loadCoverage } from "../interview/coverage-store";
import { narrativeStarLevel } from "../interview/narrative-level";
import { livedPeriods } from "../interview/periods";
import { ageInYears } from "../supabase/auth";
import type { LadderLevel } from "./brightness";

/**
 * 이 사용자의 회상 등급. 인터뷰 기록이 없으면 `null` -- 그때는 부르는 쪽이
 * 기존 신호를 쓰면 된다(없는 것을 L1 로 단정하지 않는다).
 *
 * 실패는 전부 `null` 로 떨어진다. 밝기를 못 읽는 것과 밝기가 0 인 것은 다르다.
 */
export async function loadNarrativeStarLevel(userId: string): Promise<LadderLevel | null> {
  if (!userId) return null;
  try {
    const supabase = getSupabaseClient();
    const [{ data: profile }, coverage] = await Promise.all([
      supabase.from("users").select("birth_date").eq("id", userId).maybeSingle(),
      loadCoverage(userId),
    ]);
    const birth = (profile as { birth_date?: string | null } | null)?.birth_date ?? null;
    // 나이를 모르면 `livedPeriods(null)` 이 여섯 전부를 준다(막지 않는 쪽).
    // 분모가 커져 등급이 짜게 나올 수 있지만, 밝기는 부풀면 거짓말이고 덜 차면
    // 그냥 덜 찬 것이다 -- 그 방향이 맞다.
    const periods = livedPeriods(birth ? ageInYears(birth) : null);
    const any = periods.some((p) =>
      (["fact", "feeling", "meaning", "belief", "echo"] as const).some((l) => coverage[p][l] > 0),
    );
    if (!any) return null; // 인터뷰를 한 적이 없다 -- 이 신호는 말할 것이 없다
    return narrativeStarLevel(coverage, periods);
  } catch {
    return null;
  }
}
