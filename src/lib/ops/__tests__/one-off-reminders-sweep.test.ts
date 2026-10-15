const mockPlatform = { OS: "android" };
const values = new Map<string, string>();
const scheduled = new Set<string>();
const mockStore = {
  getItem: jest.fn(async (key: string) => values.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { values.delete(key); }),
};
const mockRawStore = {
  getItem: jest.fn<Promise<string | null>, [string]>(),
  setItem: jest.fn(async () => {}),
};
const mockSdk = {
  getAllScheduledNotificationsAsync: jest.fn(async () => [...scheduled].map(identifier => ({ identifier }))),
  cancelScheduledNotificationAsync: jest.fn(async (identifier: string) => { scheduled.delete(identifier); }),
  scheduleNotificationAsync: jest.fn(async ({ identifier }: { identifier: string }) => { scheduled.add(identifier); return identifier; }),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: "date" },
};
jest.mock("react-native", () => ({ Platform: mockPlatform }));
jest.mock("../notifications-sdk", () => ({ loadNotifications: () => mockSdk }));
jest.mock("../../storage/encrypted-native-storage", () => ({ getEncryptedNativeStorage: () => mockStore }));
jest.mock("@react-native-async-storage/async-storage", () => ({ __esModule: true, default: mockRawStore }));
import { __resetAccountEpochForTests, beginAccountOwnerTransition, noteResolvedOwner } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests, installAccountLocalDeletionFence, runAccountLocalMutation } from "../../account/local-deletion-fence";
import { createOneOffReminder, listOneOffReminders, oneOffRemindersKey, removeOneOffReminder, sweepOrphanedOneOffReminders } from "../one-off-reminders";
import { getScheduledRoutineIds, routineReminderId, scheduleRoutineReminder } from "../reminders";
import { runLocalNotificationMutation } from "../notification-mutation";

const event = { title: "Private task", startsAtIso: "2026-10-12T12:00:00.000Z" };
const orphan = "chat-00000000-0000-4000-8000-000000000001";
const otherOrphan = "chat-00000000-0000-4000-8000-000000000002";
const emptyResult = { found: 0, cancelled: 0 };
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function alarm(id = orphan, owner = "owner-a") {
  const identifier = routineReminderId(owner, id);
  scheduled.add(identifier);
  return identifier;
}
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-11T00:00:00.000Z"));
  jest.clearAllMocks(); values.clear(); scheduled.clear(); mockPlatform.OS = "android";
  mockRawStore.getItem.mockResolvedValue(null);
  __resetAccountLocalDeletionFencesForTests(); __resetAccountEpochForTests(); noteResolvedOwner("owner-a");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product: "ReactNative" } });
  Reflect.deleteProperty(globalThis, "localStorage");
});
afterEach(() => { jest.useRealTimers(); });
afterAll(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
  if (originalLocal) Object.defineProperty(globalThis, "localStorage", originalLocal);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

test("Q-261011-10 cancels only this owner's orphaned chat alarms and preserves recorded tasks", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  const kept = alarm(row.id); const removed = alarm();
  const server = alarm("server-routine"); const other = alarm(otherOrphan, "owner-b");
  scheduled.add("ops-routine-chat-legacy");
  scheduled.add("ops-v2-0000000000000000-daily-review");
  expect(await sweepOrphanedOneOffReminders("owner-a")).toEqual({ found: 1, cancelled: 1 });
  expect(mockSdk.cancelScheduledNotificationAsync.mock.calls).toEqual([[removed]]);
  expect(scheduled).toEqual(new Set([kept, server, other, "ops-routine-chat-legacy", "ops-v2-0000000000000000-daily-review"]));
  expect(await listOneOffReminders("owner-a")).toEqual([row]);
});

test("a truly empty store can remove all owned chat alarms, including after a failed deletion", async () => {
  const row = (await createOneOffReminder("owner-a", event))!; alarm(row.id); alarm();
  mockSdk.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error("native failure"));
  expect(await removeOneOffReminder("owner-a", row.id)).toBe("alarm-uncertain");
  expect(await sweepOrphanedOneOffReminders("owner-a")).toEqual({ found: 2, cancelled: 2 });
  expect(scheduled.size).toBe(0);
  expect(await sweepOrphanedOneOffReminders("owner-a")).toEqual(emptyResult);
});

test.each(["storage error", "corrupt JSON", "invalid version", "invalid row"])("unreadable records never authorize cleanup: %s", async reason => {
  alarm();
  if (reason === "storage error") mockStore.getItem.mockRejectedValueOnce(new Error("storage locked"));
  else values.set(oneOffRemindersKey("owner-a"), reason === "corrupt JSON" ? "broken"
    : JSON.stringify(reason === "invalid version" ? { v: 2, items: [] } : { v: 1, items: [{ id: orphan }] }));
  await expect(sweepOrphanedOneOffReminders("owner-a")).resolves.toEqual(emptyResult);
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test.each(["stale owner", "memory fence", "durable fence", "fence read error"])("skipped record reads never mean empty records: %s", async reason => {
  alarm();
  if (reason === "stale owner") beginAccountOwnerTransition("owner-b");
  if (reason === "memory fence") await installAccountLocalDeletionFence("owner-a");
  if (reason === "durable fence") mockRawStore.getItem.mockResolvedValueOnce("terminal");
  if (reason === "fence read error") mockRawStore.getItem.mockRejectedValueOnce(new Error("fence unavailable"));
  expect(await sweepOrphanedOneOffReminders("owner-a")).toEqual(emptyResult);
  expect(mockStore.getItem).not.toHaveBeenCalled();
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test("a stale lease after waiting for the account queue prevents reads and cancellations", async () => {
  alarm(); const started = deferred<void>(); const finish = deferred<void>();
  const pending = runAccountLocalMutation("owner-a", async () => { started.resolve(); await finish.promise; });
  await started.promise;
  const sweep = sweepOrphanedOneOffReminders("owner-a");
  beginAccountOwnerTransition("owner-b"); finish.resolve(); await pending;
  expect(await sweep).toEqual(emptyResult);
  expect(mockStore.getItem).not.toHaveBeenCalled();
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test.each(["record read", "OS read"])("a transition during %s prevents every cancellation", async stage => {
  alarm();
  if (stage === "record read") mockStore.getItem.mockImplementationOnce(async () => { beginAccountOwnerTransition("owner-b"); return null; });
  else mockSdk.getAllScheduledNotificationsAsync.mockImplementationOnce(async () => {
    beginAccountOwnerTransition("owner-b"); return [...scheduled].map(identifier => ({ identifier }));
  });
  expect(await sweepOrphanedOneOffReminders("owner-a")).toEqual(emptyResult);
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test.each(["rejected", "partial", "unavailable", "timeout"])("uncertain OS reads never authorize cleanup: %s", async reason => {
  alarm();
  if (reason === "rejected") mockSdk.getAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error("OS unavailable"));
  if (reason === "partial") mockSdk.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
    { identifier: routineReminderId("owner-a", orphan) },
    { get identifier(): string { throw new Error("unreadable OS entry"); } },
  ]);
  if (reason === "unavailable") Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product: "Gecko" } });
  if (reason === "timeout") mockSdk.getAllScheduledNotificationsAsync.mockImplementationOnce(() => new Promise(() => {}));
  const sweep = sweepOrphanedOneOffReminders("owner-a");
  if (reason === "timeout") await jest.advanceTimersByTimeAsync(5_001);
  expect(await sweep).toEqual(emptyResult);
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test("strict OS reading distinguishes failure from successful emptiness without changing old callers", async () => {
  await expect(getScheduledRoutineIds("owner-a", { strict: true })).resolves.toEqual(new Set());
  mockSdk.getAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error("OS unavailable"));
  await expect(getScheduledRoutineIds("owner-a", { strict: true })).rejects.toThrow("OS unavailable");
  mockSdk.getAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error("OS unavailable"));
  await expect(getScheduledRoutineIds("owner-a")).resolves.toEqual(new Set());
});

test.each(["account transition", "deletion fence"])("%s during cancellation stops the rest of the pass", async reason => {
  const first = alarm(); const second = alarm(otherOrphan); let fence: Promise<boolean> | undefined;
  mockSdk.cancelScheduledNotificationAsync.mockImplementationOnce(async identifier => {
    scheduled.delete(identifier);
    if (reason === "account transition") beginAccountOwnerTransition("owner-b");
    else fence = installAccountLocalDeletionFence("owner-a");
  });
  expect(await sweepOrphanedOneOffReminders("owner-a")).toEqual({ found: 2, cancelled: 1 });
  await fence;
  expect(mockSdk.cancelScheduledNotificationAsync.mock.calls).toEqual([[first]]);
  expect(scheduled.has(second)).toBe(true);
});

test.each(["account transition", "deletion fence"])("%s while cancellation waits in the OS queue prevents native dispatch", async reason => {
  alarm(); const started = deferred<void>(); const finish = deferred<void>(); const read = deferred<void>();
  const pending = runLocalNotificationMutation(async () => { started.resolve(); await finish.promise; });
  await started.promise;
  mockSdk.getAllScheduledNotificationsAsync.mockImplementationOnce(async () => {
    read.resolve(); return [...scheduled].map(identifier => ({ identifier }));
  });
  const sweep = sweepOrphanedOneOffReminders("owner-a"); await read.promise;
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
  let fence: Promise<boolean> | undefined;
  if (reason === "account transition") beginAccountOwnerTransition("owner-b");
  else fence = installAccountLocalDeletionFence("owner-a");
  finish.resolve(); await pending;
  expect(await sweep).toEqual({ found: 1, cancelled: 0 }); await fence;
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test.each(["failure", "timeout"])("cancellation %s is retried after the native promise settles", async reason => {
  const first = alarm(); alarm(otherOrphan);
  const finish = deferred<void>();
  if (reason === "failure") mockSdk.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error("native failure"));
  else mockSdk.cancelScheduledNotificationAsync.mockImplementationOnce(async () => { await finish.promise; throw new Error("late failure"); });
  const sweep = sweepOrphanedOneOffReminders("owner-a");
  if (reason === "timeout") await jest.advanceTimersByTimeAsync(5_001);
  await expect(sweep).resolves.toEqual({ found: 2, cancelled: 1 });
  expect(scheduled).toEqual(new Set([first]));
  if (reason === "timeout") {
    expect(await sweepOrphanedOneOffReminders("owner-a")).toEqual({ found: 1, cancelled: 0 });
    expect(mockSdk.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    finish.resolve();
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  }
  expect(await sweepOrphanedOneOffReminders("owner-a")).toEqual({ found: 1, cancelled: 1 });
  expect(scheduled.size).toBe(0);
});

test("a record written before native scheduling survives an immediate sweep", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  expect(await scheduleRoutineReminder(event, { ownerId: "owner-a", identifier: routineReminderId("owner-a", row.id) })).toBe("scheduled");
  expect(await sweepOrphanedOneOffReminders("owner-a")).toEqual(emptyResult);
  expect(scheduled.has(routineReminderId("owner-a", row.id))).toBe(true);
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test("sweeping waits for an in-flight record write and never loses the newly scheduled task", async () => {
  const started = deferred<void>(); const finish = deferred<void>();
  mockStore.setItem.mockImplementationOnce(async (key, value) => { started.resolve(); await finish.promise; values.set(key, value); });
  const creation = createOneOffReminder("owner-a", event); await started.promise;
  const sweep = sweepOrphanedOneOffReminders("owner-a");
  expect(mockSdk.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  finish.resolve(); const row = (await creation)!; alarm(row.id);
  expect(await sweep).toEqual(emptyResult);
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test("record creation and removal wait for the complete sweep", async () => {
  const row = (await createOneOffReminder("owner-a", event))!; alarm();
  const started = deferred<void>(); const finish = deferred<void>();
  mockSdk.cancelScheduledNotificationAsync.mockImplementationOnce(async identifier => {
    started.resolve(); await finish.promise; scheduled.delete(identifier);
  });
  const sweep = sweepOrphanedOneOffReminders("owner-a"); await started.promise; mockStore.setItem.mockClear();
  const creation = createOneOffReminder("owner-a", event); const removal = removeOneOffReminder("owner-a", row.id);
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
  expect(mockStore.setItem).not.toHaveBeenCalled();
  finish.resolve(); expect(await sweep).toEqual({ found: 1, cancelled: 1 });
  const added = await creation; expect(await removal).toBe(true);
  expect(await listOneOffReminders("owner-a")).toEqual([added]);
});

test("web and invalid owners perform no storage or native work", async () => {
  alarm(); expect(await sweepOrphanedOneOffReminders(" ")).toEqual(emptyResult);
  mockPlatform.OS = "web";
  expect(await sweepOrphanedOneOffReminders("owner-a")).toEqual(emptyResult);
  expect(mockStore.getItem).not.toHaveBeenCalled();
  expect(mockSdk.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});
