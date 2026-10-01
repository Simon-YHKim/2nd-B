import { Platform } from "react-native";
import { currentAccountEpoch, currentAccountOwner } from "../auth/account-epoch";
import { requiresGuardianConsent, resolveJurisdiction } from "../auth/consent-age";
import { ageInYears } from "../supabase/auth";
import { getSupabaseClient } from "../supabase/client";
import { authMethod, type AuthMethod } from "./conversion-events";
import { captureEvent, getAnalyticsConsentSnapshot, initAnalytics, setAnalyticsConsent, suspendAnalyticsForUnresolvedProfile } from "./index";

let hydration: { owner: string; epoch: number; promise: Promise<boolean> } | null = null;
let profileGate: { owner: string; epoch: number; isMinor: boolean | null } | null = null;

/** AuthContext publishes its server-derived age before publishing React state. */
export function publishAnalyticsProfileGate(userId: string, isMinor: boolean | null): void {
  if (currentAccountOwner() !== userId) return;
  profileGate = { owner: userId, epoch: currentAccountEpoch(), isMinor };
  if (isMinor !== false && getAnalyticsConsentSnapshot().granted) {
    suspendAnalyticsForUnresolvedProfile();
  }
}

/** Share the current server read with the auth success continuation, not an
 * event queue. A resolved OFF is terminal; later opt-in never replays a login. */
export async function hydrateAnalyticsConsent(userId: string): Promise<boolean> {
  if (Platform.OS !== "web" || !userId || currentAccountOwner() !== userId) return false;
  const snapshot = getAnalyticsConsentSnapshot();
  if (profileGate?.owner !== userId || profileGate.epoch !== snapshot.epoch || profileGate.isMinor !== false) return false;
  if (snapshot.resolved) return snapshot.granted;
  if (hydration?.owner === userId && hydration.epoch === snapshot.epoch) return hydration.promise;
  const operation = (async () => {
    // init establishes its default before the first await; the server decision
    // is then allowed to arrive while runtime flags are still being read.
    void initAnalytics();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const query = getSupabaseClient().from("users").select("privacy_prefs,birth_date").eq("id", userId).maybeSingle();
      const result = await Promise.race([
        query,
        new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 5000); }),
      ]);
      if (currentAccountOwner() !== userId || currentAccountEpoch() !== snapshot.epoch || profileGate?.isMinor !== false) return false;
      const data = result?.error ? null : result?.data;
      const age = typeof data?.birth_date === "string" ? ageInYears(data.birth_date) : null;
      const adult = age !== null && Number.isFinite(age) && age >= 18;
      const granted = data?.privacy_prefs?.external_analytics === true;
      const applied = setAnalyticsConsent(granted, {
        isMinor: !adult, confirmedAdult: adult,
        underDigitalConsentAge: age === null || requiresGuardianConsent(age, resolveJurisdiction()),
      }, { expectedRevision: snapshot.revision });
      return applied && getAnalyticsConsentSnapshot().granted;
    } catch {
      if (currentAccountOwner() === userId && currentAccountEpoch() === snapshot.epoch) {
        setAnalyticsConsent(false, { isMinor: true, confirmedAdult: false }, { expectedRevision: snapshot.revision });
      }
      return false;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  })();
  const current = { owner: userId, epoch: snapshot.epoch, promise: operation };
  hydration = current;
  try { return await operation; }
  finally { if (hydration === current) hydration = null; }
}

/** Called once from an actual successful auth/profile flow, after refreshAuth.
 * No event is captured before the pre-existing server choice is confirmed. */
export async function observeAuthConversion(
  userId: string, name: "login" | "sign_up", method?: AuthMethod, oauthOnly = false,
): Promise<boolean> {
  if (Platform.OS !== "web" || currentAccountOwner() !== userId) return false;
  const epoch = currentAccountEpoch();
  const choiceRevision = getAnalyticsConsentSnapshot().choiceRevision;
  try {
    let knownMethod = method ?? null;
    if (!knownMethod) {
      const { data, error } = await getSupabaseClient().auth.getUser();
      if (error || data.user?.id !== userId) return false;
      knownMethod = authMethod(data.user.app_metadata?.provider);
    }
    if (!knownMethod || (oauthOnly && knownMethod === "email")) return false;
    if (!await hydrateAnalyticsConsent(userId)) return false;
    if (currentAccountEpoch() !== epoch || currentAccountOwner() !== userId ||
      getAnalyticsConsentSnapshot().choiceRevision !== choiceRevision) return false;
    return captureEvent({ name, props: { method: knownMethod } });
  } catch {
    // Analytics must not fail login or expose an auth/provider response.
    return false;
  }
}
