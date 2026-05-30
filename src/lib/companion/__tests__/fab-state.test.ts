import { secondbPresence, SLEEP_AFTER_MS } from "../fab-state";

describe("secondbPresence", () => {
  it("rests as default + idle when nothing is pending and recently active", () => {
    expect(secondbPresence({ idleMs: 1000, sleepAfterMs: SLEEP_AFTER_MS })).toEqual({
      fab: "default",
      mascot: "idle",
    });
  });

  it("dozes off after the idle threshold", () => {
    expect(
      secondbPresence({ idleMs: SLEEP_AFTER_MS + 1, sleepAfterMs: SLEEP_AFTER_MS }),
    ).toEqual({ fab: "default", mascot: "sleep" });
  });

  it("shows a notification glyph and never sleeps while nudging", () => {
    expect(
      secondbPresence({
        idleMs: SLEEP_AFTER_MS * 10,
        sleepAfterMs: SLEEP_AFTER_MS,
        hasNotification: true,
      }),
    ).toEqual({ fab: "notification", mascot: "idle" });
  });

  it("prefers a chat invite over a plain notification", () => {
    expect(
      secondbPresence({
        idleMs: 0,
        sleepAfterMs: SLEEP_AFTER_MS,
        hasNotification: true,
        chatReady: true,
      }).fab,
    ).toBe("chat_ready");
  });

  it("stays awake when a chat is ready even past the idle threshold", () => {
    expect(
      secondbPresence({
        idleMs: SLEEP_AFTER_MS * 5,
        sleepAfterMs: SLEEP_AFTER_MS,
        chatReady: true,
      }).mascot,
    ).toBe("idle");
  });
});
