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

test("failed usage is unknown and preserves the existing fail-open proposal policy", async () => {
  harness.read.mockRejectedValue(new Error("failed"));
  const view = await harness.settle(render);
  expect(view.reasoningRemaining).toBeNull(); await view.propose();
  expect(propose).toHaveBeenCalledTimes(1); expect(push).not.toHaveBeenCalled();
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
  await b.propose(); expect(propose).toHaveBeenCalledTimes(1); expect(push).not.toHaveBeenCalled();
});
test("A to B to A rejects an old proposal callback", async () => {
  const a = await harness.settle(render); harness.owner("owner-b"); harness.owner("owner-a");
  await a.propose(); expect(propose).not.toHaveBeenCalled();
});
test("a successful proposal refreshes confirmed usage instead of inventing a count", async () => {
  propose.mockResolvedValue(["suggestion"]);
  const a = await harness.settle(render); harness.read.mockRejectedValue(new Error("refresh failed"));
  await a.propose(); const next = await harness.settle(render);
  expect(increment).toHaveBeenCalledTimes(1); expect(next.reasoningRemaining).toBeNull();
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
