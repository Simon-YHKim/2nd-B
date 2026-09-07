import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// 동의 원장 쓰기가 실패했는데 화면이 기능을 켰다.
//
// `recordConsentBestEffort` 는 세 번 재시도한 뒤 실패를 **던지지 않고 돌려준다.**
// 그 함수 자신의 주석이 계약을 못박는다:
//
//   "PIPA accountability: a lost consent record is a compliance gap ...
//    We still don't block account creation -- the caller acts on the returned `false`."
//
// ⚠ **호출자가 그 false 에 반응하지 않는다.** 추천 토글은 결과를 버리고 그대로
// `setRecOn(true)` 로 간다. 그러면 개인화는 켜져 있는데 append-only 원장에는
// 그 사람이 동의했다는 행이 없다 - 그 writer 가 존재하는 이유인 바로 그 공백이다.
//
// 던져진 실패는 이미 처리된다(`catch` → `setRecError(true)`). 처리되지 않는 것은
// **보고된** 실패다. 이 저장소가 오늘 네 번 만난 모양과 같다.
//
// 되돌리기가 과하지 않은 이유: 이 함수는 **이미** 같은 일을 한다 - 세션이 바뀌면
// `savePrivacyPrefs(..., { recommendations: false })` 로 되돌린다. 동의 기록 없이
// 켜 두는 것이 그 가드들이 막는 것과 같은 종류의 상태다.
//
// 화면을 렌더하지 않고 실제 함수 선언을 AST 로 떼어 inert 컨텍스트에서 돌린다.
const FILE = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const OWNER = "user-a";

function enableFn(context: Record<string, unknown>) {
  const source = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
  const ast = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let text = "";
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "enableRecommendations") text = node.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!text) throw new Error("enableRecommendations 선언을 찾지 못했다");
  const js = ts.transpileModule(`${text}\nconst run = enableRecommendations;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as () => Promise<void>;
}

function harness(options: { consentRecorded?: boolean; consentThrows?: boolean } = {}) {
  const calls = {
    saved: [] as boolean[],
    recOn: [] as boolean[],
    recError: [] as boolean[],
    consentArgs: [] as unknown[],
  };
  const prefsRef = { current: { recommendations: false } as Record<string, unknown> };
  const context: Record<string, unknown> = {
    userId: OWNER, busy: false, ko: true,
    minorRef: { current: false },
    prefsUserRef: { current: OWNER as string | null },
    privacyMountedRef: { current: true },
    activeUserRef: { current: OWNER as string | null },
    prefsRef,
    setBusy: () => undefined,
    setUnderstanding: () => undefined,
    setRecOn: (on: boolean) => { calls.recOn.push(on); },
    setRecError: (on: boolean) => { calls.recError.push(on); },
    fetchPrivacyPrefs: async () => ({ recommendations: false }),
    savePrivacyPrefs: async (_id: string, prefs: { recommendations: boolean }) => {
      calls.saved.push(prefs.recommendations);
    },
    recordRecommendationsConsent: async (args: unknown) => {
      calls.consentArgs.push(args);
      if (options.consentThrows) throw new Error("ledger unreachable");
      return options.consentRecorded !== false;
    },
  };
  return { run: enableFn(context), calls, prefsRef };
}

test("원장에 기록됐으면 켜고, 오류를 띄우지 않는다", async () => {
  const screen = harness({ consentRecorded: true });
  await screen.run();
  expect(screen.calls.saved).toEqual([true]);
  expect(screen.calls.recOn).toEqual([true]);
  expect(screen.calls.recError.filter(Boolean)).toEqual([]);
});

test("원장 쓰기가 false 를 돌려주면 켜지 않는다", async () => {
  // 재시도까지 다 하고 실패를 **보고**한 경우. 예외가 아니라 반환값이다.
  const screen = harness({ consentRecorded: false });
  await screen.run();
  expect(screen.calls.recOn).toEqual([]);
});

test("원장 쓰기가 false 면 켜 뒀던 설정을 되돌린다", async () => {
  // 이 함수가 세션 가드에서 이미 하는 것과 같은 되돌리기다.
  const screen = harness({ consentRecorded: false });
  await screen.run();
  expect(screen.calls.saved).toEqual([true, false]);
  expect(screen.prefsRef.current.recommendations).toBe(false);
});

test("원장 쓰기가 false 면 사용자에게 말한다", async () => {
  const screen = harness({ consentRecorded: false });
  await screen.run();
  expect(screen.calls.recError.filter(Boolean)).toEqual([true]);
});

test("던져진 실패는 지금까지처럼 오류로 처리된다", async () => {
  // 이 경로는 이미 동작한다. 보고된 실패를 고치다가 같이 부수지 않도록 고정한다.
  const screen = harness({ consentThrows: true });
  await screen.run();
  expect(screen.calls.recOn).toEqual([]);
  expect(screen.calls.recError.filter(Boolean)).toEqual([true]);
});

test("writer 가 계약을 문서화하고 있다 - 이 검사가 지키는 것이 그 계약이다", () => {
  const writer = fs.readFileSync(path.join(process.cwd(), "src/lib/supabase/consent.ts"), "utf8");
  // 주석이 줄바꿈으로 나뉘어 있어 한 줄에 있는 조각을 본다.
  expect(writer).toContain("the caller acts on the");
  expect(writer).toContain("a lost consent record is a compliance gap");
});
