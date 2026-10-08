import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  countPendingProposals,
  countRespondedPeerInvites,
  countUnreadSources,
  inboxAuthGate,
  InboxSignalSession,
  loadInboxCount,
  openInboxRoute,
  summarizeInboxSignals,
  syncInboxSessionWithAuth,
  type InboxAuthState,
  type InboxReaders,
  type InboxSignalSnapshot,
} from "../signals";

type Proposal = { key: string };
type Peer = { responded_at: string | null; status: string };
type Source = { id: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function readers(
  proposalRead: (ownerId: string) => Promise<readonly Proposal[]>,
  peerRead: (ownerId: string) => Promise<readonly Peer[]>,
  // 2026-10-04: 세 번째 신호(아직 위키가 안 된 자료, qa261004 L1-20). 기존 경우들은
  // 이 신호가 비어 있다고 두고, 아래 전용 경우들이 이 신호를 직접 다룬다.
  sourceRead: (ownerId: string) => Promise<readonly Source[]> = async () => [],
): InboxReaders<Proposal, Peer, Source> {
  return {
    proposals: { read: proposalRead, count: countPendingProposals },
    peers: { read: peerRead, count: countRespondedPeerInvites },
    sources: { read: sourceRead, count: countUnreadSources },
  };
}

describe("inbox auth boundary", () => {
  const base: InboxAuthState = {
    userId: "owner-a",
    loading: false,
    hasProfile: true,
    profileProbeFailed: false,
  };

  test.each([
    [{ ...base, loading: true }, "loading"],
    [{ ...base, userId: null }, "signed-out"],
    [{ ...base, profileProbeFailed: true }, "profile-error"],
    [{ ...base, hasProfile: null }, "loading"],
    [{ ...base, hasProfile: false }, "incomplete"],
    [base, "ready"],
  ] as const)("maps the auth state without guessing profile completion", (auth, gate) => {
    expect(inboxAuthGate(auth)).toBe(gate);
  });

  test("runs no owner query until the profile probe is confirmed", async () => {
    const proposalRead = jest.fn(async () => [] as Proposal[]);
    const peerRead = jest.fn(async () => [] as Peer[]);
    const sourceRead = jest.fn(async () => [] as Source[]);
    const session = new InboxSignalSession(readers(proposalRead, peerRead, sourceRead), () => {});

    for (const auth of [
      { ...base, loading: true },
      { ...base, userId: null },
      { ...base, profileProbeFailed: true },
      { ...base, hasProfile: null },
      { ...base, hasProfile: false },
    ]) {
      syncInboxSessionWithAuth(session, auth);
    }
    expect(proposalRead).not.toHaveBeenCalled();
    expect(peerRead).not.toHaveBeenCalled();
    expect(sourceRead).not.toHaveBeenCalled();

    expect(syncInboxSessionWithAuth(session, base)).toBe("ready");
    expect(proposalRead).toHaveBeenCalledTimes(1);
    expect(proposalRead).toHaveBeenCalledWith("owner-a");
    expect(peerRead).toHaveBeenCalledTimes(1);
    expect(peerRead).toHaveBeenCalledWith("owner-a");
    expect(sourceRead).toHaveBeenCalledTimes(1);
    expect(sourceRead).toHaveBeenCalledWith("owner-a");
    await settle();
  });
});

describe("independent inbox reads", () => {
  test("keeps empty, ready, error, and timeout distinct", async () => {
    await expect(
      loadInboxCount("owner-a", { read: async () => [], count: countPendingProposals }),
    ).resolves.toEqual({ status: "empty", count: 0 });
    await expect(
      loadInboxCount("owner-a", { read: async () => [{ key: "one" }], count: countPendingProposals }),
    ).resolves.toEqual({ status: "ready", count: 1 });
    await expect(
      loadInboxCount("owner-a", { read: async () => Promise.reject(new Error("read failed")), count: countPendingProposals }),
    ).resolves.toEqual({ status: "error" });

    jest.useFakeTimers();
    try {
      const timed = loadInboxCount(
        "owner-a",
        { read: async () => new Promise<Proposal[]>(() => {}), count: countPendingProposals },
        20,
      );
      jest.advanceTimersByTime(20);
      await expect(timed).resolves.toEqual({ status: "timeout" });
    } finally {
      jest.useRealTimers();
    }
  });

  test("keeps a successful source visible while retrying only the failed source", async () => {
    const proposalRead = jest.fn(async () => [{ key: "one" }]);
    const peerRead = jest
      .fn<Promise<Peer[]>, [string]>()
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValueOnce([
        { responded_at: "2026-08-31T00:00:00.000Z", status: "accepted" },
        { responded_at: null, status: "pending" },
      ]);
    const session = new InboxSignalSession(readers(proposalRead, peerRead), () => {});

    session.activate("owner-a");
    await settle();
    expect(session.getSnapshot()).toEqual({
      proposals: { status: "ready", count: 1 },
      peers: { status: "error" },
      sources: { status: "empty", count: 0 },
    });
    expect(summarizeInboxSignals(session.getSnapshot()).genuineEmpty).toBe(false);

    expect(session.retry("peers")).toBe(true);
    expect(session.getSnapshot()).toEqual({
      proposals: { status: "ready", count: 1 },
      peers: { status: "loading" },
      sources: { status: "empty", count: 0 },
    });
    await settle();
    expect(session.getSnapshot()).toEqual({
      proposals: { status: "ready", count: 1 },
      peers: { status: "ready", count: 1 },
      sources: { status: "empty", count: 0 },
    });
    expect(proposalRead).toHaveBeenCalledTimes(1);
    expect(peerRead).toHaveBeenCalledTimes(2);
    expect(session.retry("proposals")).toBe(false);
    expect(proposalRead).toHaveBeenCalledTimes(1);
  });

  test("shows the shared empty state only when every source genuinely resolves empty", () => {
    const empty: InboxSignalSnapshot = {
      proposals: { status: "empty", count: 0 },
      peers: { status: "empty", count: 0 },
      sources: { status: "empty", count: 0 },
    };
    expect(summarizeInboxSignals(empty).genuineEmpty).toBe(true);
    expect(
      summarizeInboxSignals({ ...empty, peers: { status: "error" } }).genuineEmpty,
    ).toBe(false);
    expect(
      summarizeInboxSignals({ ...empty, proposals: { status: "loading" } }).genuineEmpty,
    ).toBe(false);
    // 자료 신호가 실패하면 "새 알림이 없습니다" 라고 말하지 않는다 - 모르는 것이다.
    expect(
      summarizeInboxSignals({ ...empty, sources: { status: "timeout" } }),
    ).toMatchObject({ genuineEmpty: false, failedSources: ["sources"] });
    expect(
      summarizeInboxSignals({ ...empty, sources: { status: "loading" } }),
    ).toMatchObject({ genuineEmpty: false, hasPendingRead: true });
    expect(
      summarizeInboxSignals({ ...empty, sources: { status: "ready", count: 3 } }),
    ).toMatchObject({ genuineEmpty: false, sourceCount: 3 });
  });

  test("the unread-material signal counts what it was given and retries on its own", async () => {
    // 허브는 목록을 열지 않는다. 읽기 쪽이 ingested=false 로 걸러 온 행의 수만 센다.
    expect(countUnreadSources([])).toBe(0);
    expect(countUnreadSources([{ id: "a" }, { id: "b" }])).toBe(2);

    const sourceRead = jest
      .fn<Promise<Source[]>, [string]>()
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    const proposalRead = jest.fn(async () => [] as Proposal[]);
    const session = new InboxSignalSession(
      readers(proposalRead, async () => [], sourceRead),
      () => {},
    );
    session.activate("owner-a");
    await settle();
    expect(session.getSnapshot().sources).toEqual({ status: "error" });
    expect(summarizeInboxSignals(session.getSnapshot()).genuineEmpty).toBe(false);

    expect(session.retry("sources")).toBe(true);
    await settle();
    expect(session.getSnapshot().sources).toEqual({ status: "ready", count: 2 });
    expect(sourceRead).toHaveBeenCalledTimes(2);
    expect(proposalRead).toHaveBeenCalledTimes(1);
  });

  test("counts only responded accepted or declined owner invites", () => {
    expect(
      countRespondedPeerInvites([
        { responded_at: "2026-08-31T00:00:00.000Z", status: "accepted" },
        { responded_at: "2026-08-31T00:00:00.000Z", status: "declined" },
        { responded_at: null, status: "accepted" },
        { responded_at: "2026-08-31T00:00:00.000Z", status: "withdrawn" },
        { responded_at: null, status: "pending" },
      ]),
    ).toBe(2);
  });

  test("does not publish a late query result after its timeout", async () => {
    jest.useFakeTimers();
    try {
      const pending = deferred<Proposal[]>();
      const changes: InboxSignalSnapshot[] = [];
      const session = new InboxSignalSession(
        readers(() => pending.promise, async () => []),
        (snapshot) => changes.push(snapshot),
        20,
      );
      session.activate("owner-a");
      await settle();
      jest.advanceTimersByTime(20);
      await settle();
      expect(session.getSnapshot().proposals).toEqual({ status: "timeout" });
      const afterTimeout = changes.length;

      pending.resolve([{ key: "late" }]);
      await settle();
      expect(changes).toHaveLength(afterTimeout);
      expect(session.getSnapshot().proposals).toEqual({ status: "timeout" });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("owner and lifecycle stale guards", () => {
  test("never lets owner A settle over owner B", async () => {
    const a = deferred<Proposal[]>();
    const b = deferred<Proposal[]>();
    const proposalRead = jest.fn((ownerId: string) => ownerId === "owner-a" ? a.promise : b.promise);
    const peerRead = jest.fn(async () => [] as Peer[]);
    const session = new InboxSignalSession(readers(proposalRead, peerRead), () => {});

    session.activate("owner-a");
    session.activate("owner-b");
    b.resolve([{ key: "b-1" }, { key: "b-2" }]);
    await settle();
    expect(session.getSnapshot().proposals).toEqual({ status: "ready", count: 2 });

    a.resolve([{ key: "a-1" }]);
    await settle();
    expect(session.getSnapshot().proposals).toEqual({ status: "ready", count: 2 });
    expect(proposalRead.mock.calls).toEqual([["owner-a"], ["owner-b"]]);
  });

  test("drops a late result after deactivation", async () => {
    const pending = deferred<Proposal[]>();
    const changes: InboxSignalSnapshot[] = [];
    const session = new InboxSignalSession(
      readers(() => pending.promise, async () => []),
      (snapshot) => changes.push(snapshot),
    );
    session.activate("owner-a");
    await settle();
    const before = changes.length;
    session.deactivate();
    pending.resolve([{ key: "late" }]);
    await settle();
    expect(changes).toHaveLength(before);
  });
});

describe("route and privacy contract", () => {
  test.each(["/digest", "/peer-invites", "/sources"] as const)("pushes %s exactly once per action", (route) => {
    const push = jest.fn();
    openInboxRoute(route, push);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(route);
  });

  test("the production renderer imports reads only and keeps internal values out of its output", () => {
    const screen = readFileSync(
      join(process.cwd(), "src", "screens", "deepspace", "dds-inbox-screen.tsx"),
      "utf8",
    );
    expect(screen).toContain("listInferredLinkDetails");
    expect(screen).toContain("listPeerInvites");
    expect(screen).not.toMatch(/reactExpression|ratifyLink|rejectInferredLink|createPeerInvite|withdrawPeerInvite/);
    expect(screen).not.toMatch(/from_page|to_page|invited_label|invite_token|token_hash|body_md|citation/);
    expect(screen).not.toContain("MdCard");
    expect(screen).not.toContain("MdButton");
    expect(screen).toContain('onRetry={() => retry("proposals")}');
    expect(screen).toContain('onRetry={() => retry("peers")}');
    // 자료 신호: 위키가 아직 안 된 것만 읽고, 한 줄 카드로 /sources 에 넘긴다.
    expect(screen).toContain("listSources(ownerId, { ingested: false, limit: 100 })");
    expect(screen).toContain('onRetry={() => retry("sources")}');
    expect(screen).toContain('route="/sources"');
    expect(screen).toContain("onRetry={() => void retryProfile()}");
    expect(screen).toContain('<InboxReady key={auth.userId} userId={auth.userId} />');
  });
});

describe("legacy preservation and pixel registration", () => {
  const normalize = (value: string) => value.replace(/\r\n/g, "\n");
  const sha = (value: string) => createHash("sha256").update(normalize(value)).digest("hex");

  test("keeps the combined deep-space import/inbox source byte-stable", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "screens", "deepspace", "dds-import-inbox-screens.tsx"),
      "utf8",
    );
    // 통합 머지에서 재고정. 옛 값은 이 PR 이 분기하던 시점의 파일이고, 같은
    // 통합의 #1511(연결 프레임 salvage)이 그 뒤 이 파일을 8줄 고쳤다. 병합 후
    // 이 파일은 #1511 결과와 바이트 동일이라 "inbox 작업이 이 공용 파일을
    // 건드리지 않는다" 는 뜻은 그대로다 — 기준선만 옮겼다.
    //
    // ⚠ 2026-09-07 재고정 — 명제가 바뀌었다. 이제 이 핀이 주장하는 것은
    // "inbox 작업이 이 파일을 안 건드렸다" 가 아니라 **"inbox 작업은 안 건드렸고,
    // 그 뒤 기록된 변경이 정확히 하나 들어갔다"** 이다. 그 하나는 건강 가져오기가
    // IngestResult 를 버리고 무조건 "반영됨" 이라고 말하던 것을 고친 것이다(무엇이
    // 들어갔는지 · 어떤 루틴이 자동 완료됐는지). inbox 와 무관하다.
    // 이후 재고정하는 사람은 여기에 자기 줄을 추가한다 — 안 그러면 이 핀은 읽는
    // 사람이 확인할 수 있는 것을 아무것도 주장하지 않게 된다.
    //
    // 2026-09-07 두 번째 — 위 요청대로 줄을 추가한다. 들어간 변경은 철회(revokeImport)가
    // deleteSourcesByIds 의 개수를 버려서, 다섯 중 셋만 지워져도 기록 항목을 지우던 것이다.
    // 그 항목이 남은 행을 가리키는 유일한 포인터라 이 파일 주석이 "never drop the only
    // pointer to rows that still exist" 라고 적어 둔 상태를 만들고 있었다. inbox 와 무관하다.
    // 즉 이 핀의 명제는 이제 "inbox 작업은 안 건드렸고, 그 뒤 기록된 변경이 **둘**" 이다.
    //
    // ⚠ 2026-09-13 재고정 - **이번에는 inbox 를 건드렸다.** 위 세 줄이 지켜 온
    // "inbox 작업은 이 파일을 안 건드린다" 는 명제는 여기서 끝난다. 그렇게 적어
    // 두지 않으면 이 핀은 읽는 사람에게 거짓을 말한다.
    //
    // 들어간 변경은 허브에 **신호 카드 한 장**과 그것을 세는 listSources 한 줄이다.
    // 아직 위키가 안 된 소스가 있으면 한 줄로 알리고 /sources 로 넘긴다. 목록을
    // 허브 안에 넣지 않은 이유는 화면 하나에 메시지 하나 · O-7 이고, 그 판단은
    // dds-sources-screen.tsx 머리말에 적혀 있다.
    //
    // 그래서 이 핀의 명제는 이제 **"이 파일의 변경은 전부 여기 적혀 있다"** 다 -
    // 더 좁은 "inbox 는 안 건드린다" 가 아니라. 다음 사람도 줄을 추가할 것.
    //
    // 2026-09-14 재고정 - vibe r260914 R3-A 인가 게이트 발견. 기기 건강 잠금 네 자리
    // (동의 핸들러 · 버튼 문구 · 누르기 · 색)가 `isMinor === true` 만 막아서 연령을 모르는
    // 계정(isMinor null)이 성인 쪽으로 샜다. 넷을 `isMinor !== false` 로 바꾸고 주석 둘을
    // 맞췄다. inbox 와 무관하다. 동작은 minor-lock-unknown-age.test.ts 가 지킨다.
    //
    // 2026-09-20 재고정 - vibe r260919 r32 · 가져오기 철회가 다른 이력이 가리키는 행을 지우지 않게 좁히는 판정 한 줄 · inbox 와 무관.
    // 2026-09-20 재고정 - vibe r260919 r35 · 철회를 계정마다 한 줄로 세우는 연산(withdrawImportHistoryEntry)으로 옮기고, 새 항목에 owned 표지 · 남긴 행 알림 한 줄 · inbox 와 무관.
    // 2026-09-20 재고정 - vibe r260919 R37-FIX1841C · 철회 콜백이 항목을 직접 빼지 않고(history.ts 가 승격과 한 번에 쓴다), Web Locks 없는 브라우저의 거절 문구 · 남긴 행 알림을 까닭별 줄(keptNotice)로 · inbox 와 무관.
    // 2026-09-30 재고정 - Text 를 react-native 대신 @/components/ui/PlainText 에서 가져오는 import 두 줄(앱 전체 한국어 줄바꿈) · inbox 와 무관.
    // 2026-10-01 재고정 - '오늘 반영' 탭이 OS 권한을 받은 뒤 이 폰에서 이 계정의 건강 자동 읽기를 켜고(armHealthAutoRead: 권한은 폰의 앱에 붙어서, 같은 폰의 다른 계정이 물려받지 않게) 결과 줄에 그 사실(healthAutoDaily)을 붙인다 · inbox 와 무관.
    // 2026-10-02 재고정 - 대시보드 폰 통합: 세 화면 함수(DeepSpaceInboxScreen · DeepSpaceInboxBody · DeepSpaceImportScreen)가 expo-router 의 `router` 대신 `useAppRouter()` 를, 가져오기 `mode` 가 `useLocalSearchParams` 대신 `useScreenParams` 를 쓴다(lib/nav/phone-embed.tsx). 폰 밖 동작은 같다 · **inbox 도 건드렸다**(라우터 훅 한 줄씩).
    // 2026-10-03 재고정 - 건강 카드 아래 '끄고 건강 기록 지우기' 버튼과 결과 줄(handleHealthWithdraw: 동의한 자리에서 한 번 탭으로 철회, lib/health/withdraw.ts 흐름) · inbox 와 무관.
    // 2026-10-04 재고정 - 통합 머지(#2005 폰 통합 + main): 위 두 변경이 함께 들어간 파일 · inbox 는 라우터 훅 한 줄씩만.
    // 2026-10-04 재고정 - qa261004 D-16 · /import 파일 패널의 확장자 힌트 한 줄을 고르기 MIME 목록(pickImportFiles)과 맞췄다(.zip·.csv 빼고 .html 넣음, 줄 중립) · inbox 와 무관. 동작은 import-file-copy.test.ts 가 지킨다.
    // 2026-10-05 재고정 - 롤백 레버 제거 PR(Simon 결정 Q-261004-11 C) · 라우트가 import 하지 않던 DeepSpaceInboxScreen 그림자 사본과 그것만 쓰던 InboxItem · DeepSpaceInboxBody · 스타일 열 키 · import 넷을 걷었다(바이트 사본 E:/Legacy/2ndB, batch qa261004-lever) · **inbox 를 건드렸다**(그림자 제거). 배송 /inbox 는 dds-inbox-screen.tsx 다. 남은 DeepSpaceImportScreen 은 손대지 않았다.
    // 2026-10-06 재고정 - 효과음 3차(Simon 결정 Q-261006-11) · /import 파일 가져오기가 실제로 들어온 조각이 있을 때(tally.imported > 0) 저장 소리를 낸다: useUiSound 한 줄 · 호출 한 줄 · import 둘 · 주석 · inbox 와 무관.
    // 2026-10-08: only native surface imports move to phone-scoped UIKit aliases.
    // Import/inbox data, ownership and actions retain the reviewed source.
    expect(sha(source)).toBe("5f608a7cf6ceecb09e12553fe56fd7520edeba6cd611794dfcc7bfecf4dbfc0d");
  });

  test("routes /inbox directly to the shipped hub", () => {
    // 2026-10-05: 여기 있던 InboxLegacy · styles 바이트 핀 둘(f6fcdafa… · 153b02a4…)을
    // 걷었다. 롤백 레버 제거(Simon 결정 Q-261004-11 C)로 그 반쪽은 라우트에서 빠져
    // 되살리기 원본 legacy/screens/inbox.tsx 가 됐고, 그 파일의 바이트는 이제
    // legacy-archive-integrity.test.ts 의 digest 가 지킨다(검사가 보관본을 읽는 유일한 자리).
    const source = normalize(
      readFileSync(join(process.cwd(), "src", "app", "inbox.tsx"), "utf8"),
    );
    expect(source).toContain('from "@/screens/deepspace/dds-inbox-screen"');
    expect(source).toContain("return <DeepSpaceInboxScreen />;");
    expect(source).not.toContain("InboxLegacy()");
  });

  test("registers the new renderer in the exact pixel rule list", () => {
    const check = readFileSync(join(process.cwd(), "scripts", "check-pixel-rules.ts"), "utf8");
    expect(check).toContain('"src/screens/deepspace/dds-inbox-screen.tsx"');
  });
});
