// /ttfv - First-day TTFV "첫날 자기이해 한 컷" (first-day self-understanding)
// onboarding (deep-space, propose -> ratify). Reachable directly at /ttfv, and
// opened by itself at most once per account, on its first day, by the home
// (DeepSpaceShell) after the server granted it (Q-261004-40 strict, 0219).
//
// The visit tells the server how it went (design 5.3): content on screen uses up
// the first-day chance; a review the home opened that could not load anything
// hands its grant back with the grant's receipt. A visit the home did not open
// (the address typed in, a reload) has no receipt and nothing to hand back.
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
import { markTTFVSeen, releaseTTFVClaim, ttfvClaimToken } from "@/lib/onboarding/ttfv-gate";
import { TTFVScreen } from "@/screens/deepspace/onboarding/TTFVScreen";

export default function Ttfv() {
  const { userId, loading, isMinor } = useAuth();
  // A plain read of the receipt (no hook): this route is also called directly,
  // outside React, by ttfv-review-screen.test.ts.
  const token = ttfvClaimToken(userId);

  if (loading) return <TTFVScreen mode="auth-loading" />;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <TTFVScreen
      mode="authenticated"
      userId={userId}
      minor={isMinor !== false}
      onContentReady={() => markTTFVSeen(userId, token)}
      onContentUnavailable={() => releaseTTFVClaim(userId, token)}
    />
  );
}
