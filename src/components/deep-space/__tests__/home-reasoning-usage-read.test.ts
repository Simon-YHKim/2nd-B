import { compile, deferred, snapshot, sourceFile, usageHarness } from "../../../lib/reasoning/__tests__/usage-consumer-harness";
import { remainingReasoning } from "../../../lib/entitlements/reasoning-cap";
import { weeklyBaseRemaining } from "../../../lib/reasoning/remaining-copy";

const file = sourceFile("src/components/deep-space/ConstellationHome.tsx");
const harness = usageHarness();
const auto = jest.fn();
let owner = "owner-a";
let bubble = { kind: "reasoning" };
let surface: (userId: string, bubble: { kind: string }) => { bubbleLine: string; reasoningMode: string; refreshReasoningStatus: () => void };
const render = () => surface(owner, bubble);

beforeAll(() => {
  surface = compile(`return (userId, bubble) => {
    const progression = { tier: "free" }, task = { phase: "idle" };
    const setHomeFocused = () => {};
    ${file.between("  const accountEpoch =", "  // A summoned dialogue")}
    ${file.statement("const bubbleLine =")}
    ${file.statement("const reasoningMode:")}
    return { bubbleLine, reasoningMode, refreshReasoningStatus };
  };`, {
    ...harness.install(), remainingReasoning, weeklyBaseRemaining, getAutoReasoningEnabled: auto,
    reasoningCopy: { choose: "choose", automatic: "automatic", depleted: "depleted", baseLeft: (n: number) => `base:${n}`, rewardLeft: (n: number) => `reward:${n}` },
    t: () => "intro",
  });
});
beforeEach(() => { harness.reset(); owner = "owner-a"; bubble = { kind: "reasoning" }; auto.mockReset().mockResolvedValue(false); });
afterEach(() => harness.cleanup());
afterAll(() => harness.restore());

test("failure never claims a base remainder or depletion; reopening retries", async () => {
  harness.read.mockRejectedValue(new Error("unavailable"));
  expect(await harness.settle(render)).toMatchObject({ bubbleLine: "choose", reasoningMode: "available" });
  bubble = { kind: "intro" }; harness.render(render);
  harness.read.mockResolvedValue(snapshot(1)); bubble = { kind: "reasoning" };
  expect((await harness.settle(render)).bubbleLine).toBe("base:1");
});
test.each([[0, 0, "base:2", "available"], [2, 0, "depleted", "depleted"], [2, 5, "reward:5", "available"]])(
  "confirmed used=%s credits=%s keeps the real count", async (used, credits, line, mode) => {
    harness.read.mockResolvedValue(snapshot(used as number, credits as number));
    expect(await harness.settle(render)).toMatchObject({ bubbleLine: line, reasoningMode: mode });
  },
);
test("refresh hides an old number while pending and after failure", async () => {
  harness.read.mockResolvedValue(snapshot(1)); const ready = await harness.settle(render);
  harness.read.mockRejectedValue(new Error("refresh")); ready.refreshReasoningStatus();
  expect(harness.render(render).bubbleLine).toBe("choose");
  expect((await harness.settle(render)).bubbleLine).toBe("choose");
});
test("account switch rejects A's late usage and automatic preference", async () => {
  const late = deferred<ReturnType<typeof snapshot>>(), pref = deferred<boolean>();
  harness.read.mockReturnValue(late.promise); auto.mockReturnValue(pref.promise);
  await harness.settle(render);
  harness.owner("owner-b"); owner = "owner-b";
  harness.read.mockRejectedValue(new Error("B unavailable")); auto.mockResolvedValue(false);
  await harness.settle(render); late.resolve(snapshot(2)); pref.resolve(true);
  expect(await harness.settle(render)).toMatchObject({ bubbleLine: "choose", reasoningMode: "available" });
});
test("same-owner return requires a new read and old refresh cannot restore numbers", async () => {
  const old = await harness.settle(render);
  harness.owner("owner-b"); harness.owner("owner-a");
  harness.read.mockRejectedValue(new Error("returned")); old.refreshReasoningStatus();
  expect((await harness.settle(render)).bubbleLine).toBe("choose");
});
test("home has no fail-open usage getter", () => { expect(file.source).not.toContain("getReasoningUsage"); });
