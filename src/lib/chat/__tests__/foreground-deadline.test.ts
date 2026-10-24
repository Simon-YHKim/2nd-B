import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppState } from "react-native";
import {
  createNativeForegroundSource, createWebForegroundSource, FOREGROUND_DEADLINE_MS,
  FOREGROUND_RESUME_GRACE_MS, observeForegroundDeadline, startForegroundDeadline,
  type ForegroundDeadlineClock, type ForegroundDeadlineOptions, type ForegroundSource,
} from "../foreground-deadline";

type Timer = { callback: () => void; due: number; pending: boolean };
class FakeClock implements ForegroundDeadlineClock {
  time = 0;
  readonly timers: Timer[] = [];
  now = () => this.time;
  schedule = (callback: () => void, delayMs: number) => {
    const timer = { callback, due: this.time + delayMs, pending: true };
    this.timers.push(timer);
    return () => { timer.pending = false; };
  };
  get pending() { return this.timers.filter(timer => timer.pending); }
  get latest() { return this.timers[this.timers.length - 1]; }
  // Run even a cancelled callback, as if it had already entered the event queue.
  fire(timer: Timer) { timer.pending = false; timer.callback(); }
  elapse(ms: number) { this.time += ms; }
  advance(ms: number) {
    const target = this.time + ms;
    for (;;) {
      const next = this.pending.filter(timer => timer.due <= target).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      this.time = Math.max(this.time, next.due);
      this.fire(next);
    }
    this.time = target;
  }
}

function source(initial = true) {
  let active = initial;
  const listeners = new Set<() => void>();
  const foreground: ForegroundSource = {
    isActive: jest.fn(() => active),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return {
    foreground, listeners,
    set(value: boolean, emit = true) { active = value; if (emit) [...listeners].forEach(listener => listener()); },
  };
}

function fixture(kind: ForegroundDeadlineOptions["kind"] = "reservation", active = true) {
  const clock = new FakeClock(), state = source(active), onExpire = jest.fn();
  const options = { kind, clock, foreground: state.foreground, onExpire };
  return { clock, state, onExpire, options, start: () => startForegroundDeadline(options) };
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test.each([['reservation', 20_000], ['transport', 120_000]] as const)(
  "T19 %s expires once at exactly %i foreground milliseconds", (kind, budget) => {
    const f = fixture(kind); f.start();
    expect(FOREGROUND_DEADLINE_MS[kind]).toBe(budget);
    f.clock.advance(budget - 1); expect(f.onExpire).not.toHaveBeenCalled();
    f.clock.advance(1); expect(f.onExpire).toHaveBeenCalledTimes(1);
    expect(f.clock.pending).toHaveLength(0); expect(f.state.listeners.size).toBe(0);
    f.clock.fire(f.clock.latest); f.state.set(false); f.state.set(true); f.clock.advance(budget);
    expect(f.onExpire).toHaveBeenCalledTimes(1);
  },
);

test("T19 excludes inactive time and preserves a remaining budget longer than the grace", () => {
  const f = fixture("transport"); f.start(); f.clock.advance(10_000); f.state.set(false);
  expect(f.clock.pending).toHaveLength(0);
  f.clock.advance(600_000); expect(f.onExpire).not.toHaveBeenCalled();
  f.state.set(true); f.clock.advance(109_999); expect(f.onExpire).not.toHaveBeenCalled();
  f.clock.advance(1); expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 two long hidden intervals preserve the full remaining transport budget", () => {
  const f = fixture("transport"); f.start();
  f.clock.advance(10_000); f.state.set(false); f.clock.advance(600_000); f.state.set(true);
  f.clock.advance(50_000); f.state.set(false); f.clock.advance(600_000); f.state.set(true);
  // 60 seconds of active time remain, well above the 15-second return grace.
  f.clock.advance(59_999); expect(f.onExpire).not.toHaveBeenCalled();
  f.clock.advance(1); expect(f.onExpire).toHaveBeenCalledTimes(1);
  f.clock.advance(120_000); expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test.each(["reservation", "transport"] as const)("T19 %s gets a full 15 seconds on every return", kind => {
  const f = fixture(kind); f.start(); f.clock.advance(FOREGROUND_DEADLINE_MS[kind] - 1_000);
  f.state.set(false); f.clock.advance(600_000); f.state.set(true);
  expect(FOREGROUND_RESUME_GRACE_MS).toBe(15_000);
  f.clock.advance(14_999); expect(f.onExpire).not.toHaveBeenCalled();
  f.state.set(false); f.clock.advance(600_000); f.state.set(true);
  f.clock.advance(14_999); expect(f.onExpire).not.toHaveBeenCalled();
  f.clock.advance(1); expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 duplicate active events do not reset the budget or replenish grace", () => {
  const f = fixture(); f.start(); f.clock.advance(18_000); f.state.set(true);
  f.clock.advance(1_999); expect(f.onExpire).not.toHaveBeenCalled();
  f.clock.advance(1); expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 a queued old generation cannot expire or replace the new timer", () => {
  const f = fixture(); f.start(); const old = f.clock.latest;
  f.clock.advance(19_000); f.state.set(false); f.clock.advance(60_000); f.state.set(true);
  const current = f.clock.latest;
  const scheduled = f.clock.timers.length;
  f.clock.elapse(15_000); f.clock.fire(old);
  expect(f.onExpire).not.toHaveBeenCalled(); expect(f.clock.timers).toHaveLength(scheduled);
  expect(f.clock.pending).toEqual([current]);
  f.clock.fire(current); expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 callback rechecks activity even when the hidden event has not been delivered", () => {
  const f = fixture(); f.start(); f.state.set(false, false); f.clock.advance(20_000);
  expect(f.onExpire).not.toHaveBeenCalled(); expect(f.clock.pending).toHaveLength(0);
  f.clock.advance(60_000); f.state.set(true); f.clock.advance(14_999);
  expect(f.onExpire).not.toHaveBeenCalled(); f.clock.advance(1);
  expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 callback rechecks its generation after a lifecycle transition during the state read", () => {
  const f = fixture(); f.start();
  jest.mocked(f.state.foreground.isActive).mockImplementationOnce(() => {
    f.state.set(false); f.state.set(true); return true;
  });
  f.clock.advance(20_000);
  expect(f.onExpire).not.toHaveBeenCalled();
  // Two arms only: initial timer and the return timer; the old callback does nothing.
  expect(f.clock.timers).toHaveLength(2); expect(f.clock.pending).toHaveLength(1);
  f.clock.advance(15_000); expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 stop invalidates queued callbacks, removes the subscription and is idempotent", () => {
  const f = fixture(); const deadline = f.start(), old = f.clock.latest;
  deadline.stop(); deadline.stop(); f.clock.elapse(20_000); f.clock.fire(old);
  f.state.set(false); f.state.set(true);
  expect(f.onExpire).not.toHaveBeenCalled(); expect(f.state.listeners.size).toBe(0);
  expect(f.clock.pending).toHaveLength(0); expect(f.clock.timers).toHaveLength(1);
});

test("T19 disposal during the callback state read cannot publish expiry", () => {
  const f = fixture(); const deadline = f.start();
  jest.mocked(f.state.foreground.isActive).mockImplementationOnce(() => { deadline.stop(); return true; });
  f.clock.advance(20_000); expect(f.onExpire).not.toHaveBeenCalled();
  expect(f.clock.pending).toHaveLength(0); expect(f.state.listeners.size).toBe(0);
});

test("T19 disposal during the listener state read cannot install a new timer", () => {
  const f = fixture("reservation", false), deadline = f.start();
  jest.mocked(f.state.foreground.isActive).mockImplementationOnce(() => { deadline.stop(); return true; });
  f.state.set(true);
  expect(f.clock.timers).toHaveLength(0); expect(f.state.listeners.size).toBe(0);
  f.clock.advance(20_000); expect(f.onExpire).not.toHaveBeenCalled();
});

test("T19 an early timer callback reschedules only the actual remaining time", () => {
  const f = fixture(); f.start(); f.clock.elapse(2_000); f.clock.fire(f.clock.latest);
  expect(f.clock.latest.due).toBe(20_000); expect(f.onExpire).not.toHaveBeenCalled();
  f.clock.advance(18_000); expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 an early callback followed by a pause never charges active time twice", () => {
  const f = fixture("transport"); f.start();
  f.clock.elapse(2_000); f.clock.fire(f.clock.latest);
  f.clock.advance(58_000); f.state.set(false); f.clock.advance(600_000); f.state.set(true);
  f.clock.advance(59_999); expect(f.onExpire).not.toHaveBeenCalled();
  f.clock.advance(1); expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 a callback one millisecond early must rearm without expiring", () => {
  const f = fixture(); f.start(); f.clock.elapse(19_999); f.clock.fire(f.clock.latest);
  expect(f.onExpire).not.toHaveBeenCalled(); expect(f.clock.pending).toHaveLength(1);
  expect(f.clock.latest.due).toBe(20_000);
  f.clock.advance(1); expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 timers and listeners are removed before a throwing expiry callback", () => {
  const f = fixture(), atExpiry = jest.fn(), error = new Error("screen expiry");
  f.onExpire.mockImplementation(() => {
    atExpiry(f.clock.pending.length, f.state.listeners.size);
    throw error;
  });
  f.start(); const timer = f.clock.latest;
  expect(() => f.clock.advance(20_000)).toThrow(error);
  expect(atExpiry).toHaveBeenCalledWith(0, 0);
  expect(f.clock.pending).toHaveLength(0); expect(f.state.listeners.size).toBe(0);
  f.clock.fire(timer); f.state.set(false); f.state.set(true); f.clock.advance(20_000);
  expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 retiring one request does not stop a newer request", () => {
  const f = fixture(); const old = f.start(), oldTimer = f.clock.latest;
  f.clock.advance(1_000); const nextExpiry = jest.fn();
  startForegroundDeadline({ ...f.options, onExpire: nextExpiry });
  old.stop(); f.clock.elapse(20_000); f.clock.fire(oldTimer);
  expect(f.onExpire).not.toHaveBeenCalled(); expect(nextExpiry).not.toHaveBeenCalled();
  f.clock.advance(0); expect(nextExpiry).toHaveBeenCalledTimes(1);
});

function native(initial: string | null, installed?: () => void) {
  const listeners = new Set<() => void>(), removed = jest.fn();
  const app = {
    currentState: initial,
    addEventListener: jest.fn((_event: "change", listener: () => void) => {
      listeners.add(listener); installed?.();
      return { remove() { removed(); listeners.delete(listener); } };
    }),
  };
  return { app, listeners, removed, change(state: string | null) {
    app.currentState = state; [...listeners].forEach(listener => listener());
  } };
}

test.each([null, "unknown", "inactive", "background"])("T19 native initial %s never assumes active", initial => {
  const f = fixture(); const n = native(initial);
  startForegroundDeadline({ ...f.options, foreground: createNativeForegroundSource(n.app) });
  f.clock.advance(1_000_000); expect(f.onExpire).not.toHaveBeenCalled();
  expect(f.clock.timers).toHaveLength(0);
  n.change("active"); f.clock.advance(19_999); expect(f.onExpire).not.toHaveBeenCalled();
  f.clock.advance(1); expect(f.onExpire).toHaveBeenCalledTimes(1); expect(n.removed).toHaveBeenCalledTimes(1);
});

test.each(["active", "background"])("T19 native re-reads %s after subscription installation", after => {
  const f = fixture();
  const n = native(after === "active" ? "background" : "active", () => { n.app.currentState = after; });
  startForegroundDeadline({ ...f.options, foreground: createNativeForegroundSource(n.app) });
  expect(n.app.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  expect(f.clock.pending).toHaveLength(after === "active" ? 1 : 0);
  f.clock.advance(20_000); expect(f.onExpire).toHaveBeenCalledTimes(after === "active" ? 1 : 0);
});

test.each(["inactive", "background"])("T19 native %s pauses and resumes with grace", hidden => {
  const f = fixture(); const n = native("active");
  startForegroundDeadline({ ...f.options, foreground: createNativeForegroundSource(n.app) });
  f.clock.advance(19_000); n.change(hidden); f.clock.advance(300_000);
  expect(f.onExpire).not.toHaveBeenCalled(); n.change("active"); f.clock.advance(14_999);
  expect(f.onExpire).not.toHaveBeenCalled(); f.clock.advance(1);
  expect(f.onExpire).toHaveBeenCalledTimes(1);
});

test("T19 web uses visibilitychange, re-reads after installation and unsubscribes", () => {
  const f = fixture(); const listeners = new Set<() => void>();
  const doc = {
    visibilityState: "hidden",
    addEventListener: jest.fn((_event: "visibilitychange", listener: () => void) => {
      listeners.add(listener); doc.visibilityState = "visible";
    }),
    removeEventListener: jest.fn((_event: "visibilitychange", listener: () => void) => listeners.delete(listener)),
  };
  const change = (state: string) => { doc.visibilityState = state; [...listeners].forEach(listener => listener()); };
  startForegroundDeadline({ ...f.options, foreground: createWebForegroundSource(doc) });
  expect(doc.addEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  f.clock.advance(19_000); change("hidden"); f.clock.advance(300_000);
  expect(f.onExpire).not.toHaveBeenCalled(); change("visible"); f.clock.advance(14_999);
  expect(f.onExpire).not.toHaveBeenCalled(); f.clock.advance(1);
  expect(f.onExpire).toHaveBeenCalledTimes(1); expect(listeners.size).toBe(0);
  expect(doc.removeEventListener).toHaveBeenCalledWith("visibilitychange", doc.addEventListener.mock.calls[0][1]);
});

test.each(["hidden", "prerender", "unknown"])("T19 web initial %s never spends the budget", visibilityState => {
  const f = fixture(); const remove = jest.fn();
  const deadline = startForegroundDeadline({ ...f.options, foreground: createWebForegroundSource({
    visibilityState, addEventListener: jest.fn(), removeEventListener: remove,
  }) });
  f.clock.advance(600_000); expect(f.clock.timers).toHaveLength(0);
  expect(f.onExpire).not.toHaveBeenCalled(); deadline.stop(); expect(remove).toHaveBeenCalledTimes(1);
});

test("T19 subscription callbacks during setup cannot start a speculative active timer", () => {
  const f = fixture(); const isActive = jest.fn(() => false);
  startForegroundDeadline({ ...f.options, foreground: {
    isActive, subscribe(listener) { listener(); return () => {}; },
  } });
  expect(isActive).toHaveBeenCalledTimes(1); expect(f.clock.pending).toHaveLength(0);
});

test("T19 platform sources accept real AppState and document types without runtime imports", () => {
  // Checked by tsc, not called: tests never load React Native or require a browser.
  const nativeAdapter: (value: typeof AppState) => ForegroundSource = createNativeForegroundSource;
  const webAdapter: (value: Document) => ForegroundSource = createWebForegroundSource;
  expect(nativeAdapter).toBe(createNativeForegroundSource); expect(webAdapter).toBe(createWebForegroundSource);
});

test("T19 the default monotonic clock schedules and clears native timers", () => {
  jest.useFakeTimers();
  try {
    const f = fixture();
    const deadline = startForegroundDeadline({ ...f.options, clock: undefined });
    jest.advanceTimersByTime(19_999); expect(f.onExpire).not.toHaveBeenCalled();
    deadline.stop(); jest.advanceTimersByTime(1); expect(f.onExpire).not.toHaveBeenCalled();
    startForegroundDeadline({ ...f.options, clock: undefined });
    jest.advanceTimersByTime(20_000); expect(f.onExpire).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test("T19 expiry never aborts the original transport or settles its pending promise", async () => {
  const f = fixture("transport"), result = deferred<{ status: number }>();
  const controller = new AbortController();
  const abort = jest.fn(() => controller.abort());
  controller.signal.addEventListener("abort", () => result.reject(new Error("aborted")));
  // A cancellable transport still must not be cancelled by a screen deadline.
  const transport = Object.assign(result.promise, { abort });
  const observed = observeForegroundDeadline(transport, f.options), settled = jest.fn();
  void observed.then(settled, settled);
  f.clock.advance(120_000); await Promise.resolve();
  expect(f.onExpire).toHaveBeenCalledTimes(1); expect(abort).not.toHaveBeenCalled();
  expect(controller.signal.aborted).toBe(false); expect(settled).not.toHaveBeenCalled();
  const response = { status: 200 }; result.resolve(response);
  await expect(observed).resolves.toBe(response); expect(settled).toHaveBeenCalledTimes(1);
});

test.each(["consent", "crisis", "audit", "network"])("T19 late %s rejection remains observable", kind => {
  const f = fixture(), result = deferred<never>();
  const error = { kind }; const observed = observeForegroundDeadline(result.promise, f.options);
  f.clock.advance(20_000); expect(f.onExpire).toHaveBeenCalledTimes(1);
  result.reject(error); return expect(observed).rejects.toBe(error);
});

test.each(["resolve", "reject"] as const)("T19 early %s stops the deadline and preserves the original value", async mode => {
  const f = fixture(), result = deferred<object>(), value = {};
  const observed = observeForegroundDeadline(result.promise, f.options);
  if (mode === "resolve") { result.resolve(value); await expect(observed).resolves.toBe(value); }
  else { result.reject(value); await expect(observed).rejects.toBe(value); }
  f.clock.advance(60_000); f.clock.fire(f.clock.latest);
  expect(f.onExpire).not.toHaveBeenCalled(); expect(f.state.listeners.size).toBe(0);
});

test.each(["resolve", "reject"] as const)("T19 owner disposal still observes a late %s", async mode => {
  const f = fixture(), result = deferred<object>(), value = {}, settled = jest.fn();
  const observed = observeForegroundDeadline(result.promise, f.options), old = f.clock.latest;
  void observed.then(settled, settled);
  expect(f.state.listeners.size).toBe(1);
  observed.stop(); observed.stop();
  expect(f.state.listeners.size).toBe(0); expect(f.clock.pending).toHaveLength(0);
  f.state.set(false); f.state.set(true); f.clock.advance(600_000); f.clock.fire(old);
  await Promise.resolve();
  expect(f.onExpire).not.toHaveBeenCalled(); expect(f.clock.timers).toHaveLength(1);
  expect(settled).not.toHaveBeenCalled();
  if (mode === "resolve") { result.resolve(value); await expect(observed).resolves.toBe(value); }
  else { result.reject(value); await expect(observed).rejects.toBe(value); }
  expect(settled).toHaveBeenCalledTimes(1); expect(settled).toHaveBeenCalledWith(value);
});

describe.each(["subscribe", "isActive", "now", "schedule"] as const)("T19 failed %s setup", stage => {
  test.each(["resolve", "reject"] as const)("keeps observing the original %s without leaking resources", async mode => {
    const f = fixture(), result = deferred<object>(), value = {}, settled = jest.fn();
    const fail = () => { throw new Error("deadline unavailable"); };
    if (stage === "subscribe") jest.spyOn(f.state.foreground, "subscribe").mockImplementationOnce(fail);
    else if (stage === "isActive") jest.mocked(f.state.foreground.isActive).mockImplementationOnce(fail);
    else jest.spyOn(f.clock, stage).mockImplementationOnce(fail);
    const observed = observeForegroundDeadline(result.promise, f.options);
    void observed.then(settled, settled);
    expect(f.state.listeners.size).toBe(0); expect(f.clock.pending).toHaveLength(0);
    // A stale subscription must not restart the clock after installation failed.
    f.state.set(false); f.state.set(true); f.clock.advance(600_000);
    observed.stop(); observed.stop(); await Promise.resolve();
    expect(f.onExpire).not.toHaveBeenCalled(); expect(f.clock.timers).toHaveLength(0);
    expect(settled).not.toHaveBeenCalled();
    if (mode === "resolve") { result.resolve(value); await expect(observed).resolves.toBe(value); }
    else { result.reject(value); await expect(observed).rejects.toBe(value); }
    expect(settled).toHaveBeenCalledTimes(1); expect(settled).toHaveBeenCalledWith(value);
  });
});

test.each([200, 422])("T19 HTTP %i stops before response parsing and audit waits", async status => {
  const f = fixture("transport"), raw = deferred<{ status: number }>(), audit = deferred<void>();
  const atParse = jest.fn();
  const parse = jest.fn(async (response: { status: number }) => {
    atParse(f.clock.pending.length, f.state.listeners.size);
    await audit.promise; return response;
  });
  const processed = observeForegroundDeadline(raw.promise, f.options).then(parse);
  f.clock.advance(119_999); const response = { status }; raw.resolve(response);
  await Promise.resolve(); await Promise.resolve(); expect(parse).toHaveBeenCalledTimes(1);
  expect(atParse).toHaveBeenCalledWith(0, 0);
  f.clock.advance(600_000); expect(f.onExpire).not.toHaveBeenCalled();
  audit.resolve(); await expect(processed).resolves.toBe(response);
});

test("T19 a rejected 422 response is preserved while downstream interpretation waits", async () => {
  const f = fixture("transport"), raw = deferred<never>(), audit = deferred<void>();
  const error = { status: 422 }, interpreted = jest.fn(), atInterpretation = jest.fn();
  const processed = observeForegroundDeadline(raw.promise, f.options).catch(async received => {
    atInterpretation(received, f.clock.pending.length, f.state.listeners.size);
    await audit.promise; interpreted(received);
  });
  raw.reject(error); await Promise.resolve(); await Promise.resolve();
  expect(atInterpretation).toHaveBeenCalledWith(error, 0, 0);
  f.clock.advance(600_000); expect(f.onExpire).not.toHaveBeenCalled();
  audit.resolve(); await processed; expect(interpreted).toHaveBeenCalledWith(error);
});

test("T19 module import is inert and B1 has zero production callers", () => {
  const schedule = jest.spyOn(globalThis, "setTimeout");
  try {
    jest.isolateModules(() => { require("../foreground-deadline"); });
    expect(schedule).not.toHaveBeenCalled();
  } finally { schedule.mockRestore(); }
  const root = join(__dirname, "../../..");
  const callers: string[] = [];
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (/\.tsx?$/.test(entry.name) && entry.name !== "foreground-deadline.ts"
        && /["'][^"'\r\n]*foreground-deadline["']/.test(readFileSync(path, "utf8"))) callers.push(path);
    }
  }
  scan(root); expect(callers).toEqual([]);
});
