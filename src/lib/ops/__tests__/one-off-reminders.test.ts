const mockPlatform = { OS: "android" };
let mockOwner: string | null = "owner-a";
let mockEpoch = 0;
let nextId = 1;
const values = new Map<string, string>();
const rawValues = new Map<string, string>();
const mockStore = {
  getItem: jest.fn(async (key: string) => values.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { values.delete(key); }),
};
const mockRawStore = {
  getItem: jest.fn(async (key: string) => rawValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { rawValues.set(key, value); }),
};
const mockCancel = jest.fn(async (_owner: string, _id: string, _options?: { strict?: boolean }) => undefined);
jest.mock("react-native", () => ({ Platform: mockPlatform }));
jest.mock("expo-crypto", () => ({ randomUUID: () => `00000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, "0")}` }));
jest.mock("../../storage/encrypted-native-storage", () => ({ getEncryptedNativeStorage: () => mockStore }));
jest.mock("@react-native-async-storage/async-storage", () => ({ __esModule: true, default: mockRawStore }));
jest.mock("../reminders", () => ({ cancelRoutineReminder: (...args: [string, string, { strict?: boolean }?]) => mockCancel(...args) }));
jest.mock("../../auth/account-epoch", () => ({
  captureAccountOwnerLease: (ownerId: string) => {
    const epoch = mockEpoch;
    return ownerId === mockOwner ? { isCurrent: () => ownerId === mockOwner && epoch === mockEpoch } : null;
  },
}));
import { __resetAccountLocalDeletionFencesForTests, installAccountLocalDeletionFence } from "../../account/local-deletion-fence";
import { routineNotificationId } from "../notification-identity";
import {
  ONE_OFF_REMINDER_LIMIT, createOneOffReminder, listOneOffReminders, oneOffRemindersKey,
  purgeOneOffRemindersForDeletedAccount, removeOneOffReminder,
} from "../one-off-reminders";

const event = { title: "Read book", startsAtIso: "2026-10-10T12:00:00.000Z" };
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const switchOwner = (owner: string | null) => { mockOwner = owner; mockEpoch++; };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-09T10:00:00.000Z"));
  jest.clearAllMocks(); values.clear(); rawValues.clear(); nextId = 1;
  mockOwner = "owner-a"; mockEpoch = 0; mockPlatform.OS = "android";
  __resetAccountLocalDeletionFencesForTests();
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

test("keeps only reviewed task details in encrypted storage under a reusable OS identifier", async () => {
  const row = await createOneOffReminder("owner-a", { ...event, title: "  Read book  ", description: "PRIVATE CHAT" });
  expect(row).toEqual({ id: expect.stringMatching(/^chat-/), title: "Read book", startsAtIso: event.startsAtIso });
  expect(routineNotificationId("owner-a", row!.id)).toBeTruthy();
  expect(await listOneOffReminders("owner-a")).toEqual([row]);
  const persisted = values.get(oneOffRemindersKey("owner-a"))!;
  expect(JSON.parse(persisted)).toEqual({ v: 1, items: [row] });
  expect(persisted).not.toContain("PRIVATE CHAT");
  expect(mockRawStore.setItem).not.toHaveBeenCalled();
  expect(mockCancel).not.toHaveBeenCalled();
});

test("reloads persisted tasks, including past tasks, without deleting or rescheduling them", async () => {
  const row = { id: "chat-00000000-0000-4000-8000-000000000004", title: "Earlier task", startsAtIso: "2026-10-08T01:00:00.000Z" };
  values.set(oneOffRemindersKey("owner-a"), JSON.stringify({ v: 1, items: [row] }));
  expect(await listOneOffReminders("owner-a")).toEqual([row]);
  expect(mockStore.setItem).not.toHaveBeenCalled();
  expect(mockCancel).not.toHaveBeenCalled();
});

test("simultaneous confirmations do not lose either task", async () => {
  const rows = await Promise.all([
    createOneOffReminder("owner-a", event),
    createOneOffReminder("owner-a", { ...event, title: "Second task" }),
  ]);
  expect(await listOneOffReminders("owner-a")).toEqual(rows);
  expect(new Set(rows.map(row => row!.id)).size).toBe(2);
});

test("owner changes hide another account's details and preserve them for that owner's next login", async () => {
  const row = await createOneOffReminder("owner-a", event);
  switchOwner("owner-b");
  expect(await listOneOffReminders("owner-a")).toEqual([]);
  expect(await listOneOffReminders("owner-b")).toEqual([]);
  expect(await createOneOffReminder("owner-a", event)).toBeNull();
  switchOwner("owner-a");
  expect(await listOneOffReminders("owner-a")).toEqual([row]);
});

test.each([
  { title: "" }, { title: "x".repeat(81) }, { title: "line\nbreak" },
  { startsAtIso: "invalid" }, { startsAtIso: "2026-02-30T12:00:00.000Z" },
  { startsAtIso: "2026-10-08T12:00:00.000Z" }, { recurrence: "daily" as const },
])("invalid or expired input fails before storage mutation: %j", async patch => {
  expect(await createOneOffReminder("owner-a", { ...event, ...patch })).toBeNull();
  expect(mockStore.setItem).not.toHaveBeenCalled();
});

test("a full store rejects new tasks without evicting any existing reminder", async () => {
  const items = Array.from({ length: ONE_OFF_REMINDER_LIMIT }, (_, i) => ({
    ...event, id: `chat-00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`,
  }));
  const raw = JSON.stringify({ v: 1, items });
  values.set(oneOffRemindersKey("owner-a"), raw);
  await expect(createOneOffReminder("owner-a", event)).rejects.toThrow("one_off_reminders_full");
  expect(values.get(oneOffRemindersKey("owner-a"))).toBe(raw);
  expect(mockStore.setItem).not.toHaveBeenCalled();
});

test.each(["broken", JSON.stringify({ v: 2, items: [] }), JSON.stringify({ v: 1, items: [{ ...event, id: "bad" }] })])(
  "corrupt persisted data cannot be silently overwritten: %s", async raw => {
    values.set(oneOffRemindersKey("owner-a"), raw);
    await expect(listOneOffReminders("owner-a")).rejects.toThrow();
    await expect(createOneOffReminder("owner-a", event)).rejects.toThrow();
    expect(mockStore.setItem).not.toHaveBeenCalled();
  },
);

test("deletion cancels the same notification before removing the task", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  mockCancel.mockImplementationOnce(async () => {
    expect(JSON.parse(values.get(oneOffRemindersKey("owner-a"))!).items).toEqual([row]);
  });
  expect(await removeOneOffReminder("owner-a", row.id)).toBe(true);
  expect(mockCancel).toHaveBeenCalledWith("owner-a", row.id, { strict: true });
  expect(await listOneOffReminders("owner-a")).toEqual([]);
});

test("G5-06 failed cancellation still deletes the record and reports alarm uncertainty", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  mockCancel.mockRejectedValueOnce(new Error("OS failure"));
  expect(await removeOneOffReminder("owner-a", row.id)).toBe("alarm-uncertain");
  expect(await listOneOffReminders("owner-a")).toEqual([]);
});

test("account transitions during reading suppress old details and prevent late writes", async () => {
  const row = await createOneOffReminder("owner-a", event);
  mockStore.getItem.mockImplementationOnce(async key => { switchOwner("owner-b"); return values.get(key) ?? null; });
  expect(await listOneOffReminders("owner-a")).toEqual([]);
  switchOwner("owner-a");
  mockStore.setItem.mockClear();
  mockStore.getItem.mockImplementationOnce(async key => { switchOwner("owner-b"); return values.get(key) ?? null; });
  expect(await createOneOffReminder("owner-a", event)).toBeNull();
  expect(mockStore.setItem).not.toHaveBeenCalled();
  switchOwner("owner-a");
  expect(await listOneOffReminders("owner-a")).toEqual([row]);
});

test("a transition during cancellation prevents any later local removal", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  mockStore.setItem.mockClear();
  mockCancel.mockImplementationOnce(async () => { switchOwner("owner-b"); });
  expect(await removeOneOffReminder("owner-a", row.id)).toBe(false);
  expect(mockStore.setItem).not.toHaveBeenCalled();
});

test("G5-06 a failed cancellation followed by owner change still cannot delete the old owner's record", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  mockStore.setItem.mockClear();
  mockCancel.mockImplementationOnce(async () => { switchOwner("owner-b"); throw new Error("OS failure"); });
  expect(await removeOneOffReminder("owner-a", row.id)).toBe(false);
  expect(mockStore.setItem).not.toHaveBeenCalled();
});

test("G5-06 storage failure is not reported as successful deletion even when cancellation fails", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  mockCancel.mockRejectedValueOnce(new Error("OS failure"));
  mockStore.setItem.mockRejectedValueOnce(new Error("storage locked"));
  await expect(removeOneOffReminder("owner-a", row.id)).rejects.toThrow("storage locked");
  expect(await listOneOffReminders("owner-a")).toEqual([row]);
});

test("a terminal deletion waits for an in-flight write, purges it, and fences late confirmations", async () => {
  const started = deferred<void>();
  const finish = deferred<void>();
  mockStore.setItem.mockImplementationOnce(async (key, value) => {
    started.resolve(); await finish.promise; values.set(key, value);
  });
  const pending = createOneOffReminder("owner-a", event);
  await started.promise;
  const fence = installAccountLocalDeletionFence("owner-a");
  const purge = fence.then(() => purgeOneOffRemindersForDeletedAccount("owner-a"));
  expect(await createOneOffReminder("owner-a", event)).toBeNull();
  finish.resolve();
  expect(await pending).toBeNull();
  expect(await purge).toBe(true);
  expect(values.has(oneOffRemindersKey("owner-a"))).toBe(false);
  __resetAccountLocalDeletionFencesForTests(); // Simulate restart: durable fence still blocks creation.
  expect(await createOneOffReminder("owner-a", event)).toBeNull();
  expect(await listOneOffReminders("owner-a")).toEqual([]);
});

test("terminal purge is scoped to the deleted owner and reports storage failure", async () => {
  await createOneOffReminder("owner-a", event);
  switchOwner("owner-b");
  const other = await createOneOffReminder("owner-b", event);
  expect(await purgeOneOffRemindersForDeletedAccount("owner-a")).toBe(true);
  expect(await listOneOffReminders("owner-b")).toEqual([other]);
  mockStore.removeItem.mockRejectedValueOnce(new Error("locked"));
  expect(await purgeOneOffRemindersForDeletedAccount("owner-b")).toBe(false);
  expect(await purgeOneOffRemindersForDeletedAccount(" ")).toBe(false);
});

test("web never creates native task storage or touches the native notification SDK", async () => {
  mockPlatform.OS = "web";
  expect(await createOneOffReminder("owner-a", event)).toBeNull();
  expect(await listOneOffReminders("owner-a")).toEqual([]);
  expect(await removeOneOffReminder("owner-a", "chat-00000000-0000-4000-8000-000000000001")).toBe(false);
  expect(await purgeOneOffRemindersForDeletedAccount("owner-a")).toBe(true);
  expect(mockStore.getItem).not.toHaveBeenCalled();
  expect(mockStore.setItem).not.toHaveBeenCalled();
  expect(mockCancel).not.toHaveBeenCalled();
});
