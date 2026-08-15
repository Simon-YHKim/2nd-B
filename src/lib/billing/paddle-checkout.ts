// Paddle (Merchant of Record) web checkout.
//
// The live surface is the web export on GitHub Pages, and RevenueCat - which
// drives the CTAs on dds-plans-screen - is native-only, so the web build had no
// way to take money at all. This module is that path.
//
// Deliberately dependency-free: Paddle.js is loaded from Paddle's CDN at first
// use rather than added to package.json. A React Native bundle should not carry
// a browser-only SDK, and the repo's free-tier promise means every new
// dependency is a decision; a runtime <script> on web only is neither.
//
// The one contract that matters: the webhook resolves a purchase to a user
// through `data.custom_data.user_id` (supabase/functions/paddle-webhook).
// If this module stops sending customData.user_id, a payer stays 'free' with
// no error anywhere - so paddle-checkout.test.ts pins it.
//
// Config (all public - a Paddle client-side token is publishable, like the
// Supabase anon key; the notification secret is the only real secret and it
// lives in Supabase edge secrets, never here):
//   EXPO_PUBLIC_PADDLE_CLIENT_TOKEN=live_...
//   EXPO_PUBLIC_PADDLE_PRICE_CORTEX_MONTHLY=pri_...
//   EXPO_PUBLIC_PADDLE_PRICE_CORTEX_YEARLY=pri_...
//   EXPO_PUBLIC_PADDLE_PRICE_BRAIN_MONTHLY=pri_...
//   EXPO_PUBLIC_PADDLE_PRICE_BRAIN_YEARLY=pri_...
// Unset = unavailable. Every entry point fails closed, so a half-configured
// deploy shows the existing "checkout is not open yet" copy instead of a broken
// button.

import { Platform } from "react-native";

import { getSupabaseClient } from "@/lib/supabase/client";

/** Tiers with a purchase path. Mirrors SellableTier in progression/pricing.ts. */
export type CheckoutTier = "cortex" | "brain";
export type CheckoutCadence = "monthly" | "yearly";

export type CheckoutResult =
  | { ok: true }
  | { ok: false; reason: "unsupported_platform" | "not_configured" | "no_user" | "sdk_load_failed" | "open_failed" };

const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";

function env(name: string): string {
  // Expo inlines EXPO_PUBLIC_* at build time, so these must be static lookups.
  const table: Record<string, string | undefined> = {
    EXPO_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN,
    EXPO_PUBLIC_PADDLE_PRICE_CORTEX_MONTHLY: process.env.EXPO_PUBLIC_PADDLE_PRICE_CORTEX_MONTHLY,
    EXPO_PUBLIC_PADDLE_PRICE_CORTEX_YEARLY: process.env.EXPO_PUBLIC_PADDLE_PRICE_CORTEX_YEARLY,
    EXPO_PUBLIC_PADDLE_PRICE_BRAIN_MONTHLY: process.env.EXPO_PUBLIC_PADDLE_PRICE_BRAIN_MONTHLY,
    EXPO_PUBLIC_PADDLE_PRICE_BRAIN_YEARLY: process.env.EXPO_PUBLIC_PADDLE_PRICE_BRAIN_YEARLY,
  };
  return (table[name] ?? "").trim();
}

/** The configured Paddle price id for a tier + cadence, or "" when unset. */
export function priceIdFor(tier: CheckoutTier, cadence: CheckoutCadence): string {
  return env(`EXPO_PUBLIC_PADDLE_PRICE_${tier.toUpperCase()}_${cadence.toUpperCase()}`);
}

/** True when this build can actually open a Paddle checkout for that plan. */
export function paddleCheckoutAvailable(tier: CheckoutTier, cadence: CheckoutCadence = "monthly"): boolean {
  if (Platform.OS !== "web") return false;
  return env("EXPO_PUBLIC_PADDLE_CLIENT_TOKEN") !== "" && priceIdFor(tier, cadence) !== "";
}

type PaddleGlobal = {
  Initialize: (opts: { token: string }) => void;
  Checkout: { open: (opts: unknown) => void };
};

let sdk: Promise<PaddleGlobal | null> | null = null;

/** Test hook: forget the cached SDK load. */
export function __resetPaddleSdkForTests(): void {
  sdk = null;
}

function loadPaddle(token: string): Promise<PaddleGlobal | null> {
  if (sdk) return sdk;
  sdk = new Promise<PaddleGlobal | null>((resolve) => {
    const w = globalThis as unknown as { Paddle?: PaddleGlobal; document?: Document };
    if (w.Paddle) {
      w.Paddle.Initialize({ token });
      resolve(w.Paddle);
      return;
    }
    const doc = w.document;
    if (!doc) {
      resolve(null);
      return;
    }
    const el = doc.createElement("script");
    el.src = PADDLE_JS;
    el.async = true;
    el.onload = () => {
      const p = (globalThis as unknown as { Paddle?: PaddleGlobal }).Paddle;
      if (!p) {
        resolve(null);
        return;
      }
      p.Initialize({ token });
      resolve(p);
    };
    // A failed load must not cache a rejected promise - let the next tap retry.
    el.onerror = () => {
      sdk = null;
      resolve(null);
    };
    doc.head.appendChild(el);
  });
  return sdk;
}

export interface OpenCheckoutInput {
  tier: CheckoutTier;
  cadence?: CheckoutCadence;
  locale?: "ko" | "en";
  /** Where Paddle returns the buyer after payment. Defaults to the current page. */
  successUrl?: string;
}

/**
 * Open the Paddle overlay for a plan. Resolves once the overlay is handed off;
 * the tier itself is granted server-side by the webhook, never here - the
 * client is not a source of entitlement truth.
 */
export async function openPaddleCheckout(input: OpenCheckoutInput): Promise<CheckoutResult> {
  const cadence = input.cadence ?? "monthly";
  if (Platform.OS !== "web") return { ok: false, reason: "unsupported_platform" };

  const token = env("EXPO_PUBLIC_PADDLE_CLIENT_TOKEN");
  const priceId = priceIdFor(input.tier, cadence);
  if (!token || !priceId) return { ok: false, reason: "not_configured" };

  // The webhook keys the purchase off this id. No id, no grant - so refuse to
  // open a checkout that could take money we could never attribute.
  const { data } = await getSupabaseClient().auth.getUser();
  const userId = data?.user?.id;
  if (!userId) return { ok: false, reason: "no_user" };

  const paddle = await loadPaddle(token);
  if (!paddle) return { ok: false, reason: "sdk_load_failed" };

  try {
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customData: { user_id: userId },
      customer: data?.user?.email ? { email: data.user.email } : undefined,
      settings: {
        locale: input.locale ?? "ko",
        ...(input.successUrl ? { successUrl: input.successUrl } : {}),
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "open_failed" };
  }
}
