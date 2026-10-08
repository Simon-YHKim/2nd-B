import { advancePhoneTransition, initialPhoneTransition, type PhoneScene } from "../phone-transition";

const home = (pageIndex = 2): PhoneScene => ({ screenStack: [], pageIndex, phoneApp: null, selectedNoticeId: null });
const route = (...screenStack: string[]): PhoneScene => ({ ...home(), screenStack });
const notices = (selectedNoticeId: string | null = null): PhoneScene => ({ ...home(), phoneApp: "notifications", selectedNoticeId });
const kind = (from: PhoneScene, to: PhoneScene) => advancePhoneTransition(initialPhoneTransition(from), to).kind;

test("app launch, nested push, pop, and home each have their own direction", () => {
  expect(kind(home(), route("/settings"))).toBe("open");
  expect(kind(route("/settings"), route("/settings", "/account"))).toBe("push");
  expect(kind(route("/settings", "/account"), route("/settings"))).toBe("back");
  expect(kind(route("/settings", "/account"), home())).toBe("home");
  expect(kind(home(0), route("/board/summary"))).toBe("open");
  expect(kind(route("/board/summary"), home(0))).toBe("home");
});

test("the actual routine route added by #2178 remains a normal phone app", () => {
  expect(kind(home(), route("/ops"))).toBe("open");
  expect(kind(route("/ops"), route("/ops", "/reminders"))).toBe("push");
  expect(kind(route("/ops", "/reminders"), route("/ops"))).toBe("back");
});

test("page arrows, dots, swipe, and Back select direction from their destination", () => {
  expect(kind(home(0), home(1))).toBe("page-forward");
  expect(kind(home(1), home(2))).toBe("page-forward");
  expect(kind(home(2), home(0))).toBe("page-back");
  expect(kind(home(1), home(0))).toBe("page-back");
});

test("notification launch, detail, Back, and Home also animate", () => {
  expect(kind(home(), notices())).toBe("open");
  expect(kind(notices(), notices("notice-a"))).toBe("push");
  expect(kind(notices("notice-a"), notices())).toBe("back");
  expect(kind(notices("notice-a"), notices("notice-b"))).toBe("replace");
  expect(kind(notices("notice-a"), home())).toBe("home");
  // The home bell enters directly in the notification app.
  expect(initialPhoneTransition(notices()).kind).toBe("open");
});

test("a route opened over notifications returns to that app, not to the launcher", () => {
  const nested: PhoneScene = { ...notices(), screenStack: ["/terms"] };
  expect(kind(notices(), nested)).toBe("push");
  expect(kind(nested, notices())).toBe("back");
  expect(kind(nested, home())).toBe("home");
});

test("replace and query-only replacement do not impersonate a push", () => {
  expect(kind(route("/settings"), route("/account"))).toBe("replace");
  expect(kind(route("/import?mode=account"), route("/import?mode=calendar"))).toBe("replace");
  expect(kind(route("/settings", "/account"), route("/settings", "/privacy"))).toBe("replace");
});

test("repeated pushes preserve their stack depth without ambiguous route keys", () => {
  const first = initialPhoneTransition(route("/settings"));
  const second = advancePhoneTransition(first, route("/settings", "/settings"));
  expect(second.kind).toBe("push");
  expect(second.key).not.toBe(first.key);
  expect(advancePhoneTransition(second, route("/settings")).kind).toBe("back");
  expect(initialPhoneTransition(route("/wiki?q=a,b")).key).not.toBe(initialPhoneTransition(route("/wiki?q=a", "b")).key);
});

test("refreshes and repeated presses do not replay or change an in-flight transition", () => {
  const pushed = advancePhoneTransition(initialPhoneTransition(route("/settings")), route("/settings", "/account"));
  expect(advancePhoneTransition(pushed, route("/settings", "/account"))).toBe(pushed);
  const page = advancePhoneTransition(initialPhoneTransition(home(0)), home(1));
  expect(advancePhoneTransition(page, home(1))).toBe(page);
  const detail = advancePhoneTransition(initialPhoneTransition(notices()), notices("notice-a"));
  expect(advancePhoneTransition(detail, notices("notice-a"))).toBe(detail);
});

test("hidden launcher and notification state cannot animate the currently hosted route", () => {
  const first = initialPhoneTransition(route("/settings"));
  expect(advancePhoneTransition(first, { ...notices("notice-a"), pageIndex: 0, screenStack: ["/settings"] })).toBe(first);
});

test("transition policy never changes navigation input, even for an unavailable route", () => {
  const previous = Object.freeze({ ...home(), screenStack: Object.freeze([]) });
  const next = Object.freeze({ ...home(), screenStack: Object.freeze(["/not-connected?from=phone"]) });
  const transition = advancePhoneTransition(initialPhoneTransition(previous), next);
  expect(transition.kind).toBe("open");
  expect(transition.scene).toBe(next);
  expect(previous.screenStack).toEqual([]);
  expect(next.screenStack).toEqual(["/not-connected?from=phone"]);
});
