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

interface HarnessHandles {
  owner: { current: string | null };
  mounted: { current: boolean };
  epoch: typeof import("../../auth/account-epoch");
}

/** AuthContext 가 계정을 바꾸는 순서 그대로: hold(owner 이벤트 없음) → 게시.
 *  AccountScope 가 epoch 로 장면을 다시 마운트하므로 옛 /privacy 는 내려간다. */
function publishOwner(h: HarnessHandles, next: string | null) {
  h.epoch.beginAccountOwnerTransition(next);
  h.epoch.noteResolvedOwner(next);
  h.mounted.current = false;
  h.owner.current = next;
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
    /** 서버 삭제가 성공하기 직전에 일어나는 일(외부 로그아웃 · 다른 계정 · 화면 내려감). */
    duringRequest?: (h: HarnessHandles) => void;
    /** signOutExpected 안에서 AuthContext 가 하는 일(hold → 게시)을 흉내 낸다. */
    duringSignOut?: (h: HarnessHandles) => void;
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
  const handles: HarnessHandles = { owner, mounted, epoch };
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
      options.duringRequest?.(handles);
      return RECEIPT;
    },
    purgeDeletedAccountLocalData: async () => {
      calls.purge += 1;
      if (options.localPurgeFails) throw new Error("local purge failed");
      return options.localPurgeUnconfirmed ? "unconfirmed" : "complete";
    },
    signOutExpected: async () => {
      calls.signOut += 1;
      options.duringSignOut?.(handles);
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

// 계정 삭제 기존 결함 두 갈래 (QA 261004 2단계 게이트, 2026-10-05).
//
// ① 정상 경로에서도 영수증이 버려졌다. AuthContext 의 로그아웃은 hold
//    (beginAccountOwnerTransition(null), owner 이벤트 없음) 다음 게시
//    (noteResolvedOwner(null)) 로 epoch 를 두 칸 올리는데, 영수증은 정확히 +1 만
//    받았다. 위 하네스의 signOutExpected 는 epoch 를 건드리지 않아서 그 길을
//    한 번도 지나지 않았다 - 기존 테스트가 전부 초록이었던 이유다.
// ② 서버 삭제를 기다리는 동안 외부 A -> null 로 화면이 내려가면 성공 결과·영수증·
//    로컬 정리 결과가 전부 사라졌다(`if (!privacyMountedRef.current) return`).
describe("영수증은 화면이 아니라 계정을 따라간다", () => {
  test("① 로그아웃이 AuthContext 처럼 hold → 게시로 epoch 를 두 칸 올려도 영수증이 남는다", async () => {
    const { run, calls } = harness({ duringSignOut: (h) => publishOwner(h, null) });
    await run();
    expect(getAccountDeletionNotice()?.localSignOut).toBe("complete");
    expect(getAccountDeletionNotice()?.receipt.profileErased).toBe(true);
    expect(calls.replace).toEqual(["/sign-in"]);
  });

  test("① 로그아웃이 hold 와 게시 사이에 끝나도 '진행 중' 으로 멈추지 않는다", async () => {
    let publishNull: (() => void) | null = null;
    const { run } = harness({
      duringSignOut: (h) => {
        h.epoch.beginAccountOwnerTransition(null);
        publishNull = () => h.epoch.noteResolvedOwner(null);
      },
    });
    await run();
    // AuthContext 는 정리 게이트를 기다린 뒤에 게시한다.
    (publishNull as (() => void) | null)?.();
    expect(getAccountDeletionNotice()?.localSignOut).toBe("complete");
  });

  test("② 요청 중 외부 A -> null 로 화면이 내려가도 영수증과 로컬 정리 결과가 남는다", async () => {
    const { run, calls } = harness({
      localPurgeUnconfirmed: true,
      duringRequest: (h) => publishOwner(h, null),
    });
    await run();
    const notice = getAccountDeletionNotice();
    expect(notice).not.toBeNull();
    expect(notice?.receipt.unconfirmed).toEqual(["rawClippings"]);
    expect(notice?.localPurge).toBe("unconfirmed");
    expect(calls.purge).toBe(1);
    // 세션이 이미 비어 있으면 signOutExpected 는 alreadyCleared 로 한 번 더
    // SIGNED_OUT 을 보낸다(session-mutation.ts). 그 결과까지 영수증에 남는다.
    expect(calls.signOut).toBe(1);
    expect(notice?.localSignOut).toBe("complete");
    expect(calls.replace).toEqual(["/sign-in"]);
  });

  test.each([
    ["A -> B", ["22222222-2222-4222-8222-222222222222"]],
    ["A -> null -> B", [null, "22222222-2222-4222-8222-222222222222"]],
  ] as const)("② 요청 중 %s 이면 B 는 A 의 영수증을 보지 않고 로그아웃되지도 않는다", async (_label, owners) => {
    const { run, calls, state, inFlight } = harness({
      duringRequest: (h) => { for (const next of owners) publishOwner(h, next); },
    });
    await run();
    expect(getAccountDeletionNotice()).toBeNull();
    expect(calls.signOut).toBe(0);
    expect(calls.dismissAll).toBe(0);
    expect(calls.replace).toEqual([]);
    // 지워진 A 의 기기 자료는 그래도 정리한다 - 서버에서는 이미 없는 계정이다.
    expect(calls.purge).toBe(1);
    expect(inFlight.current).toBe(false);
    expect(state.delErrorShown).toBe(0);
  });

  test("② 화면이 경계보다 먼저 B 를 그리고 있어도 B 를 로그아웃하지 않는다", async () => {
    const { run, calls } = harness({
      duringRequest: (h) => { h.owner.current = "22222222-2222-4222-8222-222222222222"; },
    });
    await run();
    expect(getAccountDeletionNotice()).toBeNull();
    expect(calls.signOut).toBe(0);
    expect(calls.replace).toEqual([]);
  });
});

// 게이트 지적 DEL-BL-01 (QA 261004, 2026-10-05).
//
// 요청 중 A -> null 로 화면이 내려가도 흐름이 끝까지 가게 되면서(위 ②), 로그아웃을
// 기다리는 사이 B 가 게시되는 길이 새로 열렸다. completion 은 무효가 되고
// finishSignOut 은 false 를 돌려주지만, 마지막 이동은 그 반환값을 안 봐서 B 의
// 화면 스택을 비우고 /sign-in 으로 보냈다. 로그아웃이 정상 반환하든 일반 오류로
// 끝나든 같다(AuthSessionOwnerChangedError 길은 원래 막혀 있었다).
describe("로그아웃을 기다리는 사이 B 가 게시되면 B 의 화면을 건드리지 않는다", () => {
  const B = "22222222-2222-4222-8222-222222222222";

  test.each([
    ["정상 반환", false],
    ["일반 오류", true],
  ] as const)("요청 중 A -> null, 로그아웃 중 B 게시, 로그아웃이 %s 해도 이동하지 않는다", async (
    _label,
    signOutFails,
  ) => {
    const { run, calls, inFlight } = harness({
      signOutFails,
      duringRequest: (h) => publishOwner(h, null),
      duringSignOut: (h) => publishOwner(h, B),
    });
    await run();
    expect(calls.signOut).toBe(1);
    expect(calls.dismissAll).toBe(0);
    expect(calls.replace).toEqual([]);
    expect(getAccountDeletionNotice()).toBeNull();
    expect(inFlight.current).toBe(false);
  });
});

// 게이트 지적 DEL-N1-01 (QA 261004, 2026-10-05).
//
// 위 DEL-BL-01 은 B 가 **게시된** 경우만 막았다. 로그인은 먼저 hold
// (beginAccountOwnerTransition(B), owner 이벤트 없음)를 세우고 정리·프로필 확인 뒤에
// 게시한다. 그 사이 게시된 owner 는 여전히 null 이라, 요청 중 A -> null 뒤의 B 로그인은
// "A 의 로그아웃 뒤" 와 구별되지 않았다. 그래서 A 영수증이 B 가 로그인하는 /sign-in 에
// 게시되고, 로그아웃이 일반 오류로 끝나면 B 의 스택까지 비웠다. 여기서는 모두
// noteResolvedOwner(B) 를 부르지 않는다.
describe("게시 전 hold 로만 B 가 보여도 A 의 영수증 · 로그아웃 · 이동을 하지 않는다", () => {
  const B = "22222222-2222-4222-8222-222222222222";

  test.each([
    ["정상 반환", false],
    ["일반 오류", true],
  ] as const)("요청 중 A -> null 다음 B 로그인 hold: 영수증 게시 · 로그아웃 · 이동이 없다(로그아웃이 %s 이어도)", async (
    _label,
    signOutFails,
  ) => {
    const { run, calls, inFlight, state } = harness({
      signOutFails,
      duringRequest: (h) => {
        publishOwner(h, null);
        h.epoch.beginAccountOwnerTransition(B);
      },
    });
    await run();
    expect(getAccountDeletionNotice()).toBeNull();
    expect(calls.signOut).toBe(0);
    expect(calls.dismissAll).toBe(0);
    expect(calls.replace).toEqual([]);
    // 지워진 A 의 기기 자료는 그래도 정리한다.
    expect(calls.purge).toBe(1);
    expect(inFlight.current).toBe(false);
    expect(state.delErrorShown).toBe(0);
  });

  test.each([
    ["A 게시 상태 · 정상 반환", false, false],
    ["A 게시 상태 · 일반 오류", false, true],
    ["요청 중 A -> null · 정상 반환", true, false],
    ["요청 중 A -> null · 일반 오류", true, true],
  ] as const)("로그아웃 중 B 로그인 hold(%s): 영수증을 거두고 B 의 스택을 건드리지 않는다", async (
    _label,
    signedOutDuringRequest,
    signOutFails,
  ) => {
    const { run, calls, inFlight } = harness({
      signOutFails,
      duringRequest: signedOutDuringRequest ? (h) => publishOwner(h, null) : undefined,
      duringSignOut: (h) => { h.epoch.beginAccountOwnerTransition(B); },
    });
    await run();
    expect(calls.signOut).toBe(1);
    expect(calls.dismissAll).toBe(0);
    expect(calls.replace).toEqual([]);
    expect(getAccountDeletionNotice()).toBeNull();
    expect(inFlight.current).toBe(false);
  });
});
