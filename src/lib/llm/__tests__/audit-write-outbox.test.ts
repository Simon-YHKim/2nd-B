const mockInsertAudit = jest.fn().mockResolvedValue(undefined);
const mockInsertCrisis = jest.fn().mockResolvedValue(undefined);
const mockRandomUUID = jest.fn(() => (require("crypto") as { randomUUID(): string }).randomUUID());
const localBacking = new Map<string, string>();
let originalLocalStorage: PropertyDescriptor | undefined;

jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: (...args: unknown[]) => mockInsertAudit(...args),
}));

jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: (...args: unknown[]) => mockInsertCrisis(...args),
}));

jest.mock("expo-crypto", () => ({ randomUUID: () => mockRandomUUID() }));

// 0179/0181 outbox_event_id as the outbox mints it.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEYED = expect.stringMatching(UUID_V4);

import {
  enqueueAuditWrite,
  flushAuditWriteOutbox,
  getAuditWriteOutboxForTests,
  purgeAuditWriteOutboxForOwner,
  resetAuditWriteOutboxForTests,
} from "../audit-write-outbox";
import {
  __resetAccountLocalDeletionFencesForTests,
  installAccountLocalDeletionFence,
} from "../../account/local-deletion-fence";

const auditPayload = {
  userId: "u1",
  promptHash: "p",
  outputHash: "o",
  modelUsed: "gemini-2.5-flash",
  vertexBackend: true,
  safetyZone: "green" as const,
  latencyMs: 12,
};

const crisisPayload = {
  classifierConfidence: 0.95,
  triggerCategories: ["input_red"],
  cssrsLevel: null,
  routingTemplateVersion: "routecrisis-inline-v1",
  locale: "en" as const,
};

describe("audit write outbox", () => {
  beforeAll(() => {
    originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => localBacking.get(key) ?? null,
        setItem: (key: string, value: string) => { localBacking.set(key, value); },
        removeItem: (key: string) => { localBacking.delete(key); },
      },
    });
  });

  beforeEach(async () => {
    localBacking.clear();
    __resetAccountLocalDeletionFencesForTests();
    await resetAuditWriteOutboxForTests();
    mockRandomUUID.mockClear();
    mockInsertAudit.mockReset();
    mockInsertAudit.mockResolvedValue(undefined);
    mockInsertCrisis.mockReset();
    mockInsertCrisis.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  test("failed audit writes stay queued and later flush", async () => {
    mockInsertAudit.mockRejectedValueOnce(new Error("network down"));

    await expect(
      enqueueAuditWrite({
        kind: "ai_audit_log",
        ownerUserId: "u1",
        payload: auditPayload,
        warnLabel: "[test] audit failed",
      }),
    ).resolves.toBeUndefined();

    expect(mockInsertAudit).toHaveBeenCalledTimes(1);
    expect(await getAuditWriteOutboxForTests()).toHaveLength(1);

    await flushAuditWriteOutbox("u1");

    expect(mockInsertAudit).toHaveBeenCalledTimes(2);
    expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
  });

  test("flush preserves audit before crisis order for one owner", async () => {
    mockInsertAudit.mockRejectedValue(new Error("network down"));

    await enqueueAuditWrite({
      kind: "ai_audit_log",
      ownerUserId: "u1",
      payload: auditPayload,
      warnLabel: "[test] audit failed",
    });
    await enqueueAuditWrite({
      kind: "crisis_event",
      ownerUserId: "u1",
      payload: crisisPayload,
      warnLabel: "[test] crisis failed",
    });

    expect(await getAuditWriteOutboxForTests()).toHaveLength(2);

    mockInsertAudit.mockReset();
    mockInsertCrisis.mockReset();
    const order: string[] = [];
    mockInsertAudit.mockImplementation(async () => {
      order.push("audit");
    });
    mockInsertCrisis.mockImplementation(async () => {
      order.push("crisis");
    });

    await flushAuditWriteOutbox("u1");

    expect(order).toEqual(["audit", "crisis"]);
    expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
  });

  test("owner-scoped flush leaves another user's queued rows untouched", async () => {
    mockInsertAudit.mockRejectedValue(new Error("network down"));

    await enqueueAuditWrite({
      kind: "ai_audit_log",
      ownerUserId: "u1",
      payload: auditPayload,
      warnLabel: "[test] audit failed",
    });
    await enqueueAuditWrite({
      kind: "ai_audit_log",
      ownerUserId: "u2",
      payload: { ...auditPayload, userId: "u2" },
      warnLabel: "[test] audit failed",
    });

    mockInsertAudit.mockResolvedValue(undefined);
    await flushAuditWriteOutbox("u2");

    const remaining = await getAuditWriteOutboxForTests();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.ownerUserId).toBe("u1");
  });

  test("uses a captured token only for immediate delivery and never persists it", async () => {
    const signal = new AbortController().signal;
    const assertCurrent = jest.fn();

    await enqueueAuditWrite(
      {
        kind: "ai_audit_log",
        ownerUserId: "u1",
        payload: auditPayload,
        warnLabel: "[test] audit failed",
      },
      { userId: "u1", accessToken: "captured-token-a", signal, assertCurrent },
    );

    expect(assertCurrent).toHaveBeenCalled();
    expect(mockInsertAudit).toHaveBeenCalledWith(auditPayload, "captured-token-a", signal, KEYED);
    expect(JSON.stringify(await getAuditWriteOutboxForTests())).not.toContain("captured-token-a");
  });

  test("keeps the entry queued without attempting a mutable-session write when the lease is stale", async () => {
    const stale = Object.assign(new Error("private stale detail"), { name: "AbortError" });

    await expect(enqueueAuditWrite(
      {
        kind: "ai_audit_log",
        ownerUserId: "u1",
        payload: auditPayload,
        warnLabel: "[test] audit failed",
      },
      { userId: "u1", accessToken: "captured-token-a", assertCurrent: () => { throw stale; } },
    )).resolves.toBeUndefined();

    expect(mockInsertAudit).not.toHaveBeenCalled();
    expect(await getAuditWriteOutboxForTests()).toHaveLength(1);
  });

  test("never retries a bound A row with no session or B's session", async () => {
    await enqueueAuditWrite(
      {
        kind: "ai_audit_log",
        ownerUserId: "u1",
        payload: auditPayload,
        warnLabel: "[test] audit failed",
      },
      {
        userId: "u1",
        accessToken: "captured-token-a",
        assertCurrent: () => { throw Object.assign(new Error("stale"), { name: "AbortError" }); },
      },
    );
    mockInsertAudit.mockClear();

    await flushAuditWriteOutbox("u1");
    await flushAuditWriteOutbox("u1", {
      userId: "u2",
      accessToken: "captured-token-b",
      assertCurrent: jest.fn(),
    });

    expect(mockInsertAudit).not.toHaveBeenCalled();
    expect(await getAuditWriteOutboxForTests()).toHaveLength(1);

    await flushAuditWriteOutbox("u1", {
      userId: "u1",
      accessToken: "fresh-token-a",
      assertCurrent: jest.fn(),
    });
    expect(mockInsertAudit).toHaveBeenCalledWith(auditPayload, "fresh-token-a", undefined, KEYED);
    expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
  });

  test("upgrades a legacy row with no binding flag to fail closed", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    let raw: string | null = JSON.stringify([{
      id: "legacy-voice-row",
      kind: "ai_audit_log",
      ownerUserId: "u1",
      payload: auditPayload,
      warnLabel: "[test] audit failed",
    }]);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: jest.fn((key: string) => key === "llm.auditWriteOutbox.v1" ? raw : null),
        setItem: jest.fn((key: string, value: string) => {
          if (key === "llm.auditWriteOutbox.v1") raw = value;
        }),
        removeItem: jest.fn((key: string) => {
          if (key === "llm.auditWriteOutbox.v1") raw = null;
        }),
      },
    });

    try {
      await flushAuditWriteOutbox("u1");
      expect(mockInsertAudit).not.toHaveBeenCalled();

      await flushAuditWriteOutbox("u1", {
        userId: "u1",
        accessToken: "fresh-token-a",
        assertCurrent: jest.fn(),
      });
      // A row persisted by an older build has a timestamp+counter id, which
      // is not safe as a server key: it stays on the unkeyed RPC, 3 args.
      expect(mockInsertAudit).toHaveBeenCalledWith(auditPayload, "fresh-token-a", undefined);
      expect(mockInsertAudit.mock.calls[0]).toHaveLength(3);
      expect(raw).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  test("terminal deletion purges only the deleted owner's queued rows", async () => {
    mockInsertAudit.mockRejectedValue(new Error("network down"));
    await enqueueAuditWrite({
      kind: "ai_audit_log",
      ownerUserId: "u1",
      payload: auditPayload,
      warnLabel: "[test] audit failed",
    });
    await enqueueAuditWrite({
      kind: "ai_audit_log",
      ownerUserId: "u2",
      payload: { ...auditPayload, userId: "u2" },
      warnLabel: "[test] audit failed",
    });

    await expect(purgeAuditWriteOutboxForOwner("u1")).resolves.toBe(true);
    const remaining = await getAuditWriteOutboxForTests();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.ownerUserId).toBe("u2");
  });

  test("terminal deletion rejects an empty owner instead of widening the purge", async () => {
    await expect(purgeAuditWriteOutboxForOwner(" ")).resolves.toBe(false);
  });

  test("a late in-flight submission cannot recreate a deleted owner's outbox row", async () => {
    await expect(purgeAuditWriteOutboxForOwner("u1")).resolves.toBe(true);
    mockInsertAudit.mockRejectedValue(new Error("late network failure"));

    await enqueueAuditWrite({
      kind: "ai_audit_log",
      ownerUserId: "u1",
      payload: auditPayload,
      warnLabel: "[test] late audit failed",
    });

    expect(mockInsertAudit).not.toHaveBeenCalled();
    expect(await getAuditWriteOutboxForTests()).toEqual([]);
  });

  test("reports an unobserved durable purge when browser storage rejects removal", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => "stale",
        setItem: () => { throw new Error("disk unavailable"); },
        removeItem: () => { throw new Error("disk unavailable"); },
      },
    });
    try {
      await expect(purgeAuditWriteOutboxForOwner("u1")).resolves.toBe(false);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
          getItem: (key: string) => localBacking.get(key) ?? null,
          setItem: (key: string, value: string) => { localBacking.set(key, value); },
          removeItem: (key: string) => { localBacking.delete(key); },
        },
      });
    }
  });

  test("a shared deletion fence blocks late enqueue and flush but preserves owner B", async () => {
    await installAccountLocalDeletionFence("u1");

    await enqueueAuditWrite({
      kind: "ai_audit_log",
      ownerUserId: "u1",
      payload: auditPayload,
      warnLabel: "[test] fenced audit",
    });
    await flushAuditWriteOutbox("u1");
    expect(mockInsertAudit).not.toHaveBeenCalled();

    await enqueueAuditWrite({
      kind: "ai_audit_log",
      ownerUserId: "u2",
      payload: { ...auditPayload, userId: "u2" },
      warnLabel: "[test] owner B audit",
    });
    expect(mockInsertAudit).toHaveBeenCalledTimes(1);
  });

  // 0179/0181: log_ai_audit_once / log_crisis_event_once keep one row per
  // (auth.uid(), outbox_event_id). This fake applies the same rule so the tests
  // count rows instead of trusting call shapes. The owner comes from the token
  // (captured session) or from whoever the global client is signed in as.
  describe("keyed delivery (0179 outbox_event_id)", () => {
    type ServerRow = { owner: string; kind: "ai" | "crisis"; key: string | null; payload: unknown };
    const TOKEN_OWNER: Record<string, string> = { "token-a": "u1", "token-b": "u2" };
    let serverRows: ServerRow[];
    let globalSessionOwner: string;
    let loseNextAck: boolean;

    function serverWrite(kind: ServerRow["kind"], payload: unknown, token?: string, key?: string): void {
      const owner = token ? TOKEN_OWNER[token]! : globalSessionOwner;
      const replay = key !== undefined
        && serverRows.some((r) => r.owner === owner && r.kind === kind && r.key === key);
      if (!replay) serverRows.push({ owner, kind, key: key ?? null, payload });
      if (loseNextAck) {
        loseNextAck = false;
        throw new Error("committed, but the response never arrived");
      }
    }

    function storedIds(): string[] {
      const raw = localBacking.get("llm.auditWriteOutbox.v1");
      return raw ? (JSON.parse(raw) as Array<{ id: string }>).map((e) => e.id) : [];
    }

    beforeEach(() => {
      serverRows = [];
      globalSessionOwner = "u1";
      loseNextAck = false;
      mockInsertAudit.mockImplementation(async (payload: unknown, token?: string, _s?: AbortSignal, key?: string) => {
        serverWrite("ai", payload, token, key);
      });
      mockInsertCrisis.mockImplementation(async (payload: unknown, token?: string, _s?: AbortSignal, key?: string) => {
        serverWrite("crisis", payload, token, key);
      });
    });

    test("a write that committed but was never acknowledged retries under the same key: one row", async () => {
      loseNextAck = true;
      await enqueueAuditWrite({ kind: "ai_audit_log", ownerUserId: "u1", payload: auditPayload, warnLabel: "[test] audit" });
      expect(await getAuditWriteOutboxForTests()).toHaveLength(1);

      await flushAuditWriteOutbox("u1");

      expect(mockInsertAudit).toHaveBeenCalledTimes(2);
      const [first, retry] = mockInsertAudit.mock.calls;
      expect(first![3]).toMatch(UUID_V4);
      expect(retry![3]).toBe(first![3]);
      expect(serverRows).toHaveLength(1);
      expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
    });

    test("distinct events get distinct keys, so none is swallowed as a replay", async () => {
      await enqueueAuditWrite({ kind: "ai_audit_log", ownerUserId: "u1", payload: auditPayload, warnLabel: "[test] a" });
      await enqueueAuditWrite({ kind: "ai_audit_log", ownerUserId: "u1", payload: auditPayload, warnLabel: "[test] b" });

      const keys = mockInsertAudit.mock.calls.map((c) => c[3]);
      expect(new Set(keys).size).toBe(2);
      // Identical payloads, two real events, two rows (C3).
      expect(serverRows).toHaveLength(2);
    });

    test("a row another tab already delivered is replayed, not duplicated, when this tab resurrects it", async () => {
      loseNextAck = true;
      await enqueueAuditWrite({ kind: "ai_audit_log", ownerUserId: "u1", payload: auditPayload, warnLabel: "[test] audit" });
      const [key] = storedIds();
      expect(key).toMatch(UUID_V4);

      // Tab 2 reads the shared queue, delivers the row and clears the key.
      serverWrite("ai", auditPayload, undefined, key);
      localBacking.delete("llm.auditWriteOutbox.v1");

      // Tab 1 still holds the row in memory and delivers it again.
      await flushAuditWriteOutbox("u1");

      expect(mockInsertAudit.mock.calls.at(-1)![3]).toBe(key);
      expect(serverRows).toHaveLength(1);
    });

    test("crisis rows are keyed the same way", async () => {
      const signal = new AbortController().signal;
      loseNextAck = true;
      await enqueueAuditWrite(
        { kind: "crisis_event", ownerUserId: "u1", payload: crisisPayload, warnLabel: "[test] crisis" },
        { userId: "u1", accessToken: "token-a", signal, assertCurrent: jest.fn() },
      );
      await flushAuditWriteOutbox("u1", { userId: "u1", accessToken: "token-a", assertCurrent: jest.fn() });

      expect(mockInsertCrisis).toHaveBeenNthCalledWith(1, crisisPayload, "token-a", signal, KEYED);
      expect(mockInsertCrisis.mock.calls[1]![3]).toBe(mockInsertCrisis.mock.calls[0]![3]);
      expect(serverRows.filter((r) => r.kind === "crisis")).toHaveLength(1);
    });

    test("an account switch never sends A's queued row, or its key, as B", async () => {
      mockInsertAudit.mockImplementationOnce(async () => { throw new Error("network down"); });
      await enqueueAuditWrite({ kind: "ai_audit_log", ownerUserId: "u1", payload: auditPayload, warnLabel: "[test] A" });
      const [aKey] = storedIds();
      expect(aKey).toMatch(UUID_V4);

      // B signs in on the same device and uses the app.
      globalSessionOwner = "u2";
      const bPayload = { ...auditPayload, userId: "u2", promptHash: "b" };
      await enqueueAuditWrite({ kind: "ai_audit_log", ownerUserId: "u2", payload: bPayload, warnLabel: "[test] B" });
      await flushAuditWriteOutbox("u2", { userId: "u2", accessToken: "token-b", assertCurrent: jest.fn() });
      // Even an explicit request for A's rows cannot ride B's session.
      await flushAuditWriteOutbox("u1", { userId: "u2", accessToken: "token-b", assertCurrent: jest.fn() });

      const sentAsB = mockInsertAudit.mock.calls.slice(1);
      expect(sentAsB).toHaveLength(1);
      expect(sentAsB[0]![0]).toEqual(bPayload);
      expect(sentAsB[0]![3]).not.toBe(aKey);
      expect(serverRows).toEqual([expect.objectContaining({ owner: "u2", payload: bPayload })]);
      expect((await getAuditWriteOutboxForTests()).map((e) => e.ownerUserId)).toEqual(["u1"]);

      // A comes back: the row goes out under A's token with its original key.
      await flushAuditWriteOutbox("u1", { userId: "u1", accessToken: "token-a", assertCurrent: jest.fn() });

      expect(mockInsertAudit.mock.calls.at(-1)).toEqual([auditPayload, "token-a", undefined, aKey]);
      expect(serverRows.filter((r) => r.owner === "u1")).toEqual([
        { owner: "u1", kind: "ai", key: aKey, payload: auditPayload },
      ]);
      expect(await getAuditWriteOutboxForTests()).toHaveLength(0);
    });

    test.each([
      ["throws", () => { throw new Error("native module unavailable"); }],
      ["returns something that is not a v4 UUID", () => "not-a-uuid"],
    ])("when secure randomness %s, the row is still delivered unkeyed (C3 over exactly-once)", async (_label, impl) => {
      mockRandomUUID.mockImplementation(impl as () => string);
      try {
        await enqueueAuditWrite({ kind: "ai_audit_log", ownerUserId: "u1", payload: auditPayload, warnLabel: "[test] audit" });
      } finally {
        mockRandomUUID.mockImplementation(() => (require("crypto") as { randomUUID(): string }).randomUUID());
      }
      expect(mockInsertAudit).toHaveBeenCalledTimes(1);
      expect(mockInsertAudit.mock.calls[0]).toEqual([auditPayload]);
      expect(serverRows).toHaveLength(1);
    });
  });
});
