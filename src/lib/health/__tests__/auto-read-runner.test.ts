// When the automatic health read runs, tested by behaviour: foreground only, one at a time,
// abandoned when the app leaves or the deadline passes, woken at the next slot.
import { startHealthAutoRead, type AutoReadLease, type AutoReadRunnerEnv } from "../auto-read-runner";

const flush = () => new Promise((resolve) => setImmediate(resolve));

type TestLease = AutoReadLease & { released: () => boolean; aborted: () => boolean };

function harness(start: { state?: string; transition?: boolean; nextCheck?: Date | null } = {}) {
  let state = start.state ?? "active";
  let transition = start.transition ?? false;
  let nextCheck = start.nextCheck ?? null;
  let clock = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  const listeners = new Set<(next: string) => void>();
  const leases: TestLease[] = [];
  const reads: { settle: () => void; fail: () => void; assertCurrent: () => void }[] = [];

  const env: AutoReadRunnerEnv = {
    appState: () => state,
    onAppStateChange: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    transitionPending: () => transition,
    beginLease: (_owner, parent) => {
      const controller = new AbortController();
      let released = false;
      const abort = () => { if (!controller.signal.aborted) controller.abort(); };
      parent.addEventListener("abort", abort, { once: true });
      if (parent.aborted) abort();
      const lease: TestLease = {
        signal: controller.signal,
        assertCurrent: () => { if (controller.signal.aborted) throw new Error("aborted"); },
        abort,
        release: () => { released = true; abort(); },
        released: () => released,
        aborted: () => controller.signal.aborted,
      };
      leases.push(lease);
      return lease;
    },
    read: (_owner, assertCurrent) => new Promise((resolve, reject) => {
      reads.push({ settle: () => resolve("done"), fail: () => reject(new Error("offline")), assertCurrent });
    }),
    nextCheckAt: async () => nextCheck,
    now: () => clock,
    setTimer: (run, ms) => {
      const id = nextId++;
      timers.set(id, { at: clock + ms, run });
      return id;
    },
    clearTimer: (handle) => { timers.delete(handle as number); },
    deadlineMs: 300_000,
  };

  return {
    env,
    reads,
    leases,
    timers,
    async advance(ms: number) {
      clock += ms;
      for (const [id, timer] of [...timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= clock && timers.delete(id)) timer.run();
      }
      await flush();
    },
    async setState(next: string) {
      state = next;
      for (const listener of [...listeners]) listener(next);
      await flush();
    },
    setTransition(next: boolean) { transition = next; },
    setNextCheck(next: Date | null) { nextCheck = next; },
    listenerCount: () => listeners.size,
  };
}

test("reads in the foreground only: nothing starts in the background", async () => {
  const h = harness({ state: "background" });
  const stop = startHealthAutoRead("owner", h.env);
  expect(h.reads).toHaveLength(0);
  await h.setState("active");
  expect(h.reads).toHaveLength(1);
  stop();
});

test("one run at a time; the lease is released when it ends, and the next foreground may start another", async () => {
  const h = harness();
  const stop = startHealthAutoRead("owner", h.env);
  await h.setState("active");
  expect(h.reads).toHaveLength(1);
  h.reads[0].settle();
  await flush();
  expect(h.leases[0].released()).toBe(true);
  await h.setState("active");
  expect(h.reads).toHaveLength(2);
  h.reads[1].fail();
  await flush();
  expect(h.leases[1].released()).toBe(true);
  stop();
});

test("leaving the foreground abandons the run: it can no longer pass assertCurrent, and the next foreground starts over", async () => {
  const h = harness();
  const stop = startHealthAutoRead("owner", h.env);
  await h.setState("background");
  expect(h.leases[0].aborted()).toBe(true);
  expect(() => h.reads[0].assertCurrent()).toThrow();
  await h.setState("active");
  expect(h.reads).toHaveLength(2);
  stop();
});

test("a read that never settles is abandoned at the deadline, so it cannot block later runs", async () => {
  const h = harness();
  const stop = startHealthAutoRead("owner", h.env);
  await h.advance(299_999);
  expect(h.leases[0].aborted()).toBe(false);
  await h.advance(1);
  expect(h.leases[0].aborted()).toBe(true);
  expect(h.leases[0].released()).toBe(true);
  await h.setState("active");
  expect(h.reads).toHaveLength(2);
  stop();
});

test("an account switch still in progress starts nothing, and stops a run that is going", async () => {
  const h = harness({ transition: true });
  const stop = startHealthAutoRead("owner", h.env);
  expect(h.reads).toHaveLength(0);
  h.setTransition(false);
  await h.setState("active");
  expect(h.reads).toHaveLength(1);
  h.setTransition(true);
  expect(() => h.reads[0].assertCurrent()).toThrow("account_transition_pending");
  expect(h.leases[0].aborted()).toBe(true);
  stop();
});

test("while the app stays open it wakes at the next slot; leaving the foreground cancels the wake", async () => {
  const h = harness({ nextCheck: new Date(60_000) });
  const stop = startHealthAutoRead("owner", h.env);
  h.reads[0].settle();
  await flush();
  expect([...h.timers.values()].map((timer) => timer.at)).toEqual([60_000]);
  await h.advance(60_000);
  expect(h.reads).toHaveLength(2);
  h.reads[1].settle();
  await flush();
  expect(h.timers.size).toBe(1);
  await h.setState("background");
  expect(h.timers.size).toBe(0);
  stop();
});

test("nothing to wait for (refresh off, phone not armed): no wake is set", async () => {
  const h = harness({ nextCheck: null });
  const stop = startHealthAutoRead("owner", h.env);
  h.reads[0].settle();
  await flush();
  expect(h.timers.size).toBe(0);
  stop();
});

test("stop ends everything: the run is aborted, the listener removed and no wake is left", async () => {
  const h = harness({ nextCheck: new Date(60_000) });
  const stop = startHealthAutoRead("owner", h.env);
  stop();
  await flush();
  expect(h.leases[0].aborted()).toBe(true);
  expect(h.listenerCount()).toBe(0);
  expect(h.timers.size).toBe(0);
  await h.advance(60_000);
  expect(h.reads).toHaveLength(1);
});
