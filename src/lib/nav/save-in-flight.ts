// 저장이 응답을 기다리는 동안 goHome 이 그 화면을 걷어내지 않는다 (PR #2044 게이트 NAV-R3-01).
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
// 모듈 하나에 "저장 중" 명단을 둔다. 저장하는 쪽이 첫 await 전에
// beginSaveInFlight(isOwnerFocused) 로 올리고 finally 에서 돌려받은 함수로 내린다.
// 명단에 있는 저장 가운데 **그 화면이 지금 포커스된 것**이 있을 때만 goHome 은 아무것도
// 하지 않는다. 화면 안 홈 버튼은 따로 disabled 로 막는다(esm.tsx).
//
// 포커스로 범위를 좁힌 이유 (게이트 NAV-S6-01): 저장 중에 뒤로(허용된 길)로 화면을
// 떠난 뒤 다른 화면의 `<RedirectHome />` 이 goHome 을 부르면, 전역 수만 보던 가드가
// 그 한 번을 삼켰고 RedirectHome 은 다시 부르지 않아 빈 화면이 남았다. 떠난 화면은
// 포커스가 없으므로 이제 다른 화면의 홈 이동을 막지 않는다. 포커스는 부를 때마다
// 라우터 상태에서 읽는다(navigation.isFocused) - 효과 순서와 무관하다.
//
// 영구 잠금을 막는 장치 하나: 마지막으로 올린 뒤 SAVE_IN_FLIGHT_LIMIT_MS 가 지나면
// 명단은 저절로 빈다. 응답이 끝내 오지 않아도 홈은 그 뒤에 다시 열린다. 저장마다 새
// 항목을 두므로, 그 전에 올린 저장이 늦게 내리려 해도 새로 올린 저장을 지우지 못한다.
//
// ## 하지 않는 것
//
// 하드웨어 뒤로 · 대시보드 폰 안의 뒤로 · 스와이프는 이 명단을 보지 않는다. 그 길은
// 이 PR 이전과 같다(칸을 걷어내며, 그때도 그랬다). 요청을 취소하지도, 중복 저장을
// 막지도 않는다.
//
// 타이머는 전역 setTimeout 을 직접 부른다. 객체 속성으로 넘기면 웹에서 this 를
// 잃는다(브라우저 타이머 Illegal invocation, intro-exit-shield.ts 와 같다).

/** 마지막으로 올린 뒤 이만큼 지나면 저장 중 명단이 저절로 빈다. */
export const SAVE_IN_FLIGHT_LIMIT_MS = 20_000;

interface SaveOwner {
  isFocused: () => boolean;
}

const owners = new Set<SaveOwner>();
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

/**
 * 저장을 시작한다고 알린다. `isOwnerFocused` 는 저장하는 화면이 지금 포커스된
 * 화면인지 답한다(보통 `() => navigation.isFocused()`). 돌려받은 함수를 finally
 * 에서 부른다. 두 번 불러도 한 번만 센다.
 */
export function beginSaveInFlight(isOwnerFocused: () => boolean): () => void {
  const owner: SaveOwner = { isFocused: isOwnerFocused };
  owners.add(owner);
  clearTimer();
  timer = setTimeout(() => {
    timer = null;
    owners.clear();
  }, SAVE_IN_FLIGHT_LIMIT_MS);
  return () => {
    owners.delete(owner); // 이미 저절로 비었으면 아무것도 지우지 않는다.
    if (owners.size === 0) clearTimer();
  };
}

/** 지금 포커스된 화면의 저장이 응답을 기다리는가. 판정이 던지면 그 저장은 막지
 *  않는다 - 판정할 수 없는 화면(이미 사라진 화면)에는 지킬 것이 없다. */
export function isSaveInFlight(): boolean {
  for (const owner of owners) {
    try {
      if (owner.isFocused()) return true;
    } catch {
      // 다음 저장을 본다.
    }
  }
  return false;
}

/** 테스트 전용: 모듈 상태를 처음으로 되돌린다. */
export function resetSaveInFlightForTests(): void {
  clearTimer();
  owners.clear();
}
