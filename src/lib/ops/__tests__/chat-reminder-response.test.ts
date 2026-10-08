import * as account from "../../auth/account-epoch";
import { notificationPrivacyData, routineNotificationId } from "../notification-identity";
const mockList = jest.fn();
const mockRemove = jest.fn();
const mockClear = jest.fn();
let mockSdkAvailable = true;
let mockListener: ((value: unknown) => void) | undefined;
let mockLast: unknown = null;
jest.mock("../one-off-reminders", () => ({ listOneOffReminders: (...args: unknown[]) => mockList(...args) }));
jest.mock("../notifications-sdk", () => ({ loadNotifications: () => mockSdkAvailable ? {
  DEFAULT_ACTION_IDENTIFIER: "default",
  addNotificationResponseReceivedListener: (listener: (value: unknown) => void) => { mockListener = listener; return { remove: mockRemove }; },
  getLastNotificationResponse: () => mockLast,
  clearLastNotificationResponse: () => { mockClear(); mockLast = null; },
} : null }));
import { observeChatReminderResponses } from "../chat-reminder-response";
function response(owner = "a", id = "chat-1", actionIdentifier = "default") {
  return { actionIdentifier, notification: { request: {
    identifier: routineNotificationId(owner, id)!, content: { data: notificationPrivacyData(owner) },
  } } };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  jest.clearAllMocks(); account.__resetAccountEpochForTests(); account.noteResolvedOwner("a");
  mockSdkAvailable = true; mockLast = null; mockListener = undefined; mockList.mockResolvedValue([{ id: "chat-1" }]);
});

test("a cold-start tap resolves an owned saved reminder once and clears only that response", async () => {
  mockLast = response(); const open = jest.fn(); const close = observeChatReminderResponses("a", open);
  mockListener!(mockLast); await tick();
  expect(mockList).toHaveBeenCalledTimes(1); expect(mockList).toHaveBeenCalledWith("a");
  expect(open).toHaveBeenCalledTimes(1); expect(mockClear).toHaveBeenCalledTimes(1);
  close(); expect(mockRemove).toHaveBeenCalledTimes(1);
});
test("foreign owners, ordinary routine ids, custom actions and unmarked requests cannot navigate", async () => {
  const open = jest.fn(); const close = observeChatReminderResponses("a", open);
  mockListener!(response("b")); mockListener!(response("a", "other")); mockListener!(response("a", "chat-1", "dismiss"));
  const unmarked = response(); unmarked.notification.request.content.data = {}; mockListener!(unmarked);
  await tick(); expect(mockList).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled(); close();
});
test.each(["owner", "unmount", "missing"])("a response cannot open after %s changes", async reason => {
  let resolve!: (rows: { id: string }[]) => void;
  mockList.mockImplementation(() => new Promise(done => { resolve = done; }));
  const open = jest.fn(); const close = observeChatReminderResponses("a", open); mockListener!(response());
  if (reason === "owner") account.beginAccountOwnerTransition("b");
  if (reason === "unmount") close();
  resolve(reason === "missing" ? [] : [{ id: "chat-1" }]); await tick();
  expect(open).not.toHaveBeenCalled(); expect(mockClear).not.toHaveBeenCalled(); if (reason !== "unmount") close();
});
test("handling an older event does not clear a newer notification response", async () => {
  const open = jest.fn(); const close = observeChatReminderResponses("a", open);
  mockListener!(response()); mockLast = response("a", "chat-new"); await tick();
  expect(open).toHaveBeenCalledTimes(1); expect(mockClear).not.toHaveBeenCalled(); close();
});
test("unavailable native hosts and unpublished owners are inert", () => {
  mockSdkAvailable = false; observeChatReminderResponses("a", jest.fn())();
  mockSdkAvailable = true; observeChatReminderResponses("b", jest.fn())();
  expect(mockListener).toBeUndefined();
});
