import { CHAT_DAILY_LIMIT, checkChatLimit, kstDateToday } from "../limits";

describe("CHAT_DAILY_LIMIT", () => {
  test("matches monetization v2 numbers (Simon-approved 2026-06-10)", () => {
    expect(CHAT_DAILY_LIMIT.free).toBe(5);
    expect(CHAT_DAILY_LIMIT.soma).toBe(30);
    expect(CHAT_DAILY_LIMIT.cortex).toBe(80);
    expect(CHAT_DAILY_LIMIT.brain).toBe(250);
  });
});

describe("checkChatLimit", () => {
  test("free tier under limit → allowed, with remaining count", () => {
    const r = checkChatLimit("free", 1);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(5);
    expect(r.used).toBe(1);
    expect(r.remaining).toBe(4);
    expect(r.upgradeTo).toBeNull();
  });

  test("free tier at exact limit → blocked, hints upgrade to the soma entry tier", () => {
    const r = checkChatLimit("free", 5);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.upgradeTo).toBe("soma");
  });

  test("free tier over limit → blocked, remaining clamps to 0", () => {
    const r = checkChatLimit("free", 99);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  test("upgrade ladder walks every paid step: soma → cortex → brain → null", () => {
    expect(checkChatLimit("soma", 30).upgradeTo).toBe("cortex");
    expect(checkChatLimit("cortex", 80).upgradeTo).toBe("brain");
    expect(checkChatLimit("brain", 250).upgradeTo).toBeNull();
  });
});

describe("kstDateToday", () => {
  test("returns YYYY-MM-DD shape", () => {
    expect(kstDateToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("UTC just after midnight rolls forward by 9 hours to KST", () => {
    // 2026-05-25 00:30:00 UTC = 2026-05-25 09:30:00 KST → "2026-05-25"
    expect(kstDateToday(new Date("2026-05-25T00:30:00Z"))).toBe("2026-05-25");
  });

  test("UTC late evening crosses KST date boundary", () => {
    // 2026-05-25 16:00:00 UTC = 2026-05-26 01:00:00 KST → "2026-05-26"
    expect(kstDateToday(new Date("2026-05-25T16:00:00Z"))).toBe("2026-05-26");
  });

  test("UTC midnight exactly = KST 09:00 same day", () => {
    expect(kstDateToday(new Date("2026-05-25T00:00:00Z"))).toBe("2026-05-25");
  });

  test("KST day is device-timezone-independent (ignores getTimezoneOffset, DST-proof)", () => {
    // The old implementation mixed getTimezoneOffset() (at `now`) with dayjs-local
    // formatting (at now+9h); across a DST transition those offsets disagreed and the
    // KST day flipped near the reset boundary. Delegating to the absolute-epoch
    // kstDayKey means a nonzero device offset must not change the answer.
    const spy = jest.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(420); // e.g. PDT
    try {
      expect(kstDateToday(new Date("2026-05-25T16:00:00Z"))).toBe("2026-05-26"); // KST 01:00 → 26th
      expect(kstDateToday(new Date("2026-05-25T14:30:00Z"))).toBe("2026-05-25"); // KST 23:30 → 25th
    } finally {
      spy.mockRestore();
    }
  });
});
