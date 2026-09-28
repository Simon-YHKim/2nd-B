import fs from "node:fs";
import path from "node:path";

import { AccountExportCooldownError, accountExportCooldownSeconds } from "@/lib/account/export";
import { exportAccountData, type AccountExportDeps } from "../dds-account-actions";

// 내보내기 쿨다운을 "실패" 가 아니라 "몇 분 뒤" 로 말하는가.
//
// 2026-09-28 01:17 에 export-account 를 main 판으로 재배포하면서 한 계정당
// 내보내기 간격 제한이 운영에 들어갔다(0175 `claim_account_export`, 300초).
// 서버는 429 `export_cooldown` 에 기다릴 초를 `retry-after` 헤더와 본문
// `retry_after_seconds` 두 곳에 싣는다(운영 카나리아: 429 · retry-after 278).
//
// ⚠ 쿨다운은 데이터를 읽기 **전에** 소모된다. 실패하거나 공유 창을 닫고 다시
// 누르면 곧바로 429 다. 화면이 그걸 "파일을 준비하지 못했어요" 로만 말하면
// 사용자는 곧장 또 누르고, 또 막힌다. 남은 시간을 말해야 멈춘다
// (DECISIONS 26.09.28 Q-260928-07).

function response(status: number, headers: Record<string, string>, body?: unknown) {
  return {
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    clone: () => ({ json: async () => body }),
  };
}

function httpError(status: number, headers: Record<string, string> = {}, body?: unknown) {
  return Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    name: "FunctionsHttpError",
    context: response(status, headers, body),
  });
}

describe("accountExportCooldownSeconds", () => {
  test("reads the wait from retry-after on a 429", async () => {
    await expect(accountExportCooldownSeconds(httpError(429, { "retry-after": "278" }))).resolves.toBe(278);
  });

  test("falls back to the body when the header is missing", async () => {
    const error = httpError(429, {}, { error: "export_cooldown", retry_after_seconds: 91 });
    await expect(accountExportCooldownSeconds(error)).resolves.toBe(91);
  });

  test("is null for every other failure, so they stay failures", async () => {
    await expect(accountExportCooldownSeconds(httpError(503, { "retry-after": "30" }))).resolves.toBeNull();
    await expect(accountExportCooldownSeconds(httpError(429, { "retry-after": "soon" }))).resolves.toBeNull();
    await expect(accountExportCooldownSeconds(httpError(429, {}, { error: "other", retry_after_seconds: 5 }))).resolves.toBeNull();
    await expect(accountExportCooldownSeconds(new Error("network"))).resolves.toBeNull();
    await expect(accountExportCooldownSeconds(null)).resolves.toBeNull();
  });
});

function deps(overrides: Partial<AccountExportDeps>): AccountExportDeps {
  return {
    requestAccountExport: async () => { throw new Error("unused"); },
    buildExportFilename: () => "polascope-data-export.json",
    deliver: async () => undefined,
    expectedUserId: "user-a",
    isActive: () => true,
    ...overrides,
  };
}

describe("exportAccountData", () => {
  test("returns cooldown with the wait instead of failed", async () => {
    const result = await exportAccountData(deps({
      requestAccountExport: async () => { throw new AccountExportCooldownError(278); },
    }));
    expect(result).toEqual({ status: "cooldown", retryAfterSeconds: 278 });
  });

  test("still reports other errors as failed", async () => {
    const result = await exportAccountData(deps({
      requestAccountExport: async () => { throw httpError(503); },
    }));
    expect(result.status).toBe("failed");
  });
});

describe("account screen says how long to wait", () => {
  const root = path.resolve(__dirname, "../../../..");
  const screen = fs.readFileSync(path.join(root, "src/screens/deepspace/dds-account-screen.tsx"), "utf8");

  test("the screen renders the cooldown line with minutes", () => {
    expect(screen).toContain('result.status === "cooldown"');
    expect(screen).toContain('t("consent:account.export.cooldown", { minutes: exportFeedback.minutes })');
  });

  test.each(["en", "ko", "es", "pt", "id"])("%s has the cooldown line with {{minutes}}", (locale) => {
    const consent = JSON.parse(fs.readFileSync(path.join(root, `locales/${locale}/consent.json`), "utf8"));
    expect(consent.account.export.cooldown).toContain("{{minutes}}");
  });
});
