
import { Redirect } from "expo-router";

import { DeepSpaceDiscoverScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Discover() {
  const { userId, loading } = useAuth();

  // Rising interests are read from one owner's records. Opened by URL while
  // signed out the screen showed an empty list as if there were nothing yet.
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Remounting by owner isolates local state and late async results on account changes.
  return <DeepSpaceDiscoverScreen key={userId} />;
}
