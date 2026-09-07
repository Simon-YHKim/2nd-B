import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// 롤백 스킨의 내보내기가 세션이 바뀐 뒤에도 파일을 건네준다.
//
// 같은 파일이 이미 규칙을 알고 있다. 삭제 경로(account.tsx:150-158)는 이렇게 쓴다:
//
//   if (!mounted.current) return;
//   if (activeUserRef.current !== targetUserId) { ...; return; }
//   // "never sign out a newly active B session after an A deletion resolves late"
//
// 그런데 40줄 아래 내보내기 경로는 셋 다 안 한다:
//   1. 전달이 **무조건** 일어난다. `mounted.current` 검사는 그 뒤의 setState 만 막는다.
//      A 가 로그아웃하고 B 가 로그인해도 A 의 전체 계정 번들(모든 테이블 + 원문
//      클리핑)이 그 기기에 내려받아지고, 네이티브에서는 공유 시트가 열린다.
//   2. 돌아온 번들의 `user_id` 를 안 본다. 픽셀클레이 셸은 이 검사를 두고 주석에
//      "a misrouted edge-function response containing another user's private data"
//      라고 적어 뒀다.
//   3. 시간 제한이 없다. 멈춘 연결에서 `exporting` 이 영영 참으로 남고, 늦게 온
//      응답은 그래도 전달된다.
//
// ⚠ 이 셸은 배포에서 켜져 있지 않다. 그런데 존재 이유가 **롤백**이다 - 켤 수 있게
// 두는 것이 목적인 화면이다. 켰을 때 남의 내보내기를 건네는 것은 낡은 스킨보다 나쁘다.
//
// 화면을 렌더하지 않고 실제 콜백 선언만 AST 로 떼어 inert 컨텍스트에서 돌린다.
const FILE = "src/app/account.tsx";
const OWNER = "user-a";
const OTHER = "user-b";

function bundleFor(userId: string) {
  return {
    schema_version: 1, kind: "2nd-b-account-export",
    exported_at: "2026-09-07T00:00:00.000Z", user_id: userId,
    tables: { users: {} }, storage: [], excluded: {}, errors: {},
  };
}

/** 파일에 실제로 있는 onExportData 콜백을 그대로 떼어 온다. 재구현이 아니다. */
function exportCallback(context: Record<string, unknown>) {
  const source = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
  const ast = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = "";
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "onExportData"
      && node.initializer && ts.isCallExpression(node.initializer)) {
      expression = node.initializer.arguments[0]!.getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!expression) throw new Error("onExportData 선언을 찾지 못했다");
  const js = ts.transpileModule(`const run = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as () => void;
}

interface HarnessOptions {
  bundleOwner?: string;
  switchSessionDuringRequest?: boolean;
  neverResolves?: boolean;
  partial?: boolean;
}

function harness(options: HarnessOptions = {}) {
  const calls = { delivered: [] as string[], shared: [] as string[], notes: [] as unknown[], failedItems: [] as number[] };
  const mounted = { current: true };
  const activeUserRef = { current: OWNER as string | null };
  const actions = require("@/screens/deepspace/dds-account-actions") as typeof import("@/screens/deepspace/dds-account-actions");
  const accountExport = require("@/lib/account/export") as typeof import("@/lib/account/export");

  const context: Record<string, unknown> = {
    userId: OWNER, exporting: false,
    mounted, activeUserRef,
    setExporting: () => undefined,
    setExportNote: (note: unknown) => { calls.notes.push(note); },
    setExportFailedItems: (count: number) => { calls.failedItems.push(count); },
    requestAccountExport: async () => {
      if (options.switchSessionDuringRequest) activeUserRef.current = OTHER;
      if (options.neverResolves) return new Promise(() => undefined);
      const bundle = bundleFor(options.bundleOwner ?? OWNER);
      if (options.partial) {
        bundle.errors = { personas: "permission denied" } as Record<string, string>;
        bundle.storage = [{ path: "user-a/one.md", error: "download_failed" }] as unknown as never[];
      }
      return bundle;
    },
    buildExportFilename: accountExport.buildExportFilename,
    summarizeAccountExport: accountExport.summarizeAccountExport,
    exportAccountData: actions.exportAccountData,
    ACCOUNT_EXPORT_TIMEOUT_MS: actions.ACCOUNT_EXPORT_TIMEOUT_MS,
    Platform: { OS: "web" },
    Blob: class { constructor(readonly parts: unknown[]) {} },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined },
    document: {
      createElement: () => ({
        set href(_v: string) { /* ignored */ },
        set download(name: string) { calls.delivered.push(name); },
        click: () => undefined,
      }),
    },
    Share: { share: async ({ message }: { message: string }) => { calls.shared.push(message); } },
    console: { warn: () => undefined },
  };
  return { run: exportCallback(context), calls, activeUserRef, mounted };
}

const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

test("깨끗한 경로는 그대로 전달하고 done 을 남긴다", async () => {
  const screen = harness();
  screen.run();
  await settle();
  expect(screen.calls.delivered).toHaveLength(1);
  expect(screen.calls.notes).toContain("done");
});

test("요청 중에 세션이 바뀌면 아무것도 건네지 않는다", async () => {
  // A 가 내보내기를 누르고, 응답이 오기 전에 B 로 바뀐다.
  const screen = harness({ switchSessionDuringRequest: true });
  screen.run();
  await settle();
  expect(screen.calls.delivered).toEqual([]);
  expect(screen.calls.shared).toEqual([]);
});

test("남의 소유로 돌아온 번들은 건네지 않는다", async () => {
  // 잘못 라우팅된 엣지 함수 응답. 픽셀클레이 셸이 두 번째 경계로 두는 그 검사다.
  const screen = harness({ bundleOwner: OTHER });
  screen.run();
  await settle();
  expect(screen.calls.delivered).toEqual([]);
  expect(screen.calls.shared).toEqual([]);
  expect(screen.calls.notes).toContain("failed");
});

test("멈춘 연결에서 영영 기다리지 않는다", async () => {
  jest.useFakeTimers();
  try {
    const screen = harness({ neverResolves: true });
    screen.run();
    await Promise.resolve();
    jest.advanceTimersByTime(60_000);
    await settle();
    expect(screen.calls.notes).toContain("failed");
    expect(screen.calls.delivered).toEqual([]);
  } finally {
    jest.useRealTimers();
  }
});

test("서버가 다 못 읽은 번들은 partial 로 보고한다 - done 이 아니다", async () => {
  // #1688 이 픽셀클레이 셸에서 고친 것과 같은 층이다. 요약을 이미 받고 있으면서
  // 무시하면 그 결함을 이 셸에 새로 만드는 셈이다.
  const screen = harness({ partial: true });
  screen.run();
  await settle();
  expect(screen.calls.delivered).toHaveLength(1);
  expect(screen.calls.notes).toContain("partial");
  expect(screen.calls.notes).not.toContain("done");
  expect(screen.calls.failedItems).toEqual([2]);
});

test("이 파일의 삭제 경로가 이미 같은 규칙을 쓰고 있다", () => {
  // 이 검사가 있는 이유: 결함은 능력 부재가 아니라 **같은 파일 안의 불일치**였다.
  const source = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
  expect(source).toContain("if (activeUserRef.current !== targetUserId) {");
  expect(source).toMatch(/activeUserRef\.current === requestedUser|activeUserRef\.current !== requestedUser/);
});
