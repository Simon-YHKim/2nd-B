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
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().default("us-central1"),
  GOOGLE_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  EXPO_PUBLIC_POSTHOG_KEY: z.string().optional(),
  EXPO_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
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
  const e: Record<string, string | undefined> =
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
  const supaUrl = e.EXPO_PUBLIC_SUPABASE_URL;
  const supaKey = e.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return {
    EXPO_PUBLIC_SUPABASE_URL: supaUrl && supaUrl.length > 0 ? supaUrl : DEMO_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: supaKey && supaKey.length > 0 ? supaKey : DEMO_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_LLM_MODE: e.EXPO_PUBLIC_LLM_MODE,
    EXPO_PUBLIC_USE_VERTEX: e.EXPO_PUBLIC_USE_VERTEX,
    GOOGLE_CLOUD_PROJECT: e.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: e.GOOGLE_CLOUD_LOCATION,
    GOOGLE_API_KEY: e.GOOGLE_API_KEY,
    SENTRY_DSN: e.SENTRY_DSN,
    EXPO_PUBLIC_POSTHOG_KEY: e.EXPO_PUBLIC_POSTHOG_KEY,
    EXPO_PUBLIC_POSTHOG_HOST: e.EXPO_PUBLIC_POSTHOG_HOST,
  };
}

export type Env = z.infer<typeof refined>;

// Returns parsed env. Throws ZodError on misconfiguration.
// Lazy-evaluated so unit tests (which don't need env) don't fail.
let cached: Env | null = null;
export function getEnv(): Env {
  if (cached) return cached;
  cached = refined.parse(readRaw());
  return cached;
}

// Test-only reset. Not exported publicly via index.
export function __resetEnvCache(): void {
  cached = null;
}
