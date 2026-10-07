// /ttfv - First-day TTFV "첫날 자기이해 한 컷" (first-day self-understanding)
// onboarding (deep-space, propose -> ratify). Reachable directly at /ttfv, and
// opened by itself at most once per account, on its first day, by the home
// (DeepSpaceShell) after the server granted it (Q-261004-40 strict, 0219).
//
// The visit tells the server how it went (design 5.3): content on screen uses up
// the first-day chance; the visit the home opened, ending without having shown
// anything after a load error, hands its grant back with the grant's receipt.
// The screen takes that receipt once, when its visit starts, so a visit the home
// did not open (the address typed in, a reload, the screen opened again) has no
// receipt and nothing to hand back (gate BA-02). It hands the grant back only
// when the visit ends, never while it can still load and show (gate FR-01).
//
// Seen-marking moved from "the moment a userId exists" to "the screen actually
// had content to show" (#1530): marking on mount spent the one auto-trigger even
// when the read was empty or failed, so the user never got their first-day view.
// The auth gate below is unchanged from #1565 -- a signed-out visitor still never
// mounts the screen.
// React stays imported by name: ttfv-review-screen.test.ts calls this route
// component directly, outside the automatic JSX runtime. For the same reason the
// route holds no hook of its own: the visit (and its receipt) lives in TTFVScreen.
import React from "react";
import { Redirect } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { markTTFVSeen, releaseTTFVClaim, takeTTFVClaimToken } from "@/lib/onboarding/ttfv-gate";
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
      takeReceipt={takeTTFVClaimToken}
      onContentReady={(receipt) => markTTFVSeen(userId, receipt)}
      onContentUnavailable={(receipt) => releaseTTFVClaim(userId, receipt)}
    />
  );
}
