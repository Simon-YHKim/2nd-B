// 홈으로 가는 길은 하나다 (QA 261004 D-01 · D-12).
//
// ## 왜 이 파일이 있나
//
// `router.replace("/")` · `router.push("/")` · `<Redirect href="/" />` 는 셋 다
// **홈을 하나 더 만든다.** expo-router 56 의 REPLACE 는 현재 칸을 새 key 의
// `index` 로 바꿀 뿐 스택 아래에 이미 있는 홈을 찾아보지 않는다
// (node_modules/expo-router/build/react-navigation/routers/StackRouter.js 의
// `case 'REPLACE'`). PUSH 는 말 그대로 위에 얹는다. 루트는 네이티브 스택이라
// 묻힌 홈도 마운트된 채 남는다. 홈 하나가 view 약 1,930개와 효과음 플레이어
// 셋을 들고 있어서, 안드로이드 에뮬레이터에서 홈이 열 개쯤 쌓이자 Java 힙
// 상한(192MB)에 닿아 앱이 죽었다(2/2 재현, 2026-10-04 QA).
//
// `router.dismissTo("/")` 는 POP_TO 다. 아래에 홈이 있으면 그 홈까지 걷어내고,
// 없으면(딥링크로 바로 들어왔거나 웹에서 새로고침한 경우) 현재 칸을 홈으로
// 바꾼다(같은 파일의 `case 'POP_TO'`). 그래서 어느 길로 와도 홈은 하나다.
//
// 웹: 걷어낸 칸 수만큼 브라우저 기록을 되돌린다. 되돌릴 기록이 없으면
// 앱 안에서 멈추고 replaceState 로 주소만 `/` 로 바꾼다 - 앱 밖으로 나가지
// 않는다(node_modules/expo-router/build/react-navigation/native/
// createMemoryHistory.js 의 `go()`). 새로고침·직접 진입은 스택에 칸이 하나뿐이라
// 예전 replace 와 결과가 같다.
//
// ⚠ 걷어내는 길이라 `beforeRemove` · `usePreventRemove` 가 끼어든다. 저장하지
// 않은 감사 응답이나 비밀번호 재설정 잠금이 그 사이에 있으면 막히는 것이
// 맞다. PUSH 는 그 가드를 건너뛰었다(tabs.ts 의 /reset-password 줄).
//
// `src/lib/nav/__tests__/go-home.test.ts` 가 두 가지를 지킨다: 실제 라우터로
// POP_TO 가 홈을 하나로 남기는지, 그리고 배송 코드에 홈을 쌓는
// `<Redirect href="/">` 가 다시 생기지 않는지.
import { useCallback } from "react";
import { router, useFocusEffect } from "expo-router";

/** 홈 라우트. 문자열을 흩뿌리지 않으려고 하나만 둔다. */
export const HOME_HREF = "/" as const;

/** 스택 아래의 홈으로 돌아간다. 홈이 없으면 지금 칸을 홈으로 바꾼다. */
export function goHome(): void {
  router.dismissTo(HOME_HREF);
}

/**
 * `<Redirect href="/" />` 의 대체. 화면이 포커스를 얻으면 홈으로 보낸다.
 *
 * expo-router 의 `Redirect` 와 같은 자리(포커스 효과)에서 같은 방식으로
 * 실패를 삼킨다. 다른 점은 replace 대신 dismissTo 를 부른다는 것 하나다.
 * 링크 미리보기(iOS `Link.Preview`) 판정은 넣지 않았다 - 이 앱은 미리보기를
 * 쓰지 않고, 그 훅은 expo-router 의 공개 API 가 아니다.
 */
export function RedirectHome(): null {
  useFocusEffect(
    useCallback(() => {
      try {
        goHome();
      } catch (error) {
        console.error(error);
      }
    }, []),
  );
  return null;
}
