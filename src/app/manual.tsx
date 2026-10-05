// Route: /manual. The screen itself is DeepSpaceManualScreen.
//
// User manual + getting-started guide, reachable from the /capture navRow and
// auto-shown right after sign-up (handled by AuthContext via users.coachmarks_seen).
// C7 scans the guide this route renders (scripts/manual-route-contract.ts).
//
// This file used to carry a second, full implementation of the guide for the
// `EXPO_PUBLIC_UI=legacy` track. That lever was removed on 2026-10-05 (Simon
// decision Q-261004-11); the old guide is in E:/Legacy/2ndB (MANIFEST batch
// qa261004-lever) and git history.
import { DeepSpaceManualScreen } from "@/screens/deepspace/dds-manual-screen";

export default function Manual() {
  return <DeepSpaceManualScreen />;
}
