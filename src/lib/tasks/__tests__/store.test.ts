import { completeTask, dismissFinishedTask, dismissTask, dismissTaskById, startTask } from "../store";

// The store keeps one task for the whole app. These tests go through its public functions only;
// the snapshot is read through the same function the hook subscribes with.
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

// React is not rendered here: read the phase the way a subscriber would see it change.
function phaseAfter(action: () => void): string {
  action();
  return currentPhase();
}

function currentPhase(): string {
  // startTask refuses while a task is running: that is the observable "running".
  // dismissFinishedTask refuses only while running, and clears otherwise, so it cannot be used to
  // peek. A throwaway start tells running from not running without touching a running task.
  const probe = startTask({ title: "probe", run: async () => undefined });
  if (probe === 0) return "running";
  dismissTaskById(probe);
  return "not-running";
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

afterEach(() => {
  dismissTask();
});

describe("the global task has an identity", () => {
  it("hands out a new id per started task, and 0 when one is already running", () => {
    const work = deferred();
    const first = startTask({ title: "first", run: () => work.promise });
    expect(first).toBeGreaterThan(0);
    let ran = false;
    const second = startTask({
      title: "second",
      run: async () => {
        ran = true;
      },
    });
    expect(second).toBe(0);
    expect(ran).toBe(false);
    work.resolve();
  });

  it("never calls run() for a task it refused", async () => {
    const work = deferred();
    startTask({ title: "first", run: () => work.promise });
    const run = jest.fn(async () => undefined);
    expect(startTask({ title: "refused", run })).toBe(0);
    await settle();
    expect(run).not.toHaveBeenCalled();
    work.resolve();
  });

  // Review round four, finding 3: run A is cancelled and dismissed, run B starts, then A settles.
  it("an older task that settles late does not finish the newer task", async () => {
    const workA = deferred();
    const taskA = startTask({ title: "A", run: () => workA.promise });
    expect(dismissTaskById(taskA)).toBe(true);

    const workB = deferred();
    const taskB = startTask({ title: "B", run: () => workB.promise });
    expect(taskB).toBeGreaterThan(taskA);

    workA.reject(new Error("reasoning_cancelled"));
    await settle();

    // B is still the running task: a new start is still refused.
    expect(startTask({ title: "probe", run: async () => undefined })).toBe(0);
    workB.resolve();
    await settle();
    // Now B has finished, so the dock is free for a new task.
    expect(currentPhase()).toBe("not-running");
  });

  it("dismissTaskById clears only the task the dock holds now", async () => {
    const workA = deferred();
    const taskA = startTask({ title: "A", run: () => workA.promise });
    dismissTaskById(taskA);
    const workB = deferred();
    const taskB = startTask({ title: "B", run: () => workB.promise });

    expect(dismissTaskById(taskA)).toBe(false);
    expect(dismissTaskById(0)).toBe(false);
    expect(currentPhase()).toBe("running");
    expect(dismissTaskById(taskB)).toBe(true);
    expect(currentPhase()).toBe("not-running");
    workA.resolve();
    workB.resolve();
  });

  it("dismissFinishedTask leaves a running task alone and clears a finished one", async () => {
    const work = deferred();
    const task = startTask({ title: "A", run: () => work.promise });
    expect(dismissFinishedTask()).toBe(false);
    expect(currentPhase()).toBe("running");

    work.resolve();
    await settle();
    expect(dismissFinishedTask()).toBe(true);
    // The id is gone with the task.
    expect(dismissTaskById(task)).toBe(false);
  });

  it("a plain dismiss still clears whatever is there, and completeTask still completes it", () => {
    const work = deferred();
    startTask({ title: "A", run: () => work.promise });
    expect(phaseAfter(() => completeTask())).toBe("not-running");
    const again = deferred();
    startTask({ title: "B", run: () => again.promise });
    expect(phaseAfter(() => dismissTask())).toBe("not-running");
    work.resolve();
    again.resolve();
  });
});
