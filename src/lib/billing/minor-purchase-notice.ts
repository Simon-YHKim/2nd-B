// 결제 전 미성년 취소권 고지(`ds.plans.minorPurchaseNotice`)를 누구에게 보이는가.
//
// 고지 문구는 다섯 로케일 모두 "만 19세 미만이라면 … 취소할 수 있습니다" 다. 근거는
// 민법 제5조(미성년자가 법정대리인 동의 없이 한 법률행위는 취소할 수 있다)와
// 제4조(성년은 만 19세)이고, 약관 제12조가 대한민국 법을 준거법으로 둔다.
// 그런데 표시 조건이 앱 전체의 `isMinor`(만 18세 미만, AuthContext 의
// MINOR_AGE_CEILING)였다. 그래서 문구가 말을 거는 사람 중 만 18세만 고지를 못 받고
// 결제 화면으로 갔다(R2C-04, 2026-10-05 실측: 16세 1줄 · 18세 0줄).
//
// MINOR_AGE_CEILING 을 19 로 올리지 않는다. 그 값은 위기 상담 라우팅 · 광고 · 개인정보
// 클램프가 함께 읽는 18세 기준이라, 결제 고지 하나 때문에 바꾸면 다른 경로가 같이 움직인다.
// 고지 대상만 문구의 기준에 맞춘다. 결제를 막거나 동의를 요구하는 강도는 Simon 미결(F5)
// 이라 여기서 다루지 않는다.
//
// 나라마다 성년 나이가 다르다(대부분 18, 태국 20 등). 그래도 나라별로 가르지 않는 이유:
//   - 문구가 스스로 "만 19세" 를 말한다. 그 문장이 가리키는 사람에게 닿는 것이 문구와
//     맞는 조건이다.
//   - 저장소에는 나라별 성년 나이 자료가 없다. 63개국 표는 디지털 동의 나이라 다른
//     개념이고(한국 14), 그걸 쓰면 한국 18세가 다시 빠진다.
//   - 웹에서는 기기 지역을 못 읽는 일이 흔하고, 가입 때 고른 거주 국가는 저장하지 않는다.
//     나라로 가르면 바로 그 사용자들이 조용히 기본값으로 떨어진다.
// 그래서 이 조건은 예전 조건의 상위 집합이다. 예전에 고지를 보던 사람은 그대로 보고,
// 새로 보는 사람은 나이를 아는 만 18세뿐이다.

/** 민법 제4조의 성년 나이. 고지 문구가 말하는 "만 19세 미만" 의 19 다. */
export const KR_CIVIL_MAJORITY_AGE = 19;

export interface MinorPurchaseNoticeInput {
  /** AuthContext 의 isMinor. 만 18세 미만, 또는 birth_date 가 없어 보호 쪽으로 둔 경우 true. */
  isMinor: boolean | null;
  /** AuthContext 의 만 나이. 아직 모르면 null. */
  age: number | null;
}

/**
 * 고지를 보일지 정한다.
 *
 * - `isMinor === true` 는 그대로 보인다. birth_date 가 없어 나이를 모르는데 보호 쪽으로
 *   둔 경우(isMinor true · age null)도 여기 들어간다.
 * - 나이를 알고 만 19세 미만이면 보인다. 새로 들어오는 것은 만 18세다.
 * - 나이를 아직 모르면(로딩 · 세션 없음 · 프로브 실패) 보이지 않는다. 예전과 같다.
 */
export function showsMinorPurchaseNotice({ isMinor, age }: MinorPurchaseNoticeInput): boolean {
  if (isMinor === true) return true;
  return age !== null && age < KR_CIVIL_MAJORITY_AGE;
}
