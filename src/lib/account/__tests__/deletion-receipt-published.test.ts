import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { finishAccountDeletion } from "../deletion-completion";
import {
  __resetLocalDeletionOutcomeForTests,
  localDeletionOutcomeFor,
  localDeletionOutcomeSnapshot,
} from "../deletion-local-outcome";
import { normalizeReceiptId, parseAccountDeletedParams } from "../deletion-receipt";

// 계정을 지운 사람이 서버가 무엇을 지웠는지 듣게 되는가 - 이제는 서버 영수증으로.
//
// 삭제 흐름은 예전부터 영수증을 받아서 버렸고, 그다음에는 앱 메모리 알림으로
// 로그인 화면까지 건넸다. 그 인계가 다섯 회차 동안 수렴하지 않고 계정 전환 때
// A 의 영수증을 B 의 로그인 화면에 띄웠다(PR #2054). Simon 결정 Q-261004-42 = A:
// 영수증은 서버가 남기고(0217), 이 흐름은 그 **번호**만 /account-deleted 로 넘긴다.
//
// 화면 전체를 렌더하지 않고 실제 콜백 선언만 AST 로 떼어 inert 컨텍스트에서
// 돌린다. 재구현이 아니라 실제 본문이다. finishAccountDeletion 도 진짜를 쓴다.
const FILE = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const RECEIPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const RECEIPT = {
  deleted: true as const,
  receiptId: RECEIPT_ID as string | null,
  profileErased: true,
  deletionFenced: true,
  rawClippingsErased: null,
  rawClippingsEmptyAtCheck: true,
  rawClippingsRemoved: 3,
  incomplete: [],
  unconfirmed: ["rawClippings" as const],
  complete: false,
  observedAtIso: "2026-10-05T00:00:00.000Z",
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
    receiptId?: string | null;
    /** 삭제 요청이 실패하기 직전에 이 화면의 소유자가 바뀐다(다른 탭 로그아웃 = null, 다른 계정 = B). */
    ownerBeforeFailure?: string | null;
    /** 로그아웃 기대값을 잡는 순간 이미 다른 계정이다 → AuthSessionOwnerChangedError. */
    expectationOwner?: string;
    /** 끝에서 본 소유자(account-epoch). */
    published?: string | null;
    pending?: string | null;
    /** 요청이 날아가는 동안 화면이 내려간다. */
    unmountDuringRequest?: boolean;
  } = {},
) {
  const calls = {
    purge: 0, signOut: 0, dismissAll: 0, replace: [] as string[],
    notePending: [] as string[], clearPending: 0, order: [] as string[],
    setParams: [] as Record<string, string>[],
  };
  const mounted = { current: true };
  const owner = { current: OWNER as string | null };
  // 화면 상태를 실제 setter 처럼 마지막 값으로 들고 있는다.
  const state = { deleting: false, delError: false, delErrorShown: 0, delUnconfirmed: false };
  const inFlight = { current: false };
  const allowNavigation = { current: false };
  const context: Record<string, unknown> = {
    userId: OWNER, delConfirm: "DELETE",
    deleteConfirmUserRef: { current: OWNER },
    deleteInFlightRef: inFlight,
    allowDeletionNavigationRef: allowNavigation,
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
      if (options.unmountDuringRequest) mounted.current = false;
      if (options.ownerBeforeFailure !== undefined) {
        owner.current = options.ownerBeforeFailure;
        throw new Error("terminal deletion failed");
      }
      if (options.deletionUnconfirmed) throw new TestAccountDeletionUnconfirmedError();
      if (options.deletionFails) throw new Error("terminal deletion failed");
      return { ...RECEIPT, receiptId: options.receiptId === undefined ? RECEIPT_ID : options.receiptId };
    },
    purgeDeletedAccountLocalData: async () => {
      calls.purge += 1;
      calls.order.push("purge");
      if (options.localPurgeFails) throw new Error("local purge failed");
      return options.localPurgeUnconfirmed ? "unconfirmed" : "complete";
    },
    signOutExpected: async () => {
      calls.signOut += 1;
      calls.order.push("signOut");
      if (options.ownerChangedDuringFinalizer) {
        throw new TestAuthSessionOwnerChangedError();
      }
      if (options.signOutFails) throw new Error("local sign-out failed");
    },
    finishAccountDeletion,
    addPendingAccountDeletion: async (_owner: string, receiptId: string) => {
      calls.notePending.push(receiptId);
      return true;
    },
    clearPendingAccountDeletion: async () => {
      calls.clearPending += 1;
      return true;
    },
    currentAccountOwner: () => options.published === undefined ? null : options.published,
    currentPendingAccountOwner: () => options.pending,
    AuthSessionOwnerChangedError: TestAuthSessionOwnerChangedError,
    AccountDeletionUnconfirmedError: TestAccountDeletionUnconfirmedError,
    rootRouter: {
      dismissAll: () => { calls.dismissAll += 1; calls.order.push("dismissAll"); },
      replace: (to: string) => { calls.replace.push(to); calls.order.push("replace"); },
      setParams: (params: Record<string, string>) => { calls.setParams.push(params); calls.order.push("setParams"); },
    },
    console: { warn: () => undefined },
  };
  return { run: deleteCallback(context), calls, owner, state, inFlight, mounted, allowNavigation };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => __resetLocalDeletionOutcomeForTests());
// This device's local results, as the receipt route reads them (token + number).
const localFor = (href: string) => localDeletionOutcomeFor(localDeletionOutcomeSnapshot(), routed(href).params);
function routed(href: string) {
  const [pathname, query = ""] = href.split("?");
  return { pathname, params: parseAccountDeletedParams(Object.fromEntries(new URLSearchParams(query))) };
}

describe("삭제한 사람이 서버가 남긴 영수증으로 간다", () => {
  test("확인된 삭제는 영수증 번호를 들고 /account-deleted 로 간다 - 로그인 화면이 아니다", async () => {
    const { run, calls } = harness();
    await run();
    expect(calls.signOut).toBe(1);
    expect(calls.dismissAll).toBe(1);
    expect(calls.replace).toHaveLength(1);
    const target = routed(calls.replace[0]);
    expect(target.pathname).toBe("/account-deleted");
    // 영수증 route 는 로그아웃 **전에** 연다(로그아웃 보류 중 루트 레이아웃이
    // (auth) 밖 route 를 "/" 로 되돌리기 때문). 로그아웃 결과는 그 뒤에 알린다 -
    // URL 값이 아니라 이 기기의 일회성 결과로 (게이트 DEL2-R1-05 · D2A-06).
    expect(target.params.receiptId).toBe(RECEIPT_ID);
    expect(normalizeReceiptId(target.params.op)).not.toBeNull();
    expect(calls.setParams).toEqual([]);
    expect(localFor(calls.replace[0])).toMatchObject({ localPurge: "complete", localSignOut: "complete" });
    expect(calls.replace[0]).not.toContain(OWNER);
    expect(calls.replace[0]).not.toMatch(/[?&](done|local|signout)=/);
  });

  test("로컬 정리 -> 영수증 route 열기 -> 로그아웃 순서로 한 번씩 돈다", async () => {
    const { run, calls } = harness();
    await run();
    expect(calls.order).toEqual(["purge", "dismissAll", "replace", "signOut"]);
  });

  test("로컬 정리 예외도 삭제·로그아웃·영수증 이동을 되돌리지 않는다", async () => {
    const { run, calls } = harness({ localPurgeFails: true });
    await run();
    expect(calls.signOut).toBe(1);
    expect(calls.notePending).toEqual([RECEIPT_ID]);
    expect(localFor(calls.replace[0])?.localPurge).toBe("retry-scheduled");
  });

  test("로그아웃이 실패해도 영수증에 남고, 그 사실을 알린다", async () => {
    const { run, calls } = harness({ signOutFails: true });
    await run();
    expect(routed(calls.replace[0]).pathname).toBe("/account-deleted");
    expect(localFor(calls.replace[0])?.localSignOut).toBe("unconfirmed");
    expect(calls.setParams).toEqual([]);
  });

  test("서버가 영수증을 못 남겼으면 번호 없이 간다 - 화면이 그 사실을 말한다", async () => {
    const { run, calls } = harness({ receiptId: null });
    await run();
    const target = routed(calls.replace[0]);
    expect(target.params.receiptId).toBeNull();
    expect(localFor(calls.replace[0])).toMatchObject({ receiptId: null, localPurge: "complete" });
  });

  test("종단 삭제가 실패하면 아무 데도 가지 않는다", async () => {
    const { run, calls } = harness({ deletionFails: true });
    await run();
    expect(calls.purge).toBe(0);
    expect(calls.signOut).toBe(0);
    expect(calls.replace).toEqual([]);
  });

  test("로그아웃 중에 B가 로컬 인증을 가졌으면 B를 보존하고 A 영수증에서 내린다", async () => {
    const { run, calls, inFlight, state } = harness({ ownerChangedDuringFinalizer: true });
    await run();
    expect(calls.signOut).toBe(1);
    expect(calls.replace.at(-1)).toBe("/");
    expect(calls.setParams).toEqual([]);
    expect(localDeletionOutcomeSnapshot()).toBeNull();
    expect(inFlight.current).toBe(false);
    expect(state.deleting).toBe(false);
  });

  test.each([
    ["게시된 B", { published: OTHER }],
    ["게시 전 보류 중인 B (DEL-N2-01)", { pending: OTHER }],
  ])("%s 가 이미 보이면 A 영수증 route 를 열지 않는다", async (_label, owner) => {
    const { run, calls } = harness(owner);
    await run();
    expect(calls.replace).toEqual([]);
    expect(calls.dismissAll).toBe(0);
  });

  test("화면이 요청 중에 내려가도 정리·로그아웃·영수증 이동을 끝까지 한다 (/privacy 언마운트)", async () => {
    const { run, calls, mounted } = harness({ unmountDuringRequest: true });
    await run();
    await flush();
    expect(mounted.current).toBe(false);
    expect(calls.purge).toBe(1);
    expect(calls.signOut).toBe(1);
    expect(routed(calls.replace[0]).params.receiptId).toBe(RECEIPT_ID);
  });

  test("영수증으로 가기 전에 route 제거 울타리를 연다", async () => {
    const { run, allowNavigation } = harness();
    await run();
    expect(allowNavigation.current).toBe(true);
  });
});

describe("확인되지 않은 결과는 실패로 말하지 않는다", () => {
  test("요청이 나갔고 답을 잃었으면 오류가 아니라 '확인 중' 을 띄운다", async () => {
    const { run, state, calls, inFlight } = harness({ deletionUnconfirmed: true });
    await run();
    expect(state.delUnconfirmed).toBe(true);
    expect(state.delErrorShown).toBe(0);
    expect(state.deleting).toBe(false);
    expect(inFlight.current).toBe(false);
    expect(calls.replace).toEqual([]);
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
    ["다른 계정 B", OTHER],
  ])("요청 중 소유자가 %s 로 바뀐 뒤 실패해도 울타리를 풀고, 오류는 띄우지 않는다", async (_label, next) => {
    const { run, state, inFlight, calls } = harness({ ownerBeforeFailure: next });
    await run();
    expect(state.deleting).toBe(false);
    expect(state.delErrorShown).toBe(0);
    expect(state.delUnconfirmed).toBe(false);
    expect(inFlight.current).toBe(false);
    expect(calls.signOut).toBe(0);
    expect(calls.replace).toEqual([]);
  });

  test("로그아웃 기대값을 잡을 때 이미 B 였으면(AuthSessionOwnerChangedError) 울타리를 푼다", async () => {
    const { run, state, inFlight } = harness({ expectationOwner: OTHER });
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

test("로그인 화면은 삭제 영수증을 그리지 않는다 - 영수증은 번호를 가진 route 에만 있다", () => {
  const signIn = fs.readFileSync(path.join(process.cwd(), "src/screens/deepspace/dds-sign-in-screen.tsx"), "utf8");
  const code = signIn.replace(/\/\/[^\n]*/g, "");
  expect(code).not.toContain("AccountDeletionNoticePanel");
  expect(code).not.toContain("useAccountDeletionNotice");
  // 대신 로그아웃이 확정되면 답을 못 받은 삭제 요청을 서버 영수증으로 정리한다.
  expect(code).toContain("resolvePendingAccountDeletionsInBackground()");
  // "확정" 은 로그인 상태를 모르는 경우와 계정 전환 보류를 뺀다 (DEL2-R1-01 · D2A-05).
  const gate = /const signedOutSettled = knownSignedOut\(\{([\s\S]*?)\}\);/.exec(code)?.[1] ?? "";
  for (const field of ["loading", "userId", "sessionUnavailable", "transitionPending"]) expect(gate).toContain(field);
  expect(code).toMatch(/if \(signedOutSettled\) void resolvePendingAccountDeletionsInBackground\(\);/);
});
