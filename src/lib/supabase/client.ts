import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

// Per CSO review: RN needs an explicit storage adapter or sessions evaporate
// on app restart. Web uses localStorage (XSS risk mitigated by vercel.json CSP).
// Native uses AsyncStorage. We detect web via `typeof document` rather than
// react-native's Platform.OS so jest (node, no RN runtime) doesn't choke on
// the import.

const IS_WEB = typeof document !== "undefined";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  const storage = resolveStorageAdapter();
  client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: IS_WEB,
      storage,
    },
  });
  return client;
}

function resolveStorageAdapter(): Storage | undefined {
  if (IS_WEB) {
    const g = globalThis as unknown as { localStorage?: Storage };
    return g.localStorage;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    return AsyncStorage as Storage;
  } catch {
    // node/test environment without AsyncStorage installed in the sandbox.
    return undefined;
  }
}

// Test hook. Not used in production code.
export function __setSupabaseClientForTests(c: SupabaseClient | null): void {
  client = c;
}
