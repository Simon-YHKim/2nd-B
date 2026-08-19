// PIXEL-CLAY 상호작용 상수 (이주 P4).
//
// 컴포넌트가 아니라 **값**만 두는 파일이다. 이유가 있다: 이 저장소의 jest 는
// `jsx: "react"`(고전 런타임)로 컴파일하는데, 그러면 JSX 를 쓰는 `.tsx` 를 테스트가
// import 하는 순간 `React` 가 스코프에 있어야 한다(TS2686). 그래서 딥스페이스·m3
// 가드들은 소스를 **텍스트로 읽고** import 하지 않는다.
//
// 값까지 텍스트로 검사하면 정규식으로 숫자를 긁는 꼴이 되니, 값은 이 `.ts` 로 빼서
// 테스트가 진짜로 import 하게 한다.
import { m3 } from "@/lib/theme/m3";

/** 눌렀을 때 한 유닛 가라앉는 변환. `.px-btn:active` 의 `translateY(var(--u))`. */
export const pixelPressTransform = [{ translateY: m3.spacing.s1 }] as const;

/** 덮는 비율. 25 = 옅게, 50 = 고전 체커, 75 = 모달 뒤처럼 짙게. */
export type DitherDensity = 25 | 50 | 75;

/** 상태층 밀도 - 색을 덮지 않고 디더로만 표시한다 (`.md-state`). */
export const pixelStateDensity: Record<"pressed" | "hovered", DitherDensity> = {
  // 웹의 hover 디더는 터치에 대응물이 없다(REPO-NOTES 함정 5). press 만 쓴다.
  pressed: 25,
  hovered: 25,
};
