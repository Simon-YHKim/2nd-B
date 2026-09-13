import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getAuthStorageRuntime,
  resetAuthStorageRuntime,
} from "../auth/session-mutation";
import { getEnv } from "../env";

// Auth persistence is versioned separately from the SDK default. The runtime
// completes the one-time v1 migration before S can be acquired, then supplies
// the same plain v2 storage to every auth operation.

const IS_WEB = typeof document !== "undefined";

let client: SupabaseClient | null = null;
let isAppStateListenerAdded = false;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  const authRuntime = getAuthStorageRuntime();
  client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      // URL callbacks are identity writers. They are consumed explicitly by
      // auth.ts under M rather than by constructor initialization under S.
      detectSessionInUrl: false,
      storageKey: authRuntime.storageKey,
      storage: authRuntime.storage,
      lock: authRuntime.sdkLock,
      lockAcquireTimeout: -1,
    },
  });

  if (!isAppStateListenerAdded && !IS_WEB) {
    isAppStateListenerAdded = true;
    try {
      // Dynamically require to avoid choking node/jest test environments without RN runtime
      const { AppState } = require("react-native");
      AppState.addEventListener("change", (state: string) => {
        if (state === "active") {
          client?.auth.startAutoRefresh();
        } else {
          client?.auth.stopAutoRefresh();
        }
      });
    } catch {
      // test environment fallback
    }
  }

  return client;
}

/** Retire the singleton and its auth-storage barrier after explicitly-consented
 * encrypted local recovery. Dropping references is the boundary; transport
 * cleanup is best-effort and cannot make the unreadable client reusable. */
export async function resetSupabaseClient(): Promise<void> {
  const previous = client;
  client = null;
  resetAuthStorageRuntime();
  if (!previous) return;

  try {
    await previous.auth.stopAutoRefresh();
  } catch {
    // The old client is already retired.
  }
  try {
    await previous.removeAllChannels();
  } catch {
    // Channel cleanup cannot reopen the retired client/storage boundary.
  }
}

// Test hook. Not used in production code.
export function __setSupabaseClientForTests(c: SupabaseClient | null): void {
  client = c;
}
