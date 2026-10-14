import { settleRunForReview, type ReviewReady } from "../proposal-targets";
import { createReviewOwnership, runFailureAction, type RunFailureKind } from "../review-ownership";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const READY: ReviewReady<string> = { live: ["a-proposal"], unreadable: 0 };

describe("review ownership: the run slot", () => {
  it("a run owns the slot it began, for the account on screen", () => {
    const ownership = createReviewOwnership("account-a");
    const run = new AbortController();
    expect(ownership.running).toBe(false);
    ownership.begin(run);
    expect(ownership.running).toBe(true);
    expect(ownership.owns(run, "account-a")).toBe(true);
    expect(ownership.owns(new AbortController(), "account-a")).toBe(false);
  });

  it("cancel aborts the run and frees the slot", () => {
    const ownership = createReviewOwnership("account-a");
    const run = new AbortController();
    ownership.begin(run);
    ownership.cancel();
    expect(run.signal.aborted).toBe(true);
    expect(ownership.running).toBe(false);
    expect(ownership.owns(run, "account-a")).toBe(false);
    expect(ownership.release(run)).toBe(false);
  });

  it("an aborted run does not own the slot even while it still sits in it", () => {
    const ownership = createReviewOwnership("account-a");
    const run = new AbortController();
    ownership.begin(run);
    run.abort();
    expect(ownership.owns(run, "account-a")).toBe(false);
  });

  it("only the run in the slot can release it, and only once", () => {
    const ownership = createReviewOwnership("account-a");
    const first = new AbortController();
    const second = new AbortController();
    ownership.begin(first);
    expect(ownership.release(second)).toBe(false);
    expect(ownership.running).toBe(true);
    expect(ownership.release(first)).toBe(true);
    expect(ownership.release(first)).toBe(false);
    expect(ownership.running).toBe(false);
  });
});

describe("review ownership: the account on screen", () => {
  it("reports a change once, and not for the same account", () => {
    const ownership = createReviewOwnership(null);
    expect(ownership.showAccount(null)).toBe(false);
    expect(ownership.showAccount("account-a")).toBe(true);
    expect(ownership.showAccount("account-a")).toBe(false);
    expect(ownership.shows("account-a")).toBe(true);
    expect(ownership.showAccount("account-b")).toBe(true);
    expect(ownership.shows("account-a")).toBe(false);
    expect(ownership.shows("account-b")).toBe(true);
  });

  it("a run started for the earlier account stops owning the moment another account is shown", () => {
    const ownership = createReviewOwnership("account-a");
    const run = new AbortController();
    ownership.begin(run);
    ownership.showAccount("account-b");
    expect(ownership.owns(run, "account-a")).toBe(false);
    // It still sits in the slot, so it (and nothing else) can give the slot back.
    expect(ownership.running).toBe(true);
    expect(ownership.release(run)).toBe(true);
  });
});

// Review round three, finding 1: cancel run A, start run B, then A rejects late.
describe("an old run that fails late", () => {
  it("leaves the newer run's slot alone and does nothing", async () => {
    const ownership = createReviewOwnership("account-a");
    const runA = new AbortController();
    const queuedA = deferred<string[]>();
    ownership.begin(runA);

    ownership.cancel();
    const runB = new AbortController();
    ownership.begin(runB);

    queuedA.reject(new Error("reasoning_cancelled"));
    const action = await queuedA.promise.then(
      () => null,
      () => runFailureAction({ ownedSlot: ownership.release(runA), onScreen: ownership.shows("account-a"), kind: "cancelled" }),
    );

    expect(action).toEqual({ act: "nothing" });
    expect(ownership.running).toBe(true);
    expect(ownership.owns(runB, "account-a")).toBe(true);
    expect(runB.signal.aborted).toBe(false);
  });

  it.each<RunFailureKind>(["limit", "safety", "cancelled", "generic"])(
    "does nothing for a %s failure once it no longer held the slot",
    (kind) => {
      expect(runFailureAction({ ownedSlot: false, onScreen: true, kind })).toEqual({ act: "nothing" });
      expect(runFailureAction({ ownedSlot: false, onScreen: false, kind })).toEqual({ act: "nothing" });
    },
  );

  it("is kept for its own account when its screen is gone or shows another account", () => {
    expect(runFailureAction({ ownedSlot: true, onScreen: false, kind: "limit" })).toEqual({ act: "defer", error: "limit" });
    expect(runFailureAction({ ownedSlot: true, onScreen: false, kind: "safety" })).toEqual({ act: "defer", error: "safety" });
    expect(runFailureAction({ ownedSlot: true, onScreen: false, kind: "generic" })).toEqual({ act: "defer", error: "generic" });
    // A cancel is not a failure to bring back later.
    expect(runFailureAction({ ownedSlot: true, onScreen: false, kind: "cancelled" })).toEqual({ act: "defer", error: null });
  });

  it.each<RunFailureKind>(["limit", "safety", "cancelled", "generic"])("is shown when it is this screen's %s failure", (kind) => {
    expect(runFailureAction({ ownedSlot: true, onScreen: true, kind })).toEqual({ act: "show", error: kind });
  });

  it("a failure after another account was painted touches no screen and frees its own slot", () => {
    const ownership = createReviewOwnership("account-a");
    const runA = new AbortController();
    ownership.begin(runA);
    ownership.showAccount("account-b");
    const action = runFailureAction({ ownedSlot: ownership.release(runA), onScreen: ownership.shows("account-a"), kind: "limit" });
    expect(action).toEqual({ act: "defer", error: "limit" });
    expect(ownership.running).toBe(false);
  });
});

// Review round three, finding 2: the earlier account's read finishes after another account is on screen.
describe("a finished run whose targets are still being read", () => {
  it("is dropped when another account is shown before the read completes", async () => {
    const ownership = createReviewOwnership("account-a");
    const runA = new AbortController();
    ownership.begin(runA);
    const read = deferred<ReviewReady<string>>();

    const settled = settleRunForReview(["a-proposal"], () => read.promise, () => ownership.owns(runA, "account-a"));
    // The commit that paints account B runs before the read answers.
    ownership.showAccount("account-b");
    read.resolve(READY);

    await expect(settled).resolves.toBeNull();
  });

  it("is dropped when it was cancelled and a newer run began during the read, and the newer run keeps the slot", async () => {
    const ownership = createReviewOwnership("account-a");
    const runA = new AbortController();
    ownership.begin(runA);
    const read = deferred<ReviewReady<string>>();

    const settled = settleRunForReview(["a-proposal"], () => read.promise, () => ownership.owns(runA, "account-a"));
    ownership.cancel();
    const runB = new AbortController();
    ownership.begin(runB);
    read.resolve(READY);

    await expect(settled).resolves.toBeNull();
    expect(ownership.release(runA)).toBe(false);
    expect(ownership.owns(runB, "account-a")).toBe(true);
  });

  it("is shown when nothing changed hands during the read", async () => {
    const ownership = createReviewOwnership("account-a");
    const runA = new AbortController();
    ownership.begin(runA);
    const read = deferred<ReviewReady<string>>();

    const settled = settleRunForReview(["a-proposal"], () => read.promise, () => ownership.owns(runA, "account-a"));
    read.resolve(READY);

    await expect(settled).resolves.toEqual(READY);
    expect(ownership.release(runA)).toBe(true);
  });

  it("the same account shown again is not a change, so the result stays", async () => {
    const ownership = createReviewOwnership("account-a");
    const runA = new AbortController();
    ownership.begin(runA);
    const read = deferred<ReviewReady<string>>();

    const settled = settleRunForReview(["a-proposal"], () => read.promise, () => ownership.owns(runA, "account-a"));
    expect(ownership.showAccount("account-a")).toBe(false);
    read.resolve(READY);

    await expect(settled).resolves.toEqual(READY);
  });
});

// Review round four.
describe("review ownership: the epoch", () => {
  it("goes up when a run begins, when a run is cancelled and when another account is shown", () => {
    const ownership = createReviewOwnership("account-a");
    const start = ownership.epoch;
    const run = new AbortController();
    ownership.begin(run);
    expect(ownership.epoch).toBe(start + 1);
    expect(ownership.cancel()).toBe(run);
    expect(ownership.epoch).toBe(start + 2);
    ownership.showAccount("account-b");
    expect(ownership.epoch).toBe(start + 3);
  });

  it("does not move for a release, a cancel with nothing to cancel, or the same account shown again", () => {
    const ownership = createReviewOwnership("account-a");
    const run = new AbortController();
    ownership.begin(run);
    const held = ownership.epoch;
    ownership.release(run);
    expect(ownership.cancel()).toBeNull();
    ownership.showAccount("account-a");
    expect(ownership.epoch).toBe(held);
  });

  // Finding 2: run A1 fails on the limit and waits for the usage read. Meanwhile the user cancels,
  // starts A2, and A2 finishes. `running` reads false before and after; only the epoch tells.
  it("tells 'a run began and already ended' from 'no run since'", () => {
    const ownership = createReviewOwnership("account-a");
    const runA1 = new AbortController();
    ownership.begin(runA1);
    expect(ownership.release(runA1)).toBe(true);
    const before = ownership.epoch;
    expect(ownership.running).toBe(false);

    ownership.cancel();
    const runA2 = new AbortController();
    ownership.begin(runA2);
    expect(ownership.release(runA2)).toBe(true);

    expect(ownership.running).toBe(false);
    expect(ownership.epoch).not.toBe(before);
  });

  it("stays put when nothing happened during the wait", () => {
    const ownership = createReviewOwnership("account-a");
    const run = new AbortController();
    ownership.begin(run);
    ownership.release(run);
    const before = ownership.epoch;
    expect(ownership.epoch).toBe(before);
    expect(ownership.shows("account-a")).toBe(true);
  });
});

describe("review ownership: the run's global task", () => {
  it("remembers the task a run started, and 0 for a run that started none", () => {
    const ownership = createReviewOwnership("account-a");
    const run = new AbortController();
    const other = new AbortController();
    ownership.begin(run);
    ownership.bindTask(run, 7);
    expect(ownership.taskOf(run)).toBe(7);
    expect(ownership.taskOf(other)).toBe(0);
  });

  it("cancel hands back the cancelled run, so only that run's task is cleared", () => {
    const ownership = createReviewOwnership("account-a");
    const runA = new AbortController();
    ownership.begin(runA);
    ownership.bindTask(runA, 3);
    const cancelled = ownership.cancel();
    expect(cancelled).toBe(runA);
    expect(cancelled && ownership.taskOf(cancelled)).toBe(3);
    // A second cancel has nothing to hand back, so nothing is cleared for it.
    expect(ownership.cancel()).toBeNull();
  });
});

// Finding 1: the check inside settleRunForReview runs one promise step before the caller resumes.
describe("a change that lands between the inner check and the caller", () => {
  it("is caught only by asking again after the await", async () => {
    const ownership = createReviewOwnership("account-a");
    const runA = new AbortController();
    ownership.begin(runA);

    const ready = await settleRunForReview(
      ["a-proposal"],
      async () => READY,
      () => {
        const current = ownership.owns(runA, "account-a");
        // Something already queued runs before the awaiting caller does.
        queueMicrotask(() => ownership.showAccount("account-b"));
        return current;
      },
    );

    // The inner check passed, so a result came back ...
    expect(ready).toEqual(READY);
    // ... but by the time the caller runs, the screen is another account's.
    expect(ownership.owns(runA, "account-a")).toBe(false);
  });

  it("the same holds for a newer run that takes the slot in that step", async () => {
    const ownership = createReviewOwnership("account-a");
    const runA = new AbortController();
    const runB = new AbortController();
    ownership.begin(runA);

    const ready = await settleRunForReview(
      ["a-proposal"],
      async () => READY,
      () => {
        const current = ownership.owns(runA, "account-a");
        queueMicrotask(() => {
          ownership.cancel();
          ownership.begin(runB);
        });
        return current;
      },
    );

    expect(ready).toEqual(READY);
    expect(ownership.owns(runA, "account-a")).toBe(false);
    expect(ownership.release(runA)).toBe(false);
    expect(ownership.owns(runB, "account-a")).toBe(true);
  });
});
