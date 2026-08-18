// 한국어 조사 자동 판정.
//
// ## 왜 있는데 아직 아무도 안 쓰는가
//
// 지금 이 앱에는 **조사 버그가 없다.** 로케일 문자열이 보간값 뒤에 조사를
// 하드코딩하는 자리가 16곳 있지만 전부 안전하다:
//
//   {{who}}    15곳 — `addressTerm()` 이 항상 "님" 을 붙이고 폴백이 "당신" 이라
//                     **받침이 보장된다.** 의도적으로 회피한 설계이고
//                     `src/lib/persona/address.ts` 헤더에 근거가 적혀 있다.
//   {{phrase}}  1곳 — `CONFIRM_PHRASE = "DELETE"` 고정 상수.
//
// 그래서 이 파일은 **오늘의 버그를 고치려고** 만든 것이 아니다. 아래 두 가지를 위해 있다.
//
// 1. `__tests__/josa.test.ts` 의 가드가 "받침이 보장되지 않는 값 뒤에 조사를
//    하드코딩" 하는 **새 문자열이 들어오는 것을 막는다.** 그때 쓸 도구가 여기 있어야
//    "그럼 어떻게 쓰라는 거냐" 로 막히지 않는다.
// 2. PIXEL-CLAY PRD §20-3 이 요구하는 규칙이고, 그쪽 화면(페르소나 3줄 요약처럼
//    **점수·특성 이름을 문장에 끼워 넣는** 자리)이 오면 바로 필요해진다.
//
// ## 원본을 그대로 베끼지 않은 이유
//
// 인수 프로토타입의 구현(`sb-persona.jsx:324-331`)에는 결함이 셋 있다:
//
//   - **(으)로 의 ㄹ 예외가 없다.** 한국어는 ㄹ 받침 뒤에 `로` 를 쓴다. 원본은
//     1·7·8(일·칠·팔)로 끝나는 값에 "…일으로" 를 만든다.
//   - 을/를 · 이/가 · 으로/로 **세 쌍만** 만든다. 은/는 · 와/과 는 없다.
//   - `window` 에 안 붙어 있어 다른 화면이 못 쓴다. 그래서 같은 번들 안에
//     `별가루을` 같은 하드코딩 오조사가 5개 파일에 남아 있다.
//
// 여기서는 셋 다 고쳤다.

/** 숫자를 읽는 소리 기준의 받침 유무. 0 영·1 일·3 삼·6 육·7 칠·8 팔 = 받침 있음. */
const DIGIT_HAS_JONG = "013678";

/** 받침이 ㄹ 인 숫자. (으)로 가 붙을 때만 갈린다 — 1 일·7 칠·8 팔. */
const DIGIT_RIEUL = "178";

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 종성 인덱스 8 = ㄹ. (code % 28) 로 나온다. */
const JONG_RIEUL = 8;

/** 조사 판정에 쓸 마지막 글자. 괄호·따옴표 같은 장식은 건너뛴다. */
function lastMeaningfulChar(value: string): string {
  const trimmed = String(value).trim().replace(/[)\]}"'"'`»›.…!?]+$/u, "");
  return trimmed.slice(-1);
}

interface Jong {
  /** 받침이 있는가. */
  has: boolean;
  /** 그 받침이 ㄹ 인가. (으)로 만 이걸 본다. */
  rieul: boolean;
  /** 한글도 숫자도 아니라 판정할 수 없는가. */
  unknown: boolean;
}

function analyze(value: string): Jong {
  const c = lastMeaningfulChar(value);
  if (c.length === 0) return { has: false, rieul: false, unknown: true };

  if (/[0-9]/.test(c)) {
    return { has: DIGIT_HAS_JONG.includes(c), rieul: DIGIT_RIEUL.includes(c), unknown: false };
  }

  const code = c.charCodeAt(0);
  if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
    const jong = (code - HANGUL_BASE) % 28;
    return { has: jong !== 0, rieul: jong === JONG_RIEUL, unknown: false };
  }

  // 라틴 문자·기호·이모지. 읽는 소리를 알 수 없다.
  return { has: false, rieul: false, unknown: true };
}

/** 마지막 글자에 받침이 있는가. 판정 불가면 false(= 받침 없음 쪽). */
export function hasJongseong(value: string): boolean {
  return analyze(value).has;
}

/** 판정할 수 있는 값인가. 라틴 문자·기호로 끝나면 false. */
export function canDecideJosa(value: string): boolean {
  return !analyze(value).unknown;
}

export type JosaPair = "을를" | "이가" | "은는" | "와과" | "으로로" | "이나나";

const PAIRS: Record<JosaPair, { withJong: string; withoutJong: string }> = {
  을를: { withJong: "을", withoutJong: "를" },
  이가: { withJong: "이", withoutJong: "가" },
  은는: { withJong: "은", withoutJong: "는" },
  와과: { withJong: "과", withoutJong: "와" }, // 받침 있으면 '과' — 다른 쌍과 방향이 반대다
  으로로: { withJong: "으로", withoutJong: "로" },
  이나나: { withJong: "이나", withoutJong: "나" },
};

/**
 * 값 뒤에 붙일 조사만 돌려준다.
 *
 * `으로로` 는 **ㄹ 받침 예외**가 있다 — ㄹ 로 끝나면 받침이 있어도 `로` 다
 * ("서울로", "1일로"). 원본 프로토타입이 놓친 부분이다.
 *
 * 판정할 수 없는 값(라틴 문자·기호)은 받침 없음 쪽으로 떨어진다. "Slack를" 처럼
 * 어색할 수 있지만 "Slack을" 보다는 낫고, 무엇보다 **조용히 틀리지 않게**
 * `canDecideJosa()` 로 미리 물어볼 수 있다.
 */
export function josaFor(value: string, pair: JosaPair): string {
  const { has, rieul } = analyze(value);
  const spec = PAIRS[pair];
  if (pair === "으로로") return has && !rieul ? spec.withJong : spec.withoutJong;
  return has ? spec.withJong : spec.withoutJong;
}

/** 값 + 조사. 문장에 바로 끼워 넣을 때 쓴다. */
export function withJosa(value: string, pair: JosaPair): string {
  return `${value}${josaFor(value, pair)}`;
}
