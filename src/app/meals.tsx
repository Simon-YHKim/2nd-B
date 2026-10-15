// /meals - Weekly meals & simple meal ideas (Wave 2, weekly_meals /
// simple_meals ops domains, vision axis 2). Weekly grid + MFDS nutrition ideas,
// assembled from the shared Ops kit.
import { Redirect } from "expo-router";

import { MealsScreen } from "@/screens/deepspace/ops";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Meals() {
  const { userId, loading } = useAuth();

  // Every save on this screen needs an owner. Opened by URL while signed out it
  // used to draw the weekly grid with a "+" that did nothing; the dashboard
  // phone already gated the same screen (PhoneOpsContent).
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Remounting by owner isolates local state and late async results on account changes.
  return <MealsScreen key={userId} />;
}
