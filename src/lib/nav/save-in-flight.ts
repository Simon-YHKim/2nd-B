// 저장이 응답을 기다리는 동안은 goHome 이 아무것도 하지 않는다 (PR #2044 게이트 NAV-R3-01).
//
// ## 무슨 일이 있었나
//
// goHome 은 POP_TO 라 지금 칸을 걷어낸다(src/lib/nav/go-home.ts). /esm 에서 저장을
// 누르고 응답이 오기 전에 홈(화면 안 버튼 · 독)을 누르면 ESM 칸이 사라지고, 저장이
// 실패했을 때 실패 안내도 고른 값도 함께 사라진다. 예전 push("/") 는 그 칸을 아래에
// 남겨 두어서 이 일이 없었다.
//
// ## 무엇을 하나 (최소 가드)
//
// 모듈 하나에 "저장 중" 수를 둔다. 저장하는 쪽이 첫 await 전에 beginSaveInFlight()
// 로 올리고 finally 에서 돌려받은 함수로 내린다. 수가 0 보다 크면 goHome 은 아무것도
// 하지 않는다. 화면 안 홈 버튼은 따로 disabled 로 막는다(esm.tsx).
//
// 영구 잠금을 막는 장치 하나: 마지막으로 올린 뒤 SAVE_IN_FLIGHT_LIMIT_MS 가 지나면
// 수는 저절로 0 이 된다. 응답이 끝내 오지 않아도 홈은 그 뒤에 다시 열린다. 그 전에
// 올린 저장이 늦게 내리려 해도 새로 올린 저장을 풀지 못한다(세대를 본다).
//
// ## 하지 않는 것
//
// 하드웨어 뒤로 · 대시보드 폰 안의 뒤로 · 스와이프는 이 수를 보지 않는다. 그 길은
// 이 PR 이전과 같다(칸을 걷어내며, 그때도 그랬다). 요청을 취소하지도, 중복 저장을
// 막지도 않는다.
//
// 타이머는 전역 setTimeout 을 직접 부른다. 객체 속성으로 넘기면 웹에서 this 를
// 잃는다(브라우저 타이머 Illegal invocation, intro-exit-shield.ts 와 같다).

/** 마지막으로 올린 뒤 이만큼 지나면 저장 중 수가 저절로 0 이 된다. */
export const SAVE_IN_FLIGHT_LIMIT_MS = 20_000;

let count = 0;
/** 저절로 0 이 될 때마다 1 오른다. 그 전에 올린 저장의 해제는 무시된다. */
let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/**
 * 저장을 시작한다고 알린다. 돌려받은 함수를 finally 에서 부른다. 두 번 불러도
 * 한 번만 센다.
 */
export function beginSaveInFlight(): () => void {
  count += 1;
  const mine = generation;
  clearTimer();
  timer = setTimeout(() => {
    timer = null;
    count = 0;
    generation += 1;
  }, SAVE_IN_FLIGHT_LIMIT_MS);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    if (mine !== generation) return; // 이미 저절로 풀렸다. 새 저장의 수를 건드리지 않는다.
    count = Math.max(0, count - 1);
    if (count === 0) clearTimer();
  };
}

/** 응답을 기다리는 저장이 있는가. */
export function isSaveInFlight(): boolean {
  return count > 0;
}

/** 테스트 전용: 모듈 상태를 처음으로 되돌린다. */
export function resetSaveInFlightForTests(): void {
  clearTimer();
  count = 0;
  generation += 1;
}
