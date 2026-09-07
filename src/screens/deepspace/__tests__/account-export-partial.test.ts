import fs from "node:fs";
import path from "node:path";

import { exportAccountData, type AccountExportDeps } from "../dds-account-actions";

// 내보내기가 "부분적으로" 돌아왔을 때 화면이 그걸 말하는가.
//
// `export-account` Edge Function 은 실패를 던지지 않고 **보고**한다:
//   errors            테이블별 읽기 실패 (errors['personas'] = ...)
//   storage[].error   파일별 내려받기 실패
//   errors['raw-clippings:list']  목록 실패 - 여기서 루프를 break 하므로
//                     그 뒤 클리핑은 조용히 빠진다
// 함수 주석이 그렇게 하기로 명시했다: "never fail the export on a Storage
// hiccup (the structured DB export above is the rights-grade payload)".
// 계속 가는 것은 의도다. 문제는 **그 다음**이다.
//
// ⚠ `exportAccountData` 는 전달만 성공하면 `{ status: "done" }` 을 돌려준다.
// 테이블 세 개가 통째로 빠진 번들과 완전한 번들이 **같은 값**이 된다. 화면은
// 둘을 구분할 방법이 없고 "Export ready." 라고만 말한다.
//
// 그리고 이 버튼은 **계정 삭제와 같은 화면에 있다.** 사용자가 자기 데이터를
// 다 받았다고 믿고 계정을 지우면, 빠진 테이블은 되돌아오지 않는다.
//
// 옆 계약 파일이 원칙은 이미 적어 뒀다 - "surfaces request and delivery
// failures **without a false success**". 다만 그 검사는 **던져진** 실패만
// 본다. **보고된** 부분 실패에는 그 원칙이 적용되지 않았다.

const CLEAN = {
  schema_version: 1,
  kind: "2nd-b-account-export",
  exported_at: "2026-09-07T00:00:00.000Z",
  user_id: "user-a",
  tables: { users: {}, records: [] },
  storage: [{ path: "user-a/one.md", markdown: "# one" }],
  excluded: { ai_audit_log: "hashes only" },
  errors: {},
};

function deps(bundle: unknown, overrides: Partial<AccountExportDeps> = {}): AccountExportDeps {
  return {
    requestAccountExport: jest.fn().mockResolvedValue(bundle),
    buildExportFilename: jest.fn().mockReturnValue("account.json"),
    deliver: jest.fn().mockResolvedValue(undefined),
    expectedUserId: "user-a",
    isActive: () => true,
    ...overrides,
  } as AccountExportDeps;
}

const partial = {
  ...CLEAN,
  storage: [
    { path: "user-a/one.md", markdown: "# one" },
    { path: "user-a/two.md", error: "download_failed" },
  ],
  errors: { personas: "permission denied", "raw-clippings:list": "timeout" },
};

test("서버가 다 못 읽은 번들이 깨끗한 번들과 같은 값으로 끝나지 않는다", async () => {
  const clean = await exportAccountData(deps(CLEAN));
  const degraded = await exportAccountData(deps(partial));
  // 이 둘이 같으면 화면이 구분할 재료 자체가 없다.
  expect(degraded).not.toEqual(clean);
});

test("부분 실패의 개수가 화면까지 나온다", async () => {
  const result = await exportAccountData(deps(partial));
  expect(result.status).toBe("done");
  // errors 2건 + storage 실패 1건 = 3
  expect(result).toMatchObject({ summary: { failedItems: 3 } });
});

test("깨끗한 번들은 실패 0 으로 보고된다 - 경고가 상시로 뜨지 않는다", async () => {
  const result = await exportAccountData(deps(CLEAN));
  expect(result).toMatchObject({ summary: { failedItems: 0, tableCount: 2, fileCount: 1 } });
});

test("던져진 실패는 여전히 failed 다 - 부분 보고와 섞이지 않는다", async () => {
  const error = new Error("edge unavailable");
  const result = await exportAccountData(deps(CLEAN, { requestAccountExport: jest.fn().mockRejectedValue(error) }));
  expect(result).toEqual({ status: "failed", error });
});

describe("문구가 페이로드보다 많이 약속하지 않는다", () => {
  // 함수는 10개 범주를 일부러 제외하고 그 목록을 `excluded` 로 돌려준다
  // (ai_audit_log · guardian_consents · peer_observations · informant_consents ·
  // 결제 기록 등). 완전한 실행에서도 "everything" 은 사실이 아니다.
  const bundleFor = (code: string) =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), "locales", code, "consent.json"), "utf8"))
      .account.export as Record<string, string>;

  test("영어 문구가 everything/complete 를 약속하지 않는다", () => {
    const en = bundleFor("en");
    expect(en.body).not.toMatch(/everything/i);
    expect(en.buttonHint).not.toMatch(/\bcomplete\b/i);
  });

  test("한국어 문구가 모든/전체 를 약속하지 않는다", () => {
    const ko = bundleFor("ko");
    expect(ko.body).not.toMatch(/모든 데이터/);
    expect(ko.buttonHint).not.toMatch(/전체/);
  });

  test("부분 실패를 말할 문구가 5개 로케일에 다 있다", () => {
    for (const code of ["en", "ko", "es", "pt", "id"]) {
      const copy = bundleFor(code);
      expect(typeof copy.donePartial).toBe("string");
      expect(copy.donePartial).toContain("{{count}}");
      // 복수형 키(_one/_other)를 쓰지 않는 저장소라 개수가 1일 때 "1 items"
      // 같은 문장이 나오지 않도록, 수를 명사와 붙여 쓰지 않는다.
      expect(copy.donePartial).not.toMatch(/\{\{count\}\}\s+[A-Za-z]/);
    }
  });

  test("화면이 실패가 있을 때만 부분 문구를 쓴다", () => {
    const screen = fs.readFileSync(
      path.join(process.cwd(), "src/screens/deepspace/dds-account-screen.tsx"), "utf8",
    );
    expect(screen).toContain("account.export.donePartial");
    expect(screen).toMatch(/failedItems\s*>\s*0/);
  });
});
