// /mbti — retired as a standalone screen (cycle-2 concept consistency).
//
// MBTI was deprecated: it has weak psychometric validity and carries a
// reliability burden the app does not want to vouch for. The app's validated
// personality measure is Big Five (BFI-44) at /big-five (애착 스타일 ECR-S at
// /attachment is the other recommended tool). The MBTI screen also had zero
// in-app entry points (hidden route), so nothing links here anymore.
//
// This route is intentionally KEPT (not deleted) as a deep-link compatibility
// redirect, mirroring /journal → /capture and /imagine → /jarvis. External or
// saved deep links to "/mbti" must not 404; they now land on /persona, where
// the assessment results used to surface. The whole change stays reversible:
// revert this file to restore the old standalone MBTI screener.

import { Redirect } from "expo-router";

export default function Mbti() {
  return <Redirect href="/persona" />;
}
