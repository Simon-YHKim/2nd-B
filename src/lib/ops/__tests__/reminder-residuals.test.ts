import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockPlatform = { OS: "android" };
const values = new Map<string, string>();
const scheduled = new Set<string>();
const mockStore = {
  getItem: jest.fn(async (key: string) => values.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
};
const mockSdk = {
  getAllScheduledNotificationsAsync: jest.fn(async () => [...scheduled].map(identifier => ({ identifier }))),
  cancelScheduledNotificationAsync: jest.fn(async (identifier: string) => { scheduled.delete(identifier); }),
  scheduleNotificationAsync: jest.fn(async ({ identifier }: { identifier: string }) => { scheduled.add(identifier); return identifier; }),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
};
jest.mock("react-native", () => ({ Platform: mockPlatform }));
jest.mock("../notifications-sdk", () => ({ loadNotifications: () => mockSdk }));
jest.mock("@react-native-async-storage/async-storage", () => ({ __esModule: true, default: mockStore }));

import { __resetAccountEpochForTests, beginAccountOwnerTransition, noteResolvedOwner } from "../../auth/account-epoch";
import { accountNotificationStorageKey, dailyReviewNotificationId, oneShotNotificationId } from "../notification-identity";
import { runLocalNotificationMutation } from "../notification-mutation";
import { disableReminder, enableReminder, getReminderStates, getScheduledRoutineIds, routineReminderId, scheduleRoutineReminder, sweepResidualReminderNotifications } from "../reminders";

const owner = "owner-a";
const disabledKey = accountNotificationStorageKey(owner, "reminders-disabled");
const empty = { disabled: { found: 0, cancelled: 0 }, otherAccounts: { found: 0, cancelled: 0 } };
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const event = { title: "Routine", startsAtIso: "2026-10-12T12:00:00.000Z", recurrence: "daily" as const };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function alarm(id = "routine-1", account = owner) {
  const identifier = routineReminderId(account, id);
  scheduled.add(identifier);
  return identifier;
}
function disabled(...ids: string[]) { values.set(disabledKey, JSON.stringify(ids)); }
async function flush() { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-11T00:00:00.000Z"));
  jest.clearAllMocks(); values.clear(); scheduled.clear(); mockPlatform.OS = "android";
  mockStore.getItem.mockReset().mockImplementation(async key => values.get(key) ?? null);
  mockSdk.getAllScheduledNotificationsAsync.mockReset().mockImplementation(async () => [...scheduled].map(identifier => ({ identifier })));
  mockSdk.cancelScheduledNotificationAsync.mockReset().mockImplementation(async identifier => { scheduled.delete(identifier); });
  __resetAccountEpochForTests(); noteResolvedOwner(owner);
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product: "ReactNative" } });
});
afterEach(() => { jest.useRealTimers(); });
afterAll(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
});

test("Q-261011-17 only explicitly disabled routines are cancelled; chat and enabled routines stay", async () => {
  const removed = alarm(); const enabled = alarm("routine-on"); const chat = alarm("chat-recorded");
  disabled("routine-1", "chat-recorded", "not-scheduled");
  expect(await sweepResidualReminderNotifications(owner)).toEqual({ ...empty, disabled: { found: 1, cancelled: 1 } });
  expect(mockSdk.cancelScheduledNotificationAsync.mock.calls).toEqual([[removed]]);
  expect(scheduled).toEqual(new Set([enabled, chat]));
  expect(mockSdk.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  expect(await getReminderStates(owner, ["routine-1"])).toEqual({ "routine-1": false });
  expect(await getScheduledRoutineIds(owner)).toEqual(new Set(["routine-on", "chat-recorded"]));
});

test.each(["failure", "invalid JSON", "invalid shape", "empty", "timeout"])("uncertain disabled list cancels no owned alarm: %s", async reason => {
  alarm(); disabled("routine-1");
  if (reason === "failure") mockStore.getItem.mockRejectedValueOnce(new Error("storage unavailable"));
  if (reason === "invalid JSON") values.set(disabledKey, "broken");
  if (reason === "invalid shape") values.set(disabledKey, '{"routine-1":true}');
  if (reason === "empty") values.delete(disabledKey);
  if (reason === "timeout") mockStore.getItem.mockImplementationOnce(() => new Promise(() => {}));
  const sweep = sweepResidualReminderNotifications(owner);
  if (reason === "timeout") await jest.advanceTimersByTimeAsync(5_001);
  expect(await sweep).toEqual(empty);
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test.each(["rejected", "partial", "unavailable", "timeout"])("uncertain OS reads authorize neither category: %s", async reason => {
  alarm(); alarm("foreign", "owner-b"); disabled("routine-1");
  if (reason === "rejected") mockSdk.getAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error("OS unavailable"));
  if (reason === "partial") mockSdk.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
    { identifier: routineReminderId(owner, "routine-1") },
    { get identifier(): string { throw new Error("unreadable entry"); } },
  ]);
  if (reason === "unavailable") Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product: "Gecko" } });
  if (reason === "timeout") mockSdk.getAllScheduledNotificationsAsync.mockImplementationOnce(() => new Promise(() => {}));
  const sweep = sweepResidualReminderNotifications(owner);
  if (reason === "timeout") await jest.advanceTimersByTimeAsync(5_001);
  expect(await sweep).toEqual(empty);
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test("all foreign v2 types are removed while current, legacy and unrelated identifiers stay", async () => {
  const foreign = [alarm("foreign", "owner-b"), dailyReviewNotificationId("owner-b"), oneShotNotificationId("owner-b")];
  const kept = [alarm(), dailyReviewNotificationId(owner), oneShotNotificationId(owner),
    "ops-routine-old", "calendar-other-app", "ops-v2-0000000000000000-unknown", "ops-v2-invalid-routine-id"];
  [...foreign, ...kept].forEach(identifier => scheduled.add(identifier));
  expect(await sweepResidualReminderNotifications(owner)).toEqual({ ...empty, otherAccounts: { found: 3, cancelled: 3 } });
  expect(mockSdk.cancelScheduledNotificationAsync.mock.calls).toEqual(foreign.map(id => [id]));
  expect(scheduled).toEqual(new Set(kept));
  expect(mockSdk.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
});

test("both categories share one OS read and never request permission or schedule anything", async () => {
  alarm(); alarm("foreign", "owner-b"); disabled("routine-1");
  expect(await sweepResidualReminderNotifications(owner)).toEqual({ disabled: { found: 1, cancelled: 1 }, otherAccounts: { found: 1, cancelled: 1 } });
  expect(mockSdk.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  expect(mockSdk.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(mockSdk.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(mockStore.setItem).not.toHaveBeenCalled();
});

test.each(["unknown", "stale", "web"])("%s owner/runtime performs no reads or cancellations", async reason => {
  alarm(); disabled("routine-1");
  if (reason === "unknown") noteResolvedOwner(null);
  if (reason === "stale") beginAccountOwnerTransition("owner-b");
  if (reason === "web") mockPlatform.OS = "web";
  expect(await sweepResidualReminderNotifications(owner)).toEqual(empty);
  expect(mockSdk.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  expect(mockStore.getItem).not.toHaveBeenCalled();
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test("a lease becoming stale in the mutation queue prevents the OS read", async () => {
  const entered = deferred<void>(); const finish = deferred<void>();
  const pending = runLocalNotificationMutation(async () => { entered.resolve(); await finish.promise; });
  await entered.promise;
  const sweep = sweepResidualReminderNotifications(owner);
  beginAccountOwnerTransition("owner-b"); finish.resolve(); await pending;
  expect(await sweep).toEqual(empty);
  expect(mockSdk.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
});

test.each(["OS read", "disabled read"])("a transition during %s prevents every cancellation", async stage => {
  alarm(); alarm("foreign", "owner-b"); disabled("routine-1");
  if (stage === "OS read") mockSdk.getAllScheduledNotificationsAsync.mockImplementationOnce(async () => {
    beginAccountOwnerTransition("owner-b"); return [...scheduled].map(identifier => ({ identifier }));
  });
  else mockStore.getItem.mockImplementationOnce(async () => { beginAccountOwnerTransition("owner-b"); return '["routine-1"]'; });
  expect(await sweepResidualReminderNotifications(owner)).toEqual(empty);
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test.each(["disabled", "foreign"])("a transition during %s cancellation stops the remaining native calls", async kind => {
  if (kind === "disabled") { alarm(); alarm("routine-2"); disabled("routine-1", "routine-2"); }
  else { alarm("foreign-1", "owner-b"); alarm("foreign-2", "owner-b"); }
  mockSdk.cancelScheduledNotificationAsync.mockImplementationOnce(async identifier => {
    scheduled.delete(identifier); beginAccountOwnerTransition("owner-b");
  });
  const result = await sweepResidualReminderNotifications(owner);
  expect(kind === "disabled" ? result.disabled : result.otherAccounts).toEqual({ found: 2, cancelled: 1 });
  expect(mockSdk.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
});

test.each(["enabled", "unreadable", "transition"])("the final disabled/lease recheck prevents cancellation when %s", async reason => {
  alarm(); disabled("routine-1");
  mockStore.getItem.mockResolvedValueOnce('["routine-1"]');
  if (reason === "enabled") mockStore.getItem.mockResolvedValueOnce("[]");
  if (reason === "unreadable") mockStore.getItem.mockRejectedValueOnce(new Error("unavailable"));
  if (reason === "transition") mockStore.getItem.mockImplementationOnce(async () => {
    beginAccountOwnerTransition("owner-b"); return '["routine-1"]';
  });
  expect(await sweepResidualReminderNotifications(owner)).toEqual({ ...empty, disabled: { found: 1, cancelled: 0 } });
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test("enable after the sweep's disabled read waits for cancellation, then schedules an alarm the sweep cannot remove", async () => {
  const old = alarm(); disabled("routine-1");
  const read = deferred<void>(); const finishRead = deferred<string | null>();
  mockStore.getItem.mockImplementationOnce(() => { read.resolve(); return finishRead.promise; });
  const sweep = sweepResidualReminderNotifications(owner); await read.promise;
  const enable = enableReminder(owner, "routine-1", event); await flush();
  expect(mockStore.setItem).not.toHaveBeenCalled();
  expect(mockSdk.scheduleNotificationAsync).not.toHaveBeenCalled();
  finishRead.resolve('["routine-1"]');
  expect(await sweep).toEqual({ ...empty, disabled: { found: 1, cancelled: 1 } });
  expect(await enable).toBe(true);
  expect(scheduled.has(old)).toBe(true);
  expect(mockSdk.cancelScheduledNotificationAsync.mock.invocationCallOrder[0])
    .toBeLessThan(mockSdk.scheduleNotificationAsync.mock.invocationCallOrder[0]);
  expect(await sweepResidualReminderNotifications(owner)).toEqual(empty);
  expect(mockSdk.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
});

test("an enable committed before the sweep retains its scheduled alarm", async () => {
  alarm(); disabled("routine-1");
  expect(await enableReminder(owner, "routine-1", event)).toBe(true);
  expect(await sweepResidualReminderNotifications(owner)).toEqual(empty);
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test("a hung enable preference read releases the notification queue after its deadline", async () => {
  disabled("hung-enable");
  mockStore.getItem.mockImplementationOnce(() => new Promise(() => {}));
  const enable = enableReminder(owner, "hung-enable", event);
  await jest.advanceTimersByTimeAsync(5_001);
  expect(await enable).toBe(false);
  expect(mockStore.setItem).not.toHaveBeenCalled();
  expect(await enableReminder(owner, "other-enable", event)).toBe(true);
});

test.each(["disabled", "foreign"])("%s cancellation failures and timeouts remain retryable without throwing", async kind => {
  const first = alarm("routine-1", kind === "foreign" ? "owner-b" : owner);
  const second = alarm("routine-2", kind === "foreign" ? "owner-b" : owner);
  if (kind === "disabled") disabled("routine-1", "routine-2");
  mockSdk.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error("native failure"));
  mockSdk.cancelScheduledNotificationAsync.mockImplementationOnce(() => new Promise(() => {}));
  const sweep = sweepResidualReminderNotifications(owner);
  await jest.advanceTimersByTimeAsync(5_001);
  const result = await sweep;
  expect(kind === "disabled" ? result.disabled : result.otherAccounts).toEqual({ found: 2, cancelled: 0 });
  expect(scheduled).toEqual(new Set([first, second]));
  const retried = await sweepResidualReminderNotifications(owner);
  expect(kind === "disabled" ? retried.disabled : retried.otherAccounts).toEqual({ found: 2, cancelled: 2 });
  expect(scheduled.size).toBe(0);
});

test("a failed disable still persists OFF and the next sweep retries its alarm", async () => {
  alarm();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    mockSdk.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error("native failure"));
    await disableReminder(owner, "routine-1");
    expect(values.get(disabledKey)).toBe('["routine-1"]');
    expect(scheduled.size).toBe(1);
    expect(await sweepResidualReminderNotifications(owner)).toEqual({ ...empty, disabled: { found: 1, cancelled: 1 } });
  } finally { warn.mockRestore(); }
});

test.each(["resolve", "reject"])("a late native cancellation must %s before the same stable id can be enabled", async outcome => {
  const identifier = alarm("late-id"); disabled("late-id");
  const finish = deferred<void>();
  mockSdk.cancelScheduledNotificationAsync.mockImplementationOnce(async id => {
    await finish.promise;
    if (outcome === "reject") throw new Error("late failure");
    scheduled.delete(id);
  });
  const sweep = sweepResidualReminderNotifications(owner);
  await jest.advanceTimersByTimeAsync(5_001);
  expect((await sweep).disabled).toEqual({ found: 1, cancelled: 0 });
  expect(await enableReminder(owner, "late-id", event)).toBe(false);
  expect(values.get(disabledKey)).toBe('["late-id"]');
  expect(await scheduleRoutineReminder(event, { ownerId: owner, identifier })).toBe("error");
  expect(mockSdk.scheduleNotificationAsync).not.toHaveBeenCalled();
  // A never-ending native call must not block unrelated reminders or the queue.
  expect(await enableReminder(owner, "independent-id", event)).toBe(true);
  finish.resolve(); await flush();
  expect(await enableReminder(owner, "late-id", event)).toBe(true);
  expect(scheduled.has(identifier)).toBe(true);
});

test("a later retry settling cannot release an earlier pending cancellation of the same id", async () => {
  const identifier = alarm("two-pending"); disabled("two-pending");
  const first = deferred<void>(); const second = deferred<void>();
  for (const finish of [first, second]) {
    mockSdk.cancelScheduledNotificationAsync.mockImplementationOnce(async id => { await finish.promise; scheduled.delete(id); });
    const sweep = sweepResidualReminderNotifications(owner);
    await jest.advanceTimersByTimeAsync(5_001);
    expect((await sweep).disabled).toEqual({ found: 1, cancelled: 0 });
  }
  second.resolve(); await flush();
  expect(await enableReminder(owner, "two-pending", event)).toBe(false);
  expect(mockSdk.scheduleNotificationAsync).not.toHaveBeenCalled();
  first.resolve(); await flush();
  expect(await enableReminder(owner, "two-pending", event)).toBe(true);
  expect(scheduled.has(identifier)).toBe(true);
});

test.each([
  ["src/components/secondb/ChatRemindersList.tsx", "ownerId", 'if (Platform.OS === "web") return;'],
  ["src/screens/deepspace/ops/screens.tsx", "userId", 'if (Platform.OS !== "web")'],
])("source contract: %s sweeps once per native load before reading displayed state", (path, account, guard) => {
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  const call = `await sweepResidualReminderNotifications(${account})`;
  expect(source.split(call)).toHaveLength(2);
  const start = source.lastIndexOf(path.includes("Chat") ? "useFocusEffect(useCallback(" : "useEffect(() => {", source.indexOf(call));
  const load = source.slice(start, source.indexOf(call) + call.length);
  expect(load).toContain(guard);
  const after = source.slice(source.indexOf(call));
  expect(after).toContain(`getScheduledRoutineIds(${account})`);
  expect(after.indexOf(`getScheduledRoutineIds(${account})`)).toBeGreaterThan(0);
  expect(after).toMatch(path.includes("Chat") ? /if \(!active\(\)\) return;/ : /if \(!alive\) return;/);
});

test("source contract: strict OS snapshot and final checks remain inside the mutation queue", () => {
  const source = readFileSync(resolve(__dirname, "../reminders.ts"), "utf8");
  const sweep = source.slice(source.indexOf("export async function sweepResidualReminderNotifications"), source.indexOf("let privacyMigrationInFlight"));
  expect(sweep).toContain("getScheduledIdentifiers({ strict: true })");
  expect(sweep.indexOf("runLocalNotificationMutation(async () => {")).toBeLessThan(sweep.indexOf("readDisabledSet(ownerId)"));
  expect(sweep).toMatch(/if \(!latest.has\(routineId\)\) continue;/);
  expect(sweep).toMatch(/if \(!lease.isCurrent\(\)\) break;\s*await cancelScheduledIdentifier\(identifier, true, \(\) => lease.isCurrent\(\)\);/);
});
