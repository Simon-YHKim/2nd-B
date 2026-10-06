// 투명 모달 카드가 "아래는 홈" 이라고 믿어도 되는가 (QA 261004 D-05).
//
// /core-brain(북극성 카드)과 /dashboard 는 transparentModal 이라 아래 화면이
// 마운트된 채 디더 사이로 비친다. 그 설계는 **아래가 홈 하늘**일 때만 맞다.
// 그런데 "뒤로 갈 곳이 있다"(router.canGoBack())는 "아래가 홈이다"와 다르다 -
// /records · /profile 에서 카드를 열거나, 빈 상태가 replace 로 넘기거나,
// /persona 가 리다이렉트하면 아래에는 다른 화면이 있다. 그 글자가 카드
// 머리줄 위아래로 겹쳐 보였다(에뮬레이터 실측, 60초 뒤에도 그대로).
//
// 그래서 홈이 자기 진입점에서만 `overlay=home` 을 붙여 보내고, 카드는 그
// 표시가 있고 뒤로 갈 곳도 있을 때만 아래를 비춘다. /dashboard 가 이미 쓰는
// 규칙과 같다(src/components/dashboard/DashboardPhone.tsx).

/** 홈의 진입점이 붙여 보내는 값. */
export const OVERLAY_HOME = "home";

/** 아래 화면을 비춰도 되는가: 홈이 열었고, 그 홈이 아직 아래에 있다. */
export function isOverHome(overlay: string | string[] | undefined, canGoBack: boolean): boolean {
  return overlay === OVERLAY_HOME && canGoBack;
}
