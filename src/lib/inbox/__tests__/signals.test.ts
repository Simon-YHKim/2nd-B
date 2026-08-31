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
    expect(sha(source)).toBe("e727ec89e8c00607b33619cb43286cc9a5ba9bf7a4a57570e87a43acff8a6201");
  });

  test("keeps InboxLegacy and its styles byte-stable while routing deep-space directly", () => {
    const source = readFileSync(join(process.cwd(), "src", "app", "inbox.tsx"), "utf8");
    const legacy = source.slice(source.indexOf("function InboxLegacy()"), source.indexOf("// The old list used"));
    const styles = source.slice(
      source.indexOf("const styles = StyleSheet.create({"),
      source.indexOf("\n\nexport default function Inbox()"),
    );
    expect(sha(legacy)).toBe("f6fcdafa440555cc23c5db4313ab700d3515b6ab2d27cc575e1df5cd5fbed48a");
    expect(sha(styles)).toBe("170888d61cf1ac7cee75cd9afd24948324204160230dd80bafdc531a0a8209cb");
    expect(source).toContain('from "@/screens/deepspace/dds-inbox-screen"');
  });

  test("registers the new renderer in the exact pixel rule list", () => {
    const check = readFileSync(join(process.cwd(), "scripts", "check-pixel-rules.ts"), "utf8");
    expect(check).toContain('"src/screens/deepspace/dds-inbox-screen.tsx"');
  });
});
