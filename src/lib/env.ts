import { z } from "zod";

// Runtime-validated env. Read once at module import; failures throw early
// so misconfiguration surfaces before any LLM/auth call.
const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
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
const refined = schema.refine(
  (e) => !e.EXPO_PUBLIC_USE_VERTEX || (e.GOOGLE_CLOUD_PROJECT && e.GOOGLE_CLOUD_PROJECT.length > 0),
  { message: "GOOGLE_CLOUD_PROJECT is required when EXPO_PUBLIC_USE_VERTEX=true (C2)" },
);

function readRaw(): Record<string, string | undefined> {
  const e: Record<string, string | undefined> =
    typeof process !== "undefined" && process.env ? process.env : {};
  return {
    EXPO_PUBLIC_SUPABASE_URL: e.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: e.EXPO_PUBLIC_SUPABASE_ANON_KEY,
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
