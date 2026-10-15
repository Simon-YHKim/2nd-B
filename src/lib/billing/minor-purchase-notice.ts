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
// ── 만 18세는 한국 법역일 때만 새로 받는다 (GS-2069-01, 2026-10-05) ──────────
// 처음 고칠 때는 나라를 가르지 않고 나이를 아는 만 18세 전원에게 고지를 넓혔다. 게이트가
// 그 확장을 짚었다: 문구는 관할 한정 없이 "취소할 수 있습니다" 라고 단정하는데, 대부분의
// 나라에서 만 18세는 이미 성년이다. 한국 밖의 만 18세에게 이 문장을 보이면 법정대리인
// 동의와 취소권이 있는 것처럼 읽힌다(추론. 정확한 법률 효과는 법무 확인이 필요하다).
// 그래서 새로 넓히는 몫은 `resolveJurisdiction()` 이 한국(KR)이라고 답할 때로 좁힌다.
//   - 문구의 19 는 한국 민법의 숫자다. 그 숫자가 맞는 곳에서만 대상을 넓힌다.
//   - 지역을 못 읽거나(웹에서 흔하다) 다른 나라면 만 18세는 예전처럼 고지를 안 본다.
//     예전 동작으로 돌아가는 것이지 새 주장을 하지 않는다. 가입 때 고른 거주 국가는
//     저장하지 않으므로 여기서 쓸 수 없다.
//   - 저장소에는 나라별 성년 나이 자료가 없다. 63개국 표는 디지털 동의 나이라 다른
//     개념이고(한국 14), 그 표로는 한국 18세를 고를 수 없다.
//   - `isMinor === true`(만 18세 미만 · birth_date 없음)는 나라와 무관하게 예전처럼 보인다.
//     만 18세 미만 해외 사용자에게 같은 문구가 가는 것은 이 변경 전부터 있던 일이고,
//     문구 자체를 관할 중립으로 바꾸는 것은 법무 승인이 필요한 별도 작업이다.
// 그래서 이 조건은 여전히 예전 조건의 상위 집합이다. 예전에 고지를 보던 사람은 그대로 보고,
// 새로 보는 사람은 법역이 한국이고 나이를 아는 만 18세뿐이다.

/** 민법 제4조의 성년 나이. 고지 문구가 말하는 "만 19세 미만" 의 19 다. */
export const KR_CIVIL_MAJORITY_AGE = 19;

/** 문구의 19 가 성년 나이인 법역. `resolveJurisdiction().country` 와 비교한다. */
export const KR_JURISDICTION = "KR";

export interface MinorPurchaseNoticeInput {
  /** AuthContext 의 isMinor. 만 18세 미만, 또는 birth_date 가 없어 보호 쪽으로 둔 경우 true. */
  isMinor: boolean | null;
  /** AuthContext 의 만 나이. 아직 모르면 null. */
  age: number | null;
  /** `resolveJurisdiction().country`. 대문자 ISO 3166-1 alpha-2, 지역을 못 읽었으면 null. */
  country: string | null;
}

/**
 * 고지를 보일지 정한다.
 *
 * - `isMinor === true` 는 그대로 보인다. birth_date 가 없어 나이를 모르는데 보호 쪽으로
 *   둔 경우(isMinor true · age null)도 여기 들어간다. 나라는 보지 않는다(예전과 같다).
 * - 법역이 한국이고 나이를 알며 만 19세 미만이면 보인다. 새로 들어오는 것은 한국 만 18세다.
 * - 그 밖(다른 나라 · 지역 판독 불가 · 나이를 아직 모름)은 보이지 않는다. 예전과 같다.
 */
export function showsMinorPurchaseNotice({ isMinor, age, country }: MinorPurchaseNoticeInput): boolean {
  if (isMinor === true) return true;
  return country === KR_JURISDICTION && age !== null && age < KR_CIVIL_MAJORITY_AGE;
}
