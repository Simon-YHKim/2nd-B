import { compile, deferred, snapshot, sourceFile, usageHarness } from "../../../lib/reasoning/__tests__/usage-consumer-harness";
import { reasoningCapForTier } from "../../../lib/entitlements/reasoning-cap";
import { REWARD_MONTHLY_CAP, REWARD_PER_WATCH } from "../../../lib/entitlements/tiers";
import { monthLabelFor } from "../../../lib/reasoning/remaining-copy";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = sourceFile("src/components/deep-space/ReasoningLimitSheet.tsx");
const harness = usageHarness();
const prefs = jest.fn(), watch = jest.fn(), grant = jest.fn(), changed = jest.fn();
let owner = "owner-a", visible = true;
let surface: (userId: string, visible: boolean) => {
  usage: ReturnType<typeof snapshot> | null; usageView: { status: string };
  baseLeft: number | null; rewardCredits: number | null;
  grantOutcome: string | null; watching: boolean; adEligible: boolean;
  onWatch: () => Promise<void>; refreshUsage: () => void;
};
const render = () => surface(owner, visible);

beforeAll(() => {
  surface = compile(`
    ${file.statement("function hasRewardSettlementAdvanced")}
    return (userId, visible) => {
      const progression = { tier: "free", loading: false }, isMinor = false, pathname = "/reasoning", i18n = { language: "ko" };
      const onChanged = changed;
      ${file.between("  const accountEpoch =", "  const goPlans =")}
      return { usage, usageView, baseLeft, rewardCredits, grantOutcome, watching, adEligible, onWatch, refreshUsage };
    };`, {
    ...harness.install(), reasoningCapForTier, REWARD_MONTHLY_CAP, REWARD_PER_WATCH, monthLabelFor,
    fetchPrivacyPrefs: prefs, showRewardedAd: watch, addRewardCredits: grant, changed,
    canCompleteRewardedWatch: () => true,
    canShowRewardedAds: ({ adsConsent }: { adsConsent: boolean | null }) => adsConsent === true,
  });
});
beforeEach(() => {
  harness.reset(); owner = "owner-a"; visible = true;
  prefs.mockReset().mockResolvedValue({ ads: true }); watch.mockReset().mockResolvedValue({ completed: true });
  grant.mockReset().mockResolvedValue("processing"); changed.mockReset();
});
afterEach(() => harness.cleanup());
afterAll(() => harness.restore());

test("failure hides both counters and the ad; retry confirms real usage", async () => {
  harness.read.mockRejectedValue(new Error("counter failed"));
  const failed = await harness.settle(render);
  expect(failed).toMatchObject({ usage: null, baseLeft: null, rewardCredits: null, adEligible: false });
  await failed.onWatch(); expect(watch).not.toHaveBeenCalled();
  harness.read.mockResolvedValue(snapshot(1, 4)); failed.refreshUsage();
  expect(await harness.settle(render)).toMatchObject({ baseLeft: 1, rewardCredits: 4, adEligible: true });
});
test.each([[0, 0, 2], [2, 0, 0], [1, 5, 1]])("confirmed used=%s credits=%s displays the real base count", async (used, credits, base) => {
  harness.read.mockResolvedValue(snapshot(used, credits));
  expect(await harness.settle(render)).toMatchObject({ baseLeft: base, rewardCredits: credits, adEligible: true });
});
test("monthly earn cap still hides the ad", async () => {
  harness.read.mockResolvedValue(snapshot(2, 5, REWARD_MONTHLY_CAP));
  expect((await harness.settle(render)).adEligible).toBe(false);
});
test("timeout hides counters and rejects an old watch button", async () => {
  const ready = await harness.settle(render);
  harness.read.mockReturnValue(new Promise(() => {})); ready.refreshUsage();
  await ready.onWatch(); expect(watch).not.toHaveBeenCalled();
  await harness.settle(render); jest.advanceTimersByTime(10_000);
  expect(await harness.settle(render)).toMatchObject({ usage: null, baseLeft: null, rewardCredits: null, usageView: { status: "timeout" } });
});
test("B does not inherit A's counts, consent or late reply", async () => {
  const late = deferred<ReturnType<typeof snapshot>>();
  harness.read.mockReturnValue(late.promise); await harness.settle(render);
  harness.owner("owner-b"); owner = "owner-b"; harness.read.mockResolvedValue(snapshot(1)); prefs.mockReturnValue(new Promise(() => {}));
  await harness.settle(render); late.resolve(snapshot(2, 9));
  expect(await harness.settle(render)).toMatchObject({ baseLeft: 1, rewardCredits: 0, adEligible: false });
});
test.each(["processing", "unconfirmed"])("%s stays locked through failed refresh and close/reopen until confirmed advance", async (outcome) => {
  harness.read.mockResolvedValue(snapshot(2, 0, 4)); const ready = await harness.settle(render);
  grant.mockResolvedValue(outcome); harness.read.mockRejectedValue(new Error("post-watch failed"));
  await ready.onWatch();
  expect(await harness.settle(render)).toMatchObject({ usage: null, grantOutcome: outcome, adEligible: false });
  visible = false; harness.render(render); visible = true;
  expect(await harness.settle(render)).toMatchObject({ usage: null, grantOutcome: outcome, adEligible: false });
  harness.read.mockResolvedValue(snapshot(2, 8, 4));
  (await harness.settle(render)).refreshUsage();
  expect(await harness.settle(render)).toMatchObject({ rewardCredits: 8, grantOutcome: outcome, adEligible: false });
  // A balance increase alone is not evidence of ad settlement (it may be a purchase).
  harness.read.mockResolvedValue(snapshot(2, 10, 6)); (await harness.settle(render)).refreshUsage();
  expect(await harness.settle(render)).toMatchObject({ rewardCredits: 10, grantOutcome: null, adEligible: true });
  expect(grant).toHaveBeenCalledTimes(1);
});
test("an unresolved watch stays with A across B's separate watch and A's return", async () => {
  harness.read.mockResolvedValue(snapshot(2, 0, 4)); const a = await harness.settle(render);
  await a.onWatch(); expect((await harness.settle(render)).grantOutcome).toBe("processing");
  harness.owner("owner-b"); owner = "owner-b"; harness.read.mockResolvedValue(snapshot());
  const b = await harness.settle(render); expect(b.grantOutcome).toBeNull(); expect(b.adEligible).toBe(true);
  grant.mockResolvedValue("unconfirmed"); await b.onWatch(); await harness.settle(render);
  harness.owner("owner-a"); owner = "owner-a"; harness.read.mockResolvedValue(snapshot(2, 0, 4));
  expect(await harness.settle(render)).toMatchObject({ grantOutcome: "processing", adEligible: false });
});
test("switching account during a watch never grants against the new session", async () => {
  const completed = deferred<{ completed: boolean }>(); watch.mockReturnValue(completed.promise);
  const a = await harness.settle(render); const watching = a.onWatch();
  harness.owner("owner-b"); owner = "owner-b"; await harness.settle(render);
  completed.resolve({ completed: true }); await watching;
  expect(grant).not.toHaveBeenCalled(); expect((await harness.settle(render)).grantOutcome).toBeNull();
  harness.owner("owner-a"); owner = "owner-a";
  expect(await harness.settle(render)).toMatchObject({ grantOutcome: "unconfirmed", watching: false, adEligible: false });
});
test("two presses on one ready button start only one watch", async () => {
  const completed = deferred<{ completed: boolean }>(); watch.mockReturnValue(completed.promise);
  const ready = await harness.settle(render); const first = ready.onWatch(); await ready.onWatch();
  expect(watch).toHaveBeenCalledTimes(1); completed.resolve({ completed: false }); await first;
});
test.each(["granted", "capped"])("%s is not rewritten to unconfirmed when its usage refresh fails", async (outcome) => {
  grant.mockResolvedValue(outcome); const ready = await harness.settle(render);
  harness.read.mockRejectedValue(new Error("post-grant failed")); await ready.onWatch();
  expect(await harness.settle(render)).toMatchObject({ usage: null, grantOutcome: null, adEligible: false });
});
test("a captured watch button stays locked after a watch exception", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    watch.mockRejectedValue(new Error("watch unavailable")); const ready = await harness.settle(render);
    await ready.onWatch(); await ready.onWatch(); expect(watch).toHaveBeenCalledTimes(1);
    expect((await harness.settle(render)).grantOutcome).toBe("unconfirmed");
  } finally { warn.mockRestore(); }
});
test("source gates the numeric meter and offers existing failure/retry copy", () => {
  expect(file.source).toContain("{cap !== null && usage ? (");
  expect(file.source).toContain("{!usage");
  expect(file.source).toContain('t("ops:phone.board.generation.unavailable")');
  expect(file.source).toContain('label={t("common:actions.retry")} variant="text" onPress={refreshUsage}');
  expect(file.source).not.toContain("getReasoningUsage");
});
test.each([
  ["ko", "불러오지 못했습니다. 다시 시도해 주세요."],
  ["en", "Could not load. Please try again."],
  ["es", "No se pudo cargar. Vuelve a intentarlo."],
  ["pt", "Não foi possível carregar. Tente novamente."],
  ["id", "Tidak dapat memuat. Silakan coba lagi."],
])("%s reused failure copy describes a read, without blaming saved items", (locale, expected) => {
  const bundle = JSON.parse(readFileSync(resolve(__dirname, "../../../../locales", locale, "ops.json"), "utf8"));
  expect(bundle.phone.board.generation.unavailable).toBe(expected);
});
