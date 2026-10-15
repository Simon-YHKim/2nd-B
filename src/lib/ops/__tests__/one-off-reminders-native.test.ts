const values = new Map<string, string>();
const mockStore = {
  getItem: jest.fn(async (key: string) => values.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { values.delete(key); }),
};
const mockSdk = {
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn<Promise<void>, [string]>(),
};
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("../notifications-sdk", () => ({ loadNotifications: () => mockSdk }));
jest.mock("../../storage/encrypted-native-storage", () => ({ getEncryptedNativeStorage: () => mockStore }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true, default: { getItem: async () => null },
}));
import { __resetAccountEpochForTests, noteResolvedOwner } from "../../auth/account-epoch";
import { __resetAccountLocalDeletionFencesForTests } from "../../account/local-deletion-fence";
import { createOneOffReminder, listOneOffReminders, removeOneOffReminder } from "../one-off-reminders";
import { cancelRoutineReminder, routineReminderId } from "../reminders";

const event = { title: "Private task title", startsAtIso: "2026-10-10T12:00:00.000Z" };
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
function native(enabled: boolean) {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product: enabled ? "ReactNative" : "Gecko" } });
}
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-09T10:00:00.000Z"));
  jest.clearAllMocks(); values.clear(); native(true);
  mockSdk.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  __resetAccountLocalDeletionFencesForTests(); __resetAccountEpochForTests(); noteResolvedOwner("owner-a");
});
afterEach(() => { jest.useRealTimers(); });
afterAll(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
});

test("G5-06 actual SDK failure deletes the task but reports the uncancelled alarm", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  mockSdk.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error("native failure"));
  expect(await removeOneOffReminder("owner-a", row.id)).toBe("alarm-uncertain");
  expect(await listOneOffReminders("owner-a")).toEqual([]);
  expect(mockSdk.cancelScheduledNotificationAsync).toHaveBeenCalledWith(routineReminderId("owner-a", row.id));
  expect(mockSdk.cancelScheduledNotificationAsync.mock.calls[0][0]).not.toContain(event.title);
});

test("G5-06 unavailable notification hosts still allow record deletion", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  native(false);
  expect(await removeOneOffReminder("owner-a", row.id)).toBe("alarm-uncertain");
  expect(await listOneOffReminders("owner-a")).toEqual([]);
  expect(mockSdk.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

test("G5-06 a native cancellation timeout does not block record deletion", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  mockSdk.cancelScheduledNotificationAsync.mockImplementationOnce(() => new Promise(() => {}));
  const removal = removeOneOffReminder("owner-a", row.id);
  const assertion = expect(removal).resolves.toBe("alarm-uncertain");
  await jest.advanceTimersByTimeAsync(5_000);
  await assertion;
  expect(await listOneOffReminders("owner-a")).toEqual([]);
});

test("successful native cancellation removes the row", async () => {
  const row = (await createOneOffReminder("owner-a", event))!;
  expect(await removeOneOffReminder("owner-a", row.id)).toBe(true);
  expect(await listOneOffReminders("owner-a")).toEqual([]);
});

test("existing callers retain best-effort cancellation semantics", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    mockSdk.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error("native failure"));
    await expect(cancelRoutineReminder("owner-a", "routine-old")).resolves.toBeUndefined();
    native(false);
    await expect(cancelRoutineReminder("owner-a", "routine-old")).resolves.toBeUndefined();
  } finally { warn.mockRestore(); }
});
