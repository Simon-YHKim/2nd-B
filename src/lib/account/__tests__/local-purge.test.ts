const mockCapturePurge = jest.fn<Promise<boolean>, [string]>();
const mockAvatarPalettePurge = jest.fn<Promise<boolean>, [string]>();
const mockImportPurge = jest.fn<Promise<boolean>, [string]>();
const mockGithubPurge = jest.fn<Promise<boolean>, [string]>();
const mockAuditPurge = jest.fn<Promise<boolean>, [string]>();
const mockNotificationPurge = jest.fn<Promise<void>, [string]>();
const mockOpsUsagePurge = jest.fn<Promise<boolean>, [string]>();
const mockFocusPurge = jest.fn<Promise<boolean>, [string]>();
const mockReasoningPurge = jest.fn<Promise<boolean>, [string]>();
const mockWikiPurge = jest.fn<Promise<boolean>, [string]>();
const mockNoticeReadPurge = jest.fn<Promise<boolean>, [string]>();
const mockNoticeLastSeenPurge = jest.fn<Promise<boolean>, [string]>();
const mockStarLastSeenPurge = jest.fn<Promise<boolean>, [string]>();
const mockHealthAutoReadPurge = jest.fn<Promise<boolean>, [string]>();
const mockInstallFence = jest.fn<Promise<boolean>, [string]>();
const mockReadFence = jest.fn<Promise<boolean | null>, [string]>();

jest.mock("../../capture/draft", () => ({
  purgeCaptureDraftsForDeletedAccount: (owner: string) => mockCapturePurge(owner),
}));
jest.mock("../../avatar-palette/gallery", () => ({
  purgeAvatarPaletteItemsForDeletedAccount: (owner: string) => mockAvatarPalettePurge(owner),
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
jest.mock("../../ops/focus-store", () => ({
  purgeFocusForDeletedAccount: (owner: string) => mockFocusPurge(owner),
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
jest.mock("../../persona/star-last-seen", () => ({
  purgeStarLastSeenForDeletedAccount: (owner: string) => mockStarLastSeenPurge(owner),
}));
jest.mock("../../notices/last-seen", () => ({
  purgeNoticeLastSeenForDeletedAccount: (owner: string) => mockNoticeLastSeenPurge(owner),
}));
jest.mock("../../health/auto-read", () => ({
  purgeHealthAutoReadForDeletedAccount: (owner: string) => mockHealthAutoReadPurge(owner),
}));
jest.mock("../local-deletion-fence", () => ({
  installAccountLocalDeletionFence: (owner: string) => mockInstallFence(owner),
  readAccountLocalDeletionFence: (owner: string) => mockReadFence(owner),
}));

import {
  LOCAL_PURGE_TIMEOUT_MS,
  purgeDeletedAccountLocalData,
} from "../local-purge";

beforeEach(() => {
  mockInstallFence.mockReset().mockResolvedValue(true);
  mockReadFence.mockReset().mockResolvedValue(false);
  mockNotificationPurge.mockReset().mockResolvedValue(undefined);
  for (const purge of [
    mockAvatarPalettePurge,
    mockCapturePurge,
    mockImportPurge,
    mockGithubPurge,
    mockAuditPurge,
    mockOpsUsagePurge,
    mockFocusPurge,
    mockReasoningPurge,
    mockWikiPurge,
    mockNoticeReadPurge,
    mockNoticeLastSeenPurge,
    mockStarLastSeenPurge,
    mockHealthAutoReadPurge,
  ]) {
    purge.mockReset().mockResolvedValue(true);
  }
});

describe("purgeDeletedAccountLocalData", () => {
  test("purges every managed owner-scoped namespace", async () => {
    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("complete");
    expect(mockInstallFence).toHaveBeenCalledWith("owner-a");
    for (const purge of [
      mockAvatarPalettePurge,
      mockCapturePurge,
      mockImportPurge,
      mockGithubPurge,
      mockAuditPurge,
      mockOpsUsagePurge,
      mockFocusPurge,
      mockReasoningPurge,
      mockWikiPurge,
      mockNoticeReadPurge,
      mockNoticeLastSeenPurge,
      mockStarLastSeenPurge,
      mockHealthAutoReadPurge,
    ]) {
      expect(purge).toHaveBeenCalledWith("owner-a");
    }
    expect(mockNotificationPurge).toHaveBeenCalledWith("owner-a");
  });

  test("reports unconfirmed without skipping the remaining purges", async () => {
    mockImportPurge.mockRejectedValueOnce(new Error("disk unavailable"));
    mockAuditPurge.mockResolvedValueOnce(false);

    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
    expect(mockCapturePurge).toHaveBeenCalledTimes(1);
    expect(mockAvatarPalettePurge).toHaveBeenCalledTimes(1);
    expect(mockGithubPurge).toHaveBeenCalledTimes(1);
    expect(mockAuditPurge).toHaveBeenCalledTimes(1);
  });

  test("rejects an empty owner instead of widening the purge", async () => {
    await expect(purgeDeletedAccountLocalData(" ")).resolves.toBe("unconfirmed");
    expect(mockCapturePurge).not.toHaveBeenCalled();
    expect(mockAvatarPalettePurge).not.toHaveBeenCalled();
    expect(mockImportPurge).not.toHaveBeenCalled();
    expect(mockGithubPurge).not.toHaveBeenCalled();
    expect(mockAuditPurge).not.toHaveBeenCalled();
    expect(mockOpsUsagePurge).not.toHaveBeenCalled();
    expect(mockFocusPurge).not.toHaveBeenCalled();
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

  test("W2: a later pass that finds the marker already laid confirms the wipe (no Web Locks)", async () => {
    // The pass that lays the marker cannot join another tab's write in flight.
    mockInstallFence.mockResolvedValue(false);
    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
    // The next pass reads the marker BEFORE it lays it again: an earlier pass laid it.
    mockReadFence.mockResolvedValueOnce(true);
    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("complete");
    expect(mockReadFence.mock.invocationCallOrder[1]).toBeLessThan(mockInstallFence.mock.invocationCallOrder[1]);
    // Mutation check: an unreadable marker (null) is not "laid".
    mockReadFence.mockResolvedValueOnce(null);
    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
  });

  test("W2: a laid marker does not excuse a namespace that was not wiped", async () => {
    mockInstallFence.mockResolvedValue(false);
    mockReadFence.mockResolvedValueOnce(true);
    mockCapturePurge.mockResolvedValueOnce(false);
    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
  });

  test("never claims local completion when the /focus tally remains", async () => {
    mockFocusPurge.mockResolvedValueOnce(false);
    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
    expect(mockFocusPurge).toHaveBeenCalledWith("owner-a");
  });

  test("never claims completion when any owner-scoped namespace remains", async () => {
    mockReasoningPurge.mockResolvedValueOnce(false);

    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
    expect(mockOpsUsagePurge).toHaveBeenCalledTimes(1);
    expect(mockWikiPurge).toHaveBeenCalledTimes(1);
    expect(mockNoticeReadPurge).toHaveBeenCalledTimes(1);
    expect(mockNoticeLastSeenPurge).toHaveBeenCalledTimes(1);
  });

  test("never claims local completion when private avatar art remains", async () => {
    mockAvatarPalettePurge.mockResolvedValueOnce(false);
    await expect(purgeDeletedAccountLocalData("owner-a")).resolves.toBe("unconfirmed");
    expect(mockAvatarPalettePurge).toHaveBeenCalledWith("owner-a");
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
      // The marker read and the fence install are awaited before the purges start.
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();

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
