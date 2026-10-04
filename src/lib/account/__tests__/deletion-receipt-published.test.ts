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
  deletionFenced: true,
  rawClippingsErased: null,
  rawClippingsEmptyAtCheck: true,
  rawClippingsRemoved: 3,
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

function harness(
  options: {
    signOutFails?: boolean;
    ownerChangedDuringFinalizer?: boolean;
    deletionFails?: boolean;
    localPurgeFails?: boolean;
    localPurgeUnconfirmed?: boolean;
    /** 삭제 요청이 실패하기 직전에 이 화면의 소유자가 바뀐다(다른 탭 로그아웃 = null, 다른 계정 = B). */
    ownerBeforeFailure?: string | null;
    /** 로그아웃 기대값을 잡는 순간 이미 다른 계정이다 → AuthSessionOwnerChangedError. */
    expectationOwner?: string;
  } = {},
) {
  const calls = { purge: 0, signOut: 0, dismissAll: 0, replace: [] as string[] };
  const mounted = { current: true };
  const owner = { current: OWNER as string | null };
  // 화면 상태를 실제 setter 처럼 마지막 값으로 들고 있는다.
  const state = { deleting: false, delError: false, delErrorShown: 0 };
  const inFlight = { current: false };
  class TestAuthSessionOwnerChangedError extends Error {}
  const completion = require("../deletion-completion") as typeof import("../deletion-completion");
  const epoch = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
  const context: Record<string, unknown> = {
    userId: OWNER, delConfirm: "DELETE",
    deleteConfirmUserRef: { current: OWNER },
    deleteInFlightRef: inFlight,
    allowDeletionNavigationRef: { current: false },
    privacyMountedRef: mounted, activeUserRef: owner,
    setDeleting: (value: boolean) => { state.deleting = value; },
    setDelError: (value: boolean) => {
      state.delError = value;
      if (value) state.delErrorShown += 1;
    },
    captureSignOutExpectation: async () => {
      if (options.expectationOwner !== undefined) owner.current = options.expectationOwner;
      return {
        userId: options.expectationOwner ?? OWNER,
        sessionId: "session-a",
        accessToken: "test-token",
      };
    },
    requestAccountDeletion: async () => {
      if (options.ownerBeforeFailure !== undefined) {
        owner.current = options.ownerBeforeFailure;
        throw new Error("terminal deletion failed");
      }
      if (options.deletionFails) throw new Error("terminal deletion failed");
      return RECEIPT;
    },
    purgeDeletedAccountLocalData: async () => {
      calls.purge += 1;
      if (options.localPurgeFails) throw new Error("local purge failed");
      return options.localPurgeUnconfirmed ? "unconfirmed" : "complete";
    },
    signOutExpected: async () => {
      calls.signOut += 1;
      if (options.ownerChangedDuringFinalizer) {
        throw new TestAuthSessionOwnerChangedError();
      }
      if (options.signOutFails) throw new Error("local sign-out failed");
    },
    AuthSessionOwnerChangedError: TestAuthSessionOwnerChangedError,
    dismissAccountDeletionNotice: completion.dismissAccountDeletionNotice,
    router: { dismissAll: () => { calls.dismissAll += 1; }, replace: (to: string) => { calls.replace.push(to); } },
    createAccountDeletionCompletion: completion.createAccountDeletionCompletion,
    currentAccountEpoch: epoch.currentAccountEpoch,
    console: { warn: () => undefined },
  };
  return { run: deleteCallback(context), calls, owner, state, inFlight, mounted };
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
    expect(notice?.receipt.deletionFenced).toBe(true);
    expect(notice?.receipt.rawClippingsErased).toBeNull();
    expect(notice?.receipt.rawClippingsEmptyAtCheck).toBe(true);
    expect(notice?.receipt.unconfirmed).toEqual(["rawClippings"]);
    expect(calls.signOut).toBe(1);
    expect(calls.replace).toEqual(["/sign-in"]);
  });

  test("검사된 owner-scoped 로컬 정리 결과를 영수증에 그대로 연결한다", async () => {
    const clean = harness();
    await clean.run();
    expect(clean.calls.purge).toBe(1);
    expect(getAccountDeletionNotice()?.localPurge).toBe("complete");

    dismissAccountDeletionNotice();
    __resetAccountEpochForTests();
    noteResolvedOwner(OWNER);
    const incomplete = harness({ localPurgeUnconfirmed: true });
    await incomplete.run();
    expect(getAccountDeletionNotice()?.localPurge).toBe("unconfirmed");
  });

  test("로컬 정리 예외도 삭제·로그아웃·영수증 발행을 되돌리지 않는다", async () => {
    const { run, calls } = harness({ localPurgeFails: true });
    await run();
    expect(calls.signOut).toBe(1);
    expect(getAccountDeletionNotice()?.localPurge).toBe("unconfirmed");
    expect(getAccountDeletionNotice()?.localSignOut).toBe("complete");
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

  test("A 삭제 뒤 B가 로그인했으면 B를 보존하고 A 영수증으로 이동하지 않는다", async () => {
    const { run, calls } = harness({ ownerChangedDuringFinalizer: true });
    await run();

    expect(calls.signOut).toBe(1);
    expect(calls.dismissAll).toBe(0);
    expect(calls.replace).toEqual([]);
    expect(getAccountDeletionNotice()).toBeNull();
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

// 실패 경로의 울타리 (게이트 지적 AG-02 · AUTH-01, PR #2040).
//
// `deleting` 은 /privacy 의 로그인 가드를 면제하는 울타리다(`!userId && !deleting`).
// 소유자 변경 effect 는 요청이 날아가는 동안 그것을 일부러 안 푼다 — "그 흐름이
// 불일치를 보고 푼다". 그런데 요청이 **실패**하면 catch 는 소유자가 그대로일 때만
// 풀었다. 삭제 중 다른 탭에서 로그아웃하고 요청이 실패하면 울타리가 영영 남고,
// 로그아웃한 방문자가 /sign-in 으로 가지 않은 채 /privacy 에 남았다.
// 오류 표시는 원래 소유자에게만 띄운다 — B 가 A 의 실패를 보면 안 된다.
describe("삭제가 실패하면 울타리는 소유자와 무관하게 풀린다", () => {
  test("소유자가 그대로면 오류를 띄우고 울타리를 푼다(기존 동작)", async () => {
    const { run, state, inFlight, calls } = harness({ deletionFails: true });
    await run();
    expect(state.deleting).toBe(false);
    expect(state.delErrorShown).toBe(1);
    expect(inFlight.current).toBe(false);
    expect(calls.replace).toEqual([]);
  });

  test.each([
    ["다른 탭에서 로그아웃(null)", null],
    ["다른 계정 B", "22222222-2222-4222-8222-222222222222"],
  ])("요청 중 소유자가 %s 로 바뀐 뒤 실패해도 울타리를 풀고, 오류는 띄우지 않는다", async (_label, next) => {
    const { run, state, inFlight, calls } = harness({ ownerBeforeFailure: next });
    await run();
    expect(state.deleting).toBe(false);
    expect(state.delErrorShown).toBe(0);
    expect(inFlight.current).toBe(false);
    expect(calls.signOut).toBe(0);
    expect(calls.replace).toEqual([]);
    expect(getAccountDeletionNotice()).toBeNull();
  });

  test("로그아웃 기대값을 잡을 때 이미 B 였으면(AuthSessionOwnerChangedError) 울타리를 푼다", async () => {
    const { run, state, inFlight } = harness({ expectationOwner: "22222222-2222-4222-8222-222222222222" });
    await run();
    expect(state.deleting).toBe(false);
    expect(state.delErrorShown).toBe(0);
    expect(inFlight.current).toBe(false);
  });

  test("화면이 이미 내려갔으면 상태를 건드리지 않는다", async () => {
    const h = harness({ ownerBeforeFailure: null });
    const pending = h.run();
    // run 은 첫 await 전에 울타리를 세운다. 그 뒤 화면이 내려간다.
    expect(h.state.deleting).toBe(true);
    h.mounted.current = false;
    await pending;
    expect(h.state.deleting).toBe(true);
    expect(h.state.delErrorShown).toBe(0);
    expect(h.inFlight.current).toBe(false);
  });
});
