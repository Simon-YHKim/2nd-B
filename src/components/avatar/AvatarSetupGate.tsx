// Runs inside IntroGate, after recovery and the mandatory age/consent profile
// probe. Only an authenticated, profile-complete user's real SQL NULL requires
// first avatar setup. Failed reads never strand an account before the server
// migration has been applied.
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Redirect, useSegments } from "expo-router";

import { InlineLoader } from "@/components/ui/InlineLoader";
import { useAuth } from "@/lib/auth/AuthContext";
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
  const decision = avatarFirstRunDecision(userId, hasProfile, segments[0], state);
  if (decision === "hold") return <InlineLoader />;
  if (decision === "setup") return <Redirect href="/avatar-studio?setup=1" />;
  // saved: setup complete. deferred: explicit escape after studio read failure.
  // error: unreadable or absent server column; keep existing app access alive.
  return <>{children}</>;
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
