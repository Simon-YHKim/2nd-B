// Route: /review. The screen itself is DeepSpaceReviewScreen.
//
// This file used to carry a second, full implementation of the same screen for
// the `EXPO_PUBLIC_UI=legacy` track and pick between them at render. Every
// delivery path pins deep-space and `ui-mode.ts` defaults to it, so that branch
// had been unreachable for months; it now lives in E:/Legacy/2ndB/legacy/screens/review.tsx, out of
// the build but still readable.
import { Redirect } from "expo-router";

import { DeepSpaceReviewScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";
import { useAuth } from "@/lib/auth/AuthContext";

export default function ReviewScreen() {
  const { userId, loading } = useAuth();

  // Proposals are made from one owner's results. Opened by URL while signed out
  // the screen cleared its targets and said "take a test first", which was not
  // the reason nothing showed.
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Remounting by owner isolates local state and late async results on account changes.
  return <DeepSpaceReviewScreen key={userId} />;
}
