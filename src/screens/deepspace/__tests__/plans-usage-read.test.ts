import { compile, deferred, snapshot, sourceFile, usageHarness } from "../../../lib/reasoning/__tests__/usage-consumer-harness";
import { remainingReasoning } from "../../../lib/entitlements/reasoning-cap";
import { REWARD_MONTHLY_CAP } from "../../../lib/entitlements/tiers";

const file = sourceFile("src/screens/deepspace/dds-plans-screen.tsx");
const progression = sourceFile("src/lib/progression/useProgression.ts");
const harness = usageHarness();
const grant = jest.fn(), cue = jest.fn();
let owner = "owner-a";
let surface: (dataOwner: string) => {
  ownedUsage: { status: string; used: number; rewardCredits: number };
  rewardedAllowed: boolean; freeRemaining: number; retry: () => void;
  onRewardEarned: (credits: number) => Promise<string>;
};
const render = () => surface(owner);

// Execute just the projection: the hook harness otherwise flushes the account
// effect before returning, hiding the stale same-owner frame from this test.
test.each([
  ["current owner and epoch", "owner-a", 7, true, "ready"],
  ["another owner", "owner-b", 7, true, "loading"],
  ["same owner returning in a new epoch", "owner-a", 8, true, "loading"],
  ["same owner without a valid lease", "owner-a", 7, false, "loading"],
] as const)("usage projection before effects: %s", (_label, dataOwner, epoch, hasLease, expected) => {
  const project = compile<(usageRead: object, dataOwner: string, accountEpoch: number) => { status: string; rewardCredits: number }>(`
    return (usageRead, dataOwner, accountEpoch) => {
      ${file.statement("const ownedUsage:")}
      return ownedUsage;
    };`, { captureAccountOwnerLease: () => hasLease ? { epoch } : null });
  expect(project({ ownerId: "owner-a", epoch: 7, status: "ready", ...snapshot(1, 9) }, dataOwner, epoch))
    .toMatchObject({ status: expected, rewardCredits: expected === "ready" ? 9 : 0 });
});

beforeAll(() => {
  surface = compile(`
    ${progression.statement("function settleAsyncRead").replace("export ", "")}
    ${progression.statement("function rewardCapAllowsWatch").replace("export ", "")}
    ${file.statement("const EMPTY_USAGE:")}
    ${file.statement("async function readPlansUsage")}
    return (dataOwner) => {
      const currentTier = "free", tierLoading = false, isMinor = false, pathname = "/plans";
      const ownedPrefs = { status: "ready", adsConsent: true };
      ${file.statement("const activeOwnerRef =")}
      activeOwnerRef.current = dataOwner;
      ${file.statement("const [usageRead,")}
      ${file.statement("const accountEpoch =")}
      ${file.statement("const [readEpoch,")}
      ${file.statement("const usageGeneration =")}
      ${file.between("  useEffect(() => {\n    const generation = ++usageGeneration.current;", "  const ownedStore:")}
      ${file.statement("const ownedUsage:")}
      ${file.between("  const adsConsent =", "  if (authLoading)")}
      return { ownedUsage, rewardedAllowed, freeRemaining, onRewardEarned, retry: () => setReadEpoch(v => v + 1) };
    };`, {
    ...harness.install(), readReasoningUsageStrict: harness.read, remainingReasoning, REWARD_MONTHLY_CAP,
    READ_TIMEOUT_MS: 8000, canCompleteRewardedWatch: () => true, canShowRewardedAds: () => true,
    addRewardCredits: grant, requestGlobalCue: cue,
  });
});
beforeEach(() => { harness.reset(); owner = "owner-a"; grant.mockReset().mockResolvedValue("processing"); cue.mockReset(); });
afterEach(() => harness.cleanup());
afterAll(() => harness.restore());

test("a failed read hides the reward numbers and can retry", async () => {
  harness.read.mockRejectedValue(new Error("ledger failed"));
  const failed = await harness.settle(render);
  expect(failed.ownedUsage.status).toBe("error"); expect(failed.rewardedAllowed).toBe(false);
  harness.read.mockResolvedValue(snapshot(1, 3)); failed.retry();
  const ready = await harness.settle(render); expect(ready.freeRemaining).toBe(4); expect(ready.rewardedAllowed).toBe(true);
});
test.each([[0, 0, 2], [2, 0, 0], [1, 5, 6]])("real used=%s credits=%s remains confirmed", async (used, credits, left) => {
  harness.read.mockResolvedValue(snapshot(used, credits)); const view = await harness.settle(render);
  expect(view.ownedUsage.status).toBe("ready"); expect(view.freeRemaining).toBe(left); expect(view.rewardedAllowed).toBe(true);
});
test("timeout cannot be replaced by a late result", async () => {
  const late = deferred<ReturnType<typeof snapshot>>(); harness.read.mockReturnValue(late.promise);
  await harness.settle(render); jest.advanceTimersByTime(8000);
  expect((await harness.settle(render)).ownedUsage.status).toBe("timeout");
  late.resolve(snapshot(0, 5)); expect((await harness.settle(render)).rewardedAllowed).toBe(false);
});
test("B never sees A's ready or late value", async () => {
  harness.read.mockResolvedValue(snapshot(1, 5)); const a = await harness.settle(render);
  const late = deferred<ReturnType<typeof snapshot>>(); harness.read.mockReturnValue(late.promise); a.retry(); await harness.settle(render);
  harness.owner("owner-b"); owner = "owner-b"; harness.read.mockRejectedValue(new Error("B failed"));
  expect(harness.render(render).rewardedAllowed).toBe(false);
  await harness.settle(render); late.resolve(snapshot(0, 9));
  const b = await harness.settle(render); expect(b.ownedUsage.status).toBe("error"); expect(b.rewardedAllowed).toBe(false);
  await a.onRewardEarned(2); expect(grant).not.toHaveBeenCalled();
});
test("A to B to A invalidates an old grant callback and usage", async () => {
  const a = await harness.settle(render); harness.owner("owner-b"); harness.owner("owner-a");
  harness.read.mockRejectedValue(new Error("returned")); await a.onRewardEarned(2);
  expect(grant).not.toHaveBeenCalled(); expect((await harness.settle(render)).rewardedAllowed).toBe(false);
});
test.each(["processing", "unconfirmed", "granted", "capped"])("refresh failure preserves the %s grant outcome", async (outcome) => {
  grant.mockResolvedValue(outcome); const view = await harness.settle(render);
  harness.read.mockRejectedValue(new Error("post-grant failed"));
  await expect(view.onRewardEarned(2)).resolves.toBe(outcome);
  expect((await harness.settle(render)).rewardedAllowed).toBe(false);
  expect(cue).toHaveBeenCalledTimes(outcome === "granted" ? 1 : 0);
});
test("only ready usage is eligible to display the reward sheet", () => {
  expect(file.source).toContain('import { readReasoningUsageStrict } from "@/lib/entitlements/reasoning-usage-read"');
  expect(file.source).toContain("visible={rewardVisible && rewardedAllowed}");
  expect(file.source).not.toContain("Number(credit.available)");
  expect(file.source).not.toContain("mirrorEarned");
});
