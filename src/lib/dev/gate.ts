// 개발자용 표면을 보여줄지 정하는 한 곳.
//
// 두 문이 있고 **둘 중 하나만 열려도 보인다.**
//
// 1. `__DEV__` — 로컬 개발 서버. 원래부터 있던 문.
// 2. `EXPO_PUBLIC_ALLOW_DEV_TIER` — QA 빌드. 2026-08-19 에 추가했다.
//
// 2번이 필요한 이유: Simon 이 실제로 화면을 보는 곳은 GitHub Pages 정적
// 익스포트인데 거기서 `__DEV__` 는 false 다. 1번만 있으면 "앱에서 화면을 볼 수
// 있게 해달라"는 요구를 만족시킬 수 없다 — 개발자 화면이 홈으로 튕긴다.
//
// 새 플래그를 만들지 않고 이미 있는 것을 쓴다. `EXPO_PUBLIC_ALLOW_DEV_TIER` 는
// 이미 정확히 이 성격이다: `web-deploy.yml` 의 `workflow_dispatch` 입력에서만
// 켜지고, 기본값이 false 이며, `src/lib/progression/__tests__/dev-tier-not-live.test.ts`
// 가 "배포 설정에 하드코딩 true 가 없다" 를 강제한다. 플래그를 새로 만들면
// 지켜야 할 게이트가 하나 더 늘어난다.
//
//   켜기:   gh workflow run web-deploy.yml -f allow_dev_tier=true
//   끄기:   gh workflow run web-deploy.yml -f allow_dev_tier=false   (기본값)
import { getEnv } from "@/lib/env";

// `__DEV__` 는 이 프로젝트 tsconfig 에 타입이 없어서 globalThis 로 읽는다
// (`src/lib/env.ts` 와 같은 방식). **명시적으로 true 일 때만** 개발으로 본다 —
// 알 수 없는 런타임은 숨기는 쪽으로 떨어진다.
function isDevRuntime(): boolean {
  return (globalThis as { __DEV__?: boolean }).__DEV__ === true;
}

function isQaBuild(): boolean {
  try {
    return getEnv().EXPO_PUBLIC_ALLOW_DEV_TIER === true;
  } catch {
    // env 스키마가 깨진 런타임에서도 숨기는 쪽으로 떨어진다.
    return false;
  }
}

/**
 * 개발자용 화면·진입점을 보여도 되는 런타임인가.
 *
 * 라우트 게이트(`DevOnlyRoute`)와 설정의 진입 버튼이 **같은 판단**을 쓰도록
 * 한 곳에 둔다. 둘이 갈리면 눌리는데 안 열리는 버튼이 생긴다.
 */
export function isDevSurfaceEnabled(): boolean {
  return isDevRuntime() || isQaBuild();
}
