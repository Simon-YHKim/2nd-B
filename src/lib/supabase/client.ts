import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

// Test hook. Not used in production code.
export function __setSupabaseClientForTests(c: SupabaseClient | null): void {
  client = c;
}
