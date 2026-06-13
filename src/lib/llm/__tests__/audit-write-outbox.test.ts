const mockInsertAudit = jest.fn().mockResolvedValue(undefined);
const mockInsertCrisis = jest.fn().mockResolvedValue(undefined);

jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: (...args: unknown[]) => mockInsertAudit(...args),
}));

jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: (...args: unknown[]) => mockInsertCrisis(...args),
}));

import {
  enqueueAuditWrite,
  flushAuditWriteOutbox,
  getAuditWriteOutboxForTests,
  resetAuditWriteOutboxForTests,
} from "../audit-write-outbox";

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
  beforeEach(async () => {
    await resetAuditWriteOutboxForTests();
    mockInsertAudit.mockReset();
    mockInsertAudit.mockResolvedValue(undefined);
    mockInsertCrisis.mockReset();
    mockInsertCrisis.mockResolvedValue(undefined);
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
});
