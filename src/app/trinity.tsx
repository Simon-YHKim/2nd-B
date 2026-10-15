// /trinity — a redirect to 북극성 (/core-brain).
//
// Brain Trinity was Simon's 4-area life-management system (health / app / brain /
// finance) surfaced as a tag-filter dashboard over records. CONCEPT.md names Brain
// Trinity LEGACY, and 북극성 (/core-brain) is the canonical aggregate that
// superseded it.
//
// Simon decision Q-261004-33 B (2026-10-04): both renderers left together — the
// `EXPO_PUBLIC_UI=legacy` dashboard (TrinityLegacy) and the __DEV__-only M3 remake
// (TrinityDeepSpace). They are in E:/Legacy/2ndB (MANIFEST batch qa261004-lever)
// and git history. This decision replaces the 2026-08-18 D1 "hiding is not
// deleting" note for this route.
//
// The route is KEPT as a redirect so saved and external links do not 404 (same
// practice as /persona, /mbti, /journal).
import { Redirect } from "expo-router";

export default function Trinity() {
  return <Redirect href="/core-brain" />;
}
