// /reading - Reading & learning shelf (Wave 2, reading_list ops domain,
// vision axis 2: personal assistant). Google Books search + shelf, assembled
// from the shared Ops kit.
import { Redirect } from "expo-router";

import { ReadingScreen } from "@/screens/deepspace/ops";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Reading() {
  const { userId, loading } = useAuth();

  // The shelf belongs to an owner. Opened by URL while signed out it used to
  // draw an empty shelf whose saves did nothing; the dashboard phone already
  // gated the same screen (PhoneOpsContent).
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Remounting by owner isolates local state and late async results on account changes.
  return <ReadingScreen key={userId} />;
}
