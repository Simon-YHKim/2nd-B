// Runs inside IntroGate, after recovery and the mandatory age/consent profile
// probe. Only an authenticated, profile-complete user's real SQL NULL requires
// first avatar setup. Failed reads never strand an account before the server
// migration has been applied.
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Redirect, useGlobalSearchParams, usePathname, useSegments } from "expo-router";

import { GateCover } from "@/components/ui/GateCover";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { useAuth } from "@/lib/auth/AuthContext";
import { SHARE_REFUSED_PARAMS, isMarkedShareCapture } from "@/lib/capture/share-intent";
import {
  avatarFirstRunDecision,
  avatarFirstRunSnapshot,
  probeAvatarFirstRun,
  setAvatarFirstRunOwner,
  subscribeAvatarFirstRun,
} from "@/lib/avatar/first-run-store";
import { fetchAvatarSpec } from "@/lib/supabase/avatar-spec";

export function AvatarSetupGate({ children }: { children: ReactNode }) {
  const { userId, loading, hasProfile } = useAuth();
  const segments = useSegments();
  // A first run sent from an Android share (/capture?...&from=share) drops the
  // share like any other link, and the editor says so in one line
  // (src/lib/capture/share-intent.ts).
  const shareTurnedAway = isMarkedShareCapture(usePathname(), useGlobalSearchParams());
  const state = useSyncExternalStore(
    subscribeAvatarFirstRun,
    avatarFirstRunSnapshot,
    avatarFirstRunSnapshot,
  );

  useEffect(() => {
    setAvatarFirstRunOwner(userId);
    if (!userId || loading || hasProfile !== true) return;
    void probeAvatarFirstRun(userId, () => fetchAvatarSpec(userId));
  }, [userId, loading, hasProfile]);

  // IntroGate owns signed-out, recovery, unknown profile and C10 decisions.
  // Allow its auth hand-off screens and the setup editor itself to mount while
  // this read settles; otherwise the editor would redirect to itself.
  // saved: setup complete. deferred: explicit escape after studio read failure.
  // error: unreadable or absent server column; keep existing app access alive.
  const decision = avatarFirstRunDecision(userId, hasProfile, segments[0], state);
  // R2A-01: hold and setup COVER the routes, they never replace them. Returning
  // the loader instead of the children unmounted the root Stack, and then
  // useSegments() answered from the last deep link (an exempt /sign-in or
  // /avatar-studio), which released the hold, remounted the Stack at "/", held
  // again ... until "Maximum update depth exceeded" (components/ui/GateCover.tsx).
  // Each scene is still held by AvatarSetupSceneGuard below, and the setup
  // Redirect now replaces inside the mounted Stack.
  return (
    <>
      <GateCover cover={decision === "allow" ? null : <InlineLoader />}>{children}</GateCover>
      {decision === "setup" ? (
        <Redirect
          href={
            shareTurnedAway
              ? { pathname: "/avatar-studio", params: { setup: "1", ...SHARE_REFUSED_PARAMS } }
              : "/avatar-studio?setup=1"
          }
        />
      ) : null}
    </>
  );
}

/**
 * Expo Router publishes useSegments after committing a new scene. When leaving
 * an exempt auth route, the outer gate can see the old segment for one commit.
 * The scene already knows its own route name, so hold its product effects until
 * the outer gate has redirected or the avatar check has settled.
 */
export function AvatarSetupSceneGuard({
  children,
  routeName,
}: {
  children: ReactNode;
  routeName: string;
}) {
  const { userId, hasProfile } = useAuth();
  const state = useSyncExternalStore(
    subscribeAvatarFirstRun,
    avatarFirstRunSnapshot,
    avatarFirstRunSnapshot,
  );
  const decision = avatarFirstRunDecision(userId, hasProfile, routeName.split("/")[0], state);
  return decision === "allow" ? <>{children}</> : <InlineLoader />;
}
