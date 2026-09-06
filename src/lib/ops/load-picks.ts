// 오늘의 두 가지 — 후보 실측 (Simon 2026-08-18, D6).
//
// `today-picks.ts` 가 고르는 규칙이라면 여기는 **무엇이 있는지 보는 눈**이다.
// cowork 대시보드 프롬프트의 첫 단계("접근할 수 있는 것을 살펴보고")가 이것이다.
//
// ## 왜 각 기능의 로더를 재사용하지 않는가
//
// 허브는 "행이 있는가 / 마지막이 언제인가" 만 알면 된다. `listActiveRoutines`
// 같은 기존 로더는 객체 전체를 끌어온다 - 홈처럼 열 때마다 도는 화면에서 여섯
// 소스의 전체 목록을 받아오면 그게 가장 비싼 자리가 된다.
//
// 그래서 소스마다 **가장 최근 한 줄의 시각만** 읽는다(`limit(1)`). 여섯 개를
// 병렬로 던지므로 왕복은 한 번 분량이다.
//
// ## 실패하면 조용히 빠진다
//
// 한 소스의 질의가 실패해도 화면 전체가 죽으면 안 된다. 실패한 소스는 "데이터
// 없음" 으로 떨어지고, 그러면 picker 가 후보에서 제외한다. **없는 것을 있다고
// 하지 않는 방향으로 실패한다** - 반대 방향이면 빈 카드를 그리게 된다.

import { getSupabaseClient } from "@/lib/supabase/client";

import { routineDueToday, type OpsRoutine } from "./routines";
import { PICK_IDS, type PickCandidate, type PickId } from "./today-picks";

/** 소스별 최근 활동을 읽을 테이블과 시각 컬럼. */
const PROBES: Readonly<Record<Exclude<PickId, "routine">, { table: string; at: string }>> = {
  milestone: { table: "ops_milestones", at: "created_at" },
  reading: { table: "ops_reading", at: "created_at" },
  meals: { table: "ops_meal_plan", at: "created_at" },
  records: { table: "records", at: "created_at" },
  esm: { table: "esm_responses", at: "created_at" },
};

async function probe(
  table: string,
  at: string,
  userId: string,
  failOnReadError: boolean,
): Promise<number | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(table)
      .select(at)
      .eq("user_id", userId)
      .order(at, { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return null;
    const raw = (data[0] as unknown as Record<string, unknown>)[at];
    const ms = typeof raw === "string" ? Date.parse(raw) : NaN;
    return Number.isFinite(ms) ? ms : null;
  } catch (error) {
    if (failOnReadError) throw error;
    // 조용히 빠진다 - 위 헤더 참조. 이 소스는 후보가 되지 않는다.
    return null;
  }
}

/**
 * 루틴만 다르게 읽는다: "오늘 걸려 있는가" 가 점수의 가장 큰 항목이라
 * 존재 여부만으로는 부족하다. 활성 루틴을 받아 오늘 해당하는 것이 있는지 본다.
 */
async function probeRoutine(
  userId: string,
  now: Date,
  failOnReadError: boolean,
): Promise<PickCandidate> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("ops_routines")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) {
      return { id: "routine", hasData: false };
    }
    const rows = data as unknown as OpsRoutine[];
    const dueToday = rows.some((r) => {
      try {
        return routineDueToday(r, now);
      } catch {
        return false;
      }
    });
    const newest = rows
      .map((r) => Date.parse(String((r as unknown as Record<string, unknown>).created_at ?? "")))
      .filter((n) => Number.isFinite(n));
    return {
      id: "routine",
      hasData: true,
      dueToday,
      lastActivityAt: newest.length > 0 ? Math.max(...newest) : null,
    };
  } catch (error) {
    if (failOnReadError) throw error;
    return { id: "routine", hasData: false };
  }
}

export interface LoadPickCandidatesOptions {
  /**
   * The hub needs to tell an unavailable read from a genuinely empty source.
   * Existing background callers keep the historical fail-soft default.
   */
  failOnReadError?: boolean;
}

/**
 * 여섯 후보의 현재 상태를 한 번에 읽는다.
 *
 * 반환 순서는 `PICK_IDS` 와 같다 - picker 가 동점일 때 이 순서를 쓰기 때문에
 * 흔들리면 안 된다.
 */
export async function loadPickCandidates(
  userId: string,
  now: Date = new Date(),
  options: LoadPickCandidatesOptions = {},
): Promise<PickCandidate[]> {
  const failOnReadError = options.failOnReadError === true;
  const [routine, ...rest] = await Promise.all([
    probeRoutine(userId, now, failOnReadError),
    ...(Object.keys(PROBES) as Exclude<PickId, "routine">[]).map(async (id) => {
      const { table, at } = PROBES[id];
      const ms = await probe(table, at, userId, failOnReadError);
      return { id, hasData: ms != null, lastActivityAt: ms } satisfies PickCandidate;
    }),
  ]);
  const byId = new Map<PickId, PickCandidate>([[routine.id, routine], ...rest.map((c) => [c.id, c] as const)]);
  return PICK_IDS.map((id) => byId.get(id) ?? { id, hasData: false });
}
