let mockCurrent = true;
let mockLeaseAvailable = true;
const mockListeners = new Set<() => void>();
const mockPlatform = { OS: "android" };
const mockCreate = jest.fn();
const mockCreateReminder = jest.fn();
const mockSchedule = jest.fn();
jest.mock("react-native", () => ({ Platform: mockPlatform }));
jest.mock("../../auth/account-epoch", () => ({
  captureAccountOwnerLease: () => mockLeaseAvailable ? { isCurrent: () => mockCurrent } : null,
  subscribeAccountTransition: (fn: () => void) => { mockListeners.add(fn); return () => mockListeners.delete(fn); },
}));
jest.mock("../../ops/routines", () => ({ createRoutineFromRecommendation: (...args: unknown[]) => mockCreate(...args) }));
jest.mock("../../ops/one-off-reminders", () => ({ createOneOffReminder: (...args: unknown[]) => mockCreateReminder(...args) }));
jest.mock("../../ops/reminders", () => ({ scheduleRoutineReminder: (...args: unknown[]) => mockSchedule(...args), routineReminderId: (owner: string, id: string) => `owned:${owner}:${id}` }));
import { saveChatPlan } from "../save-plan";
import type { ChatPlanDraft } from "../plan-draft";

const now = new Date(2026, 9, 9, 10);
const draft = (patch: Partial<ChatPlanDraft> = {}): ChatPlanDraft => ({
  kind: "routine", title: "Take a walk", recurrence: "daily", weekday: null,
  date: "", time: "", domainId: "exercise_routine", exportConsent: false, ...patch,
});
const invalidate = () => { mockCurrent = false; mockListeners.forEach(fn => fn()); };
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalCreateUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); mockListeners.clear();
  mockCurrent = true; mockLeaseAvailable = true; mockPlatform.OS = "android";
  mockCreate.mockResolvedValue({ id: "routine-1" }); mockSchedule.mockResolvedValue("scheduled");
  mockCreateReminder.mockResolvedValue({ id: "chat-reminder-1" });
});
afterEach(() => {
  jest.runOnlyPendingTimers(); jest.useRealTimers();
  for (const [target, key, descriptor] of [[globalThis, "document", originalDocument], [URL, "createObjectURL", originalCreateUrl], [URL, "revokeObjectURL", originalRevokeUrl]] as const) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
  expect(mockListeners.size).toBe(0);
});

test("reviewed untimed weekly routine creates one row with its weekday and no alarm", async () => {
  const result = await saveChatPlan("owner-a", draft({ recurrence: "weekly", weekday: 2 }), { now });
  expect(result).toEqual({ status: "saved", routineId: "routine-1" });
  expect(mockCreate).toHaveBeenCalledWith("owner-a", "exercise_routine", { title: "Take a walk", reason: "", recurrence: "weekly" }, expect.objectContaining({ weekday: 2, signal: expect.any(AbortSignal) }));
  expect(mockSchedule).not.toHaveBeenCalled();
});

test.each(["scheduled", "denied", "unavailable", "error"])("routine save survives alarm result %s without creating a duplicate", async notification => {
  mockSchedule.mockResolvedValue(notification);
  expect(await saveChatPlan("owner-a", draft({ time: "09:00" }), { now })).toEqual({ status: "saved", routineId: "routine-1", notification });
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({ recurrence: "daily", title: "Take a walk" }), { ownerId: "owner-a", identifier: "owned:owner-a:routine-1" });
});

test("an unexpected native alarm exception still reports the already saved routine", async () => {
  mockSchedule.mockRejectedValue(new Error("native scheduling failed"));
  expect(await saveChatPlan("owner-a", draft({ time: "09:00" }), { now })).toEqual({ status: "saved", routineId: "routine-1", notification: "error" });
  expect(mockCreate).toHaveBeenCalledTimes(1);
});

test("a web routine is saved but never claims a native notification", async () => {
  mockPlatform.OS = "web";
  expect(await saveChatPlan("owner-a", draft({ time: "09:00" }), { now })).toEqual({ status: "saved", routineId: "routine-1", notification: "unavailable" });
  expect(mockSchedule).not.toHaveBeenCalled();
});

test.each(["scheduled", "denied", "unavailable", "error"])("one-off native reminders preserve details before alarm result %s", async notification => {
  mockSchedule.mockImplementation(async () => {
    expect(mockCreateReminder).toHaveBeenCalledTimes(1);
    return notification;
  });
  expect(await saveChatPlan("owner-a", draft({ kind: "reminder", date: "2026-10-10", time: "12:00" }), { now }))
    .toEqual({ status: "saved", reminderId: "chat-reminder-1", notification });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockCreateReminder).toHaveBeenCalledWith("owner-a", { title: "Take a walk", startsAtIso: new Date(2026, 9, 10, 12).toISOString() });
  expect(mockSchedule).toHaveBeenCalledWith({ title: "Take a walk", startsAtIso: new Date(2026, 9, 10, 12).toISOString() }, { ownerId: "owner-a", identifier: "owned:owner-a:chat-reminder-1" });
});

test("a native scheduling exception retains the saved one-off identifier", async () => {
  mockSchedule.mockRejectedValueOnce(new Error("OS rejected"));
  expect(await saveChatPlan("owner-a", draft({ kind: "reminder", date: "2026-10-10", time: "12:00" }), { now }))
    .toEqual({ status: "saved", reminderId: "chat-reminder-1", notification: "error" });
  expect(mockCreateReminder).toHaveBeenCalledTimes(1);
});

test.each(["full", "null", "stale"])("one-off persistence %s prevents any alarm side effect", async failure => {
  mockCreateReminder.mockImplementationOnce(async () => {
    if (failure === "full") throw new Error("full");
    if (failure === "stale") invalidate();
    return null;
  });
  expect(await saveChatPlan("owner-a", draft({ kind: "reminder", date: "2026-10-10", time: "12:00" }), { now }))
    .toEqual({ status: failure === "stale" ? "stale" : "error" });
  expect(mockSchedule).not.toHaveBeenCalled();
});

test("invalid input, missing owner and persistence failures have no follow-up effects", async () => {
  expect(await saveChatPlan("owner-a", draft({ title: "" }), { now })).toEqual({ status: "invalid", validation: "title" });
  mockLeaseAvailable = false;
  expect(await saveChatPlan("owner-a", draft(), { now })).toEqual({ status: "stale" });
  expect(mockCreate).not.toHaveBeenCalled();
  mockLeaseAvailable = true; mockCreate.mockRejectedValue(new Error("write rejected"));
  expect(await saveChatPlan("owner-a", draft({ time: "09:00" }), { now })).toEqual({ status: "error" });
  expect(mockSchedule).not.toHaveBeenCalled();
});

test("account changes abort the pending write and prevent scheduling after its response", async () => {
  mockCreate.mockImplementation(async (_owner, _domain, _rec, options) => {
    invalidate(); expect(options.signal.aborted).toBe(true); return { id: "old-owner-routine" };
  });
  expect(await saveChatPlan("owner-a", draft({ time: "09:00" }), { now })).toEqual({ status: "stale" });
  expect(mockSchedule).not.toHaveBeenCalled();
});

test("account changes during native permission/scheduling cannot publish success to the next owner", async () => {
  mockSchedule.mockImplementation(async () => { invalidate(); return "scheduled"; });
  expect(await saveChatPlan("owner-a", draft({ kind: "reminder", date: "2026-10-10", time: "12:00" }), { now })).toEqual({ status: "stale" });
});

function browser() {
  mockPlatform.OS = "web";
  const anchor = { href: "", download: "", click: jest.fn() };
  const create = jest.fn((_blob: Blob) => "blob:local-calendar");
  const revoke = jest.fn();
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => anchor } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  return { anchor, create, revoke };
}

test("web ICS needs explicit consent, contains only reviewed title/time, and reports export rather than alarm", async () => {
  const web = browser();
  const reminder = { ...draft({ kind: "reminder", date: "2026-10-10", time: "12:00" }), description: "PRIVATE CHAT" };
  expect(await saveChatPlan("owner-a", reminder, { now })).toEqual({ status: "invalid", validation: "exportConsent" });
  expect(web.create).not.toHaveBeenCalled();
  expect(await saveChatPlan("owner-a", { ...reminder, exportConsent: true }, { now })).toEqual({ status: "exported" });
  const blob = web.create.mock.calls[0][0] as Blob;
  const text = await blob.text();
  expect(text).toContain("SUMMARY:Take a walk");
  expect(text).not.toMatch(/DESCRIPTION:|RRULE:|PRIVATE CHAT|https?:\/\//);
  expect(web.anchor).toMatchObject({ href: "blob:local-calendar", download: "polascope-reminder.ics" });
  expect(web.anchor.click).toHaveBeenCalledTimes(1);
  expect(mockCreate).not.toHaveBeenCalled(); expect(mockSchedule).not.toHaveBeenCalled();
  expect(mockCreateReminder).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1000); expect(web.revoke).toHaveBeenCalledWith("blob:local-calendar");
});

test("an owner change before a browser click suppresses export and revokes its unused local blob", async () => {
  const web = browser(); web.create.mockImplementation(() => { invalidate(); return "blob:local-calendar"; });
  expect(await saveChatPlan("owner-a", draft({ kind: "reminder", date: "2026-10-10", time: "12:00", exportConsent: true }), { now })).toEqual({ status: "stale" });
  expect(web.anchor.click).not.toHaveBeenCalled();
  expect(web.revoke).toHaveBeenCalledWith("blob:local-calendar");
});
