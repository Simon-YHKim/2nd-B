import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { __setDeletionOpMemoStorageForTests } from "../deletion-op-memo";
import { ACCOUNT_DELETED_ROUTE } from "../deletion-receipt";
import {
  clearDeletionReceiptHandoff,
  deletionReceiptHandoffSnapshot,
} from "../deletion-receipt-handoff";
import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";

// 계정을 지운 사람이 서버가 무엇을 지웠는지 듣게 되는가 (0217, Simon 결정 Q-261004-42 = A).
//
// 영수증은 이제 서버 기록이다. 이 화면이 하는 일은 서버가 삭제를 확인한 뒤
// (1) 이 기기의 그 계정 데이터를 지우고 (2) /account-deleted 를 열고 (3) 그 계정을
// 로그아웃하는 것이고, 영수증 화면에는 요청 번호와 이 기기의 결과만 넘긴다
// (deletion-receipt-handoff.ts). 영수증 내용은 그 화면이 서버에서 읽는다.
//
// 화면 전체를 렌더하지 않고 실제 콜백 선언만 AST 로 떼어 inert 컨텍스트에서
// 돌린다. 재구현이 아니라 실제 본문이다. finishAccountDeletion 은 진짜 모듈이다.
const FILE = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OP = "0b7c2a7e-1d1f-4d3a-9a51-6f2f0c4d9e11";
const RECEIPT = {
  deleted: true as const,
  opId: OP,
  profileErased: true,
  deletionFenced: true,
  rawClippingsErased: null,
  rawClippingsEmptyAtCheck: true,
  rawClippingsRemoved: 3,
  incomplete: [],
  unconfirmed: ["rawClippings" as const],
  complete: false,
  observedAtIso: "2026-10-07T00:00:00.000Z",
};

function deleteCallback(context: Record<string, unknown>) {
  const source = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
  const ast = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = "";
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "runDeleteAccount") expression = node.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!expression) throw new Error("삭제 콜백 선언을 찾지 못했다");
  const js = ts.transpileModule(`const run = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as () => Promise<unknown>;
}

class TestAuthSessionOwnerChangedError extends Error {}
class TestAccountDeletionUnconfirmedError extends Error {}

function harness(
  options: {
    signOutFails?: boolean;
    ownerChangedDuringFinalizer?: boolean;
    deletionFails?: boolean;
    deletionUnconfirmed?: boolean;
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
  const state = { deleting: false, delError: false, delErrorShown: 0, delUnconfirmed: false };
  const inFlight = { current: false };
  const completion = require("../deletion-completion") as typeof import("../deletion-completion");
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
    setDelUnconfirmed: (value: boolean) => { state.delUnconfirmed = value; },
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
      if (options.deletionUnconfirmed) throw new TestAccountDeletionUnconfirmedError("lost");
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
    AccountDeletionUnconfirmedError: TestAccountDeletionUnconfirmedError,
    finishAccountDeletion: completion.finishAccountDeletion,
    ACCOUNT_DELETED_ROUTE,
    rootRouter: { dismissAll: () => { calls.dismissAll += 1; }, replace: (to: string) => { calls.replace.push(to); } },
    console: { warn: () => undefined },
  };
  return { run: deleteCallback(context), calls, owner, state, inFlight, mounted };
}

beforeEach(() => {
  const memory = new Map<string, string>();
  __setDeletionOpMemoStorageForTests({
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => { memory.set(key, value); },
    removeItem: async (key) => { memory.delete(key); },
    keys: async () => [...memory.keys()],
  });
  clearDeletionReceiptHandoff();
  __resetAccountEpochForTests();
  noteResolvedOwner(OWNER);
});
afterEach(() => {
  clearDeletionReceiptHandoff();
  __setDeletionOpMemoStorageForTests(null);
});

describe("삭제한 사람이 서버가 남긴 영수증으로 간다", () => {
  test("서버 확인 뒤: 이 기기 정리 → 영수증 화면 → 그 계정 로그아웃, 번호만 넘긴다", async () => {
    const { run, calls } = harness();
    await run();
    expect(calls.purge).toBe(1);
    expect(calls.signOut).toBe(1);
    expect(calls.dismissAll).toBe(1);
    expect(calls.replace).toEqual([ACCOUNT_DELETED_ROUTE]);
    const handoff = deletionReceiptHandoffSnapshot();
    expect(handoff).toMatchObject({ owner: OWNER, opId: OP, localPurge: "complete", localSignOut: "complete" });
    // The receipt itself is not carried; the screen reads it from the server.
    expect(JSON.stringify(handoff)).not.toContain("rawClippingsRemoved");
  });

  test("로컬 정리 결과를 그대로 넘긴다 - 확인 못 한 정리는 다음 기회로 예약된다", async () => {
    const incomplete = harness({ localPurgeUnconfirmed: true });
    await incomplete.run();
    expect(deletionReceiptHandoffSnapshot()?.localPurge).toBe("retry-scheduled");
  });

  test("로컬 정리 예외도 삭제·로그아웃·영수증 이동을 되돌리지 않는다", async () => {
    const { run, calls } = harness({ localPurgeFails: true });
    await run();
    expect(calls.signOut).toBe(1);
    expect(calls.replace).toEqual([ACCOUNT_DELETED_ROUTE]);
    expect(deletionReceiptHandoffSnapshot()?.localPurge).toBe("retry-scheduled");
  });

  test("로그아웃이 실패하면 unconfirmed 로 남고, 삭제 실패로 바뀌지 않는다", async () => {
    const bad = harness({ signOutFails: true });
    await bad.run();
    expect(deletionReceiptHandoffSnapshot()?.localSignOut).toBe("unconfirmed");
    expect(bad.state.delErrorShown).toBe(0);
  });

  test("종단 삭제가 실패하면 아무것도 넘기지 않고 오류를 띄운다", async () => {
    const { run, calls, state } = harness({ deletionFails: true });
    await run();
    expect(deletionReceiptHandoffSnapshot()).toBeNull();
    expect(calls.signOut).toBe(0);
    expect(calls.purge).toBe(0);
    expect(calls.replace).toEqual([]);
    expect(state.delErrorShown).toBe(1);
    expect(state.delUnconfirmed).toBe(false);
  });

  test("결과를 모르면 오류가 아니라 '확인하지 못했다' 를 띄운다 (I5)", async () => {
    const { run, calls, state } = harness({ deletionUnconfirmed: true });
    await run();
    expect(state.delUnconfirmed).toBe(true);
    expect(state.delErrorShown).toBe(0);
    expect(calls.purge).toBe(0);
    expect(calls.replace).toEqual([]);
  });

  test("A 삭제 뒤 B가 로그인했으면 B를 보존하고 A 영수증에 남기지 않는다", async () => {
    const { run, calls } = harness({ ownerChangedDuringFinalizer: true });
    await run();
    expect(calls.signOut).toBe(1);
    expect(calls.replace).toEqual([ACCOUNT_DELETED_ROUTE, "/"]);
  });

  test("로그인 화면은 영수증을 그리지 않는다 (I6)", () => {
    const signIn = fs.readFileSync(
      path.join(process.cwd(), "src/screens/deepspace/dds-sign-in-screen.tsx"), "utf8",
    );
    expect(signIn).not.toContain("AccountDeletionNoticePanel");
    expect(signIn).not.toContain("useAccountDeletionNotice");
    // It only runs the pass for requests whose answer was lost, once signed out is known.
    expect(signIn).toContain("resolvePendingAccountDeletionOpsOnce(");
    expect(signIn).toContain("if (!signedOutSettled) return;");
  });
});

// 실패 경로의 울타리 (게이트 지적 AG-02 · AUTH-01, PR #2040).
//
// `deleting` 은 /privacy 의 로그인 가드를 면제하는 울타리다(`!userId && !deleting`).
// 요청이 **실패**하면 소유자와 무관하게 풀고, 오류는 원래 소유자에게만 띄운다.
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
    expect(deletionReceiptHandoffSnapshot()).toBeNull();
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
