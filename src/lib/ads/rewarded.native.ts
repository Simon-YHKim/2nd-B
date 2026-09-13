// Rewarded-ad boundary, NATIVE side of the platform split. The default/web
// implementation remains the fail-closed stub in ./rewarded.ts so Metro never
// pulls the native ads SDK into the web bundle.
//
// The SDK EARNED_REWARD event answers only whether the watch completed. It is
// not grant authority. When SSV is enabled, the signed Google callback and its
// atomic DB ticket consume are the sole payer; the client never invokes a
// reward RPC. Every ad request carries only a server-issued opaque ticket;
// the authenticated subject stays inside the ticket service.

import { Platform } from "react-native";

import { withTimeout } from "../async/with-timeout";
import { getSupabaseClient } from "../supabase/client";
import { ensureAdsInitialized, ensureUmpConsent } from "./consent";
import type { RewardedResult, ShowRewardedAdOptions } from "./types";

export type { RewardedResult, ShowRewardedAdOptions } from "./types";

type GoogleMobileAdsModule = typeof import("react-native-google-mobile-ads");
type RewardKind = "reasoning" | "chat";
type PlacementHint = { kind: RewardKind; userId: string };
type RewardTicket = { userId: string; customData: string; expiresAt: number };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{1,8192}$/;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ADMOB_REWARDED_UNIT_PATTERN = /^ca-app-pub-\d{16}\/\d{10}$/;
const GOOGLE_TEST_REWARDED_UNITS = new Set([
  "ca-app-pub-3940256099942544/5224354917", // Android
  "ca-app-pub-3940256099942544/1712485313", // iOS
]);
const TICKET_TIMEOUT_MS = 5_000;
const SESSION_FENCE_TIMEOUT_MS = 5_000;
const LOAD_TIMEOUT_MS = 20_000;
const SHOW_TIMEOUT_MS = 10 * 60_000;
const PROVIDER_RETRY_WINDOW_MS = 5_000;
const CALLBACK_DELIVERY_MARGIN_MS = 5 * 60_000;
const REWARD_TICKET_TTL_SECONDS = 20 * 60;
const MIN_REWARD_TICKET_TTL_MS = TICKET_TIMEOUT_MS + 2 * SESSION_FENCE_TIMEOUT_MS +
  LOAD_TIMEOUT_MS + SHOW_TIMEOUT_MS + PROVIDER_RETRY_WINDOW_MS + CALLBACK_DELIVERY_MARGIN_MS;
const MIN_SHOW_DELIVERY_BUDGET_MS =
  SHOW_TIMEOUT_MS + PROVIDER_RETRY_WINDOW_MS + CALLBACK_DELIVERY_MARGIN_MS;

function loadSdk(): GoogleMobileAdsModule | null {
  if (Platform.OS === "web") return null;
  try {
    return require("react-native-google-mobile-ads") as GoogleMobileAdsModule;
  } catch {
    return null;
  }
}

/** Whether the rewarded-ad SDK is present in this build (Expo Go/jest: no). */
export function isRewardedAdSdkAvailable(): boolean {
  return loadSdk() !== null;
}

function rewardedAdUnitId(sdk: GoogleMobileAdsModule): string | null {
  if (__DEV__) return sdk.TestIds.REWARDED;

  const configured = process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID;
  if (
    typeof configured !== "string" ||
    !ADMOB_REWARDED_UNIT_PATTERN.test(configured) ||
    configured === sdk.TestIds.REWARDED ||
    GOOGLE_TEST_REWARDED_UNITS.has(configured)
  ) {
    return null;
  }
  return configured;
}

/**
 * A native watch is useful only when its callback has a deployable SSV payer.
 * Keep this strict so a typo such as TRUE cannot expose a locally-paid path.
 */
export function canCompleteRewardedWatch(): boolean {
  if (process.env.EXPO_PUBLIC_REWARD_SSV !== "true") return false;
  const sdk = loadSdk();
  return sdk !== null && rewardedAdUnitId(sdk) !== null;
}

/**
 * Preserve the fielded caller surface without trusting it as provider data.
 * Bare UUID means reasoning; the only accepted suffix is exactly `|chat`.
 */
function parsePlacementHint(value: string | undefined): PlacementHint | null {
  if (!value) return null;
  if (UUID_PATTERN.test(value)) return { kind: "reasoning", userId: value };
  const suffix = "|chat";
  if (!value.endsWith(suffix)) return null;
  const userId = value.slice(0, -suffix.length);
  return UUID_PATTERN.test(userId) ? { kind: "chat", userId } : null;
}

function parseTicketResponse(
  value: unknown,
  expectedUserId: string,
  requestedAt: number,
): RewardTicket | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  if (keys.join(",") !== "custom_data,expires_in,user_id") return null;
  if (row.user_id !== expectedUserId) return null;
  if (typeof row.custom_data !== "string" || !TICKET_PATTERN.test(row.custom_data)) return null;
  if (
    typeof row.expires_in !== "number" || !Number.isInteger(row.expires_in) ||
    row.expires_in !== REWARD_TICKET_TTL_SECONDS ||
    row.expires_in * 1_000 < MIN_REWARD_TICKET_TTL_MS
  ) {
    return null;
  }
  return {
    userId: expectedUserId,
    customData: row.custom_data,
    expiresAt: requestedAt + row.expires_in * 1_000,
  };
}

function hasShowDeliveryBudget(ticket: RewardTicket): boolean {
  return ticket.expiresAt - Date.now() >= MIN_SHOW_DELIVERY_BUDGET_MS;
}

async function sessionStillOwns(userId: string): Promise<boolean> {
  try {
    const { data, error } = await withTimeout(
      getSupabaseClient().auth.getSession(),
      SESSION_FENCE_TIMEOUT_MS,
      "reward session ownership check",
    );
    return !error && data.session?.user?.id === userId;
  } catch {
    return false;
  }
}

async function acquireRewardTicket(hint: PlacementHint): Promise<RewardTicket | null> {
  const requestedAt = Date.now();
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const deadline = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, TICKET_TIMEOUT_MS);
  });

  const issue = async (): Promise<RewardTicket | null> => {
    const client = getSupabaseClient();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (controller.signal.aborted || sessionError) return null;

    const session = sessionData.session;
    const accessToken = session?.access_token;
    const sessionUserId = session?.user?.id;
    if (
      typeof accessToken !== "string" || !ACCESS_TOKEN_PATTERN.test(accessToken) ||
      typeof sessionUserId !== "string" || sessionUserId !== hint.userId
    ) return null;

    const kind = hint.kind;
    const { data, error } = await client.functions.invoke("rewarded-ssv", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { kind },
      signal: controller.signal,
    });
    if (controller.signal.aborted || error) return null;
    return parseTicketResponse(data, sessionUserId, requestedAt);
  };

  try {
    return await Promise.race([issue(), deadline]);
  } catch {
    return null;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

/**
 * Play one rewarded video. All gates fail closed, and a fresh server ticket is
 * acquired after consent/SDK initialization but before ad construction/show.
 */
export async function showRewardedAd(opts?: ShowRewardedAdOptions): Promise<RewardedResult> {
  const hint = parsePlacementHint(opts?.ssvCustomData);
  if (!hint) return { completed: false };

  const sdk = loadSdk();
  if (!sdk || process.env.EXPO_PUBLIC_REWARD_SSV !== "true") return { completed: false };
  const unitId = rewardedAdUnitId(sdk);
  if (!unitId) return { completed: false };

  try {
    const consent = await ensureUmpConsent(
      opts?.debugUmpEea ? { debugGeographyEea: true } : undefined,
    );
    if (!consent.canRequestAds || !(await ensureAdsInitialized())) return { completed: false };

    const ticket = await acquireRewardTicket(hint);
    if (!ticket) return { completed: false };
    if (!(await sessionStillOwns(ticket.userId))) return { completed: false };
    if (!hasShowDeliveryBudget(ticket)) return { completed: false };

    const ad = sdk.RewardedAd.createForAdRequest(unitId, {
      serverSideVerificationOptions: {
        customData: ticket.customData,
      },
    });

    return await new Promise<RewardedResult>((resolve) => {
      let earned = false;
      let showStarted = false;
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const subscriptions: Array<() => void> = [];

      const settle = (completed: boolean) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
        for (const unsubscribe of subscriptions) {
          try {
            unsubscribe();
          } catch {
            // Listener cleanup is best-effort; the result must still settle.
          }
        }
        resolve({ completed });
      };

      try {
        subscriptions.push(ad.addAdEventListener(sdk.RewardedAdEventType.LOADED, () => {
          if (settled || showStarted) return;
          showStarted = true;
          if (timeoutId !== null) clearTimeout(timeoutId);
          timeoutId = setTimeout(() => settle(false), SHOW_TIMEOUT_MS);
          void (async () => {
            if (
              !(await sessionStillOwns(ticket.userId)) ||
              !hasShowDeliveryBudget(ticket) || settled
            ) {
              settle(false);
              return;
            }
            try {
              await ad.show();
            } catch {
              settle(false);
            }
          })();
        }));
        subscriptions.push(ad.addAdEventListener(sdk.RewardedAdEventType.EARNED_REWARD, () => {
          if (!settled && Date.now() < ticket.expiresAt) earned = true;
        }));
        subscriptions.push(ad.addAdEventListener(sdk.AdEventType.CLOSED, () => {
          if (settled) return;
          void sessionStillOwns(ticket.userId).then(
            (owned) => settle(earned && owned && Date.now() < ticket.expiresAt),
            () => settle(false),
          );
        }));
        subscriptions.push(ad.addAdEventListener(sdk.AdEventType.ERROR, () => settle(false)));

        timeoutId = setTimeout(() => settle(false), LOAD_TIMEOUT_MS);
        ad.load();
      } catch {
        settle(false);
      }
    });
  } catch {
    return { completed: false };
  }
}
