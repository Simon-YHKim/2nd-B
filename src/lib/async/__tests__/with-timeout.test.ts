// A promise that never settles is worse than one that rejects. A rejection shows the user
// an error and lets them retry. A hang shows a spinner forever and looks exactly like the
// app ate their work.
//
// /ipip-neo did the second. Its 120-item assessment -- roughly 15 minutes of the user's
// life -- is saved through createRecord(), which had no time bound anywhere in it. Neither
// fetch nor supabase-js times out on its own, so on a STALLED connection (socket open,
// nothing coming back -- not the same as a failed one) the await never settled, `finally`
// never ran, setSubmitting(false) never fired. The button spun forever, no error toast
// appeared, and the only way out was to kill the app and lose the answers.

import { withTimeout, TimeoutError, isTimeoutError } from "../with-timeout";

jest.useFakeTimers();

describe("withTimeout", () => {
  test("passes a value through when the work finishes in time", async () => {
    const p = withTimeout(Promise.resolve("ok"), 1000);
    await expect(p).resolves.toBe("ok");
  });

  test("propagates a rejection unchanged -- it does not turn errors into timeouts", async () => {
    const boom = new Error("insert failed");
    await expect(withTimeout(Promise.reject(boom), 1000)).rejects.toBe(boom);
  });

  test("rejects when the work never settles", async () => {
    const never = new Promise<string>(() => {
      /* the hang */
    });
    const p = withTimeout(never, 20_000, "record insert");
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    jest.advanceTimersByTime(20_000);
    await assertion;
  });

  test("the timeout error names what timed out and for how long", async () => {
    const p = withTimeout(new Promise<void>(() => {}), 20_000, "record insert");
    const assertion = p.catch((e: unknown) => e);
    jest.advanceTimersByTime(20_000);
    const err = await assertion;
    expect(isTimeoutError(err)).toBe(true);
    expect((err as Error).message).toContain("record insert");
    expect((err as Error).message).toContain("20000");
  });

  test("accepts a thenable, not just a Promise (supabase query builders are thenables)", async () => {
    const thenable: PromiseLike<number> = {
      then: (onFulfilled) => Promise.resolve(7).then(onFulfilled),
    };
    await expect(withTimeout(thenable, 1000)).resolves.toBe(7);
  });

  test("clears its timer once settled, so nothing is left pending", async () => {
    await withTimeout(Promise.resolve(1), 60_000);
    expect(jest.getTimerCount()).toBe(0);
  });
});

// The other half of the fix: the record is saved the moment the INSERT returns. Everything
// after it is enrichment, and enrichment must not hold the save button hostage -- least of
// all the embedding call, which is a network round trip to an AI service.
describe("createRecord does not make the user wait on enrichment", () => {
  const src = (
    require("fs").readFileSync(
      require("path").resolve(__dirname, "../../records/create.ts"),
      "utf8",
    ) as string
  ).replace(/\r\n/g, "\n");

  test("the guard is reading the real file", () => {
    expect(src).toContain("export async function createRecord");
    expect(src.length).toBeGreaterThan(1000);
  });

  test("the insert is bounded", () => {
    expect(src).toMatch(/withTimeout\(/);
    expect(src).toMatch(/RECORD_INSERT_TIMEOUT_MS/);
  });

  test("XP is fired and forgotten, as its own comment always claimed", () => {
    // The comment said "best-effort, never blocks the capture" and the next line awaited
    // it. It blocked.
    expect(src).toMatch(/void awardXpSafe\(/);
    expect(src).not.toMatch(/await awardXpSafe\(/);
  });

  test("the auto-embed round trip does not block the save", () => {
    // The point is not that the embed code is gone -- it still runs. The point is WHERE it
    // runs: detached, so the caller is not awaiting a network round trip to an AI service
    // after the record is already safely in the database. So assert the containment, not
    // the absence of the lines. (The first draft asserted the absence and failed, because
    // the lines are of course still there -- one indent deeper.)
    const detached = src.indexOf("void (async () => {");
    const embed = src.indexOf("embedAndStoreRecord(", detached);
    const returned = src.indexOf("return { id: data.id");
    expect(detached).toBeGreaterThan(0);
    expect(embed).toBeGreaterThan(detached); // the embed is inside the detached block
    expect(detached).toBeLessThan(returned); // and the function still returns after it
    // Nothing awaits the embed on the caller's behalf.
    expect(src).not.toMatch(/^\s{2}await embedAndStoreRecord\(/m);
  });
});
