import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import {
  dismissAccountDeletionNotice,
  getAccountDeletionNotice,
} from "../deletion-completion";
import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";

// 계정을 지운 사람이 서버가 무엇을 지웠는지 듣게 되는가.
//
// 삭제 흐름은 예전부터 영수증을 받아서 버렸다. 사용자는 종단 작업을 마친 뒤
// 로그아웃되어 로그인 폼 앞에 서고, 프로필이 지워졌는지·원문 클립이 지워졌는지·
// 무엇이 확인되지 않았는지 아무것도 듣지 못했다.
//
// ⚠ 이 검사가 있는 이유: 배선을 지우는 변이가 아무 테스트도 깨뜨리지 않았다.
// 발행 쪽을 보는 검사가 하나도 없었다는 뜻이다. 원본 하네스에 그 자리를 덮는
// 것이 있지만 그것은 로컬 삭제 모듈(purge-local-data)까지 요구해서 이 회차에
// 들어올 수 없다. 그래서 이 회차가 배선한 것만 좁게 본다.
//
// 화면 전체를 렌더하지 않고 실제 콜백 선언만 AST 로 떼어 inert 컨텍스트에서
// 돌린다. 재구현이 아니라 실제 본문이다.
const FILE = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const OWNER = "11111111-1111-4111-8111-111111111111";
const RECEIPT = {
  deleted: true as const,
  profileErased: true,
  rawClippingsErased: null,
  incomplete: [],
  unconfirmed: ["rawClippings" as const],
  complete: false,
  observedAtIso: "2026-09-07T00:00:00.000Z",
};

function deleteCallback(context: Record<string, unknown>) {
  const source = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
  const ast = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = "";
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "runDeleteAccount") expression = node.getText(ast);
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "runDeleteAccount"
      && node.initializer && ts.isCallExpression(node.initializer)) {
      expression = node.initializer.arguments[0]!.getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!expression) throw new Error("삭제 콜백 선언을 찾지 못했다");
  const js = ts.transpileModule(`const run = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as () => Promise<unknown>;
}

function harness(options: { signOutFails?: boolean; deletionFails?: boolean } = {}) {
  const calls = { purge: 0, signOut: 0, dismissAll: 0, replace: [] as string[] };
  const mounted = { current: true };
  const owner = { current: OWNER as string | null };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const completion = require("../deletion-completion") as typeof import("../deletion-completion");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const epoch = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
  const context: Record<string, unknown> = {
    userId: OWNER, delConfirm: "DELETE",
    deleteConfirmUserRef: { current: OWNER },
    deleteInFlightRef: { current: false },
    allowDeletionNavigationRef: { current: false },
    privacyMountedRef: mounted, activeUserRef: owner,
    setDeleting: () => undefined, setDelError: () => undefined,
    requestAccountDeletion: async () => {
      if (options.deletionFails) throw new Error("terminal deletion failed");
      return RECEIPT;
    },
    purgeCaptureDraftsForDeletedAccount: async () => { calls.purge += 1; },
    signOut: async () => {
      calls.signOut += 1;
      if (options.signOutFails) throw new Error("local sign-out failed");
    },
    router: { dismissAll: () => { calls.dismissAll += 1; }, replace: (to: string) => { calls.replace.push(to); } },
    createAccountDeletionCompletion: completion.createAccountDeletionCompletion,
    currentAccountEpoch: epoch.currentAccountEpoch,
    console: { warn: () => undefined },
  };
  return { run: deleteCallback(context), calls, owner };
}

beforeEach(() => {
  dismissAccountDeletionNotice();
  __resetAccountEpochForTests();
  noteResolvedOwner(OWNER);
});
afterEach(() => { dismissAccountDeletionNotice(); });

describe("삭제한 사람이 서버가 말한 것을 듣는다", () => {
  test("영수증이 알림으로 발행된다 - 버려지지 않는다", async () => {
    const { run, calls } = harness();
    await run();
    const notice = getAccountDeletionNotice();
    expect(notice).not.toBeNull();
    expect(notice?.receipt.profileErased).toBe(true);
    expect(notice?.receipt.rawClippingsErased).toBeNull();
    expect(notice?.receipt.unconfirmed).toEqual(["rawClippings"]);
    expect(calls.signOut).toBe(1);
    expect(calls.replace).toEqual(["/sign-in"]);
  });

  test("로컬 정리는 unconfirmed 로 보고한다 - 이 흐름은 검사된 정리 단계를 돌리지 않는다", () => {
    // 이 화면은 캡처 초안만 지운다. 문구가 말하는 "검사된 로컬 정리 단계" 는
    // purge-local-data 의 12개 작업이고 그것은 아직 착지하지 않았다.
    // complete 라고 쓰면 더 좁은 청소를 넓은 것처럼 말하게 된다.
    const source = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
    expect(source).toMatch(/beginSignOut\(receipt,\s*"unconfirmed"\)/);
    expect(source).not.toMatch(/beginSignOut\(receipt,\s*"complete"\)/);
  });

  test("로그아웃이 성공하면 complete, 실패하면 unconfirmed 로 남는다", async () => {
    const ok = harness();
    await ok.run();
    expect(getAccountDeletionNotice()?.localSignOut).toBe("complete");

    dismissAccountDeletionNotice();
    __resetAccountEpochForTests();
    noteResolvedOwner(OWNER);
    const bad = harness({ signOutFails: true });
    await bad.run();
    expect(getAccountDeletionNotice()?.localSignOut).toBe("unconfirmed");
  });

  test("종단 삭제가 실패하면 아무것도 발행하지 않는다", async () => {
    const { run, calls } = harness({ deletionFails: true });
    await run();
    expect(getAccountDeletionNotice()).toBeNull();
    expect(calls.signOut).toBe(0);
    expect(calls.replace).toEqual([]);
  });

  test("알림이 그 화면에서 실제로 그려진다", () => {
    const signIn = fs.readFileSync(
      path.join(process.cwd(), "src/screens/deepspace/dds-sign-in-screen.tsx"), "utf8",
    );
    expect(signIn).toContain("AccountDeletionNoticePanel");
    // 게스트 가드보다 앞에 있어야 한다. 뒤에 있으면 로딩·리다이렉트가 결과를 밀어낸다.
    expect(signIn.indexOf("AccountDeletionNoticePanel")).toBeLessThan(signIn.indexOf("if (loading)"));
  });
});
