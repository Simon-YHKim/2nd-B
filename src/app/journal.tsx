// /journal — retired as a standalone screen in the menu restructure (Phase 3).
//
// Journaling (오늘의 조각 / 일기) now lives inside the unified 담기 screen as its
// "일기" mode (/capture), which carries the Lv3 gate + free-tier limit + crisis
// routing ported from here. This route is intentionally KEPT (not deleted)
// because ~19 entry points still link to "/journal" — onboarding firstRun,
// the index empty-graph CTA, insights, inbox, wiki, trinity, manual, persona,
// audit, settings, core-brain, +not-found — and both the character map
// (characterForRoute("/journal") → momo) and the _layout Stack.Screen still
// reference it. It simply forwards to /capture so no deep link 404s, and the
// whole restructure stays reversible: revert this file to restore the old
// standalone journal screen.

import { Redirect } from "expo-router";

export default function JournalRedirect() {
  return <Redirect href="/capture" />;
}
