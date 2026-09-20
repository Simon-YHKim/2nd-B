const mockCapturePurge = jest.fn<Promise<boolean>, [string]>();
const mockImportPurge = jest.fn<Promise<boolean>, [string]>();
const mockGithubPurge = jest.fn<Promise<boolean>, [string]>();
const mockAuditPurge = jest.fn<Promise<boolean>, [string]>();
const mockNotificationPurge = jest.fn<Promise<void>, [string]>();
const mockOpsUsagePurge = jest.fn<Promise<boolean>, [string]>();
const mockReasoningPurge = jest.fn<Promise<boolean>, [string]>();
const mockWikiPurge = jest.fn<Promise<boolean>, [string]>();
const mockNoticeReadPurge = jest.fn<Promise<boolean>, [string]>();
const mockNoticeLastSeenPurge = jest.fn<Promise<boolean>, [string]>();
const mockInstallFence = jest.fn<Promise<boolean>, [string]>();

jest.mock("../../capture/draft", () => ({
  purgeCaptureDraftsForDeletedAccount: (owner: string) => mockCapturePurge(owner),
}));
jest.mock("../../import/history", () => ({
  purgeImportHistoryForDeletedAccount: (owner: string) => mockImportPurge(owner),
}));
jest.mock("../../projects/github-link", () => ({
  purgeGithubUsernameForDeletedAccount: (owner: string) => mockGithubPurge(owner),
}));
jest.mock("../../llm/audit-write-outbox", () => ({
  purgeAuditWriteOutboxForOwner: (owner: string) => mockAuditPurge(owner),
}));
jest.mock("../../ops/reminders", () => ({
  clearAccountScopedLocalNotifications: (owner: string) => mockNotificationPurge(owner),
}));
jest.mock("../../ops/usage", () => ({
  purgeOpsUsageForDeletedAccount: (owner: string) => mockOpsUsagePurge(owner),
}));
jest.mock("../../reasoning/auto-pref", () => ({
  purgeAutoReasoningForDeletedAccount: (owner: string) => mockReasoningPurge(owner),
}));
jest.mock("../../wiki/auto-promote", () => ({
  purgeWikiAutoPromoteForDeletedAccount: (owner: string) => mockWikiPurge(owner),
}));
jest.mock("../../notices/read-store", () => ({
  purgeNoticeReadStateForDeletedAccount: (owner: string) => mockNoticeReadPurge(owner),
}));
jest.mock("../../notices/last-seen", () => ({
  purgeNoticeLastSeenForDeletedAccount: (owner: string) => mockNoticeLastSeenPurge(owner),
}));
jest.mock("../local-deletion-fence", () => ({
  installAccountLocalDeletionFence: (owner: string) => mockInstallFence(owner),
}));

import {
  LOCAL_PURGE_TIMEOUT_MS,
  purgeDeletedAccountLocalData,
} from "../local-purge";
import { autosaveUndoStorageKey } from "../../chat/autosave-undo-queue";

// 대화 자동 저장의 되돌리기 대기 기록(PR 1814 재설계)은 목으로 바꾸지 않는다. 실제 모듈이 웹 저장소에서 키를
// 지우는지를 이 진입점으로 본다 - 정리 목록에서 빠지거나 다른 키를 지우면 빨갛다.
const localValues = new Map<string, string>();
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => localValues.get(key) ?? null,
    setItem: (key: string, value: string) => void localValues.set(key, String(value)),
    removeItem: (key: string) => void localValues.delete(key),
  };
});
afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

beforeEach(() => {
  localValues.clear();
  mockInstallFence.mockReset().mockResolvedValue(true);
  mockNotificationPurge.mockReset().mockResolvedValue(undefined);
  for (const purge of [
    mockCapturePurge,
    mockImportPurge,
    mockGithubPurge,
    mockAuditPurge,
    mockOpsUsagePurge,
    mockReasoningPurge,
    mockWikiPurge,
    mockNoticeReadPurge,
    mockNoticeLastSeenPurge,
  ]) {
    purge.mockReset().mockResolvedValue(true);
  }
});

describe("purgeDeletedAccountLocalData", () => {
  test("purges every managed owner-scoped namespace", async () => {
    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("complete");
    expect(mockInstallFence).toHaveBeenCalledWith("owner-a");
    for (const purge of [
      mockCapturePurge,
      mockImportPurge,
      mockGithubPurge,
      mockAuditPurge,
      mockOpsUsagePurge,
      mockReasoningPurge,
      mockWikiPurge,
      mockNoticeReadPurge,
      mockNoticeLastSeenPurge,
    ]) {
      expect(purge).toHaveBeenCalledWith("owner-a");
    }
    expect(mockNotificationPurge).toHaveBeenCalledWith("owner-a");
  });

  test("removes the chat autosave undo queue of the deleted owner and keeps another owner's", async () => {
    const queued = (owner: string) => JSON.stringify([{ ownerId: owner, sourceId: "3f0c9a52-8a1d-4b1e-9c2f-6d7e8f9a0b1c" }]);
    expect(autosaveUndoStorageKey("owner-a")).toBe("chat.autosaveUndo.v1.owner-a");
    localValues.set("chat.autosaveUndo.v1.owner-a", queued("owner-a"));
    localValues.set("chat.autosaveUndo.v1.owner-b", queued("owner-b"));

    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("complete");
    expect([...localValues.keys()]).toEqual(["chat.autosaveUndo.v1.owner-b"]);
  });

  test("reports unconfirmed without skipping the remaining purges", async () => {
    mockImportPurge.mockRejectedValueOnce(new Error("disk unavailable"));
    mockAuditPurge.mockResolvedValueOnce(false);

    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
    expect(mockCapturePurge).toHaveBeenCalledTimes(1);
    expect(mockGithubPurge).toHaveBeenCalledTimes(1);
    expect(mockAuditPurge).toHaveBeenCalledTimes(1);
  });

  test("rejects an empty owner instead of widening the purge", async () => {
    await expect(purgeDeletedAccountLocalData(" ")).resolves.toBe("unconfirmed");
    expect(mockCapturePurge).not.toHaveBeenCalled();
    expect(mockImportPurge).not.toHaveBeenCalled();
    expect(mockGithubPurge).not.toHaveBeenCalled();
    expect(mockAuditPurge).not.toHaveBeenCalled();
    expect(mockOpsUsagePurge).not.toHaveBeenCalled();
    expect(mockReasoningPurge).not.toHaveBeenCalled();
    expect(mockWikiPurge).not.toHaveBeenCalled();
    expect(mockNoticeReadPurge).not.toHaveBeenCalled();
    expect(mockNoticeLastSeenPurge).not.toHaveBeenCalled();
    expect(mockNotificationPurge).not.toHaveBeenCalled();
    expect(mockInstallFence).not.toHaveBeenCalled();
  });

  test("still purges but never claims completion without a durable cross-tab fence ACK", async () => {
    mockInstallFence.mockResolvedValueOnce(false);
    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
    expect(mockCapturePurge).toHaveBeenCalledTimes(1);
    expect(mockImportPurge).toHaveBeenCalledTimes(1);
    expect(mockGithubPurge).toHaveBeenCalledTimes(1);
    expect(mockAuditPurge).toHaveBeenCalledTimes(1);
    expect(mockOpsUsagePurge).toHaveBeenCalledTimes(1);
    expect(mockReasoningPurge).toHaveBeenCalledTimes(1);
    expect(mockWikiPurge).toHaveBeenCalledTimes(1);
    expect(mockNoticeReadPurge).toHaveBeenCalledTimes(1);
    expect(mockNoticeLastSeenPurge).toHaveBeenCalledTimes(1);
    expect(mockNotificationPurge).toHaveBeenCalledTimes(1);
  });

  test("never claims completion when any owner-scoped namespace remains", async () => {
    mockReasoningPurge.mockResolvedValueOnce(false);

    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
    expect(mockOpsUsagePurge).toHaveBeenCalledTimes(1);
    expect(mockWikiPurge).toHaveBeenCalledTimes(1);
    expect(mockNoticeReadPurge).toHaveBeenCalledTimes(1);
    expect(mockNoticeLastSeenPurge).toHaveBeenCalledTimes(1);
  });

  test("never claims local completion when notification cleanup is incomplete", async () => {
    mockNotificationPurge.mockRejectedValueOnce(new Error("notification cleanup incomplete"));

    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
    expect(mockCapturePurge).toHaveBeenCalledTimes(1);
    expect(mockNotificationPurge).toHaveBeenCalledTimes(1);
  });

  test("starts every purge and returns unconfirmed at the aggregate 5 second deadline", async () => {
    jest.useFakeTimers();
    try {
      mockCapturePurge.mockImplementationOnce(() => new Promise<boolean>(() => {}));
      const result = purgeDeletedAccountLocalData("owner-a");
      await Promise.resolve();
      await Promise.resolve();

      expect(mockCapturePurge).toHaveBeenCalledTimes(1);
      expect(mockImportPurge).toHaveBeenCalledTimes(1);
      expect(mockGithubPurge).toHaveBeenCalledTimes(1);
      expect(mockAuditPurge).toHaveBeenCalledTimes(1);
      expect(mockNotificationPurge).toHaveBeenCalledTimes(1);
      expect(mockOpsUsagePurge).toHaveBeenCalledTimes(1);
      expect(mockReasoningPurge).toHaveBeenCalledTimes(1);
      expect(mockWikiPurge).toHaveBeenCalledTimes(1);
      expect(mockNoticeReadPurge).toHaveBeenCalledTimes(1);
      expect(mockNoticeLastSeenPurge).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(LOCAL_PURGE_TIMEOUT_MS);
      await expect(result).resolves.toBe("unconfirmed");
    } finally {
      jest.useRealTimers();
    }
  });
});
