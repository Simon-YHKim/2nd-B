// Route: /big-five. The screen itself is DeepSpaceBigFiveScreen.
//
// Big Five (BFI-44) personality questionnaire — John, Donahue, & Kentle (1991).
// 44 items, 5-point Likert. Public domain. The result is saved as a record so it
// surfaces in /persona and feeds the inference engine; the scale, scoring and
// owner-safe write controller live in src/lib/persona/big-five-screen.ts.
//
// This file used to carry a second, premium-shell renderer of the same survey for
// the `EXPO_PUBLIC_UI=legacy` track. That lever was removed on 2026-10-05 (Simon
// decision Q-261004-11); the old renderer is in E:/Legacy/2ndB (MANIFEST batch
// qa261004-lever) and git history.
import { DeepSpaceBigFiveScreen } from "@/screens/deepspace/dds-big-five-screen";

export default function BigFive() {
  return <DeepSpaceBigFiveScreen />;
}
