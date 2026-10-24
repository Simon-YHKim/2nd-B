import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  checkCopyEndings,
  declarativeEndings,
  endingExclusion,
  scanEndingBundles,
} from "../check-copy-endings";

const repo = resolve(__dirname, "../..");
const bundle = (file: string) => JSON.parse(readFileSync(join(repo, "locales/ko", file), "utf8"));
const scan = (file: string, value: unknown) => scanEndingBundles([{ file, bundle: value }]);

describe("B안 facts, questions and requests", () => {
  test.each([
    ["기록을 저장했어요.", "저장했어요"],
    ["아직 기록이 없어요", "없어요"],
    ["이 기능을 사용해요!", "사용해요"],
    ["자동으로 적용돼요…", "적용돼요"],
    ["완료한 상태예요。", "상태예요"],
    ["화면이 달라요\n다시 확인하세요.", "달라요"],
    ["파일이 커요\r\n다시 선택하세요.", "커요"],
    ["잠시 후 열려요.", "열려요"],
    ["새 알림이 생겨요.", "생겨요"],
    ["이곳에 보여요.", "보여요"],
    ["알림이 켜져요.", "켜져요"],
    ["진행이 멈춰요.", "멈춰요"],
    ["여기에 있어요. 저장할까요?", "있어요"],
    ["저장됐네요.", "저장됐네요"],
    ["이 앱이 저장할게요.", "저장할게요"],
  ])("flags the declarative fact in %s", (text, ending) => {
    expect(declarativeEndings(text)).toEqual([ending]);
  });

  test.each([
    "저장했습니다.", "기록 저장", "소요", "권한 필요", "개요", "가요", "아니요.", "잠시만요",
    "저장할까요?", "기록이 있나요", "어떤가요?", "저장했어요?", "정말 없어요！？",
    "선택하세요.", "다시 시도해 주세요.", "잠시 쉬셔요.",
    "「모르겠어요.」라는 답을 골랐습니다.", "‘내 기록이에요’라고 적었습니다.",
    '예: "기록을 저장했어요."', "영문: 'I saved it.'",
  ])("does not turn questions, requests, labels or quoted input into facts: %s", (text) => {
    expect(declarativeEndings(text)).toEqual([]);
  });

  test("does not hide another assertion behind a quote or question", () => {
    expect(declarativeEndings("‘모르겠어요.’를 골랐습니다. 기록이 없어요.")).toEqual(["없어요"]);
    expect(declarativeEndings("저장할까요? 이미 저장했어요.")).toEqual(["저장했어요"]);
    expect(declarativeEndings("‘닫히지 않은 인용 뒤에도 저장했어요.")).toEqual(["저장했어요"]);
  });
});

describe("approved exceptions stay narrow", () => {
  test("allows the two approved screen scopes, not their entire files", () => {
    expect(scan("profile.json", { contextImport: { future: "새로운 내용이에요." }, other: "저장했어요." }).hits)
      .toMatchObject([{ key: "other", ending: "저장했어요" }]);
    const result = scan("secondb.json", { planSuggestion: {
      reminderSavedNoReminder: "저장했어요.",
      reminderSavedReminderDenied: "예약하지 못했어요.",
      reminderSavedReminderFailed: "저장했어요.",
      oneOff: { loadFailed: "읽지 못했어요." },
      routineSavedReminderFailed: "저장했어요.",
    }, empty: "없어요." });
    expect(result.hits.map((hit) => hit.key)).toEqual(["planSuggestion.routineSavedReminderFailed", "empty"]);
    expect(scan("other.json", { contextImport: { body: "저장했어요." } }).hits).toHaveLength(1);
    expect(scan("profile.json", { contextImportExtra: { body: "저장했어요." } }).hits).toHaveLength(1);
  });

  test("retains the existing 17 version-bound consent strings but no new/repurposed ones", () => {
    const current = bundle("consent.json");
    expect(scan("consent.json", current).hits).toEqual([]);
    expect(scan("consent.json", current).excluded).toBe(17);
    current.serviceControl.saved = "새 내용도 자동 저장해요.";
    current.serviceControl.newStatus = "추가된 안내예요.";
    expect(scan("consent.json", current).hits.map((hit) => hit.key)).toEqual([
      "serviceControl.saved", "serviceControl.newStatus",
    ]);
  });

  test("allows user answers and a share message without exempting neighboring app claims", () => {
    expect(endingExclusion({ file: "interview.json", key: "drill.dontKnow", value: "모르겠어요" })).toBeTruthy();
    expect(endingExclusion({ file: "interview.json", key: "drill.dontKnow", value: "기록이 없어요" })).toBeNull();
    expect(scan("interview.json", { drill: { dontKnow: "모르겠어요", body: "모르겠어요" } }).hits)
      .toMatchObject([{ key: "drill.body" }]);
    expect(scan("peer.json", bundle("peer.json")).hits).toEqual([]);
  });

  test("day-limit fact sentences retain the normal ending policy", () => {
    const current = bundle("interview.json");
    expect(scan("interview.json", current).hits).toEqual([]);
    current.drill.dayLimit = current.drill.dayLimit.replace("사용 한도에 닿았습니다.", "사용 한도에 닿았어요.");
    expect(scan("interview.json", current).hits).toMatchObject([{ key: "drill.dayLimit", ending: "닿았어요" }]);
    expect(scan("other.json", { body: "지금까지 나눈 이야기를 저장하고 나중에 이어서 해요." }).hits).toHaveLength(1);
  });

  test("arrays and nested values are checked, not just top-level messages", () => {
    expect(scan("new.json", { a: [{ b: "저장했어요." }], count: 2 }).hits)
      .toMatchObject([{ key: "a.0.b", ending: "저장했어요" }]);
  });
});

describe("real CLI gate (temporary files, no mutations to shared locale bundles)", () => {
  let root: string;
  const script = join(repo, "scripts/check-copy-endings.ts");
  const tsx = require.resolve("tsx/cli");

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "copy-endings-"));
    mkdirSync(join(root, "locales/ko/nested"), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const write = (file: string, value: unknown) => writeFileSync(join(root, "locales/ko", file), JSON.stringify(value));

  test("passes clean copy and fails a newly introduced fact without any git/base dependency", () => {
    write("new.json", { body: "저장했습니다." });
    expect(execFileSync(process.execPath, [tsx, script], { cwd: root, encoding: "utf8" })).toContain("copy-endings PASS");
    write("nested/new.json", { body: "저장했어요." });
    const result = spawnSync(process.execPath, [tsx, script], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("locales/ko/nested/new.json:body");
    expect(result.stdout).toContain("copy-endings FAIL");
  });

  test("empty or malformed locale input cannot report PASS", () => {
    expect(() => checkCopyEndings(root, () => {})).toThrow("No Korean locale bundles");
    writeFileSync(join(root, "locales/ko/broken.json"), "{");
    const result = spawnSync(process.execPath, [tsx, script], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("PASS");
  });

  test("untrusted translation keys cannot inject GitHub workflow commands", () => {
    write("new.json", { "status\n::error::injected": "저장했어요." });
    const output: string[] = [];
    expect(checkCopyEndings(root, (line) => output.push(line))).toBe(1);
    expect(output.join("\n")).not.toMatch(/^::error/m);
    expect(output[0]).toContain("\\n::error");
  });
});

test("verify runs the separate failing endings gate and keeps the explanatory warning gate", () => {
  const scripts = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).scripts;
  expect(scripts["check:copy-endings"]).toBe("tsx scripts/check-copy-endings.ts");
  expect(scripts.verify.split(" && ")).toContain("npm run check:copy-endings");
  expect(scripts.verify.split(" && ")).toContain("npm run check:explanatory-copy");
});
