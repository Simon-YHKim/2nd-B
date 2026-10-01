// 생성물 — 손으로 고치지 말 것 (Simon 지침 §0-2).
//
//   원본        r51 조사의 age-table.json (63개국 · 값이 있는 행의 1차 출처 100%)
//               sha256 f0967a0f2aa85937f1131702fa7c6846cb6f4e3da6784763cb3f48d053edc2dc
//               schema r51-age-table/1 · measuredAt 2026-09-21 00:46 KST
//   생성 스크립트 reports/vibe-r260920/r53-jurisdiction-table/gen/build-consent-age-table.mjs
//   생성        2026-09-21 01:04 KST
//
// 고치는 법: **원본 JSON 을 고치고 스크립트를 다시 돌린다.** 이 파일을 직접
// 고치면 다음 생성에서 지워지고, 그 사이에 표와 원본이 갈라진다. 생성기는
// 원본을 검사한 뒤에만 쓴다(행 63 · cc 중복 없음 · basis 셋 · 18 미만 행의
// 1차 근거 · effectiveAge = max(age, 14) 일치).
//
// 조문 · 축자 인용 · URL · 확인일 · 개정 이력은 원본 JSON 과 같은 폴더의
// rows-detail.md 에 있다. **런타임 번들에는 코드가 실제로 쓰는 셋만 싣는다** —
// 근거 전문을 앱에 태울 이유가 없다.
//
// age 의 뜻: 가입할 때 부모 · 법정대리인의 관여 없이 **본인이** 개인정보 처리에
// 동의할 수 있는 최소 연령. 민법상 성년 · 계약 능력 · SNS 최소연령은 다른 축이라
// 섞지 않았다. 서버 하한(14)은 여기 반영돼 있지 않다 — 그 계산은 consent-age.ts 가
// 한 곳에서 한다(effectiveAgeFor).
//
// 값의 분포 (63개국):
//   13세  12개국  BE EE FI GB IS LV MT NO PT SE SG US
//   14세  10개국  AT BG CA CN CY ES IT KR LT PE
//   15세   6개국  AU CZ DK FR GR SI
//   16세  12개국  DE HR HU IE JP LI LU NL PL RO SK VN
//   18세  22개국  AE AR BR CH CL CO EG HK ID IL IN MX MY NG NZ PH RU SA TR TW UA ZA
//   20세   1개국  TH
//
// ⚠ watch: true 인 14개 행은 입법이 움직이는 중이다. 재확인 기한은
// CONSENT_AGE_TABLE_RECHECK_BY, 사유는 각 행의 주석. 통과하지 않은 법안을 근거로
// 행을 **미리 낮추지 말 것** — 낮춘 행이 틀리면 동의할 수 없는 사람을 받는다.

/** 값이 어디서 왔는가. `civil-capacity` 는 법에 숫자가 없어 민법 행위능력으로
 *  돌아간 **보수적 해석값**이다 — 법률 자문으로 낮출 여지가 있는 행들이다. */
export type ConsentAgeBasis = "statute" | "regulator-guidance" | "civil-capacity";

export interface ConsentAgeRow {
  /** 법이 말하는 자기동의 최소 연령. 서버 하한은 반영돼 있지 않다. */
  readonly age: number;
  readonly basis: ConsentAgeBasis;
  /** 입법이 움직이는 중 — 출시 전 재확인 대상. 사유는 행 주석. */
  readonly watch: boolean;
}

/** 이 표가 어느 조사에서 왔는지. 감사가 원본을 되찾는 데 필요한 최소한. */
export const CONSENT_AGE_TABLE_SOURCE = {
  report: "vibe-r260920 / r51-age-table",
  file: "age-table.json",
  schema: "r51-age-table/1",
  sha256: "f0967a0f2aa85937f1131702fa7c6846cb6f4e3da6784763cb3f48d053edc2dc",
  measuredAt: "2026-09-21 00:46 KST",
  countries: 63,
} as const;

/** watch 행을 다시 확인해야 하는 날. 표에서 가장 이른 예정 변경일이다. */
export const CONSENT_AGE_TABLE_RECHECK_BY = "2026-12-01";

/** ISO 3166-1 alpha-2 -> 그 나라의 자기동의 최소 연령. 없는 나라는 폴백으로 간다. */
export const CONSENT_AGE_TABLE: Readonly<Record<string, ConsentAgeRow>> = Object.freeze({
  AE: { age: 18,  basis: "civil-capacity",       watch: false }, // 아랍에미리트
  AR: { age: 18,  basis: "civil-capacity",       watch: true },  // 아르헨티나 · ⚠ 상향 법안이 16 을 명시(1948-D-2025 Art. 19 원문 확인) — 전부 위원회 초기 단계
  AT: { age: 14,  basis: "statute",              watch: false }, // 오스트리아
  AU: { age: 15,  basis: "regulator-guidance",   watch: true },  // 호주 · ⚠ Children's Online Privacy Code 등록 기한 2026-12-10 — 초안 s13(1) 도 15(1차·에이전트)
  BE: { age: 13,  basis: "statute",              watch: false }, // 벨기에
  BG: { age: 14,  basis: "statute",              watch: false }, // 불가리아
  BR: { age: 18,  basis: "civil-capacity",       watch: false }, // 브라질
  CA: { age: 14,  basis: "statute",              watch: false }, // 캐나다
  CH: { age: 18,  basis: "civil-capacity",       watch: false }, // 스위스
  CL: { age: 18,  basis: "civil-capacity",       watch: true },  // 칠레 · ⚠ ⏰ 2026-12-01 부터 Ley 19.628 Art. 16 quáter 적용 — 민감정보 기준 16(우리 앱 해당)
  CN: { age: 14,  basis: "statute",              watch: false }, // 중국
  CO: { age: 18,  basis: "statute",              watch: true },  // 콜롬비아 · ⚠ 하향 법안 계류(정부 제출 · MINCIT 2025-08-28) — 14세 이상 본인 승인. 번호 · 단계 2차
  CY: { age: 14,  basis: "statute",              watch: false }, // 키프로스
  CZ: { age: 15,  basis: "statute",              watch: false }, // 체코
  DE: { age: 16,  basis: "statute",              watch: false }, // 독일
  DK: { age: 15,  basis: "statute",              watch: false }, // 덴마크
  EE: { age: 13,  basis: "statute",              watch: false }, // 에스토니아
  EG: { age: 18,  basis: "statute",              watch: false }, // 이집트
  ES: { age: 14,  basis: "statute",              watch: true },  // 스페인 · ⚠ 상향 Proyecto 121/000052 가 14 → 16(2차) — 하원 법사위 단계(2025-11-27~) · 미통과
  FI: { age: 13,  basis: "statute",              watch: false }, // 핀란드
  FR: { age: 15,  basis: "statute",              watch: false }, // 프랑스
  GB: { age: 13,  basis: "statute",              watch: true },  // 영국 · ⚠ UK GDPR 8(2A) 위임 신설 2026-04-29(장관이 13~16 에서 변경 가능) — 규정 제정 흔적 없음
  GR: { age: 15,  basis: "statute",              watch: false }, // 그리스
  HK: { age: 18,  basis: "civil-capacity",       watch: false }, // 홍콩
  HR: { age: 16,  basis: "statute",              watch: false }, // 크로아티아
  HU: { age: 16,  basis: "statute",              watch: false }, // 헝가리
  ID: { age: 18,  basis: "statute",              watch: false }, // 인도네시아
  IE: { age: 16,  basis: "statute",              watch: false }, // 아일랜드
  IL: { age: 18,  basis: "civil-capacity",       watch: true },  // 이스라엘 · ⚠ 하향? PPL 개정 15 초안이 미성년 장을 담는다는 보도 — 초안 · 수치 비공개(2차)
  IN: { age: 18,  basis: "statute",              watch: false }, // 인도
  IS: { age: 13,  basis: "statute",              watch: false }, // 아이슬란드
  IT: { age: 14,  basis: "statute",              watch: true },  // 이탈리아 · ⚠ 상향 DDL n. 1136(상원): art. 2-quinquies 14 → 16 — 제안 단계(2차)
  JP: { age: 16,  basis: "regulator-guidance",   watch: false }, // 일본
  KR: { age: 14,  basis: "statute",              watch: true },  // 대한민국 · ⚠ 상향? 이해민 의원 개정안 보도 2026-01-22 — 동의 연령을 바꾸는지 내용 미확인(2차)
  LI: { age: 16,  basis: "statute",              watch: false }, // 리히텐슈타인
  LT: { age: 14,  basis: "statute",              watch: false }, // 리투아니아
  LU: { age: 16,  basis: "statute",              watch: false }, // 룩셈부르크
  LV: { age: 13,  basis: "statute",              watch: false }, // 라트비아
  MT: { age: 13,  basis: "statute",              watch: false }, // 몰타
  MX: { age: 18,  basis: "civil-capacity",       watch: false }, // 멕시코
  MY: { age: 18,  basis: "statute",              watch: false }, // 말레이시아
  NG: { age: 18,  basis: "statute",              watch: true },  // 나이지리아 · ⚠ NDPA s.31(5) 가 '13세 이상' 규정을 위원회에 위임 — 제정된 것을 찾지 못했다
  NL: { age: 16,  basis: "statute",              watch: false }, // 네덜란드
  NO: { age: 13,  basis: "statute",              watch: true },  // 노르웨이 · ⚠ 상향 13 → 15 공식 제안(법무부 høring 마감 2025-10-07, 2차) — 2025~26 회기 미제출
  NZ: { age: 18,  basis: "civil-capacity",       watch: false }, // 뉴질랜드
  PE: { age: 14,  basis: "statute",              watch: false }, // 페루
  PH: { age: 18,  basis: "civil-capacity",       watch: false }, // 필리핀
  PL: { age: 16,  basis: "statute",              watch: false }, // 폴란드
  PT: { age: 13,  basis: "statute",              watch: true },  // 포르투갈 · ⚠ 상향 PJL 398/XVII 3조가 16조를 16 anos 로 — 2026-02-12 일반토론 가결 · 위원회 · 미공포
  RO: { age: 16,  basis: "statute",              watch: false }, // 루마니아
  RU: { age: 18,  basis: "civil-capacity",       watch: false }, // 러시아
  SA: { age: 18,  basis: "statute",              watch: false }, // 사우디아라비아
  SE: { age: 13,  basis: "statute",              watch: false }, // 스웨덴
  SG: { age: 13,  basis: "regulator-guidance",   watch: false }, // 싱가포르
  SI: { age: 15,  basis: "statute",              watch: false }, // 슬로베니아
  SK: { age: 16,  basis: "statute",              watch: false }, // 슬로바키아
  TH: { age: 20,  basis: "civil-capacity",       watch: false }, // 태국
  TR: { age: 18,  basis: "civil-capacity",       watch: true },  // 튀르키예 · ⚠ 하향? KVKK 개정 초안이 dijital rıza yaşı 도입 예정 — 수치 비공개 · 의회 미제출(2차)
  TW: { age: 18,  basis: "civil-capacity",       watch: false }, // 대만
  UA: { age: 18,  basis: "civil-capacity",       watch: true },  // 우크라이나 · ⚠ 하향? Проєкт 8153 ст. 6 ч. 9–10 이 14 를 둔다 — 1독회 통과(2024-11-20) · 2독회 미통과
  US: { age: 13,  basis: "statute",              watch: false }, // 미국
  VN: { age: 16,  basis: "statute",              watch: false }, // 베트남
  ZA: { age: 18,  basis: "statute",              watch: false }, // 남아프리카공화국
});
