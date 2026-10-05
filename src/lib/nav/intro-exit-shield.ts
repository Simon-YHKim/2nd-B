// 오프닝이 끝난 직후의 탭이 아래 탭바로 떨어지지 않게 (QA 261004 W-05).
//
// ## 무슨 일이 있었나
//
// 오프닝의 '건너뛰기'는 우하단의 작은 버튼이고(Simon 결정, DECISIONS.md
// 26.10.03 22:21), 그 자리 바로 아래가 홈 독의 '설정' 탭이다(390x844 기준
// 건너뛰기 중심 (341,818) 이 설정 탭 안에 들어간다). 오프닝이 끝나면
// IntroGate 가 LoadingScreen 을 한 번에 Stack 으로 바꾸는데, 사라지는 동안
// 터치를 받아 주는 층이 없었다. 그래서 건너뛰기 직후의 두 번째 탭이나,
// 오프닝이 스스로 끝나는 순간에 도착한 탭이 그대로 설정 탭을 눌렀다.
// 홈을 열었는데 설정 화면에 도착한다(웹 재현: 클릭 뒤 12~44ms 에 오프닝이
// 사라지고 143~201ms 에 그 좌표 아래가 '설정' 탭이 된다).
//
// ## 무엇을 하나
//
// 오프닝이 끝난 그 순간부터 INTRO_EXIT_SHIELD_MS 동안 화면 전체를 덮는
// 투명한 막을 둔다(src/components/ui/IntroExitShield.tsx). 막은 터치를 받기만
// 하고 아무것도 하지 않으며, 보조 기술에서는 숨는다. 그 뒤 사라진다.
//
// 버튼 위치는 바꾸지 않았다. 위치를 옮기는 것은 위 결정의 '뒤집는 조건'에
// 걸려 Simon 이 정할 일이다. 이 막은 '사라지는 버튼 아래로 탭이 새는'
// 경합만 닫는다. 막이 걷힌 뒤에 도착한 탭(예: 첫 탭 뒤 0.7초)은 여전히 아래
// 탭을 누른다 - 그건 위치의 문제다.
//
// ## 왜 상태를 모듈에 두나
//
// IntroGate 는 오프닝 뒤에도 여러 갈래(로더 · 복구 게이트 · 재시도 · Stack)로
// 나뉜다. 막을 갈래마다 끼우는 대신 루트 레이아웃이 IntroGate 바로 다음
// 형제로 한 번 그리고, IntroGate 는 오프닝을 끝낼 때 startIntroExitShield()
// 하나만 부른다. 오프닝은 실행마다 한 번이라 모듈 상태로 충분하다.
//
// 타이머는 전역 setTimeout 을 직접 부른다. 객체 속성으로 넘기면 웹에서
// this 를 잃는다(브라우저 타이머 Illegal invocation).

/** 막이 머무는 시간. 웹 재현에서 아래 탭이 드러나기까지 143~201ms 였다. */
export const INTRO_EXIT_SHIELD_MS = 400;

let active = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** 오프닝이 끝나는 순간 부른다. 다시 부르면 시간을 처음부터 다시 잰다. */
export function startIntroExitShield(): void {
  if (timer !== null) clearTimeout(timer);
  active = true;
  emit();
  timer = setTimeout(() => {
    timer = null;
    active = false;
    emit();
  }, INTRO_EXIT_SHIELD_MS);
}

export function isIntroExitShieldActive(): boolean {
  return active;
}

export function subscribeIntroExitShield(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 테스트 전용: 모듈 상태를 처음으로 되돌린다. */
export function resetIntroExitShieldForTests(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  active = false;
  listeners.clear();
}
