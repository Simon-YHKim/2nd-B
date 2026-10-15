// /reminders - Scheduled reminders visibility (ops-ia §4). Lists the user's
// active routines that carry a reminder time, with a status chip per device
// capability, assembled from the shared Ops kit.
import { Redirect } from "expo-router";

import { RemindersScreen } from "@/screens/deepspace/ops";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Reminders() {
  const { userId, loading } = useAuth();

  // The reminders are an owner's routines. Opened by URL while signed out the
  // list had no one to read for; the dashboard phone already gated the same
  // screen (PhoneOpsContent).
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Remounting by owner isolates local state and late async results on account changes.
  return <RemindersScreen key={userId} />;
}
