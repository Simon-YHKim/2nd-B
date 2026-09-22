// C10 / task F: 자기동의 최소 연령 — 이제 3덩어리가 아니라 63개국 표다.
//
// 여기 있던 것은 KR 14 / US 13 / EU 16 / DEFAULT 16 네 칸짜리 합집합이었다.
// Simon 결정(2026-09-20): "나라마다 나라에 맞게 적용해야지. 일관 14세는 안돼.
// 한국도 다시 검토해서 각 국가별 최소 나이를 다시 찾아보고 적용해." r51 조사가
// 63개국을 1차 원문으로 확인했고(값이 있는 행의 1차 출처 100%), 값은 13 에서 20
// 까지 퍼져 있었다. 네 칸으로는 담기지 않는다.
//
// 표는 이 파일에 없다 — 생성물이라 consent-age-table.ts 에 따로 산다. 이 파일은
// **판정**만 한다: 어느 나라인가, 그 나라에 행이 있는가, 없으면 무엇으로 가는가.
//
// ── 한국은 다시 확인했다 ────────────────────────────────────────────────
// 개인정보 보호법 제22조의2 제1항 「만 14세 미만」, 현행판 [시행 2026. 9. 11.]
// [법률 제21445호]. 2023-03-14 신설 뒤 개정 없고, 2026 년 개정이 건드린 18개
// 조문에 이 조문은 없다. 14 는 유지 — 다만 그것은 **한국 행**이지 세계 기본값이
// 아니다.
//
// ── 오차는 여전히 비대칭이다. 그래서 규율이 바뀐다 ──────────────────────
// 틀리게 **낮은** 행은 법적으로 동의할 수 없는 사람을 받아들이고, 틀리게 **높은**
// 행이나 아예 없는 행은 받을 수 있었던 사람을 돌려보낼 뿐이다. 표가 없던 시절
// 이 비대칭은 "EEA 를 한 칸(16)으로 둔다"는 결론이었다. 표가 생긴 지금 같은
// 비대칭은 **행을 낮출 때의 증거 기준**으로 살아난다:
//
//   폴백(18)보다 낮은 값을 싣는 행은 1차 원문 — 조문 · 축자 인용 · URL · 확인일 —
//   이 있을 때만 싣는다. 2차 자료 · 플랫폼 계정 연령표 · 통설로는 낮추지 않는다.
//
// r51 이 그 기준으로 걸러 냈다. 프랑스 15 · 아일랜드 16 은 2026-08-16 에 출처가
// 갈렸다고 적혀 있던 바로 그 둘인데 이번엔 조문 원문으로 확정됐다. 반대로 통설이
// 12 라고 하던 브라질과 13 이라고 하던 아랍에미리트는 1차 문장이 그 해석을
// 뒷받침하지 않아 **낮추지 않고** 보수값 18 로 뒀다. 이집트는 영어 요약만 보면
// 15 인데 아랍어 원문에서는 15~18세도 보호자 동의가 필요했다 — 낮췄으면 위법
// 쪽으로 틀렸을 행이다.
//
// ── 남기는 구멍: 지역을 못 읽으면 표가 아무리 넓어도 못 고친다 ──────────
// deviceRegionCode() 가 null 을 주는 사람은 표의 어느 나라 사람일 수도 있다.
// 행으로는 절대 닫히지 않는 구멍이고, 지금 그 사람은 폴백 18 로 간다. 결과를
// 숨기지 않고 적는다: **웹에서 지역이 안 읽히는 14~17세는 가입이 막힌다.** 한국
// 웹 이용자가 여기 포함된다.
//
// 오늘 실해가 없는 이유는 분명하다 — 이 앱은 어느 스토어에도 출시된 적이 없고
// 웹 사용자도 사실상 없다. 그래서 이 구멍은 지금 사람을 막고 있지 않다. 그러나
// **출시 전에는 닫아야 한다.** 닫는 방법은 숫자를 바꾸는 것이 아니라 나라를
// 알아내는 것이다: 지역이 **안 읽힐 때만** 거주국을 묻고(읽히면 묻지 않는다),
// 고른 나라의 행을 적용하고, "목록에 없음"은 폴백으로 보낸다. 그것이 다음
// 라운드다. 이 파일은 그때를 위해 세 경우를 갈라 둔다(FloorSource) — 자기신고로
// 구제할 수 있는 것은 "region-unreadable" 하나뿐이기 때문이다.
//
// ── 서버 하한 14 는 이 파일이 건드리지 않는다 ───────────────────────────
// 서버 트리거는 법역과 무관하게 < 14 를 거부한다(살아 있는 정의는
// db/migrations/0050). 그래서 법정 값이 13 인 12개국(미국 · 영국 · 싱가포르 등)은
// 클라이언트가 통과시켜도 서버가 막는다. 표에는 **법이 말하는 값**을 그대로 싣고,
// 게이트가 쓰는 값은 여기서 max(법정값, 서버 하한)으로 만든다. 법값을 버리지
// 않는 이유는 하나다 — 서버 하한이 바뀌는 날 그 값이 살아나야 하고, 그때 63개국을
// 다시 조사하고 싶지 않다. 서버 하한 변경은 Simon 미결 사항이다(루트 CLAUDE.md
// "EU 최소 가입연령 상향").
//
// ── 이 파일의 이력 (지우지 말 것 - 법무 문서가 이 범위를 인용한다) ──────
// 2026-08-16  기기 지역 신호가 붙었다 - the country signal landed. 그 전까지
//   resolveJurisdiction() 은 평생 "KR" 만 답했고, 그래서 DIGITAL_CONSENT_AGE.EU 는
//   아무에게도 적용된 적이 없었다. 신호는 device-region.ts 가 준다.
// 2026-09-08  이 자리에 "LEXICON_LAST_LEGAL_REVIEW is still null" 이 적혀 있었다.
//   실제 값은 "2026-06-10" 이다(src/lib/safety/lexicon.ts:460). DPIA 가 그 문장을
//   다섯 곳에서 인용해서, 낡은 절반이 하류에서 실제로 일을 하고 있었다.
// 2026-09-21  네 덩어리(KR 14 / US 13 / EU 16 / DEFAULT 16)가 63개국 표로 바뀌고,
//   판독 불가의 착지점이 KR 14 에서 폴백 18 로 옮겨졌다(r53).
//
// TODO(legal): 표 자체는 1차 원문에 서 있지만 **법률 자문은 아니다**. 특히
// basis 가 civil-capacity 인 행(법에 숫자가 없어 민법 성년으로 돌아간 보수값)은
// 자문으로 낮출 여지가 있다. 낮출 때 필요한 증거 기준은 위에 적은 그대로다.
// (문서화됨: docs/CONSTRAINTS.md C10)

import { CONSENT_AGE_TABLE, type ConsentAgeBasis, type ConsentAgeRow } from "./consent-age-table";
import { deviceRegionCode } from "./device-region";

export { CONSENT_AGE_TABLE, CONSENT_AGE_TABLE_RECHECK_BY, CONSENT_AGE_TABLE_SOURCE } from "./consent-age-table";
export type { ConsentAgeBasis, ConsentAgeRow } from "./consent-age-table";

/**
 * 서버가 법역과 무관하게 거부하는 나이. 이 파일은 이 값을 **읽기만** 한다 —
 * 올리거나 내리는 것은 마이그레이션이고 Simon 결정 사항이다.
 */
export const SERVER_AGE_FLOOR = 14;

/**
 * 나라를 모를 때 쓰는 값. **18 이다.**
 *
 * 16 이 아닌 이유: r51 표에서 16 을 넘는 행이 23개(태국 20 · 나머지 18)다.
 * 그 나라 사람의 지역이 안 읽히면 16~17세를 그 나라 법 기준 미달로 받게 된다.
 * 18 이면 넘는 행이 하나(태국 20)로 줄고, 그 하나는 FALLBACK_SHORTFALL 에
 * 이름과 이유를 적어 **명시적으로 승인**한다.
 *
 * 20 이 아닌 이유: 거의 모든 나라의 성인(18~19세)을 "지역을 못 읽었다"는 이유로
 * 막게 된다. 비용이 이득을 압도한다.
 *
 * 14 가 아닌 이유: Simon 이 "일관 14세는 안 된다"고 직접 닫았다(2026-09-20).
 */
export const FALLBACK_CONSENT_AGE = 18;

/**
 * 폴백보다 **높은** 행. 폴백이 이들을 덮지 못한다는 사실을 이름과 이유로
 * 승인해 둔 목록이고, 빈 목록이 목표가 아니다.
 *
 * 검사(consent-age.test.ts)가 양방향으로 문다: 폴백보다 높은 행이 여기 없으면
 * 빨강이고(새 행이 조용히 넘어서는 것을 막는다), 여기 있는데 실제로는 높지
 * 않아도 빨강이다(승인이 낡는 것을 막는다).
 */
// ⚠ 값만 영어로 쓴다. 화면에 안 나가는 문자열이지만 **문자열이라** `korean-in-code`
// 가드가 읽는다 — 한국어를 넣으려면 그 가드의 면제 목록을 건드려야 하고, 이건 거기
// 올릴 만한 종류(프롬프트 · 매칭 패턴 · 개념 정본)가 아니다. 뜻은 바로 위 주석에
// 한국어로 있다.
export const FALLBACK_SHORTFALL: Readonly<Record<string, string>> = Object.freeze({
  TH:
    "Thailand 20. PDPA s.20 ties a minor's consent to the Civil and Commercial Code s.19 " +
    "(majority at 20), so this is a conservative reading, not a stated consent age. Signing " +
    "up for a free app is arguable as an s.22-24 independent act, so the fallback was not " +
    "raised to 20; a Thai device whose region IS readable still gets the row value, 20.",
});

/**
 * 층이 어디서 왔는가. **세 경우를 갈라 두는 것이 이 타입의 존재 이유다.**
 *
 * - `country-row`        지역이 읽혔고 그 나라에 행이 있다. 표의 값이 간다.
 * - `country-no-row`     지역이 읽혔지만 조사 범위 밖이다(r51 T3). 폴백이 간다.
 * - `region-unreadable`  지역 자체를 못 읽었다. 폴백이 간다.
 *
 * 지금은 뒤의 둘이 **같은 숫자**로 가지만 같은 경우가 아니다. 거주국 자기신고로
 * 구제할 수 있는 것은 `region-unreadable` 뿐이고(나라를 아는 사람에게 나라를
 * 다시 묻는 것은 신호를 낮추는 짓이다), 표를 넓혀서 줄일 수 있는 것은
 * `country-no-row` 뿐이다. 한 코드 경로로 뭉개면 다음 라운드가 둘을 못 가른다.
 */
export type FloorSource = "country-row" | "country-no-row" | "region-unreadable";

/** 한 사용자에게 적용되는 자기동의 층과, 그 층이 어디서 왔는지. */
export interface ConsentFloor {
  /** 가입 게이트가 쓰는 값. = max(법정값 또는 폴백, SERVER_AGE_FLOOR). */
  readonly effectiveAge: number;
  /** 법이 말하는 값. 행이 적용되지 않았으면 null — 폴백은 법이 아니다. */
  readonly statutoryAge: number | null;
  /** 값을 낸 ISO 3166-1 alpha-2. 지역을 못 읽었으면 null. */
  readonly country: string | null;
  readonly source: FloorSource;
  /** 표의 근거 유형. 행이 적용되지 않았으면 null. */
  readonly basis: ConsentAgeBasis | null;
  /** 이 행의 입법이 움직이는 중인가. 재확인 기한은 CONSENT_AGE_TABLE_RECHECK_BY. */
  readonly watch: boolean;
  /** 운영자 핀(EXPO_PUBLIC_JURISDICTION)으로 온 나라인가. QA/스테이징 전용. */
  readonly pinned: boolean;
}

/** 법정 값에 서버 하한을 씌운다. 게이트가 실제로 비교하는 수를 만드는 유일한 곳. */
export function effectiveAgeFor(statutoryAge: number): number {
  return Math.max(statutoryAge, SERVER_AGE_FLOOR);
}

/** 나라를 모를 때의 층. 세 경우 중 둘이 여기로 오고, 둘은 source 로 구분된다. */
function fallbackFloor(country: string | null, source: FloorSource): ConsentFloor {
  return {
    effectiveAge: effectiveAgeFor(FALLBACK_CONSENT_AGE),
    statutoryAge: null,
    country,
    source,
    basis: null,
    watch: false,
    pinned: false,
  };
}

/**
 * ISO 3166-1 alpha-2 -> 그 나라에 적용되는 층.
 *
 * 이 함수가 `jurisdictionForCountry()` 를 대체한다. 옛 함수는 나라를 네 덩어리
 * 중 하나로 접고 모르는 나라에는 null 을 줘서, **"모른다"와 "읽지 못했다"가
 * 호출부에서 같은 값**이 됐다. 이제 그 둘이 서로 다른 `source` 로 나온다.
 *
 * 2글자가 아닌 입력(빈 문자열 · `"KOR"` · null)은 "읽지 못했다"로 본다 — 나라로
 * 쓸 수 없는 신호이고, 그 사람이 어느 나라 사람인지에 대해 아무것도 말해 주지
 * 않는다는 점에서 null 과 같다.
 */
export function consentFloorForCountry(country?: string | null): ConsentFloor {
  const cc = (country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return fallbackFloor(null, "region-unreadable");

  // cc 는 대문자 2글자로 이미 좁혀졌다 — Object.prototype 의 어떤 이름과도 겹칠
  // 수 없으므로 평범한 색인으로 충분하다. 타입에는 undefined 를 명시한다:
  // Record<string, T> 색인은 기본 설정에서 undefined 를 숨긴다.
  const row: ConsentAgeRow | undefined = CONSENT_AGE_TABLE[cc];
  if (!row) return fallbackFloor(cc, "country-no-row");

  return {
    effectiveAge: effectiveAgeFor(row.age),
    statutoryAge: row.age,
    country: cc,
    source: "country-row",
    basis: row.basis,
    watch: row.watch,
    pinned: false,
  };
}

/** 자기동의 층의 숫자. 층이 없으면(인자 미전달) 나라를 모르는 것과 같다. */
export function digitalConsentAge(floor?: ConsentFloor | null): number {
  return floor ? floor.effectiveAge : effectiveAgeFor(FALLBACK_CONSENT_AGE);
}

/** `age` 가 층 아래라 법정대리인 동의가 필요한가. */
export function requiresGuardianConsent(age: number, floor?: ConsentFloor | null): boolean {
  return age < digitalConsentAge(floor);
}

/**
 * "이 사용자에게는 어느 나라의 규칙이 적용되는가" 의 **단일 이음매**. 게이트는
 * 흩어진 리터럴 대신 전부 여기를 지난다.
 *
 * 순서: 운영자 핀(EXPO_PUBLIC_JURISDICTION, babel 이 인라인하도록 process.env 를
 * 직접 읽는다) → 기기 지역(deviceRegionCode) → 폴백.
 *
 * **이름은 그대로 두고 반환값만 바꿨다.** 소비처 두 곳(`src/lib/supabase/auth.ts`
 * 의 MIN_SELF_CONSENT_AGE · `src/app/_layout.tsx` 의 분석 동의)과 법무 문서가 이
 * 이름으로 인용하고 있고, check:constraints 의 C10 검사도 이 선언 문자열을
 * 찾는다. 바뀐 것은 "네 덩어리 중 하나"가 아니라 **나라 + 그 나라의 층**을
 * 돌려준다는 것이다.
 *
 * ⚠ 핀은 이제 **나라 코드**를 받는다. 대문자 두 글자면 그대로 나라로 읽으므로
 * 표에 없는 나라를 찍어 `country-no-row` 경로도 시험할 수 있다. 예외는 하나 —
 * 옛 버킷 값 `EU` 는 ISO 3166-1 의 나라가 아니라 예외 유보 코드라 나라로 읽지
 * 않고 **핀이 없던 것으로 친다**. 유럽을 시험하려면 회원국을 찍는다
 * (`DE` 16 · `FR` 15 · `AT` 14). 형식이 안 맞는 핀도 같다.
 *
 * ⚠ 이것은 여전히 거주 증명이 아니다(device-region.ts 가 스스로 적는다). 기기
 * 지역은 설정이고, 따라 움직이고, 바꿀 수 있다 — 옆에 있는 자기신고 생년월일과
 * 같은 급의 신호이고 같은 방식으로 쓰인다. 어느 층을 적용할지 고르는 데 쓰지,
 * 누구를 검증하는 데 쓰지 않는다.
 */
export function resolveJurisdiction(): ConsentFloor {
  const pin = (process.env.EXPO_PUBLIC_JURISDICTION ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(pin) && pin !== "EU") {
    return { ...consentFloorForCountry(pin), pinned: true };
  }

  return consentFloorForCountry(deviceRegionCode());
}
