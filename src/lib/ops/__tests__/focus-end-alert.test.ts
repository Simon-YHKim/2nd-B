import { createFocusEndAlert, FOCUS_END_ARM_LIMIT, FOCUS_END_RETRY_MARGIN_MS } from "../focus-end-alert";
import type { ReminderResult } from "../reminders";

const MINUTE = 60_000;
const START = 1_760_000_000_000;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A fake OS: every schedule call is held until the test answers it. */
function harness() {
  const calls: { ownerId: string; at: number; answer: ReturnType<typeof deferred<ReminderResult>> }[] = [];
  const cancels: string[] = [];
  let cancelOutcome: () => Promise<boolean> = () => Promise.resolve(true);
  let clock = START;
  const order: string[] = [];
  const alert = createFocusEndAlert("account-a", {
    schedule: (ownerId, at) => {
      const answer = deferred<ReminderResult>();
      calls.push({ ownerId, at: at.getTime(), answer });
      order.push("schedule");
      return answer.promise.then((result) => {
        order.push(`scheduled:${result}`);
        return result;
      });
    },
    cancel: (ownerId) => {
      cancels.push(ownerId);
      order.push("cancel");
      return cancelOutcome();
    },
    now: () => clock,
  });
  return {
    alert, calls, cancels, order,
    setClock: (value: number) => { clock = value; },
    setCancel: (outcome: () => Promise<boolean>) => { cancelOutcome = outcome; },
  };
}
const flush = async () => { for (let turn = 0; turn < 5; turn += 1) await Promise.resolve(); };

describe("one focus session's end alert (Z109)", () => {
  test("the OS gets the alert at the start, for the end of the session", () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ ownerId: "account-a", at: START + 15 * MINUTE });
  });

  test("once the OS has it, the screen stays silent at the end", async () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    h.calls[0].answer.resolve("scheduled");
    await expect(h.alert.finish()).resolves.toBe(true);
    // The end does not cancel what is about to ring.
    expect(h.cancels).toEqual([]);
  });

  test.each<ReminderResult>(["denied", "unavailable", "error"])("when the OS answered %s the screen rings at the end", async (result) => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    h.calls[0].answer.resolve(result);
    await expect(h.alert.finish()).resolves.toBe(false);
  });

  test("the end waits for an answer that is still on its way", async () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    let settled: boolean | null = null;
    void h.alert.finish().then((value) => { settled = value; });
    await flush();
    expect(settled).toBeNull();
    h.calls[0].answer.resolve("scheduled");
    await flush();
    expect(settled).toBe(true);
  });

  test("a schedule call that throws counts as not scheduled", async () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    h.calls[0].answer.reject(new Error("native module gone"));
    await expect(h.alert.finish()).resolves.toBe(false);
  });

  test("an arm that failed is offered again on a later tick, with the same end, a bounded number of times", async () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    h.alert.retry();
    expect(h.calls).toHaveLength(1); // still on its way: no second offer over the first
    for (let attempt = 1; attempt < FOCUS_END_ARM_LIMIT; attempt += 1) {
      h.calls[attempt - 1].answer.resolve("error");
      await flush();
      h.alert.retry();
      expect(h.calls).toHaveLength(attempt + 1);
      expect(h.calls[attempt].at).toBe(START + 15 * MINUTE);
    }
    h.calls[FOCUS_END_ARM_LIMIT - 1].answer.resolve("error");
    await flush();
    h.alert.retry();
    h.alert.retry();
    expect(h.calls).toHaveLength(FOCUS_END_ARM_LIMIT);
    await expect(h.alert.finish()).resolves.toBe(false);
  });

  test("a retry that succeeds is the OS having the alert", async () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    h.calls[0].answer.resolve("error");
    await flush();
    h.alert.retry();
    h.calls[1].answer.resolve("scheduled");
    await flush();
    h.alert.retry();
    expect(h.calls).toHaveLength(2); // armed: nothing more to offer
    await expect(h.alert.finish()).resolves.toBe(true);
  });

  test.each<ReminderResult>(["denied", "unavailable"])("an answer of %s is not retried", async (result) => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    h.calls[0].answer.resolve(result);
    await flush();
    h.alert.retry();
    expect(h.calls).toHaveLength(1);
  });

  test("too close to the end, a failed arm is not offered again", async () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    h.calls[0].answer.resolve("error");
    await flush();
    h.setClock(START + 15 * MINUTE - FOCUS_END_RETRY_MARGIN_MS);
    h.alert.retry();
    expect(h.calls).toHaveLength(1);
    h.setClock(START + 15 * MINUTE - FOCUS_END_RETRY_MARGIN_MS - 1);
    h.alert.retry();
    expect(h.calls).toHaveLength(2);
  });

  test("arming again (a changed device clock) replaces the end, and only the newest answer counts", async () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    h.alert.arm(START + 75 * MINUTE);
    expect(h.calls.map((call) => call.at)).toEqual([START + 15 * MINUTE, START + 75 * MINUTE]);
    // The older answer arrives last and says "scheduled"; the newer one failed.
    h.calls[1].answer.resolve("error");
    await flush();
    h.calls[0].answer.resolve("scheduled");
    await flush();
    await expect(h.alert.finish()).resolves.toBe(false);
  });

  test("arming again starts the count of offers over", async () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    for (let attempt = 0; attempt < FOCUS_END_ARM_LIMIT; attempt += 1) {
      h.calls[attempt].answer.resolve("error");
      await flush();
      h.alert.retry();
    }
    expect(h.calls).toHaveLength(FOCUS_END_ARM_LIMIT);
    h.alert.arm(START + 20 * MINUTE);
    h.calls[FOCUS_END_ARM_LIMIT].answer.resolve("error");
    await flush();
    h.alert.retry();
    expect(h.calls).toHaveLength(FOCUS_END_ARM_LIMIT + 2);
  });

  test("stopping before the end withdraws the alert, after an offer that is still on its way has landed", async () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    let withdrawn: boolean | null = null;
    void h.alert.withdraw().then((value) => { withdrawn = value; });
    await flush();
    // The offer has not landed: cancelling now would leave it behind.
    expect(h.cancels).toEqual([]);
    h.calls[0].answer.resolve("scheduled");
    await flush();
    expect(h.cancels).toEqual(["account-a"]);
    expect(h.order).toEqual(["schedule", "scheduled:scheduled", "cancel"]);
    await flush();
    expect(withdrawn).toBe(true);
  });

  test("a withdrawal is asked for even when nothing is known to be scheduled", async () => {
    const h = harness();
    h.alert.arm(START + 15 * MINUTE);
    h.calls[0].answer.resolve("error");
    await expect(h.alert.withdraw()).resolves.toBe(true);
    expect(h.cancels).toEqual(["account-a"]);
  });

  test("a withdrawal the OS did not confirm is reported, so it can be asked again", async () => {
    const refused = harness();
    refused.setCancel(() => Promise.resolve(false));
    refused.alert.arm(START + 15 * MINUTE);
    refused.calls[0].answer.resolve("scheduled");
    await expect(refused.alert.withdraw()).resolves.toBe(false);

    const thrown = harness();
    thrown.setCancel(() => Promise.reject(new Error("native cancel failed")));
    thrown.alert.arm(START + 15 * MINUTE);
    thrown.calls[0].answer.resolve("scheduled");
    await expect(thrown.alert.withdraw()).resolves.toBe(false);
  });

  test("after the session has ended or stopped, nothing more is offered to the OS", async () => {
    for (const close of ["finish", "withdraw"] as const) {
      const h = harness();
      h.alert.arm(START + 15 * MINUTE);
      h.calls[0].answer.resolve("error");
      await h.alert[close]();
      h.alert.retry();
      h.alert.arm(START + 30 * MINUTE);
      expect(h.calls).toHaveLength(1);
    }
  });
});
