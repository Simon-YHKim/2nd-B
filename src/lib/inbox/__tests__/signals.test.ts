import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  countPendingProposals,
  countRespondedPeerInvites,
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
): InboxReaders<Proposal, Peer> {
  return {
    proposals: { read: proposalRead, count: countPendingProposals },
    peers: { read: peerRead, count: countRespondedPeerInvites },
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

  test("runs neither owner query until the profile probe is confirmed", async () => {
    const proposalRead = jest.fn(async () => [] as Proposal[]);
    const peerRead = jest.fn(async () => [] as Peer[]);
    const session = new InboxSignalSession(readers(proposalRead, peerRead), () => {});

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

    expect(syncInboxSessionWithAuth(session, base)).toBe("ready");
    expect(proposalRead).toHaveBeenCalledTimes(1);
    expect(proposalRead).toHaveBeenCalledWith("owner-a");
    expect(peerRead).toHaveBeenCalledTimes(1);
    expect(peerRead).toHaveBeenCalledWith("owner-a");
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
    });
    expect(summarizeInboxSignals(session.getSnapshot()).genuineEmpty).toBe(false);

    expect(session.retry("peers")).toBe(true);
    expect(session.getSnapshot()).toEqual({
      proposals: { status: "ready", count: 1 },
      peers: { status: "loading" },
    });
    await settle();
    expect(session.getSnapshot()).toEqual({
      proposals: { status: "ready", count: 1 },
      peers: { status: "ready", count: 1 },
    });
    expect(proposalRead).toHaveBeenCalledTimes(1);
    expect(peerRead).toHaveBeenCalledTimes(2);
    expect(session.retry("proposals")).toBe(false);
    expect(proposalRead).toHaveBeenCalledTimes(1);
  });

  test("shows the shared empty state only when both sources genuinely resolve empty", () => {
    const empty: InboxSignalSnapshot = {
      proposals: { status: "empty", count: 0 },
      peers: { status: "empty", count: 0 },
    };
    expect(summarizeInboxSignals(empty).genuineEmpty).toBe(true);
    expect(
      summarizeInboxSignals({ ...empty, peers: { status: "error" } }).genuineEmpty,
    ).toBe(false);
    expect(
      summarizeInboxSignals({ ...empty, proposals: { status: "loading" } }).genuineEmpty,
    ).toBe(false);
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
  test.each(["/digest", "/peer-invites"] as const)("pushes %s exactly once per action", (route) => {
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
    expect(sha(source)).toBe("193567c35a282ae57bda3d0fd217f1c9dcbd66d2a72afcb03361c00f14b7e100");
  });

  test("keeps InboxLegacy and its styles byte-stable while routing deep-space directly", () => {
    // Normalize before locating the blank-line slice boundary. Looking for
    // `\n\n` in raw CRLF text returned -1 on Windows and made the preservation
    // hash platform-dependent even though sha() normalized afterward.
    const source = normalize(
      readFileSync(join(process.cwd(), "src", "app", "inbox.tsx"), "utf8"),
    );
    const legacy = source.slice(source.indexOf("function InboxLegacy()"), source.indexOf("// The old list used"));
    const styles = source.slice(
      source.indexOf("const styles = StyleSheet.create({"),
      source.indexOf("\n\nexport default function Inbox()"),
    );
    expect(sha(legacy)).toBe("f6fcdafa440555cc23c5db4313ab700d3515b6ab2d27cc575e1df5cd5fbed48a");
    expect(sha(styles)).toBe("153b02a4df53b3223350e66cad98251e76bfbcab2bcffd5f1a6a1f93782d431b");
    expect(source).toContain('from "@/screens/deepspace/dds-inbox-screen"');
  });

  test("registers the new renderer in the exact pixel rule list", () => {
    const check = readFileSync(join(process.cwd(), "scripts", "check-pixel-rules.ts"), "utf8");
    expect(check).toContain('"src/screens/deepspace/dds-inbox-screen.tsx"');
  });
});
