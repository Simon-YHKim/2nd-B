// /ttfv - First-day TTFV "첫날 자기이해 한 컷" (first-day self-understanding)
// onboarding (deep-space, propose -> ratify). Reachable directly at /ttfv, and
// auto-triggered once on the user's first day post-signup by the graph-home gate
// (src/app/index.tsx via useAutoTriggerTTFV).
//
// Seen-marking moved from "the moment a userId exists" to "the screen actually
// had content to show" (#1530): marking on mount spent the one auto-trigger even
// when the read was empty or failed, so the user never got their first-day view.
// The auth gate below is unchanged from #1565 -- a signed-out visitor still never
// mounts the screen.
// React stays imported by name: ttfv-review-screen.test.ts calls this route
// component directly, outside the automatic JSX runtime.
import React from "react";
import { Redirect } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { markTTFVSeen } from "@/lib/onboarding/ttfv-gate";
import { TTFVScreen } from "@/screens/deepspace/onboarding/TTFVScreen";

export default function Ttfv() {
  const { userId, loading, isMinor } = useAuth();

  if (loading) return <TTFVScreen mode="auth-loading" />;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <TTFVScreen
      mode="authenticated"
      userId={userId}
      minor={isMinor !== false}
      onContentReady={markTTFVSeen}
    />
  );
}
