// /journal — retired as a standalone screen in the menu restructure (Phase 3).
//
// Journaling (오늘의 조각 / 일기) now lives inside the unified 담기 screen as its
// "일기" mode (/capture), which carries the Lv3 gate + free-tier limit + crisis
// routing ported from here. This route is intentionally KEPT (not deleted) as a
// deep-link compatibility redirect. Normal in-app CTAs were migrated to point
// directly to /capture (2026-06-05); the character map
// (characterForRoute("/journal") → momo) and the _layout Stack.Screen still
// reference it, and external/saved deep links to "/journal" must not 404.
// It simply forwards to /capture, and the whole restructure stays reversible:
// revert this file to restore the old standalone journal screen.

import { Redirect } from "expo-router";

export default function JournalRedirect() {
  return <Redirect href="/capture" />;
}
