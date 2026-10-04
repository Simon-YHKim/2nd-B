// Route: /wiki. The screen itself is DeepSpaceWikiScreen.
//
// This file used to carry a second, full implementation of the same screen for
// the `EXPO_PUBLIC_UI=legacy` track and pick between them at render. That lever
// was removed on 2026-10-05 (Simon decision Q-261004-11), so the half is in no
// build. It is kept as a revive source (Q-261004-12) in legacy/screens/wiki.tsx,
// out of the build but still readable; once revived it moves to E:/Legacy.
import { DeepSpaceWikiScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function Wiki() {
  return <DeepSpaceWikiScreen />;
}
