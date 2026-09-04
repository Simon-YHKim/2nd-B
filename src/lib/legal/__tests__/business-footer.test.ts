// 사업자 정보 푸터의 두 가지 규율을 지킨다.
//
// 1. 전부 아니면 전무: 등록 전(null) 또는 일곱 칸 중 하나라도 비면 한 줄도 그리지
//    않는다. 반쯤 채워진 법정 표시(전자상거래법 제10조)는 없는 것보다 나쁘다.
// 2. 값은 지어내지 않는다: 저장소의 BUSINESS_INFO 는 Simon 이 등록 값을 넣기 전까지
//    null 이어야 한다. 목업 플레이스홀더("(주)하양집"·"김세컨")가 코드로 새어
//    들어오면 여기서 걸린다.
//
// 렌더 테스트는 이 저장소에서 막혀 있으므로(RN 0.85 upstream) 줄 생성은 순수
// 함수로, 화면 배선은 소스 스캔으로 검사한다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  BUSINESS_FIELD_ORDER,
  BUSINESS_INFO,
  businessFooterLines,
  type BusinessInfo,
  type BusinessLabels,
} from "../business-info";

const LABELS: BusinessLabels = {
  company: "상호",
  ceo: "대표",
  address: "주소",
  bizNo: "사업자등록번호",
  mailOrderNo: "통신판매업 신고번호",
  privacyOfficer: "개인정보 담당",
  phone: "대표번호",
};

const FULL: BusinessInfo = {
  company: "테스트 상호",
  ceo: "테스트 대표",
  address: "테스트 주소 1",
  bizNo: "000-00-00000",
  mailOrderNo: "0000-테스트-0000",
  privacyOfficer: "privacy@example.com",
  phone: "000-0000-0000",
};

describe("businessFooterLines: 전부 아니면 전무", () => {
  test("등록 전(null)에는 한 줄도 없다", () => {
    expect(businessFooterLines(null, LABELS)).toEqual([]);
    expect(businessFooterLines(undefined, LABELS)).toEqual([]);
  });

  test("일곱 칸이 다 있으면 목업 순서대로 일곱 줄", () => {
    const lines = businessFooterLines(FULL, LABELS);
    expect(lines.map((l) => l.field)).toEqual([...BUSINESS_FIELD_ORDER]);
    expect(lines).toHaveLength(7);
    expect(lines[0]).toEqual({ field: "company", label: "상호", value: "테스트 상호" });
    expect(lines[3]).toEqual({ field: "bizNo", label: "사업자등록번호", value: "000-00-00000" });
  });

  test("한 칸이라도 비면(공백 포함) 전체를 숨긴다", () => {
    for (const field of BUSINESS_FIELD_ORDER) {
      const partial = { ...FULL, [field]: "   " };
      expect({ field, lines: businessFooterLines(partial, LABELS) }).toEqual({ field, lines: [] });
    }
  });

  test("값의 앞뒤 공백은 잘라서 그린다", () => {
    const lines = businessFooterLines({ ...FULL, phone: "  000-0000-0000  " }, LABELS);
    expect(lines[6].value).toBe("000-0000-0000");
  });
});

describe("값은 지어내지 않는다", () => {
  test("저장소의 BUSINESS_INFO 는 등록 전이라 null 이다", () => {
    // Simon 이 실제 등록 값을 넣는 PR 에서는 이 단언을 실제 값 검증으로 바꾼다.
    expect(BUSINESS_INFO).toBeNull();
  });

  test("목업 플레이스홀더가 소스에 없다", () => {
    const src = readFileSync(resolve(__dirname, "../business-info.ts"), "utf8").replace(/\r\n/g, "\n");
    // 주석에서 '지어내지 않는다'는 설명으로 인용한 것은 허용하고, 코드 값으로
    // 들어온 것만 잡는다: 문자열 리터럴 할당 형태.
    expect(src).not.toMatch(/company:\s*"\(주\)하양집"/);
    expect(src).not.toMatch(/ceo:\s*"김세컨"/);
    expect(src).not.toMatch(/bizNo:\s*"123-45-67890"/);
  });
});

describe("사인인 화면이 푸터를 동의 링크 아래에 붙인다", () => {
  const src = readFileSync(
    resolve(__dirname, "../../../screens/deepspace/dds-auth-screens.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = src.indexOf("export function DeepSpaceSignInDesignScreen");
  const end = src.indexOf("\nexport function", start + 1);
  const body = src.slice(start, end === -1 ? src.length : end);

  test("가드가 진짜 함수 본문을 읽는다", () => {
    expect(start).toBeGreaterThan(-1);
    expect(body.length).toBeGreaterThan(500);
  });

  test("푸터가 마운트되고, 법적 동의 링크보다 아래에 있다", () => {
    const footer = body.indexOf("<BusinessFooter");
    const consent = body.indexOf("deepspace:auth.legalConsent");
    expect(footer).toBeGreaterThan(-1);
    expect(consent).toBeGreaterThan(-1);
    expect(footer).toBeGreaterThan(consent);
  });

  test("가입 문은 하나다: 로그인 아래 버튼이고, 하단 안내 행은 없다", () => {
    expect(body).toContain("styles.authSecondary");
    expect(body).not.toContain("styles.authSignUpRow");
    expect((body.match(/router\.push\("\/sign-up"\)/g) ?? []).length).toBe(1);
  });
});
