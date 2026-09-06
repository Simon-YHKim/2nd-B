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
  TestIds: { REWARDED: "google-official-test-rewarded" },
}));

import { canCompleteRewardedWatch, showRewardedAd } from "../rewarded.native";
import { ensureAdsInitialized, ensureUmpConsent } from "../consent";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_USER_ID = "223e4567-e89b-42d3-a456-426614174000";
const ACCESS_TOKEN = "test-access-token";
const TICKET = "A".repeat(43);
const REASONING_OPTIONS = { ssvCustomData: USER_ID };
const CHAT_OPTIONS = { ssvCustomData: `${USER_ID}|chat` };
const ORIGINAL_SSV = process.env.EXPO_PUBLIC_REWARD_SSV;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function sessionResponse(userId = USER_ID) {
  return {
    data: { session: { access_token: ACCESS_TOKEN, user: { id: userId } } },
    error: null,
  };
}

function ticketResponse(userId = USER_ID) {
  return {
    data: { user_id: userId, custom_data: TICKET, expires_in: 600 },
    error: null,
  };
}

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

beforeEach(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  process.env.EXPO_PUBLIC_REWARD_SSV = "true";
  for (const key of Object.keys(listeners)) delete listeners[key];
  unsubscribers.length = 0;
  jest.clearAllMocks();
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
});

describe("showRewardedAd SSV ticket boundary", () => {
  test.each([
    [REASONING_OPTIONS, "reasoning"],
    [CHAT_OPTIONS, "chat"],
  ] as const)("gets an authenticated %s ticket before creating the ad", async (options, kind) => {
    const result = showRewardedAd(options);
    await flush();

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("rewarded-ssv", {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      body: { kind },
      signal: expect.anything(),
    });
    expect(mockInvoke.mock.invocationCallOrder[0]).toBeLessThan(
      createForAdRequest.mock.invocationCallOrder[0],
    );
    expect(createForAdRequest).toHaveBeenCalledWith("google-official-test-rewarded", {
      serverSideVerificationOptions: { userId: USER_ID, customData: TICKET },
    });
    expect(fakeAd.load).toHaveBeenCalledTimes(1);
    expect(fakeAd.show).not.toHaveBeenCalled();

    fire("loaded");
    fire("loaded");
    expect(fakeAd.show).toHaveBeenCalledTimes(1);
    fire("closed");
    await expect(result).resolves.toEqual({ completed: false });
  });

  test("an earned watch completes once and performs no local grant", async () => {
    const completed = jest.fn();
    const result = showRewardedAd(REASONING_OPTIONS).then((value) => {
      completed(value);
      return value;
    });
    await flush();
    fire("loaded");
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

  test("production stays fail-closed until the real ad unit is configured", async () => {
    const global = globalThis as { __DEV__?: boolean };
    global.__DEV__ = false;
    await expect(showRewardedAd(REASONING_OPTIONS)).resolves.toEqual({ completed: false });
    expect(canCompleteRewardedWatch()).toBe(false);
    expect(ensureUmpConsent).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});
