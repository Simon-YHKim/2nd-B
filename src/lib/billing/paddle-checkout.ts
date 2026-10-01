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
// Ownership is bound server-side. The browser asks subscription-manage for a
// short-lived HMAC object and passes that entire object as customData. The
// webhook verifies it and never trusts a browser-selected user id.
//
// Config here is public - a Paddle client-side token is publishable, like the
// Supabase anon key. Notification and checkout-binding secrets are server-only
// Supabase Edge secrets and never belong in this module:
//   EXPO_PUBLIC_PADDLE_ENVIRONMENT=production (default) or sandbox
//   EXPO_PUBLIC_PADDLE_CLIENT_TOKEN=live_...
//   EXPO_PUBLIC_PADDLE_PRICE_CORTEX_MONTHLY=pri_...
//   EXPO_PUBLIC_PADDLE_PRICE_CORTEX_YEARLY=pri_...
//   EXPO_PUBLIC_PADDLE_PRICE_BRAIN_MONTHLY=pri_...
//   EXPO_PUBLIC_PADDLE_PRICE_BRAIN_YEARLY=pri_...
// Sandbox builds use test_ tokens and their isolated project's Supabase URL.
// The server binding must agree on environment, project, and selected price.
// Unset = unavailable. Every entry point fails closed, so a half-configured
// deploy shows the existing "checkout is not open yet" copy instead of a broken
// button.

import { Platform } from "react-native";

import { getSupabaseClient } from "@/lib/supabase/client";
import { createPaddleAnalyticsAttempt } from "@/lib/analytics/paddle-conversions";
import { captureAccountOwnerLease, currentAccountOwner } from "@/lib/auth/account-epoch";

/** Tiers with a purchase path. Mirrors SellableTier in progression/pricing.ts. */
export type CheckoutTier = "cortex" | "brain";
export type CheckoutCadence = "monthly" | "yearly";

export type CheckoutResult =
  | { ok: true }
  | { ok: false; reason: "unsupported_platform" | "not_configured" | "no_user" | "binding_failed" | "sdk_load_failed" | "open_failed" };

const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";
type PaddleEnvironment = "production" | "sandbox";

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
  return checkoutConfig(tier, cadence) !== null;
}

function checkoutConfig(tier: CheckoutTier, cadence: CheckoutCadence): {
  environment: PaddleEnvironment; token: string; priceId: string; audience: string;
} | null {
  const environment = process.env.EXPO_PUBLIC_PADDLE_ENVIRONMENT ?? "production";
  if (environment !== "production" && environment !== "sandbox") return null;
  const token = env("EXPO_PUBLIC_PADDLE_CLIENT_TOKEN");
  const prefix = environment === "sandbox" ? "test" : "live";
  if (!new RegExp(`^${prefix}_[a-zA-Z0-9]{27}$`).test(token)) return null;
  const priceId = priceIdFor(tier, cadence);
  if (!/^pri_[a-z0-9]{26}$/.test(priceId)) return null;
  try {
    const url = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { environment, token, priceId, audience: url.origin };
  } catch {
    return null;
  }
}

type PaddleGlobal = {
  Initialized?: boolean;
  Environment: { set: (environment: PaddleEnvironment) => void };
  Initialize: (opts: { token: string }) => void;
  Update: (opts: { eventCallback: (event: unknown) => void }) => void;
  Checkout: { open: (opts: unknown) => void };
};

interface PaddleCheckoutBindingData {
  user_id: string;
  issued_at: number;
  nonce: string;
  signature: string;
  version: 2;
  environment: PaddleEnvironment;
  audience: string;
  price_id: string;
}

function checkoutBindingFor(
  value: unknown, expectedUserId: string,
  config: { environment: PaddleEnvironment; audience: string; priceId: string },
): PaddleCheckoutBindingData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const binding = value as Record<string, unknown>;
  if (
    binding.user_id !== expectedUserId
    || binding.version !== 2
    || binding.environment !== config.environment
    || binding.audience !== config.audience
    || binding.price_id !== config.priceId
    || !Number.isSafeInteger(binding.issued_at)
    || typeof binding.nonce !== "string"
    || !/^[0-9a-f]{32}$/.test(binding.nonce)
    || typeof binding.signature !== "string"
    || !/^[0-9a-f]{64}$/.test(binding.signature)
  ) return null;
  return {
    user_id: binding.user_id as string,
    issued_at: binding.issued_at as number,
    nonce: binding.nonce,
    signature: binding.signature,
    version: 2,
    environment: config.environment,
    audience: config.audience,
    price_id: config.priceId,
  };
}

let sdk: Promise<PaddleGlobal | null> | null = null;
let sdkIdentity: string | null = null;

/** Test hook: forget the cached SDK load. */
export function __resetPaddleSdkForTests(): void {
  sdk = null;
  sdkIdentity = null;
}

function loadPaddle(token: string, environment: PaddleEnvironment): Promise<PaddleGlobal | null> {
  const identity = `${environment}:${token}`;
  if (sdk) return sdkIdentity === identity ? sdk : Promise.resolve(null);
  sdkIdentity = identity;
  sdk = new Promise<PaddleGlobal | null>((resolve) => {
    const initialize = (paddle: PaddleGlobal | undefined) => {
      try {
        // This module owns initialization. A preinitialized foreign instance
        // has no verifiable token/environment and must not open our checkout.
        if (!paddle || paddle.Initialized) return resolve(null);
        // A fresh SDK defaults to production; Paddle documents this setter
        // for sandbox before initialization.
        if (environment === "sandbox") paddle.Environment.set("sandbox");
        paddle.Initialize({ token });
        resolve(paddle);
      } catch {
        resolve(null);
      }
    };
    const w = globalThis as unknown as { Paddle?: PaddleGlobal; document?: Document };
    if (w.Paddle) {
      initialize(w.Paddle);
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
      initialize(p);
    };
    // A failed load must not cache a rejected promise - let the next tap retry.
    el.onerror = () => {
      sdk = null;
      resolve(null);
    };
    doc.head.appendChild(el);
  }).then((paddle) => {
    if (!paddle) { sdk = null; sdkIdentity = null; }
    return paddle;
  }).catch(() => {
    sdk = null;
    sdkIdentity = null;
    return null;
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

  const config = checkoutConfig(input.tier, cadence);
  if (!config) return { ok: false, reason: "not_configured" };
  const { token, priceId, environment } = config;

  // The webhook keys the purchase off this id. No id, no grant - so refuse to
  // open a checkout that could take money we could never attribute.
  const ownerId = currentAccountOwner();
  const ownerLease = ownerId ? captureAccountOwnerLease(ownerId) : null;
  if (!ownerLease) return { ok: false, reason: "no_user" };
  const client = getSupabaseClient();
  const { data } = await client.auth.getUser();
  const userId = data?.user?.id;
  if (userId !== ownerLease.ownerId || !ownerLease.isCurrent()) return { ok: false, reason: "no_user" };

  let checkoutBinding: PaddleCheckoutBindingData | null = null;
  try {
    const { data: bindingData, error } = await client.functions.invoke("subscription-manage", {
      body: { action: "checkout_binding", price_id: priceId, paddle_environment: environment },
    });
    if (!error) checkoutBinding = checkoutBindingFor(bindingData, userId, config);
  } catch {
    checkoutBinding = null;
  }
  if (!ownerLease.isCurrent()) return { ok: false, reason: "no_user" };
  if (!checkoutBinding) return { ok: false, reason: "binding_failed" };

  const paddle = await loadPaddle(token, environment);
  if (!ownerLease.isCurrent()) return { ok: false, reason: "no_user" };
  if (!paddle) return { ok: false, reason: "sdk_load_failed" };

  try {
    let attempt: ReturnType<typeof createPaddleAnalyticsAttempt> | null = null;
    try {
      attempt = createPaddleAnalyticsAttempt({ tier: input.tier, cadence, priceId, environment });
    } catch { /* Optional analytics must not prevent a checkout. */ }
    const nonce = checkoutBinding.nonce;
    paddle.Update({ eventCallback: (event: unknown) => {
      // A late event from an earlier overlay cannot complete this attempt.
      // The nonce is compared locally and is never sent to analytics.
      try {
        if (!ownerLease.isCurrent()) return;
        if (!event || typeof event !== "object") return;
        const data = (event as { data?: { custom_data?: { nonce?: unknown } } }).data;
        if (data?.custom_data?.nonce !== nonce) return;
        attempt?.completed(event);
      } catch { /* Provider events and optional analytics cannot break checkout. */ }
    } });
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customData: checkoutBinding,
      customer: data?.user?.email ? { email: data.user.email } : undefined,
      settings: {
        locale: input.locale ?? "ko",
        ...(input.successUrl ? { successUrl: input.successUrl } : {}),
      },
    });
    try { attempt?.started(); } catch { /* Checkout has already opened. */ }
    return { ok: true };
  } catch {
    return { ok: false, reason: "open_failed" };
  }
}
