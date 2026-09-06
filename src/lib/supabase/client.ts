import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env";
import { getEncryptedNativeStorage, type StringStorage } from "../storage/encrypted-native-storage";

// Per CSO review: RN needs an explicit storage adapter or sessions evaporate
// on app restart. Web uses localStorage (XSS risk mitigated by vercel.json CSP).
// Native uses the encrypted adapter; node/test explicitly uses no adapter.
// Runtime detection avoids importing react-native while the module loads.

const IS_WEB = typeof document !== "undefined";
const IS_REACT_NATIVE = !IS_WEB
  && (globalThis.navigator as { product?: string } | undefined)?.product === "ReactNative";

let client: SupabaseClient | null = null;
let isAppStateListenerAdded = false;

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

  if (!isAppStateListenerAdded && IS_REACT_NATIVE) {
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

function resolveStorageAdapter(): Storage | StringStorage | undefined {
  if (IS_WEB) {
    const g = globalThis as unknown as { localStorage?: Storage };
    return g.localStorage;
  }
  if (IS_REACT_NATIVE) return getEncryptedNativeStorage();
  return undefined;
}

// Test hook. Not used in production code.
export function __setSupabaseClientForTests(c: SupabaseClient | null): void {
  client = c;
}
