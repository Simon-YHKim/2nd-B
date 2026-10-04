// /growth - "나의 변화" weekly growth review. Synthesizes star_tier_history +
// ops logs + milestones + records into a this-week vs last-week summary; closes
// the self-understanding ↔ assistant feedback loop.
import { Redirect } from "expo-router";

import { WeeklyGrowthScreen } from "@/screens/deepspace/growth/WeeklyGrowthScreen";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Growth() {
  const { userId, loading } = useAuth();

  // The summary is built from one owner's records. Opened by URL while signed
  // out there was no one to summarize, so the screen goes to sign-in first.
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Remounting by owner isolates local state and late async results on account changes.
  return <WeeklyGrowthScreen key={userId} />;
}
