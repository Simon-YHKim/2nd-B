import { z } from "zod";

// Public demo placeholders. When the deployed web build has no Supabase
// repo Variables set (e.g. first-deploy of a public preview), zod would
// fail the .url()/.min(20) checks and the entire app would crash on
// import — producing the dreaded blank white screen.
//
// We accept these placeholders at module load so the UI renders. Any
// actual auth/data call against this stub will fail with a clear
// network error rather than a silent SPA crash. Production builds with
// real Supabase credentials in env vars are unaffected.
const DEMO_SUPABASE_URL = "https://demo.invalid.supabase.co";
const DEMO_SUPABASE_ANON_KEY = "demo-key-placeholder-20-chars-min";

export const IS_DEMO_BUILD = (raw: string | undefined): boolean =>
  !raw || raw === "" || raw === DEMO_SUPABASE_URL;

// Runtime-validated env. Read once at module import; failures throw early
// so misconfiguration surfaces before any LLM/auth call.
const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  // LLM mode: "live" calls Gemini for real; "mock" returns templated responses
  // (still routes through safety classifier — C9 invariant holds).
  // Defaults to "mock" when no GOOGLE_API_KEY and not using Vertex.
  EXPO_PUBLIC_LLM_MODE: z
    .union([z.literal("live"), z.literal("mock")])
    .optional(),
  EXPO_PUBLIC_USE_VERTEX: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "true"),
  // When true, callGemini() routes through the gemini-proxy Edge Function
  // instead of constructing a @google/genai client. This keeps the API key
  // off the client bundle — strongly recommended for Web deploys since the
  // bundle is public.
  EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "true"),
  // Test/QA paywall override: force a subscription tier for ALL users,
  // bypassing the per-user `users.subscription_tier` gating (the free-tier
  // journal/note caps, the chat daily cap, and premium-only features). This is
  // a deliberate, temporary "unlock everything for testing" switch and is the
  // single point that flips the whole paywall on/off:
  //   - "brain" (default): everything unlocked — the current testing-phase
  //     setting, applied build-wide even when the var is unset.
  //   - "off": use the real per-user tier (restores live billing gating).
  //   - "soma" | "cortex" | "free": pin everyone to that tier to test a
  //     specific paywall boundary.
  // Restore real billing by setting EXPO_PUBLIC_FORCE_TIER=off.
  EXPO_PUBLIC_FORCE_TIER: z
    .enum(["off", "free", "soma", "cortex", "brain"])
    .default("brain"),
  // Render the Soul Core v3 SVG art pack (public/assets/cosmic-pixel-v3-soulcore/)
  // instead of the legacy PNG art. Default false — the v3 pack is wired but not
  // yet QA'd on-device; flip to "true" on a dev/QA build to preview it.
  EXPO_PUBLIC_USE_V3_ART: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "true"),
  // Naver social login (custom OAuth via the oauth-naver edge function). The
  // REST client id is public (it appears in the authorize URL); the secret stays
  // in the edge function. EXPO_PUBLIC_ENABLE_NAVER gates the button + flow off by
  // default — the oauth-naver function is also server-gated by ENABLE_NAVER_OAUTH.
  EXPO_PUBLIC_NAVER_CLIENT_ID: z.string().optional(),
  EXPO_PUBLIC_ENABLE_NAVER: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "true"),
  // Supabase-native social providers (Google / Apple / Kakao). Each must be
  // configured in the Supabase dashboard (client id/secret + redirect URL) to
  // actually work; these flags only control whether the app SHOWS the button.
  // Default "true" (opt-out) preserves the prior unconditional buttons; set a
  // provider to "false" on a deploy where it is not configured so users do not
  // see a dead button. Sign-in also auto-hides a provider for the session if its
  // OAuth start fails with a "provider not enabled" error.
  EXPO_PUBLIC_ENABLE_GOOGLE: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "true"),
  EXPO_PUBLIC_ENABLE_APPLE: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "true"),
  EXPO_PUBLIC_ENABLE_KAKAO: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "true"),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().default("us-central1"),
  // GOOGLE_API_KEY without EXPO_PUBLIC_ is server-side only (native / Edge
  // Function). For Expo Web we accept EXPO_PUBLIC_GOOGLE_API_KEY too so the
  // key gets inlined into the client bundle. SECURITY: any key inlined in
  // the web bundle is extractable by anyone who visits the deployed site —
  // only use this for test keys. Production should route Gemini through a
  // Supabase Edge Function or Vertex with a service account.
  GOOGLE_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  EXPO_PUBLIC_POSTHOG_KEY: z.string().optional(),
  EXPO_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  // Web usage analytics — public client-side ids (not secrets). Both no-op until
  // set, and only load after the user grants analytics consent (PIPA). GA4 =
  // "G-XXXXXXX" measurement id (gtag); Clarity = the project id from
  // clarity.microsoft.com. Set as repo/EAS Variables to activate.
  EXPO_PUBLIC_GA4_MEASUREMENT_ID: z.string().optional(),
  EXPO_PUBLIC_CLARITY_PROJECT_ID: z.string().optional(),
});

// C2: when Vertex is enabled, GOOGLE_CLOUD_PROJECT must be set.
// Mock mode skips this requirement (no live call → no project needed).
const refined = schema
  .transform((e) => ({
    ...e,
    EXPO_PUBLIC_LLM_MODE:
      e.EXPO_PUBLIC_LLM_MODE ??
      (e.EXPO_PUBLIC_USE_VERTEX || (e.GOOGLE_API_KEY && e.GOOGLE_API_KEY.length > 0)
        ? ("live" as const)
        : ("mock" as const)),
  }))
  .refine(
    (e) =>
      e.EXPO_PUBLIC_LLM_MODE === "mock" ||
      !e.EXPO_PUBLIC_USE_VERTEX ||
      (e.GOOGLE_CLOUD_PROJECT && e.GOOGLE_CLOUD_PROJECT.length > 0),
    { message: "GOOGLE_CLOUD_PROJECT is required when EXPO_PUBLIC_USE_VERTEX=true (C2)" },
  );

function readRaw(): Record<string, string | undefined> {
  // CRITICAL: every EXPO_PUBLIC_* value must be read as a *direct*
  // `process.env.EXPO_PUBLIC_X` member expression. babel-preset-expo replaces
  // exactly that syntactic pattern with the literal value at build time.
  // Aliasing `process.env` to a local variable (e.g. `const e = process.env`)
  // defeats the static replacement — the prior bug, which made every web /
  // native build silently fall back to the demo placeholders below even when
  // real Supabase credentials were configured. Do not refactor these into a
  // loop or an alias.
  const supaUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const llmMode = process.env.EXPO_PUBLIC_LLM_MODE;
  const useVertex = process.env.EXPO_PUBLIC_USE_VERTEX;
  const viaEdge = process.env.EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION;
  const forceTier = process.env.EXPO_PUBLIC_FORCE_TIER;
  const useV3Art = process.env.EXPO_PUBLIC_USE_V3_ART;
  const naverClientId = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID;
  const enableNaver = process.env.EXPO_PUBLIC_ENABLE_NAVER;
  const enableGoogle = process.env.EXPO_PUBLIC_ENABLE_GOOGLE;
  const enableApple = process.env.EXPO_PUBLIC_ENABLE_APPLE;
  const enableKakao = process.env.EXPO_PUBLIC_ENABLE_KAKAO;
  const publicGoogleKey = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
  const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST;
  const ga4Id = process.env.EXPO_PUBLIC_GA4_MEASUREMENT_ID;
  const clarityId = process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID;
  // Non-public vars (no EXPO_PUBLIC_ prefix) are never inlined into the client
  // bundle by design; they resolve from the real process.env on native / node
  // and are simply undefined on web. Aliasing is safe for these.
  const proc: Record<string, string | undefined> =
    typeof process !== "undefined" && process.env ? process.env : {};
  // Empty-string fallback to demo values lets the UI render even on a
  // public preview deploy with no repo Variables set. Real credentials
  // override these unconditionally.
  //
  // ONLY fall back when the env var is missing or empty. Do NOT replace
  // a present-but-too-short anon key with demo — that would silently mask
  // a misconfigured-but-intentional credential (truncation, wrong key
  // type, secret-store paste error). For non-empty-but-malformed input,
  // let zod's .url()/.min(20) throw so the user sees a clear error.
  return {
    EXPO_PUBLIC_SUPABASE_URL: supaUrl && supaUrl.length > 0 ? supaUrl : DEMO_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: supaKey && supaKey.length > 0 ? supaKey : DEMO_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_LLM_MODE: llmMode,
    EXPO_PUBLIC_USE_VERTEX: useVertex,
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: viaEdge,
    EXPO_PUBLIC_FORCE_TIER: forceTier,
    EXPO_PUBLIC_USE_V3_ART: useV3Art,
    EXPO_PUBLIC_NAVER_CLIENT_ID: naverClientId,
    EXPO_PUBLIC_ENABLE_NAVER: enableNaver,
    EXPO_PUBLIC_ENABLE_GOOGLE: enableGoogle,
    EXPO_PUBLIC_ENABLE_APPLE: enableApple,
    EXPO_PUBLIC_ENABLE_KAKAO: enableKakao,
    GOOGLE_CLOUD_PROJECT: proc.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: proc.GOOGLE_CLOUD_LOCATION,
    // Prefer the inlined EXPO_PUBLIC_ variant when present (Web), fall back
    // to the non-public one (native / Edge Function).
    GOOGLE_API_KEY: (publicGoogleKey && publicGoogleKey.length > 0) ? publicGoogleKey : proc.GOOGLE_API_KEY,
    SENTRY_DSN: proc.SENTRY_DSN,
    EXPO_PUBLIC_POSTHOG_KEY: posthogKey,
    EXPO_PUBLIC_POSTHOG_HOST: posthogHost,
    EXPO_PUBLIC_GA4_MEASUREMENT_ID: ga4Id,
    EXPO_PUBLIC_CLARITY_PROJECT_ID: clarityId,
  };
}

export type Env = z.infer<typeof refined>;

// Returns parsed env. Throws ZodError on misconfiguration.
// Lazy-evaluated so unit tests (which don't need env) don't fail.
let cached: Env | null = null;
export function getEnv(): Env {
  if (cached) return cached;
  cached = refined.parse(readRaw());
  // Audit MED: EXPO_PUBLIC_FORCE_TIER defaults to "brain", so a release/judge
  // build that forgets to set it ships with the paywall fully open. Flipping
  // the default is a launch-time call (it would change what testers see today),
  // so for now make the unsafe state loud instead of silent: warn once in a
  // non-dev runtime when the override is active. Pre-launch checklist: set
  // EXPO_PUBLIC_FORCE_TIER=off.
  const devGlobal = (globalThis as { __DEV__?: boolean }).__DEV__;
  if (cached.EXPO_PUBLIC_FORCE_TIER !== "off" && devGlobal === false && typeof console !== "undefined") {
    console.warn(
      `[env] EXPO_PUBLIC_FORCE_TIER="${cached.EXPO_PUBLIC_FORCE_TIER}" in a non-dev build: ` +
        "the paywall is bypassed for every user. Set it to 'off' before launch/judging.",
    );
  }
  return cached;
}

// Test-only reset. Not exported publicly via index.
export function __resetEnvCache(): void {
  cached = null;
}
