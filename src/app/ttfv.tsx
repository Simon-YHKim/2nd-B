// /ttfv - First-day TTFV "첫날 자기이해 한 컷" (first-day self-understanding)
// onboarding (deep-space, propose -> ratify). Reachable directly at /ttfv, and
// auto-triggered once on the user's first day post-signup by the graph-home gate
// (src/app/index.tsx via useAutoTriggerTTFV). Viewing it marks it seen so the
// auto-trigger fires exactly once; manual visits also count as seen.
import { useEffect } from "react";
import { Redirect } from "expo-router";

import { TTFVScreen } from "@/screens/deepspace/onboarding/TTFVScreen";
import { useAuth } from "@/lib/auth/AuthContext";
import { markTTFVSeen } from "@/lib/onboarding/ttfv-gate";

export default function Ttfv() {
  const { userId, loading } = useAuth();

  useEffect(() => {
    if (userId) markTTFVSeen();
  }, [userId]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  return <TTFVScreen />;
}
