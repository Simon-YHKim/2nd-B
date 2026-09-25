// Native rewarded ads are useful only when the server-side callback is the
// payer. The client must acquire a short-lived, JWT-owned ticket before it
// creates or shows an ad and must never turn an SDK event into a DB grant.

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

jest.mock("../consent", () => ({
  ensureUmpConsent: jest.fn(async () => ({ canRequestAds: true })),
  ensureAdsInitialized: jest.fn(async () => true),
}));

const mockGetSession = jest.fn();
const mockInvoke = jest.fn();
const mockRpc = jest.fn();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

type Listener = (...args: unknown[]) => void;
const listeners: Record<string, Listener[]> = {};
const unsubscribers: jest.Mock[] = [];
const fire = (type: string, ...args: unknown[]) => {
  for (const callback of listeners[type] ?? []) callback(...args);
};
const fakeAd = {
  addAdEventListener: jest.fn((type: string, callback: Listener) => {
    (listeners[type] ??= []).push(callback);
    const unsubscribe = jest.fn();
    unsubscribers.push(unsubscribe);
    return unsubscribe;
  }),
  load: jest.fn(),
  show: jest.fn(() => Promise.resolve()),
};
const createForAdRequest = jest.fn(() => fakeAd);

jest.mock("react-native-google-mobile-ads", () => ({
  RewardedAd: { createForAdRequest: (...args: unknown[]) => createForAdRequest(...(args as [])) },
  RewardedAdEventType: { LOADED: "loaded", EARNED_REWARD: "earned" },
  AdEventType: { CLOSED: "closed", ERROR: "error" },
  TestIds: { REWARDED: "ca-app-pub-3940256099942544/5224354917" },
}));

import { canCompleteRewardedWatch, showRewardedAd } from "../rewarded.native";
import { ensureAdsInitialized, ensureUmpConsent } from "../consent";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_USER_ID = "223e4567-e89b-42d3-a456-426614174000";
const ACCESS_TOKEN = "test-access-token";
const TICKET = "A".repeat(43);
const REASONING_OPTIONS = { ssvCustomData: USER_ID };
const CHAT_OPTIONS = { ssvCustomData: `${USER_ID}|chat` };
const TEST_AD_UNIT = "ca-app-pub-3940256099942544/5224354917";
const LIVE_AD_UNIT = "ca-app-pub-1234567890123456/1234567890";
const ANDROID_AD_UNIT = "ca-app-pub-1234567890123456/2345678901";
const IOS_AD_UNIT = "ca-app-pub-1234567890123456/3456789012";
const ORIGINAL_SSV = process.env.EXPO_PUBLIC_REWARD_SSV;
const ORIGINAL_REWARDED_UNIT = process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID;
const ORIGINAL_ANDROID_UNIT = process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID;
const ORIGINAL_IOS_UNIT = process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS;
const { Platform } = jest.requireMock("react-native") as { Platform: { OS: string } };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const flushMicrotasks = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function sessionResponse(userId = USER_ID) {
  return {
    data: { session: { access_token: ACCESS_TOKEN, user: { id: userId } } },
    error: null,
  };
}

function ticketResponse(userId = USER_ID, expiresIn = 20 * 60) {
  return {
    data: { user_id: userId, custom_data: TICKET, expires_in: expiresIn },
    error: null,
  };
}

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

beforeEach(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  process.env.EXPO_PUBLIC_REWARD_SSV = "true";
  delete process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID;
  delete process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID;
  delete process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS;
  Platform.OS = "android";
  for (const key of Object.keys(listeners)) delete listeners[key];
  unsubscribers.length = 0;
  jest.clearAllMocks();
  mockGetSession.mockReset();
  mockInvoke.mockReset();
  mockRpc.mockReset();
  fakeAd.load.mockImplementation(() => undefined);
  fakeAd.show.mockImplementation(() => Promise.resolve());
  createForAdRequest.mockImplementation(() => fakeAd);
  (ensureUmpConsent as jest.Mock).mockResolvedValue({ canRequestAds: true });
  (ensureAdsInitialized as jest.Mock).mockResolvedValue(true);
  mockGetSession.mockResolvedValue(sessionResponse());
  mockInvoke.mockResolvedValue(ticketResponse());
});

afterAll(() => {
  if (ORIGINAL_SSV === undefined) delete process.env.EXPO_PUBLIC_REWARD_SSV;
  else process.env.EXPO_PUBLIC_REWARD_SSV = ORIGINAL_SSV;
  if (ORIGINAL_REWARDED_UNIT === undefined) {
    delete process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID;
  } else {
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID = ORIGINAL_REWARDED_UNIT;
  }
  if (ORIGINAL_ANDROID_UNIT === undefined) {
    delete process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID;
  } else {
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID = ORIGINAL_ANDROID_UNIT;
  }
  if (ORIGINAL_IOS_UNIT === undefined) {
    delete process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS;
  } else {
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS = ORIGINAL_IOS_UNIT;
  }
});

describe("showRewardedAd SSV ticket boundary", () => {
  test.each([
    [REASONING_OPTIONS, "reasoning"],
    [CHAT_OPTIONS, "chat"],
  ] as const)("gets an authenticated %s ticket before creating the ad", async (options, kind) => {
    const result = showRewardedAd(options);
    await flush();

    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenCalledWith("rewarded-ssv", {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      body: { kind, ad_unit_id: TEST_AD_UNIT },
      signal: expect.anything(),
    });
    expect(mockInvoke.mock.invocationCallOrder[0]).toBeLessThan(
      createForAdRequest.mock.invocationCallOrder[0],
    );
    expect(createForAdRequest).toHaveBeenCalledWith(TEST_AD_UNIT, {
      serverSideVerificationOptions: { customData: TICKET },
    });
    expect(fakeAd.load).toHaveBeenCalledTimes(1);
    expect(fakeAd.show).not.toHaveBeenCalled();

    fire("loaded");
    fire("loaded");
    await flush();
    expect(fakeAd.show).toHaveBeenCalledTimes(1);
    fire("closed");
    await expect(result).resolves.toEqual({ completed: false });
    expect(mockGetSession).toHaveBeenCalledTimes(4);
  });

  test("an earned watch completes once and performs no local grant", async () => {
    const completed = jest.fn();
    const result = showRewardedAd(REASONING_OPTIONS).then((value) => {
      completed(value);
      return value;
    });
    await flush();
    fire("loaded");
    await flush();
    fire("earned");
    fire("earned");
    fire("closed");
    fire("closed");

    await expect(result).resolves.toEqual({ completed: true });
    expect(completed).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(unsubscribers).toHaveLength(4);
    for (const unsubscribe of unsubscribers) expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test.each([
    undefined,
    { ssvCustomData: "" },
    { ssvCustomData: "not-a-user" },
    { ssvCustomData: `${USER_ID}|reasoning` },
    { ssvCustomData: `${USER_ID}|chat|extra` },
  ])("rejects a missing or ambiguous placement hint before auth: %#", async (options) => {
    const result = showRewardedAd(options);
    await flush();
    fire("closed");
    await expect(result).resolves.toEqual({ completed: false });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  test("requires the caller's user hint to match the authenticated subject", async () => {
    mockGetSession.mockResolvedValueOnce(sessionResponse(OTHER_USER_ID));
    const result = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("closed");
    await expect(result).resolves.toEqual({ completed: false });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  test("drops an issued A ticket if the session changes before ad construction", async () => {
    mockGetSession
      .mockResolvedValueOnce(sessionResponse(USER_ID))
      .mockResolvedValueOnce(sessionResponse(OTHER_USER_ID));
    const result = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("closed");

    await expect(result).resolves.toEqual({ completed: false });
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  test("fails closed when the post-issue session fence rejects", async () => {
    mockGetSession
      .mockResolvedValueOnce(sessionResponse(USER_ID))
      .mockRejectedValueOnce(new Error("session unavailable"));

    await expect(showRewardedAd(REASONING_OPTIONS)).resolves.toEqual({ completed: false });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  test("bounds a stalled post-issue session fence before creating the ad", async () => {
    jest.useFakeTimers();
    try {
      mockGetSession
        .mockResolvedValueOnce(sessionResponse(USER_ID))
        .mockImplementationOnce(() => new Promise(() => undefined));
      const result = showRewardedAd(REASONING_OPTIONS);
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockGetSession).toHaveBeenCalledTimes(2);

      const outcome = Promise.race([
        result.then((value) => ({ state: "settled", value })),
        new Promise<{ state: "pending" }>((resolve) => {
          setTimeout(() => resolve({ state: "pending" }), 6_000);
        }),
      ]);
      await jest.advanceTimersByTimeAsync(6_000);

      await expect(outcome).resolves.toEqual({
        state: "settled",
        value: { completed: false },
      });
      expect(createForAdRequest).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("does not show an A-owned ad after the session changes to B while loading", async () => {
    mockGetSession
      .mockResolvedValueOnce(sessionResponse(USER_ID))
      .mockResolvedValueOnce(sessionResponse(USER_ID))
      .mockResolvedValueOnce(sessionResponse(OTHER_USER_ID));
    const result = showRewardedAd(REASONING_OPTIONS);
    await flush();
    expect(createForAdRequest).toHaveBeenCalledTimes(1);
    fire("loaded");
    await flush();
    fire("closed");

    await expect(result).resolves.toEqual({ completed: false });
    expect(fakeAd.show).not.toHaveBeenCalled();
  });

  test("does not report A's earned result into B's active session", async () => {
    mockGetSession
      .mockResolvedValueOnce(sessionResponse(USER_ID))
      .mockResolvedValueOnce(sessionResponse(USER_ID))
      .mockResolvedValueOnce(sessionResponse(USER_ID))
      .mockResolvedValueOnce(sessionResponse(OTHER_USER_ID));
    const result = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("loaded");
    await flush();
    fire("earned");
    fire("closed");

    await expect(result).resolves.toEqual({ completed: false });
    expect(fakeAd.show).toHaveBeenCalledTimes(1);
  });

  test.each([
    { data: { session: null }, error: null },
    { data: { session: null }, error: new Error("signed out") },
    { data: { session: { access_token: "", user: { id: USER_ID } } }, error: null },
  ])("fails closed when no valid session exists: %#", async (session) => {
    mockGetSession.mockResolvedValueOnce(session);
    const result = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("closed");
    await expect(result).resolves.toEqual({ completed: false });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  test("accepts the bounded 20-minute server ticket contract", async () => {
    mockInvoke.mockResolvedValueOnce(ticketResponse(USER_ID, 20 * 60));
    const result = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("closed");

    expect(createForAdRequest).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toEqual({ completed: false });
  });

  test("does not show a ticket whose wall-clock delivery budget expired while suspended", async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-09-13T00:00:00Z"));
      const result = showRewardedAd(REASONING_OPTIONS);
      await flushMicrotasks();
      jest.setSystemTime(new Date("2026-09-13T00:06:00Z"));
      fire("loaded");
      await flushMicrotasks();

      await expect(result).resolves.toEqual({ completed: false });
      expect(fakeAd.show).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("does not report local completion after the ticket expires while suspended", async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-09-13T00:00:00Z"));
      const result = showRewardedAd(REASONING_OPTIONS);
      await flushMicrotasks();
      fire("loaded");
      await flushMicrotasks();
      fire("earned");
      jest.setSystemTime(new Date("2026-09-13T00:21:00Z"));
      fire("closed");

      await expect(result).resolves.toEqual({ completed: false });
    } finally {
      jest.useRealTimers();
    }
  });

  test.each([
    { data: null, error: new Error("offline") },
    { data: { user_id: OTHER_USER_ID, custom_data: TICKET, expires_in: 600 }, error: null },
    { data: { user_id: USER_ID, custom_data: "short", expires_in: 600 }, error: null },
    { data: { user_id: USER_ID, custom_data: TICKET, expires_in: 601 }, error: null },
    { data: { user_id: USER_ID, custom_data: TICKET, expires_in: 600, extra: true }, error: null },
  ])("rejects an error or malformed ticket before creating an ad: %#", async (response) => {
    mockInvoke.mockResolvedValueOnce(response);
    const result = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("closed");
    await expect(result).resolves.toEqual({ completed: false });
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  test("aborts a stalled ticket request at the deadline", async () => {
    jest.useFakeTimers();
    try {
      mockInvoke.mockReturnValueOnce(new Promise(() => undefined));
      const result = showRewardedAd(REASONING_OPTIONS);
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      await jest.advanceTimersByTimeAsync(20_000);
      await expect(result).resolves.toEqual({ completed: false });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const signal = mockInvoke.mock.calls[0]?.[1]?.signal as AbortSignal | undefined;
      expect(signal?.aborted).toBe(true);
      expect(createForAdRequest).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("a failed ticket issue can be retried without reusing client state", async () => {
    mockInvoke
      .mockResolvedValueOnce({ data: null, error: new Error("temporary") })
      .mockResolvedValueOnce(ticketResponse());
    const failed = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("closed");
    await expect(failed).resolves.toEqual({ completed: false });
    expect(createForAdRequest).not.toHaveBeenCalled();

    const retry = showRewardedAd(REASONING_OPTIONS);
    await flush();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(createForAdRequest).toHaveBeenCalledTimes(1);
    fire("closed");
    await expect(retry).resolves.toEqual({ completed: false });
  });

  test("SDK option construction failure resolves false and never loads or shows", async () => {
    createForAdRequest.mockImplementationOnce(() => {
      throw new Error("invalid SSV options");
    });
    await expect(showRewardedAd(REASONING_OPTIONS)).resolves.toEqual({ completed: false });
    expect(fakeAd.load).not.toHaveBeenCalled();
    expect(fakeAd.show).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("SDK load and show failures resolve false and clean up listeners", async () => {
    fakeAd.load.mockImplementationOnce(() => {
      throw new Error("load failed");
    });
    await expect(showRewardedAd(REASONING_OPTIONS)).resolves.toEqual({ completed: false });
    expect(unsubscribers).toHaveLength(4);
    for (const unsubscribe of unsubscribers) expect(unsubscribe).toHaveBeenCalledTimes(1);

    for (const key of Object.keys(listeners)) delete listeners[key];
    unsubscribers.length = 0;
    fakeAd.show.mockRejectedValueOnce(new Error("show failed"));
    const showFailure = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("loaded");
    await expect(showFailure).resolves.toEqual({ completed: false });
    expect(unsubscribers).toHaveLength(4);
    for (const unsubscribe of unsubscribers) expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("showRewardedAd gates and SDK lifecycle", () => {
  test("SSV disabled fails before consent, ticket acquisition, or ad creation", async () => {
    delete process.env.EXPO_PUBLIC_REWARD_SSV;
    const result = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("closed");
    await expect(result).resolves.toEqual({ completed: false });
    expect(canCompleteRewardedWatch()).toBe(false);
    expect(ensureUmpConsent).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  test("UMP denial and SDK initialization failure never issue tickets", async () => {
    (ensureUmpConsent as jest.Mock).mockResolvedValueOnce({ canRequestAds: false });
    await expect(showRewardedAd(REASONING_OPTIONS)).resolves.toEqual({ completed: false });
    expect(mockGetSession).not.toHaveBeenCalled();

    (ensureUmpConsent as jest.Mock).mockResolvedValueOnce({ canRequestAds: true });
    (ensureAdsInitialized as jest.Mock).mockResolvedValueOnce(false);
    await expect(showRewardedAd(REASONING_OPTIONS)).resolves.toEqual({ completed: false });
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  test("web platform fails closed without touching consent or auth", async () => {
    const reactNative = jest.requireMock("react-native") as { Platform: { OS: string } };
    reactNative.Platform.OS = "web";
    try {
      await expect(showRewardedAd(REASONING_OPTIONS)).resolves.toEqual({ completed: false });
      expect(ensureUmpConsent).not.toHaveBeenCalled();
      expect(mockGetSession).not.toHaveBeenCalled();
    } finally {
      reactNative.Platform.OS = "android";
    }
  });

  test("dismissal and SDK error without EARNED_REWARD stay incomplete", async () => {
    const dismissed = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("loaded");
    fire("closed");
    await expect(dismissed).resolves.toEqual({ completed: false });

    for (const key of Object.keys(listeners)) delete listeners[key];
    const errored = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("error", new Error("no fill"));
    await expect(errored).resolves.toEqual({ completed: false });
  });

  test.each([
    undefined,
    "",
    "ca-app-pub-123/456",
    ` ${LIVE_AD_UNIT}`,
    TEST_AD_UNIT,
  ])("production rejects a missing, malformed, or Google test ad unit: %#", async (unitId) => {
    const global = globalThis as { __DEV__?: boolean };
    global.__DEV__ = false;
    if (unitId === undefined) delete process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID;
    else process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID = unitId;

    await expect(showRewardedAd(REASONING_OPTIONS)).resolves.toEqual({ completed: false });
    expect(canCompleteRewardedWatch()).toBe(false);
    expect(ensureUmpConsent).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  test("Android retains the legacy live ad unit when its platform setting is absent", async () => {
    const global = globalThis as { __DEV__?: boolean };
    global.__DEV__ = false;
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID = LIVE_AD_UNIT;

    expect(canCompleteRewardedWatch()).toBe(true);
    const result = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("closed");
    await expect(result).resolves.toEqual({ completed: false });

    expect(createForAdRequest).toHaveBeenCalledWith(LIVE_AD_UNIT, {
      serverSideVerificationOptions: { customData: TICKET },
    });
    expect(mockInvoke).toHaveBeenCalledWith("rewarded-ssv", expect.objectContaining({
      body: { kind: "reasoning", ad_unit_id: LIVE_AD_UNIT },
    }));
  });

  test.each([
    ["android", ANDROID_AD_UNIT],
    ["ios", IOS_AD_UNIT],
  ])("%s uses its platform unit for both ticket issuance and the displayed ad", async (platform, unitId) => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    Platform.OS = platform;
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID = LIVE_AD_UNIT;
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID = ANDROID_AD_UNIT;
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS = IOS_AD_UNIT;

    const result = showRewardedAd(CHAT_OPTIONS);
    await flush();
    fire("closed");
    await expect(result).resolves.toEqual({ completed: false });

    expect(canCompleteRewardedWatch()).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("rewarded-ssv", expect.objectContaining({
      body: { kind: "chat", ad_unit_id: unitId },
    }));
    expect(createForAdRequest).toHaveBeenCalledWith(unitId, {
      serverSideVerificationOptions: { customData: TICKET },
    });
  });

  test("iOS without its own unit fails closed even when Android and legacy units exist", async () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    Platform.OS = "ios";
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID = LIVE_AD_UNIT;
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID = ANDROID_AD_UNIT;

    const result = showRewardedAd(REASONING_OPTIONS);
    await flush();
    fire("closed");
    await expect(result).resolves.toEqual({ completed: false });

    expect(canCompleteRewardedWatch()).toBe(false);
    expect(ensureUmpConsent).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(createForAdRequest).not.toHaveBeenCalled();
  });

  describe.each(["android", "ios"])("%s platform unit validation", (platform) => {
    test.each([
      "",
      "ca-app-pub-123/456",
      ` ${LIVE_AD_UNIT}`,
      TEST_AD_UNIT,
      "ca-app-pub-3940256099942544/1712485313",
      "ca-app-pub-3940256099942544/1033173712",
    ])("rejects an explicit invalid unit without falling back to legacy: %#", async (unitId) => {
      (globalThis as { __DEV__?: boolean }).__DEV__ = false;
      Platform.OS = platform;
      process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID = LIVE_AD_UNIT;
      process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID = unitId;
      process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS = unitId;

      const result = showRewardedAd(REASONING_OPTIONS);
      await flush();
      fire("closed");
      await expect(result).resolves.toEqual({ completed: false });

      expect(canCompleteRewardedWatch()).toBe(false);
      expect(ensureUmpConsent).not.toHaveBeenCalled();
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(createForAdRequest).not.toHaveBeenCalled();
    });
  });
});
