// Rewarded-ad boundary, NATIVE side of the platform split. The default/web
// implementation remains the fail-closed stub in ./rewarded.ts so Metro never
// pulls the native ads SDK into the web bundle.
//
// The SDK EARNED_REWARD event answers only whether the watch completed. It is
// not grant authority. When SSV is enabled, the signed Google callback and its
// atomic DB ticket consume are the sole payer; the client never invokes a
// reward RPC. Every ad request carries only a server-issued ticket and the
// matching authenticated subject.

import { Platform } from "react-native";

import { getSupabaseClient } from "../supabase/client";
import { ensureAdsInitialized, ensureUmpConsent } from "./consent";
import type { RewardedResult, ShowRewardedAdOptions } from "./types";

export type { RewardedResult, ShowRewardedAdOptions } from "./types";

type GoogleMobileAdsModule = typeof import("react-native-google-mobile-ads");
type RewardKind = "reasoning" | "chat";
type PlacementHint = { kind: RewardKind; userId: string };
type RewardTicket = { userId: string; customData: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{1,8192}$/;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TICKET_TIMEOUT_MS = 5_000;
const LOAD_TIMEOUT_MS = 20_000;
const SHOW_TIMEOUT_MS = 10 * 60_000;

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

// Single source for "does a live ad unit exist". The production launch change
// sets this true alongside the real unit id; dev builds use Google's test unit.
const HAS_LIVE_AD_UNIT = false;

/**
 * A native watch is useful only when its callback has a deployable SSV payer.
 * Keep this strict so a typo such as TRUE cannot expose a locally-paid path.
 */
export function canCompleteRewardedWatch(): boolean {
  if (process.env.EXPO_PUBLIC_REWARD_SSV !== "true") return false;
  if (loadSdk() === null) return false;
  return __DEV__ || HAS_LIVE_AD_UNIT;
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

function parseTicketResponse(value: unknown, expectedUserId: string): RewardTicket | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  if (keys.join(",") !== "custom_data,expires_in,user_id") return null;
  if (row.user_id !== expectedUserId) return null;
  if (typeof row.custom_data !== "string" || !TICKET_PATTERN.test(row.custom_data)) return null;
  if (
    typeof row.expires_in !== "number" || !Number.isInteger(row.expires_in) ||
    row.expires_in < 1 || row.expires_in > 600
  ) {
    return null;
  }
  return { userId: expectedUserId, customData: row.custom_data };
}

async function acquireRewardTicket(hint: PlacementHint): Promise<RewardTicket | null> {
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
    return parseTicketResponse(data, sessionUserId);
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
  if (!sdk || !canCompleteRewardedWatch()) return { completed: false };

  try {
    const consent = await ensureUmpConsent(
      opts?.debugUmpEea ? { debugGeographyEea: true } : undefined,
    );
    if (!consent.canRequestAds || !(await ensureAdsInitialized())) return { completed: false };

    const ticket = await acquireRewardTicket(hint);
    if (!ticket) return { completed: false };

    // Production launch replaces the test id only when HAS_LIVE_AD_UNIT flips.
    const unitId = sdk.TestIds.REWARDED;
    const ad = sdk.RewardedAd.createForAdRequest(unitId, {
      serverSideVerificationOptions: {
        userId: ticket.userId,
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
          try {
            void ad.show().catch(() => settle(false));
          } catch {
            settle(false);
          }
        }));
        subscriptions.push(ad.addAdEventListener(sdk.RewardedAdEventType.EARNED_REWARD, () => {
          if (!settled) earned = true;
        }));
        subscriptions.push(ad.addAdEventListener(sdk.AdEventType.CLOSED, () => settle(earned)));
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
