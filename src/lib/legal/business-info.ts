// 사업자 정보 표시: 전자상거래법 제10조(신원 표시)·제13조 표시의무의 auth 화면 푸터.
//
// PIXEL-CLAY auth 목적지 목업(design/pixel_clay_260825/captures/auth.png)에는
// 상호·대표·주소·사업자등록번호·통신판매업 신고번호·개인정보 담당·대표번호가 있다.
// 그 목업의 값("(주)하양집"·"김세컨"·"123-45-67890"·"2026-서울성동-0405")은
// Claude Design 의 플레이스홀더다. 법적 표시 값은 등록된 사실이어야 하므로 여기서
// 지어내지 않는다: Simon 이 실제 등록 값을 넣기 전까지 BUSINESS_INFO 는 null 이고
// 푸터는 아무것도 그리지 않는다. 일곱 칸 중 하나라도 비면 전체를 숨긴다. 반쯤
// 채워진 법정 표시는 없는 것보다 나쁘다(전부 아니면 전무).
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

export type BusinessLabels = Record<BusinessField, string>;

/**
 * 등록된 사업자 정보. **null = 아직 등록 전** -> 푸터를 그리지 않는다.
 * 실제 값은 Simon 만 넣는다. 추정·목업 값 금지.
 */
export const BUSINESS_INFO: BusinessInfo | null = null;

export interface BusinessFooterLine {
  field: BusinessField;
  label: string;
  value: string;
}

/**
 * 푸터에 그릴 줄 목록. 정보가 없거나 한 칸이라도 비어 있으면 빈 배열이다:
 * 화면은 빈 배열이면 아무것도 그리지 않는다.
 */
export function businessFooterLines(info: BusinessInfo | null | undefined, labels: BusinessLabels): BusinessFooterLine[] {
  if (!info) return [];
  const lines: BusinessFooterLine[] = [];
  for (const field of BUSINESS_FIELD_ORDER) {
    const value = (info[field] ?? "").trim();
    if (!value) return [];
    lines.push({ field, label: labels[field], value });
  }
  return lines;
}
