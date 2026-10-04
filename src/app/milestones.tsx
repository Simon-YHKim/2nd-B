// /milestones - Career & learning goals (Wave 3, learning_goals / career_check
// ops domains, vision axis 2). Manual milestones + progress, assembled from the
// shared Ops kit.
import { Redirect } from "expo-router";

import { MilestonesScreen } from "@/screens/deepspace/ops";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Milestones() {
  const { userId, loading } = useAuth();

  // Every save on this screen needs an owner. Opened by URL while signed out it
  // used to offer "keep a record" and then do nothing; the dashboard phone
  // already gated the same screen (PhoneOpsContent).
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Remounting by owner isolates local state and late async results on account changes.
  return <MilestonesScreen key={userId} />;
}
