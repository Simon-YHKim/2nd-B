import { compile, deferred, snapshot, sourceFile, usageHarness } from "../../lib/reasoning/__tests__/usage-consumer-harness";
import { remainingReasoning } from "../../lib/entitlements/reasoning-cap";

const file = sourceFile("src/app/northstar.tsx");
const harness = usageHarness();
const propose = jest.fn(), increment = jest.fn(), push = jest.fn();
let owner = "owner-a";
let tier = "free";
let surface: (userId: string, tier: string) => { reasoningRemaining: number | null; propose: () => Promise<void>; refreshUsage: () => void; suggestions: string[] | null };
const render = () => surface(owner, tier);

beforeAll(() => {
  surface = compile(`return (userId, tier) => {
    const loading = false, locale = "ko", isMinor = false, router = { push };
    ${file.statement("const [suggestions,")}
    ${file.statement("const [proposing,")}
    ${file.statement("const [thinBase,")}
    ${file.statement("const [proposeError,")}
    const progression = { tier };
    ${file.between("  const accountEpoch =", "  useEffect(() => {")}
    ${file.statement("const propose =")}
    return { reasoningRemaining, propose, refreshUsage, suggestions };
  };`, { ...harness.install(), remainingReasoning, proposeNorthstarSentences: propose, incrementReasoningUsage: increment, push });
});
beforeEach(() => { harness.reset(); owner = "owner-a"; tier = "free"; propose.mockReset().mockResolvedValue(null); increment.mockReset().mockResolvedValue(undefined); push.mockReset(); });
afterEach(() => harness.cleanup());
afterAll(() => harness.restore());

test("a first failed usage read is unknown and blocks proposals until retry confirms it", async () => {
  harness.read.mockRejectedValue(new Error("failed"));
  const view = await harness.settle(render);
  expect(view.reasoningRemaining).toBeNull(); await view.propose();
  await view.propose();
  expect(propose).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
  harness.read.mockResolvedValue(snapshot(1)); view.refreshUsage();
  const ready = await harness.settle(render);
  expect(propose).not.toHaveBeenCalled(); expect(increment).not.toHaveBeenCalled();
  await ready.propose(); expect(propose).toHaveBeenCalledTimes(1);
});
test.each([[0, 0, 2], [1, 0, 1], [2, 0, 0], [2, 4, 4]])("confirmed used=%s credits=%s gates only real exhaustion", async (used, credits, left) => {
  harness.read.mockResolvedValue(snapshot(used, credits));
  const view = await harness.settle(render); expect(view.reasoningRemaining).toBe(left);
  await view.propose();
  expect(push).toHaveBeenCalledTimes(left === 0 ? 1 : 0);
  expect(propose).toHaveBeenCalledTimes(left === 0 ? 0 : 1);
});
test("unlimited tier remains unblocked", async () => {
  tier = "brain"; harness.read.mockResolvedValue(snapshot(100));
  const view = await harness.settle(render); expect(view.reasoningRemaining).toBe(Infinity);
  await view.propose(); expect(propose).toHaveBeenCalledTimes(1);
});
test("B cannot inherit A's exhausted balance or late result", async () => {
  harness.read.mockResolvedValue(snapshot(2)); const a = await harness.settle(render);
  const late = deferred<ReturnType<typeof snapshot>>(); harness.read.mockReturnValue(late.promise); a.refreshUsage(); await harness.settle(render);
  harness.owner("owner-b"); owner = "owner-b"; harness.read.mockRejectedValue(new Error("B failed"));
  await harness.settle(render); late.resolve(snapshot(2));
  const b = await harness.settle(render); expect(b.reasoningRemaining).toBeNull();
  await a.propose(); expect(propose).not.toHaveBeenCalled();
  await b.propose(); expect(propose).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
});
test("A to B to A rejects an old proposal callback", async () => {
  const a = await harness.settle(render); harness.owner("owner-b"); harness.owner("owner-a");
  await a.propose(); expect(propose).not.toHaveBeenCalled();
});
test("a successful proposal retains its local debit when the confirmed refresh fails", async () => {
  propose.mockResolvedValue(["suggestion"]);
  const a = await harness.settle(render); harness.read.mockRejectedValue(new Error("refresh failed"));
  await a.propose(); const next = await harness.settle(render);
  expect(increment).toHaveBeenCalledTimes(1); expect(next.reasoningRemaining).toBe(1);
  expect(next.suggestions).toEqual(["suggestion"]);
});
test("an unresponsive usage write cannot hold the proposal UI; the existing local cap still counts the run", async () => {
  const writing = deferred<void>(); increment.mockReturnValue(writing.promise);
  propose.mockResolvedValue(["suggestion"]); harness.read.mockResolvedValue(snapshot(1));
  const a = await harness.settle(render); let finished = false;
  const running = a.propose().then(() => { finished = true; });
  const next = await harness.settle(render);
  expect(finished).toBe(true); expect(next.reasoningRemaining).toBe(0);
  await next.propose(); expect(propose).toHaveBeenCalledTimes(1); expect(push).toHaveBeenCalledTimes(1);
  writing.resolve(); await running;
});
test("northstar no longer calls the zero-filling getter", () => { expect(file.source).not.toContain("getReasoningUsage"); });

test.each(["pending", "error", "timeout"])("the last confirmed run stays spent during a %s refresh (review reproduction)", async (status) => {
  propose.mockResolvedValue(["suggestion"]);
  harness.read.mockResolvedValue(snapshot(1));
  const before = await harness.settle(render);
  expect(before.reasoningRemaining).toBe(1);
  harness.read.mockImplementation(() => status === "error" ? Promise.reject(new Error("refresh failed")) : new Promise(() => {}));
  await before.propose();
  let after = await harness.settle(render);
  if (status === "timeout") { jest.advanceTimersByTime(10_000); after = await harness.settle(render); }
  await after.propose();
  expect(propose).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith("/plans?from=northstar_limit");
  expect(after.reasoningRemaining).toBe(0);
});

test.each(["pending", "error", "timeout"])("confirmed zero still routes to plans through a %s refresh", async (status) => {
  harness.read.mockResolvedValue(snapshot(2)); const ready = await harness.settle(render);
  harness.read.mockImplementation(() => status === "error" ? Promise.reject(new Error("read failed")) : new Promise(() => {}));
  ready.refreshUsage(); await harness.settle(render);
  if (status === "timeout") jest.advanceTimersByTime(10_000);
  const next = await harness.settle(render); await next.propose();
  expect(next.reasoningRemaining).toBe(0); expect(push).toHaveBeenCalledTimes(1); expect(propose).not.toHaveBeenCalled();
});

test.each(["pending", "timeout"])("a first %s read cannot start a proposal or invent exhaustion", async (status) => {
  harness.read.mockReturnValue(new Promise(() => {})); await harness.settle(render);
  if (status === "timeout") jest.advanceTimersByTime(10_000);
  const view = await harness.settle(render); await view.propose();
  expect(view.reasoningRemaining).toBeNull(); expect(propose).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
});

test.each([[0, 0], [2, 2]])("failed refreshes retain all local uses, including reward credits (used=%s credits=%s)", async (used, credits) => {
  propose.mockResolvedValue(["suggestion"]); harness.read.mockResolvedValue(snapshot(used, credits));
  const first = await harness.settle(render); expect(first.reasoningRemaining).toBe(2);
  harness.read.mockRejectedValue(new Error("refresh failed"));
  await first.propose(); const second = await harness.settle(render); expect(second.reasoningRemaining).toBe(1);
  await second.propose(); const spent = await harness.settle(render); expect(spent.reasoningRemaining).toBe(0);
  await spent.propose(); expect(propose).toHaveBeenCalledTimes(2); expect(push).toHaveBeenCalledTimes(1);
});

test("a captured button reads the debited budget even before another render", async () => {
  propose.mockResolvedValue(["suggestion"]); harness.read.mockResolvedValue(snapshot(1));
  const before = await harness.settle(render); harness.read.mockReturnValue(new Promise(() => {}));
  await before.propose(); await before.propose();
  expect(propose).toHaveBeenCalledTimes(1); expect(push).toHaveBeenCalledTimes(1);
});

test("a captured button uses the latest confirmed exhaustion", async () => {
  const before = await harness.settle(render); harness.read.mockResolvedValue(snapshot(2)); before.refreshUsage();
  await harness.settle(render); await before.propose();
  expect(propose).not.toHaveBeenCalled(); expect(push).toHaveBeenCalledTimes(1);
});

test("a confirmed refresh after the write replaces the budget without double counting", async () => {
  propose.mockResolvedValue(["suggestion"]); const first = await harness.settle(render);
  harness.read.mockResolvedValue(snapshot(1)); await first.propose();
  const second = await harness.settle(render); expect(second.reasoningRemaining).toBe(1);
  harness.read.mockResolvedValue(snapshot(2)); await second.propose();
  const spent = await harness.settle(render); await spent.propose();
  expect(propose).toHaveBeenCalledTimes(2); expect(push).toHaveBeenCalledTimes(1);
  // A later confirmed credit can open the gate again.
  harness.read.mockResolvedValue(snapshot(2, 1)); spent.refreshUsage();
  expect((await harness.settle(render)).reasoningRemaining).toBe(1);
});

test("a read during an unfinished usage write cannot erase its local debit", async () => {
  const writing = deferred<void>(); increment.mockReturnValue(writing.promise);
  propose.mockResolvedValue(["suggestion"]); harness.read.mockResolvedValue(snapshot(1));
  const first = await harness.settle(render); await first.propose();
  harness.read.mockResolvedValue(snapshot(1)); first.refreshUsage();
  const during = await harness.settle(render); await during.propose();
  expect(during.reasoningRemaining).toBe(0); expect(propose).toHaveBeenCalledTimes(1); expect(push).toHaveBeenCalledTimes(1);
  harness.read.mockResolvedValue(snapshot(2)); writing.resolve();
  expect((await harness.settle(render)).reasoningRemaining).toBe(0);
});

test("a failed same-owner return cannot reuse the previous epoch's allowance", async () => {
  await harness.settle(render); harness.owner("owner-b"); harness.owner("owner-a");
  harness.read.mockRejectedValue(new Error("returned read failed"));
  const returned = await harness.settle(render); await returned.propose();
  expect(returned.reasoningRemaining).toBeNull(); expect(propose).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
});

test("two presses on a captured button cannot spend the last run concurrently", async () => {
  const result = deferred<string[]>(); propose.mockReturnValue(result.promise); harness.read.mockResolvedValue(snapshot(1));
  const view = await harness.settle(render); const first = view.propose(); await view.propose();
  expect(propose).toHaveBeenCalledTimes(1); result.resolve(["suggestion"]); await first;
});

test("unknown usage disables proposal and exposes existing read failure and retry copy", () => {
  expect(file.source).toContain("disabled={proposing || reasoningRemaining === null}");
  expect(file.source).toContain('usageView.status === "error" || usageView.status === "timeout"');
  expect(file.source).toContain('t("ops:phone.board.generation.unavailable")');
  expect(file.source).toContain('t("common:errors.network")');
  expect(file.source).toContain('label={t("common:actions.retry")} variant="text" onPress={refreshUsage}');
});
