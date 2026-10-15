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
// A new session_id replaces the whole visit even for the same UID (K3). Its
// cleanup keeps the old sessionId, so it cannot return a grant under the new one.
//
// Seen-marking moved from "the moment a userId exists" to "the screen actually
// had content to show" (#1530): marking on mount spent the one auto-trigger even
// when the read was empty or failed, so the user never got their first-day view.
// The auth gate below is unchanged from #1565 -- a signed-out visitor still never
// mounts the screen.
// React stays imported by name: ttfv-review-screen.test.ts calls this route
// component directly, outside the automatic JSX runtime.
import React, { useEffect, useRef, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { RedirectHome } from "@/lib/nav/go-home";
import { markTTFVSeen, releaseTTFVClaim, takeTTFVClaimToken } from "@/lib/onboarding/ttfv-gate";
import { TTFVScreen } from "@/screens/deepspace/onboarding/TTFVScreen";

// The marker carries no authority or receipt. A queued home navigation can
// outlive its grant (K1): take the existing receipt before mounting content.
// A forged marker with no receipt can only send the visitor home.
function AutomaticTtfv({ userId, sessionId, minor }: {
  userId: string;
  sessionId: string | null;
  minor: boolean;
}) {
  const receiptRef = useRef<{ value: string | null } | null>(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    // Keep the one take across effect replay. The route key isolates logins.
    receiptRef.current ??= { value: takeTTFVClaimToken(userId, sessionId) };
    setResolved(true);
  }, [userId, sessionId]);
  if (!resolved) return <TTFVScreen mode="auth-loading" />;
  const receipt = receiptRef.current?.value ?? null;
  if (!receipt) return <RedirectHome />;
  return (
    <TTFVScreen
      mode="authenticated"
      userId={userId}
      minor={minor}
      takeReceipt={() => receipt}
      onContentReady={(token) => markTTFVSeen(userId, token, sessionId)}
      onContentUnavailable={(token) => releaseTTFVClaim(userId, token, sessionId)}
    />
  );
}

export default function Ttfv() {
  const { userId, sessionId, loading, isMinor } = useAuth();
  const { auto } = useLocalSearchParams<{ auto?: string | string[] }>();

  if (loading) return <TTFVScreen mode="auth-loading" />;
  if (!userId) return <Redirect href="/sign-in" />;
  if (auto !== undefined) return (
    <AutomaticTtfv
      key={JSON.stringify([userId, sessionId])}
      userId={userId}
      sessionId={sessionId}
      minor={isMinor !== false}
    />
  );

  return (
    <TTFVScreen
      key={JSON.stringify([userId, sessionId])}
      mode="authenticated"
      userId={userId}
      minor={isMinor !== false}
      takeReceipt={(ownerId) => takeTTFVClaimToken(ownerId, sessionId)}
      onContentReady={(receipt) => markTTFVSeen(userId, receipt, sessionId)}
      onContentUnavailable={(receipt) => releaseTTFVClaim(userId, receipt, sessionId)}
    />
  );
}
