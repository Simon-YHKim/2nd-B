// 사업자 정보 표시: 전자상거래법 제10조(신원 표시)·제13조 표시의무의 auth 화면 푸터.
//
// PIXEL-CLAY auth 목적지 목업(design/pixel_clay_260825/captures/auth.png)에는
// 상호·대표·주소·사업자등록번호·통신판매업 신고번호·개인정보 담당·대표번호가 있다.
// 그 목업의 값("(주)하양집"·"김세컨"·"123-45-67890"·"2026-서울성동-0405")은
// Claude Design 의 플레이스홀더다. 법적 표시 값은 등록된 사실이어야 하므로 여기서
// 지어내지 않는다: Simon 이 실제 등록 값을 넣기 전까지 BUSINESS_INFO 는 null 이고
// 푸터는 아무것도 그리지 않는다.
//
// ⚠ 2026-09-06 정정 — "일곱 칸 전부 아니면 전무"는 너무 셌다.
// 통신판매업 신고는 안 한 사업자가 있을 수 있고(신고 전이거나 대상이 아니거나),
// 그 한 칸 때문에 상호·대표·주소·등록번호까지 **영원히 안 뜨는** 구조였다.
// 그건 표시 의무를 더 잘 지키는 게 아니라 덜 지키는 것이다. 그래서 갈랐다:
//   · 필수(REQUIRED) 다섯 - 하나라도 비면 전체를 숨긴다. 반쯤 채워진 신원 표시는
//     여전히 없는 것보다 나쁘다.
//   · 선택(OPTIONAL) 둘 - 있으면 그 줄을 더하고, 없으면 그 줄만 뺀다.
//     통신판매업 신고번호는 신고한 사업자만 갖고, 개인정보 보호책임자는 처리방침에
//     공개하는 것으로도 족하다(개인정보보호법 제30조·제31조).
// 값 자체를 지어내지 않는 규율은 그대로다.
//
// 라벨(상호/대표/...)은 로케일에 있고(deepspace:auth.business.*), 값은 여기 있다.
// 값은 등록 사실이라 로케일마다 같고, 로케일 검사(빈값 금지·영어복사 금지)를
// 법적 값에 적용할 이유가 없기 때문이다.

export interface BusinessInfo {
  /** 상호 */
  company: string;
  /** 대표자 */
  ceo: string;
  /** 사업장 주소 */
  address: string;
  /** 사업자등록번호 */
  bizNo: string;
  /** 통신판매업 신고번호 */
  mailOrderNo: string;
  /** 개인정보 보호책임자 (이름 또는 연락처) */
  privacyOfficer: string;
  /** 대표 전화 */
  phone: string;
}

export type BusinessField = keyof BusinessInfo;

/** 표시 순서. 목업과 같고, 법정 항목(상호·대표·주소·등록번호·신고번호)이 앞. */
export const BUSINESS_FIELD_ORDER: readonly BusinessField[] = [
  "company",
  "ceo",
  "address",
  "bizNo",
  "mailOrderNo",
  "privacyOfficer",
  "phone",
];

/**
 * 하나라도 비면 푸터 전체를 숨기는 칸. 전자상거래법 제10조 제1항의 신원 표시 중
 * 사업자라면 예외 없이 갖는 것들이다.
 */
export const BUSINESS_REQUIRED_FIELDS: readonly BusinessField[] = [
  "company",
  "ceo",
  "address",
  "bizNo",
];

/**
 * 없을 수 있는 칸. 비면 그 줄만 빠지고 나머지는 그대로 뜬다.
 *
 * `phone` 이 여기 있는 것은 **Simon 지시**다 (2026-09-06: 대표번호 "생략").
 * ⚠ 전화번호는 전자상거래법 제10조 제1항이 열거하는 표시 항목이다. 지금 화면에는
 * 그 줄이 없다 - 값이 생기면 여기 넣기만 하면 그 줄이 살아난다. 이건 코드가 정할
 * 일이 아니라 사업자가 정할 일이라 지시대로 두고 사실만 적어 둔다.
 */
export const BUSINESS_OPTIONAL_FIELDS: readonly BusinessField[] = [
  "mailOrderNo",
  "privacyOfficer",
  "phone",
];

export type BusinessLabels = Record<BusinessField, string>;

/**
 * 등록된 사업자 정보. **null = 아직 등록 전** -> 푸터를 그리지 않는다.
 * 실제 값은 Simon 만 넣는다. 추정·목업 값 금지.
 *
 * 2026-09-06 Simon 이 등록 값을 전달했다. 넣지 않은 셋은 **없어서** 비운 것이다:
 *   · phone        - 지시로 생략(위 BUSINESS_OPTIONAL_FIELDS 주석 참조)
 *   · mailOrderNo  - 통신판매업 신고번호 미전달
 *   · privacyOfficer - 미전달(개인정보 처리방침에는 별도로 공개된다)
 * 우편번호(14081)는 별도 칸이 없어 주소 앞에 한국 표준 표기로 붙였다.
 */
export const BUSINESS_INFO: BusinessInfo | null = {
  company: "하양 프로덕션",
  ceo: "배소하",
  address: "(14081) 경기도 안양시 동안구 귀인로 98번길 12",
  bizNo: "205-10-98603",
  mailOrderNo: "",
  privacyOfficer: "",
  phone: "",
};

export interface BusinessFooterLine {
  field: BusinessField;
  label: string;
  value: string;
}

/**
 * 푸터에 그릴 줄 목록.
 *
 * - 정보가 없거나 **필수 칸** 하나라도 비면 빈 배열이다(화면은 아무것도 그리지 않는다).
 * - **선택 칸**이 비면 그 줄만 빠진다. 순서는 BUSINESS_FIELD_ORDER 그대로다.
 */
export function businessFooterLines(info: BusinessInfo | null | undefined, labels: BusinessLabels): BusinessFooterLine[] {
  if (!info) return [];
  const valueOf = (field: BusinessField): string => (info[field] ?? "").trim();
  for (const field of BUSINESS_REQUIRED_FIELDS) {
    if (!valueOf(field)) return [];
  }
  const lines: BusinessFooterLine[] = [];
  for (const field of BUSINESS_FIELD_ORDER) {
    const value = valueOf(field);
    if (!value) continue; // 선택 칸만 여기 닿는다 - 필수는 위에서 걸렀다
    lines.push({ field, label: labels[field], value });
  }
  return lines;
}
