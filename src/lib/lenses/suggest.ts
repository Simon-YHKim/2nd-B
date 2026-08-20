// 렌즈가 결정 필드에 **어떻게** 개입하는가.
//
// 자율도(`autonomy.ts`)는 "맡겨도 되는 정도"를 숫자로 들고 있고, 이 파일은 그
// 숫자를 **화면이 실제로 그릴 수 있는 모양**으로 바꾼다. 일곱 렌즈가 전부 이걸
// 쓴다 -- 필드 타입만 다르고 개입하는 방식은 같아야, 사용자가 한 자리에서 배운
// 것이 다른 자리에서도 통한다.
//
//   L1  ask     -- 채우지 않는다. 사용자가 고른다.
//   L2  choose  -- 둘로 좁혀 온다. 사용자가 고른다.
//   L3  prefill -- 하나를 채워 온다. 사용자는 필요하면 되돌린다.
//
// **되돌림이 사다리를 내리는 유일한 신호**이므로(autonomy.ts), L3 은 되돌릴 수
// 있는 자리에만 쓸 수 있다. 되돌리기가 없는 필드에 L3 을 주면 강등 경로가 없어져
// 사다리가 한쪽으로만 도는 톱니가 된다.

import { optionCount, type Autonomy } from "./autonomy";

export type LensSuggestion<T> =
  | { kind: "ask" }
  | { kind: "choose"; options: readonly [T, T] }
  | { kind: "prefill"; value: T };

/**
 * 후보 목록을 자율도에 맞는 제안으로 바꾼다. **좋은 순서로 정렬돼 들어온다고
 * 가정한다** -- 무엇이 좋은 후보인지는 렌즈마다 다르고, 그건 이 파일이 알 바가
 * 아니다. 여기가 정하는 것은 오직 **몇 개를 어떤 모양으로 내보이는가**다.
 *
 * 후보가 모자라면 **자율도와 무관하게 아래로 떨어진다.** 없는 값을 채워 올 수는
 * 없기 때문이고, 이건 실패가 아니라 정상 동작이다 -- 새 사용자는 후보가 없는
 * 상태로 시작하므로 이 경로가 오히려 흔하다.
 */
export function suggest<T>(level: Autonomy, candidates: readonly T[]): LensSuggestion<T> {
  const want = optionCount(level);
  if (want === 0) return { kind: "ask" };
  if (candidates.length === 0) return { kind: "ask" };
  if (want === 1) return { kind: "prefill", value: candidates[0] };
  // L2 는 **둘**이어야 의미가 있다. 후보가 하나뿐인데 둘 중 고르라고 내밀 수는
  // 없으니 묻는 쪽으로 떨어진다 -- 같은 값을 두 번 보여주는 것보다 낫다.
  if (candidates.length < 2) return { kind: "ask" };
  return { kind: "choose", options: [candidates[0], candidates[1]] };
}

/**
 * 제안이 실제로 값을 들고 있는가. 화면이 "빈칸으로 둘지"를 이걸로 가른다.
 */
export function hasValue<T>(s: LensSuggestion<T>): s is Exclude<LensSuggestion<T>, { kind: "ask" }> {
  return s.kind !== "ask";
}

/**
 * 사용자의 응답을 자율도 결과로 옮긴다.
 *
 * 왜 화면이 아니라 여기서 판정하나: **`reverted` 와 `miss` 를 가르는 규칙이
 * 일곱 자리에 흩어지면 각자 다르게 판정한다.** 되돌림은 강등이고 빗나감은
 * 아니므로(autonomy.ts), 그 경계가 한 군데 있어야 사다리가 렌즈마다 다르게
 * 돌지 않는다.
 *
 * - `prefill` 을 사용자가 **그대로 뒀다** -> hit
 * - `prefill` 을 사용자가 **고쳤다** -> reverted (세컨비가 정하지 말라는 뜻)
 * - `choose` 에서 **낸 것 중 골랐다** -> hit
 * - `choose` 에서 **다른 값을 넣었다** -> miss (좁힌 게 틀렸을 뿐, 권한 문제는 아니다)
 * - `ask` 에서 무엇을 고르든 -> miss 로 세지 않는다. 애초에 예측을 안 했다.
 */
export function outcomeOf<T>(
  s: LensSuggestion<T>,
  chosen: T,
  same: (a: T, b: T) => boolean = Object.is,
): "hit" | "miss" | "reverted" | "no-prediction" {
  if (s.kind === "ask") return "no-prediction";
  if (s.kind === "prefill") return same(s.value, chosen) ? "hit" : "reverted";
  return s.options.some((o) => same(o, chosen)) ? "hit" : "miss";
}
