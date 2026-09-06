// 사업자 정보 푸터의 두 가지 규율을 지킨다.
//
// 1. 필수는 전부 아니면 전무 / 선택은 있으면 더한다:
//    등록 전(null) 또는 **필수 다섯**(상호·대표·주소·등록번호·대표번호) 중 하나라도
//    비면 한 줄도 그리지 않는다 - 반쯤 채워진 신원 표시(전자상거래법 제10조)는
//    없는 것보다 나쁘다. **선택 둘**(통신판매업 신고번호·개인정보 보호책임자)은
//    없을 수 있고, 없으면 그 줄만 빠진다. 2026-09-06 이전에는 일곱 칸 전부를
//    요구했는데, 그러면 신고를 안 한 사업자는 나머지 넷까지 영원히 못 띄운다.
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
  BUSINESS_OPTIONAL_FIELDS,
  BUSINESS_REQUIRED_FIELDS,
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

  test("필수 칸이 비면(공백 포함) 전체를 숨긴다", () => {
    for (const field of BUSINESS_REQUIRED_FIELDS) {
      const partial = { ...FULL, [field]: "   " };
      expect({ field, lines: businessFooterLines(partial, LABELS) }).toEqual({ field, lines: [] });
    }
  });

  test("선택 칸이 비면 그 줄만 빠지고 나머지는 뜬다", () => {
    for (const field of BUSINESS_OPTIONAL_FIELDS) {
      const partial = { ...FULL, [field]: "   " };
      const fields = businessFooterLines(partial, LABELS).map((l) => l.field);
      expect({ field, has: fields.includes(field), n: fields.length }).toEqual({ field, has: false, n: 6 });
      // 남은 줄의 순서는 목업 순서 그대로다
      expect(fields).toEqual(BUSINESS_FIELD_ORDER.filter((f) => f !== field));
    }
  });

  test("선택 칸이 다 없어도 필수는 전부 뜬다 (신고 전 · 번호 생략 사업자)", () => {
    const bare = { ...FULL } as Record<string, string>;
    for (const f of BUSINESS_OPTIONAL_FIELDS) bare[f] = "";
    const lines = businessFooterLines(bare as unknown as BusinessInfo, LABELS);
    expect(lines.map((l) => l.field)).toEqual([...BUSINESS_REQUIRED_FIELDS]);
  });

  test("필수와 선택은 일곱 칸을 정확히 나눈다", () => {
    expect([...BUSINESS_REQUIRED_FIELDS, ...BUSINESS_OPTIONAL_FIELDS].sort()).toEqual([...BUSINESS_FIELD_ORDER].sort());
  });

  test("값의 앞뒤 공백은 잘라서 그린다", () => {
    const lines = businessFooterLines({ ...FULL, phone: "  000-0000-0000  " }, LABELS);
    expect(lines[6].value).toBe("000-0000-0000");
  });
});

describe("값은 지어내지 않는다", () => {
  test("저장소의 BUSINESS_INFO 는 Simon 이 준 등록 값이다 (2026-09-06)", () => {
    expect(BUSINESS_INFO).not.toBeNull();
    expect(BUSINESS_INFO).toEqual({
      company: "하양 프로덕션",
      ceo: "배소하",
      address: "(14081) 경기도 안양시 동안구 귀인로 98번길 12",
      bizNo: "205-10-98603",
      mailOrderNo: "",
      privacyOfficer: "",
      phone: "",
    });
  });

  test("사업자등록번호는 국세청 체크섬을 통과한다", () => {
    // 오타 한 자리는 눈으로 안 잡힌다. 가중치 [1,3,7,1,3,7,1,3,5] + floor(d9*5/10).
    const digits = (BUSINESS_INFO?.bizNo ?? "").replace(/\D/g, "");
    expect(digits).toHaveLength(10);
    const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
    const sum = w.reduce((a, wi, i) => a + Number(digits[i]) * wi, 0) + Math.floor((Number(digits[8]) * 5) / 10);
    expect((10 - (sum % 10)) % 10).toBe(Number(digits[9]));
  });

  test("지금 화면에 실제로 뜨는 줄: 상호·대표·주소·사업자등록번호 넷", () => {
    const lines = businessFooterLines(BUSINESS_INFO, LABELS);
    expect(lines.map((l) => l.field)).toEqual(["company", "ceo", "address", "bizNo"]);
    // 대표번호는 Simon 지시로 생략, 신고번호·개인정보 담당은 미전달이라 줄이 없다.
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
  // #1533 이 이 화면을 dds-auth-screens.tsx 에서 들어내 자기 파일로 옮겼다.
  // 푸터는 화면을 따라가야 하므로 검사도 따라간다 — 지키는 대상(동의 링크 아래에
  // 사업자 정보 푸터가 붙는다)은 그대로다. 추출본에는 푸터가 딸려오지 않았고,
  // 이 검사가 통합 중에 그걸 잡았다.
  const src = readFileSync(
    resolve(__dirname, "../../../screens/deepspace/dds-sign-in-screen.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const start = src.indexOf("export function DeepSpaceSignInDesignScreen");
  const end = src.indexOf("\nexport function", start + 1);
  const body = src.slice(start, end === -1 ? src.length : end);

  test("옛 자리에는 재수출만 남는다", () => {
    // 두 벌이 남으면 한쪽만 고쳐서 푸터가 다시 빠질 수 있다.
    const old = readFileSync(
      resolve(__dirname, "../../../screens/deepspace/dds-auth-screens.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(old).toContain(
      'export { DeepSpaceSignInDesignScreen } from "./dds-sign-in-screen";',
    );
    expect(old).not.toContain("export function DeepSpaceSignInDesignScreen");
  });

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
    // PIXEL-CLAY 추출본의 이름으로 옮겼다. 뜻은 같다 — 가입 문은 로그인 폼
    // **아래** 버튼 하나뿐이고, 하단에 중복 안내 행을 만들지 않는다.
    expect(body).toContain("styles.signUpContent");
    expect(body).not.toContain("styles.authSignUpRow");
    expect((body.match(/router\.push\("\/sign-up"\)/g) ?? []).length).toBe(1);
  });
});
