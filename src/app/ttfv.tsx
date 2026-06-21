// /ttfv - First-day TTFV "첫날 자기이해 한 컷" (first-day self-understanding)
// onboarding (deep-space, propose -> ratify). Reachable directly at /ttfv, and
// auto-triggered once on the user's first day post-signup by the graph-home gate
// (src/app/index.tsx via useAutoTriggerTTFV). Viewing it marks it seen so the
// auto-trigger fires exactly once; manual visits also count as seen.
import { useEffect } from "react";

import { TTFVScreen } from "@/screens/deepspace/onboarding/TTFVScreen";
import { markTTFVSeen } from "@/lib/onboarding/ttfv-gate";

export default function Ttfv() {
  useEffect(() => {
    markTTFVSeen();
  }, []);
  return <TTFVScreen />;
}
