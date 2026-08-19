// /mbti — retired as a standalone screen (cycle-2 concept consistency).
//
// MBTI was deprecated: it has weak psychometric validity and carries a
// reliability burden the app does not want to vouch for. The app's validated
// personality measure is Big Five (BFI-44) at /big-five (애착 스타일 ECR-S at
// /attachment is the other recommended tool). The MBTI screen also had zero
// in-app entry points (hidden route), so nothing links here anymore.
//
// This route is intentionally KEPT (not deleted) as a deep-link compatibility
// redirect, mirroring /journal → /capture and /imagine → /secondb. External or
// saved deep links to "/mbti" must not 404. The whole change stays reversible:
// revert this file to restore the old standalone MBTI screener.
//
// ⚠ Where it actually lands (corrected 2026-08-19). The old comment said
// "/persona, where the assessment results used to surface" — true only in the
// legacy skin. In the DEFAULT (deep-space) skin `/persona` itself redirects
// again, so the real chain is two hops:
//
//     /mbti → /persona → /core-brain      (deep-space, the default)
//     /mbti → /persona                    (EXPO_PUBLIC_UI=legacy)
//
// The second hop is deliberate, not an oversight. Pointing straight at
// /core-brain would mean duplicating persona.tsx's skin branch here, and then
// this file drifts the day that branch changes. `/persona` owns the decision;
// this route just defers to it. One extra render frame is the price of not
// having two places that must agree.

import { Redirect } from "expo-router";

export default function Mbti() {
  return <Redirect href="/persona" />;
}
