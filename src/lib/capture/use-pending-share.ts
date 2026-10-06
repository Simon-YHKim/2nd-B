// React ends of ./pending-share.ts (gate FIN-01): the root layout keeps a share
// that a sign-in or profile redirect is about to drop, and the home screen
// hands it back to /capture once the person can use it.

import { useEffect, useState } from "react";
import { router, useGlobalSearchParams, usePathname, type Href } from "expo-router";

import { useAuth } from "../auth/AuthContext";
import { captureAccountOwnerLease } from "../auth/account-epoch";
import { useOnboardingComplete } from "../onboarding/state";
import { useAutoTriggerTTFV } from "../onboarding/ttfv-gate";
import { createPendingShareWatcher, takePendingShareHref } from "./pending-share";

/**
 * Root layout, outside IntroGate: IntroGate replaces the whole Stack with its
 * /complete-profile redirect, so a hook inside a screen would never see the
 * share. Global params still carry it: expo-router builds the route info from
 * the navigation state, and on a cold start from the link's own state before
 * any navigator mounts (expo-router/build/global-state/useStore.js,
 * getRouteInfoFromState.js).
 */
export function usePendingShareHold(): void {
  const { loading, userId, hasProfile, profileProbeFailed } = useAuth();
  const pathname = usePathname();
  const { url, text, title } = useGlobalSearchParams<{ url?: string; text?: string; title?: string }>();
  const [watch] = useState(createPendingShareWatcher);
  useEffect(() => {
    watch(pathname, { url, text, title }, { loading, userId, hasProfile, profileProbeFailed });
  }, [watch, pathname, url, text, title, loading, userId, hasProfile, profileProbeFailed]);
}

/**
 * Home screen: the first place every path through sign-in, profile completion,
 * avatar setup and onboarding comes back to. Waits for the same conditions
 * DeepSpaceShell needs before it draws the home itself, so the push does not
 * race its own redirects, and for the published account to match.
 */
export function usePendingShareResume(): void {
  const { loading, userId, hasProfile, profileProbeFailed } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  const autoTriggerTTFV = useAutoTriggerTTFV();
  useEffect(() => {
    if (
      loading || !userId || hasProfile !== true || profileProbeFailed ||
      onboardingComplete !== true || autoTriggerTTFV !== false
    ) return;
    if (captureAccountOwnerLease(userId) === null) return;
    const href = takePendingShareHref(userId);
    if (href !== null) router.push(href as Href);
  }, [loading, userId, hasProfile, profileProbeFailed, onboardingComplete, autoTriggerTTFV]);
}
