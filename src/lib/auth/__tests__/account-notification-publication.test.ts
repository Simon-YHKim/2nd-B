import { createAccountNotificationPublicationGate } from "../account-notification-publication";
import fs from "node:fs";
import path from "node:path";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("account notification publication gate", () => {
  test("AuthProvider awaits the gate before its first owner publication", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "AuthContext.tsx"), "utf8");
    const resolveStart = source.indexOf("async function resolveSession");
    const resolveEnd = source.indexOf("type QueuedAuthEvent", resolveStart);
    const resolveBody = source.slice(resolveStart, resolveEnd);
    const gate = resolveBody.indexOf("await accountNotificationGateRef.current!.prepare(");
    const publish = resolveBody.indexOf("noteResolvedOwner(userId)");

    expect(gate).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(gate);
    expect(source).toContain("beginAccountOwnerTransition(userId);");
  });

  test("direct A to B publication waits for A cleanup terminal result", async () => {
    const cleanupDone = deferred();
    const cleanup = jest.fn(() => cleanupDone.promise);
    const gate = createAccountNotificationPublicationGate(cleanup);
    await expect(gate.prepare("account-a", () => true)).resolves.toBe(true);

    let settled = false;
    const preparingB = gate.prepare("account-b", () => true).then((ready) => {
      settled = true;
      return ready;
    });
    await Promise.resolve();

    expect(cleanup).toHaveBeenCalledWith("account-a");
    expect(settled).toBe(false);
    expect(gate.publishedOwner()).toBe("account-a");

    cleanupDone.resolve();
    await expect(preparingB).resolves.toBe(true);
    expect(gate.publishedOwner()).toBe("account-b");
  });

  test("a superseded cleanup never publishes B and does not strand a later C", async () => {
    const firstCleanup = deferred();
    let currentOwner = "account-b";
    const cleanup = jest.fn()
      .mockImplementationOnce(() => firstCleanup.promise)
      .mockResolvedValue(undefined);
    const gate = createAccountNotificationPublicationGate(cleanup);
    await gate.prepare("account-a", () => true);

    const preparingB = gate.prepare("account-b", () => currentOwner === "account-b");
    currentOwner = "account-c";
    firstCleanup.resolve();
    await expect(preparingB).resolves.toBe(false);
    expect(gate.publishedOwner()).toBe("account-a");

    await expect(gate.prepare("account-c", () => currentOwner === "account-c")).resolves.toBe(true);
    expect(gate.publishedOwner()).toBe("account-c");
  });

  test("rapid B then C preparation shares one cleanup of the published A owner", async () => {
    const cleanupDone = deferred();
    let currentOwner = "account-b";
    const cleanup = jest.fn(() => cleanupDone.promise);
    const gate = createAccountNotificationPublicationGate(cleanup);
    await gate.prepare("account-a", () => true);

    const preparingB = gate.prepare("account-b", () => currentOwner === "account-b");
    currentOwner = "account-c";
    const preparingC = gate.prepare("account-c", () => currentOwner === "account-c");
    await Promise.resolve();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith("account-a");
    expect(gate.publishedOwner()).toBe("account-a");

    cleanupDone.resolve();
    await expect(preparingB).resolves.toBe(false);
    await expect(preparingC).resolves.toBe(true);
    expect(gate.publishedOwner()).toBe("account-c");
  });

  test("bounded cleanup failure is terminal and cannot leave bootstrap loading forever", async () => {
    const cleanup = jest.fn().mockRejectedValue(new Error("native timeout"));
    const gate = createAccountNotificationPublicationGate(cleanup);
    await gate.prepare("account-a", () => true);

    await expect(gate.prepare("account-b", () => true)).resolves.toBe(true);
    expect(gate.publishedOwner()).toBe("account-b");
  });
});
