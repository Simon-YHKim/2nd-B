// Mounted once in the root layout (src/app/_layout.tsx), next to the other *Sync
// components. Runs the automatic health read (lib/health/auto-read.ts) on the schedule of
// lib/health/auto-read-runner.ts: in the foreground only, one run at a time under an
// account lease, with a deadline and a timer at the next daily slot. Native only; renders
// nothing.
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { useAuth } from "@/lib/auth/AuthContext";
import { isAccountTransitionPending } from "@/lib/auth/account-epoch";
import { beginAccountSessionLease } from "@/lib/auth/account-session-lease";
import { getRefreshSettings } from "@/lib/dashboard/refresh-cadence";
import { autoReadHealth, loadAutoReadMarks, markAutoReadRun, nextAutoReadCheck } from "@/lib/health/auto-read";
import { startHealthAutoRead } from "@/lib/health/auto-read-runner";
import { ingestHealthSamples } from "@/lib/health/ingest";
import { availableHealthSources } from "@/lib/health/registry";
import { resolvePrivacyPrefs } from "@/lib/privacy/prefs";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Long enough for a few days of samples in chunks; short enough that a stall frees the next run. */
const AUTO_READ_DEADLINE_MS = 5 * 60 * 1000;

/**
 * The stored health_import consent. Unlike fetchPrivacyPrefs this does not fall back to
 * the defaults on an error: a failed read must mean "try again later", not "no consent".
 */
async function readHealthConsent(ownerId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().from("users").select("privacy_prefs").eq("id", ownerId).maybeSingle();
  if (error) throw error;
  return resolvePrivacyPrefs(data?.privacy_prefs ?? null).health_import === true;
}

export function HealthAutoReadSync(): null {
  const { userId, isMinor, loading, recoveryUserId, recoveryPendingGlobal } = useAuth();
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (loading || !userId || isMinor !== false || recoveryUserId || recoveryPendingGlobal) return;
    return startHealthAutoRead(userId, {
      appState: () => AppState.currentState,
      onAppStateChange: (listener) => {
        const subscription = AppState.addEventListener("change", listener);
        return () => subscription.remove();
      },
      transitionPending: isAccountTransitionPending,
      beginLease: (owner, parent) => beginAccountSessionLease(owner, parent),
      read: (owner, assertCurrent) => autoReadHealth(owner, isMinor, {
        now: () => new Date(),
        loadSettings: getRefreshSettings,
        loadMarks: loadAutoReadMarks,
        markRun: markAutoReadRun,
        consented: readHealthConsent,
        sources: availableHealthSources,
        ingest: ingestHealthSamples,
        assertCurrent,
      }),
      nextCheckAt: (owner) => nextAutoReadCheck(owner, {
        now: () => new Date(),
        loadSettings: getRefreshSettings,
        loadMarks: loadAutoReadMarks,
      }),
      now: () => Date.now(),
      // Wrapped: a bare setTimeout/clearTimeout passed as a value loses its this on web.
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      deadlineMs: AUTO_READ_DEADLINE_MS,
    });
  }, [loading, userId, isMinor, recoveryUserId, recoveryPendingGlobal]);
  return null;
}
