import type * as Analytics from "../index";
import type * as AuthConversions from "../auth-conversions";
import type * as PaddleConversions from "../paddle-conversions";
import type * as Account from "../../auth/account-epoch";

const priceId = "pri_01h00000000000000000000000";
const transactionId = "txn_01h00000000000000000000000";
const input = { tier: "brain", cadence: "monthly", priceId, environment: "production" } as const;
const adult = { isMinor: false, confirmedAdult: true };
const profile = { privacy_prefs: { external_analytics: true }, birth_date: "1981-04-18" };
function completion() {
  return { name: "checkout.completed", data: {
    status: "completed", transaction_id: transactionId, currency_code: "USD",
    totals: { subtotal: 30, discount: 5, tax: 2.5, total: 27.5 },
    items: [{ price_id: priceId, quantity: 1, totals: { subtotal: 30, discount: 5 } }],
    customer: { email: "private@example.invalid" }, custom_data: { user_id: "private-owner", signature: "private-signature" },
    payment: { card: { last4: "1234" } },
  } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("consented web conversions", () => {
  let analytics: typeof Analytics;
  let auth: typeof AuthConversions;
  let paddle: typeof PaddleConversions;
  let account: typeof Account;
  let readProfile: jest.Mock;
  let getUser: jest.Mock;
  let platform: { OS: string };
  let runtimeEnabled: boolean;
  let dataLayer: unknown[];
  let appendChild: jest.Mock;
  const events = () => dataLayer.map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((entry) => entry[0] === "event");
  async function flush() { for (let i = 0; i < 15; i += 1) await Promise.resolve(); }
  async function grant() { analytics.setAnalyticsConsent(true, adult); await flush(); }

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    platform = { OS: "web" };
    runtimeEnabled = true;
    readProfile = jest.fn().mockResolvedValue({ data: profile, error: null });
    getUser = jest.fn().mockResolvedValue({ data: { user: { id: "adult-a", app_metadata: { provider: "google" } } }, error: null });
    jest.doMock("react-native", () => ({ Platform: platform }));
    jest.doMock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_GA4_MEASUREMENT_ID: "G-TEST" }) }));
    jest.doMock("../../supabase/auth", () => ({ ageInYears: (date: string) => 2026 - Number(date.slice(0, 4)) }));
    jest.doMock("../../auth/consent-age", () => ({ requiresGuardianConsent: (age: number) => age < 14, resolveJurisdiction: () => ({}) }));
    jest.doMock("../../supabase/client", () => ({ getSupabaseClient: () => ({
      auth: { getUser },
      from: (table: string) => ({
        select() { return this; }, eq() { return this; },
        maybeSingle: readProfile,
        in: async () => ({ data: table === "runtime_flags" ? [{ key: "analytics_enabled", enabled: runtimeEnabled }] : [], error: null }),
      }),
    }) }));
    dataLayer = [];
    appendChild = jest.fn();
    (globalThis as { window?: unknown }).window = {
      dataLayer, location: { origin: "https://example.invalid" },
      localStorage: { setItem: jest.fn(), getItem: jest.fn() },
    };
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ async: false, src: "" }), head: { appendChild }, cookie: "",
    };
    analytics = require("../index");
    auth = require("../auth-conversions");
    paddle = require("../paddle-conversions");
    account = require("../../auth/account-epoch");
    account.noteResolvedOwner("adult-a");
    analytics.__resetAnalytics();
    auth.publishAnalyticsProfileGate("adult-a", false);
    await analytics.initAnalytics();
  });
  afterEach(() => {
    analytics.__resetAnalytics();
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
    jest.useRealTimers();
  });

  test("an existing opt-in is resolved once before observing login, without a pre-consent event", async () => {
    const pending = deferred<{ data: typeof profile; error: null }>();
    readProfile.mockReturnValue(pending.promise);
    const hydration = auth.hydrateAnalyticsConsent("adult-a");
    const observation = auth.observeAuthConversion("adult-a", "login", "email");
    expect(events()).toEqual([]);
    expect(appendChild).not.toHaveBeenCalled();
    expect(readProfile).toHaveBeenCalledTimes(1);
    pending.resolve({ data: profile, error: null });
    expect(await hydration).toBe(true);
    expect(await observation).toBe(true);
    await flush();
    expect(events()).toHaveLength(1);
    expect(events()[0]).toEqual(["event", "login", expect.objectContaining({ method: "email" })]);
  });

  test("explicit OFF during hydration wins and later ON never replays the dropped login", async () => {
    const pending = deferred<{ data: typeof profile; error: null }>();
    readProfile.mockReturnValue(pending.promise);
    const observation = auth.observeAuthConversion("adult-a", "login", "email");
    analytics.setAnalyticsConsent(false, adult);
    pending.resolve({ data: profile, error: null });
    expect(await observation).toBe(false);
    await grant();
    expect(events()).toEqual([]);
  });

  test("a resolved refusal is not hydration and is never replaced by a stale server grant", async () => {
    analytics.setAnalyticsConsent(false, adult);
    expect(await auth.observeAuthConversion("adult-a", "sign_up", "email")).toBe(false);
    expect(readProfile).not.toHaveBeenCalled();
    await grant();
    expect(events()).toEqual([]);
  });

  test("a failed initial profile probe can recover the same owner's existing opt-in", async () => {
    auth.publishAnalyticsProfileGate("adult-a", null);
    analytics.suspendAnalyticsForUnresolvedProfile();
    expect(await auth.observeAuthConversion("adult-a", "login", "email")).toBe(false);
    auth.publishAnalyticsProfileGate("adult-a", false);
    expect(await auth.hydrateAnalyticsConsent("adult-a")).toBe(true);
    await flush();
    expect(events()).toEqual([]); // recovering consent does not replay failed login
  });

  test("a later unresolved profile does not erase the user's explicit OFF", async () => {
    analytics.setAnalyticsConsent(false, adult);
    auth.publishAnalyticsProfileGate("adult-a", null);
    analytics.suspendAnalyticsForUnresolvedProfile();
    auth.publishAnalyticsProfileGate("adult-a", false);
    expect(await auth.hydrateAnalyticsConsent("adult-a")).toBe(false);
    expect(readProfile).not.toHaveBeenCalled();
  });

  test("an adult grant is immediately suspended until the same owner's age is confirmed again", async () => {
    await grant();
    auth.publishAnalyticsProfileGate("adult-a", null);
    expect(analytics.getAnalyticsConsentSnapshot()).toMatchObject({ granted: false, resolved: false });
    expect(analytics.captureEvent({ name: "login", props: { method: "email" } })).toBe(false);
    auth.publishAnalyticsProfileGate("adult-a", false);
    expect(await auth.hydrateAnalyticsConsent("adult-a")).toBe(true);
    await flush();
    expect(events()).toEqual([]);
  });

  test("an account transition retires an in-flight consent read before publication", async () => {
    const pending = deferred<{ data: typeof profile; error: null }>();
    readProfile.mockReturnValue(pending.promise);
    const observation = auth.observeAuthConversion("adult-a", "login", "email");
    account.beginAccountOwnerTransition("adult-b");
    pending.resolve({ data: profile, error: null });
    expect(await observation).toBe(false);
    expect(analytics.getAnalyticsConsentSnapshot().granted).toBe(false);
    expect(events()).toEqual([]);
  });

  test.each([null, "2012-01-01", "invalid"])("missing/minor/malformed server DOB stays off: %s", async (birth_date) => {
    readProfile.mockResolvedValue({ data: { ...profile, birth_date }, error: null });
    expect(await auth.observeAuthConversion("adult-a", "login", "email")).toBe(false);
    expect(appendChild).not.toHaveBeenCalled();
    expect(events()).toEqual([]);
  });

  test.each([null, true])("AuthContext unresolved/minor age cannot be overruled by the consent read: %s", async (minor) => {
    auth.publishAnalyticsProfileGate("adult-a", minor);
    expect(await auth.observeAuthConversion("adult-a", "login", "email")).toBe(false);
    expect(readProfile).not.toHaveBeenCalled();
    expect(events()).toEqual([]);
  });

  test("a failed consent read and timeout fail closed", async () => {
    readProfile.mockReturnValue(new Promise(() => {}));
    const observation = auth.observeAuthConversion("adult-a", "login", "email");
    await jest.advanceTimersByTimeAsync(5000);
    expect(await observation).toBe(false);
    expect(events()).toEqual([]);
  });

  test("runtime OFF and native continue to block web conversions", async () => {
    analytics.__resetAnalytics();
    runtimeEnabled = false;
    await analytics.initAnalytics();
    expect(await auth.observeAuthConversion("adult-a", "login", "email")).toBe(false);
    platform.OS = "ios";
    readProfile.mockClear();
    expect(await auth.observeAuthConversion("adult-a", "login", "email")).toBe(false);
    expect(readProfile).not.toHaveBeenCalled();
    expect(events()).toEqual([]);
  });

  test("OAuth method is allowlisted and a withdrawal while resolving it retires the observation", async () => {
    await grant();
    const pending = deferred<unknown>();
    getUser.mockReturnValue(pending.promise);
    const observation = auth.observeAuthConversion("adult-a", "login", undefined, true);
    analytics.setAnalyticsConsent(false, adult);
    await grant();
    pending.resolve({ data: { user: { id: "adult-a", app_metadata: { provider: "google" } } }, error: null });
    expect(await observation).toBe(false);
    expect(events()).toEqual([]);
  });

  test("only callback purchase fields reach GA and a transaction is accepted once", async () => {
    await grant();
    const attempt = paddle.createPaddleAnalyticsAttempt(input);
    expect(attempt.started()).toBe(true);
    expect(attempt.started()).toBe(false);
    expect(attempt.completed(completion())).toBe(true);
    expect(attempt.completed(completion())).toBe(false);
    expect(events().map((entry) => entry[1])).toEqual(["begin_checkout", "purchase"]);
    expect(events()[1][2]).toMatchObject({
      transaction_id: transactionId, currency: "USD", value: 25,
      items: [{ item_id: priceId, item_name: "brain", quantity: 1, price: 25 }],
    });
    expect(JSON.stringify(events())).not.toMatch(/private|customer|custom_data|signature|payment|last4/);
    const repeated = paddle.createPaddleAnalyticsAttempt(input);
    repeated.started();
    expect(repeated.completed(completion())).toBe(false);
  });

  test.each(["sandbox", "denied", "withdrawn", "account-change"])("retires purchase when %s", async (mode) => {
    if (mode !== "denied") await grant();
    const attempt = paddle.createPaddleAnalyticsAttempt({ ...input, environment: mode === "sandbox" ? "sandbox" : "production" });
    attempt.started();
    if (mode === "denied") await grant();
    if (mode === "withdrawn") { analytics.setAnalyticsConsent(false, adult); await grant(); }
    if (mode === "account-change") {
      account.beginAccountOwnerTransition("adult-b");
      account.noteResolvedOwner("adult-b");
      await grant();
    }
    expect(attempt.completed(completion())).toBe(false);
    expect(events().filter((entry) => entry[1] === "purchase")).toEqual([]);
  });

  test.each([NaN, Infinity, -1, "30"])("rejects invalid callback amounts: %s", (amount) => {
    const event = completion();
    (event.data.totals as Record<string, unknown>).subtotal = amount;
    expect(paddle.paddlePurchaseProps(event, input)).toBeNull();
  });

  test("rejects unknown currency, inconsistent totals and a different price", () => {
    const currency = completion(); currency.data.currency_code = "ZZZ";
    const totals = completion(); totals.data.items[0].totals.subtotal = 500;
    const price = completion(); price.data.items[0].price_id = "pri_01h11111111111111111111111";
    for (const event of [currency, totals, price]) expect(paddle.paddlePurchaseProps(event, input)).toBeNull();
  });

  test("KRW uses whole currency units and does not apply the API's cents conversion", () => {
    const event = completion();
    event.data.currency_code = "KRW";
    event.data.totals.subtotal = event.data.items[0].totals.subtotal = 10000;
    event.data.totals.discount = event.data.items[0].totals.discount = 0;
    expect(paddle.paddlePurchaseProps(event, input)?.value).toBe(10000);
    event.data.totals.subtotal = event.data.items[0].totals.subtotal = 10000.5;
    expect(paddle.paddlePurchaseProps(event, input)).toBeNull();
  });
});
