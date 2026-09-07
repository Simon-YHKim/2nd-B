import { createAccountExportSession } from "../export-session";
import { currentAccountEpoch, isCurrentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";

const bundle = () => ({
  kind: "2nd-b-account-export", schema_version: 1, exported_at: "2026-09-06T07:00:00Z",
  user_id: "owner-a", tables: { users: { id: "owner-a" }, records: [] },
  storage: [], excluded: { audit: "separate scope" }, errors: {},
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function setup(owner: string | null = "owner-a") {
  let current = true;
  const request = jest.fn().mockResolvedValue(bundle());
  const deliver = jest.fn().mockResolvedValue("download-started");
  const session = createAccountExportSession(owner, { request, deliver, isCurrent: () => current });
  return { session, request, deliver, stale: () => { current = false; } };
}

test("prepares once on rapid taps, never auto-delivers, then hands off on a separate action", async () => {
  const { session, request, deliver } = setup();
  await Promise.all([session.prepare(), session.prepare()]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith("owner-a");
  expect(deliver).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toMatchObject({ phase: "ready", summary: { failedItems: 0, excludedCategories: 1 } });
  await Promise.all([session.deliver(), session.deliver()]);
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(JSON.parse(deliver.mock.calls[0][0])).toEqual(bundle());
  expect(session.getSnapshot()).toMatchObject({ phase: "ready", note: "download-started" });
});

test("a partial bundle is retained for explicit delivery, including storage-only errors", async () => {
  const { session, request, deliver } = setup();
  request.mockResolvedValueOnce({ ...bundle(), storage: [{ path: "failed", error: "download_failed" }] });
  await session.prepare();
  expect(session.getSnapshot()).toMatchObject({ phase: "ready", summary: { failedItems: 1 } });
  expect(deliver).not.toHaveBeenCalled();
  await session.deliver();
  expect(JSON.parse(deliver.mock.calls[0][0]).storage[0].error).toBe("download_failed");
});

test("a transport failure retries the prepared file without requesting the server again", async () => {
  const { session, request, deliver } = setup();
  await session.prepare();
  deliver.mockRejectedValueOnce(new Error("private failure details"));
  await session.deliver();
  expect(session.getSnapshot()).toMatchObject({ phase: "ready", note: "delivery-failed" });
  expect(JSON.stringify(session.getSnapshot())).not.toContain("private failure");
  await session.deliver();
  expect(request).toHaveBeenCalledTimes(1);
  expect(deliver).toHaveBeenCalledTimes(2);
});

test.each(["share-sheet-closed", "cancelled"])("%s is not described as saved", async (result) => {
  const { session, deliver } = setup();
  deliver.mockResolvedValueOnce(result);
  await session.prepare();
  await session.deliver();
  expect(session.getSnapshot()).toMatchObject({ phase: "ready", note: result });
});

test("request failure exposes retry with no data and no raw error", async () => {
  const { session, request } = setup();
  request.mockRejectedValueOnce(new Error("private details"));
  await session.prepare();
  expect(session.getSnapshot()).toEqual({ phase: "failed", summary: null, note: null });
  await session.prepare();
  expect(session.getSnapshot().phase).toBe("ready");
});

test("owner loss while requesting cannot prepare or deliver the late bundle", async () => {
  const { session, request, deliver, stale } = setup();
  const pending = deferred<ReturnType<typeof bundle>>();
  request.mockReturnValueOnce(pending.promise);
  const run = session.prepare();
  stale();
  pending.resolve(bundle());
  await run;
  await session.deliver();
  expect(deliver).not.toHaveBeenCalled();
  expect(session.getSnapshot().summary).toBeNull();
});

test("cleanup invalidates late work and clears a prepared file; a new mount can start afresh", async () => {
  const { session, request, deliver } = setup();
  const pending = deferred<ReturnType<typeof bundle>>();
  request.mockReturnValueOnce(pending.promise);
  const run = session.prepare();
  session.cancel();
  pending.resolve(bundle());
  await run;
  await session.deliver();
  expect(deliver).not.toHaveBeenCalled();
  expect(session.getSnapshot()).toEqual({ phase: "idle", summary: null, note: null });
  await session.prepare();
  session.cancel();
  await session.deliver();
  expect(deliver).not.toHaveBeenCalled();
});

test("signed-out and stale controllers cannot start requests", async () => {
  for (const ctx of [setup(null), setup()]) {
    ctx.stale();
    await ctx.session.prepare();
    expect(ctx.request).not.toHaveBeenCalled();
  }
  const ctx = setup(null);
  await ctx.session.prepare();
  expect(ctx.request).not.toHaveBeenCalled();
});

test("A to B to A remains stale even though the final owner string matches", async () => {
  noteResolvedOwner("owner-a");
  const epoch = currentAccountEpoch();
  const request = jest.fn().mockResolvedValue(bundle());
  const deliver = jest.fn();
  const session = createAccountExportSession("owner-a", { request, deliver, isCurrent: () => isCurrentAccountEpoch(epoch) });
  await session.prepare();
  noteResolvedOwner("owner-b");
  noteResolvedOwner("owner-a");
  await session.deliver();
  expect(deliver).not.toHaveBeenCalled();
});

test("delivery rechecks the current scope across its own async work", async () => {
  const { session, deliver, stale } = setup();
  await session.prepare();
  deliver.mockImplementationOnce(async (_json: string, _filename: string, isCurrent: () => boolean) => {
    stale();
    expect(isCurrent()).toBe(false);
    return "cancelled";
  });
  await session.deliver();
  expect(session.getSnapshot().note).toBeNull();
});
