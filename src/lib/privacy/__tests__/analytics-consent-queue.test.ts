import { createPrivacySaveQueue } from "../analytics-consent-queue";

function deferred() {
  let resolve!: () => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Drain pending microtasks (the queue chains saves via .then microtasks).
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("createPrivacySaveQueue — external analytics opt-out monotonicity", () => {
  test("external analytics opt-out is monotonic across queued privacy saves", async () => {
    let analyticsOn = false; // the LATEST committed pref
    const applied: boolean[] = [];
    const queue = createPrivacySaveQueue({
      applyAnalyticsConsent: (on) => applied.push(on),
      latestAnalyticsOn: () => analyticsOn,
    });

    const saveA = deferred();
    const saveB = deferred();

    // 1. Toggle ON: latest = true, save A in-flight (opt-in -> no immediate apply).
    analyticsOn = true;
    queue.submit({ save: () => saveA.promise, optOut: false, onError: () => {} });

    // 2. Toggle OFF before A resolves: latest = false, immediate opt-out, B queued.
    analyticsOn = false;
    queue.submit({ save: () => saveB.promise, optOut: true, onError: () => {} });

    // The opt-out applied false immediately; nothing has turned analytics on.
    expect(applied).toEqual([false]);

    // 3. Save A resolves AFTER the off toggle: it must NOT re-enable analytics.
    saveA.resolve();
    await flush();
    expect(applied).not.toContain(true);

    // 4. Save B resolves: final analytics consent stays false.
    saveB.resolve();
    await queue.idle();
    await flush();
    expect(applied).not.toContain(true);
    expect(applied[applied.length - 1]).toBe(false);
  });

  test("a failed save does not re-enable analytics during optimistic revert", async () => {
    let analyticsOn = false;
    const applied: boolean[] = [];
    const queue = createPrivacySaveQueue({
      applyAnalyticsConsent: (on) => applied.push(on),
      latestAnalyticsOn: () => analyticsOn,
    });

    // User flips it on, but the save fails and the revert puts latest back to false.
    analyticsOn = true;
    queue.submit({
      save: () => Promise.reject(new Error("db down")),
      optOut: false,
      onError: () => {
        analyticsOn = false; // revert
      },
    });

    await queue.idle();
    await flush();
    expect(applied).not.toContain(true);
    expect(applied[applied.length - 1]).toBe(false);
  });

  test("a successful opt-in applies analytics on", async () => {
    let analyticsOn = false;
    const applied: boolean[] = [];
    const queue = createPrivacySaveQueue({
      applyAnalyticsConsent: (on) => applied.push(on),
      latestAnalyticsOn: () => analyticsOn,
    });

    analyticsOn = true;
    queue.submit({ save: () => Promise.resolve(), optOut: false, onError: () => {} });

    await queue.idle();
    await flush();
    expect(applied[applied.length - 1]).toBe(true);
  });
});
