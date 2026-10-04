// /ledger - Money check (Wave 2, money_check ops domain, vision axis 2). Manual
// ledger month summary + per-category, assembled from the shared Ops kit.
import { Redirect } from "expo-router";

import { LedgerScreen } from "@/screens/deepspace/ops";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Ledger() {
  const { userId, loading } = useAuth();

  // Every save on this screen needs an owner. Opened by URL while signed out it
  // used to draw the input row and let "add" do nothing; the dashboard phone
  // already gated the same screen (PhoneOpsContent).
  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Remounting by owner isolates local state and late async results on account changes.
  return <LedgerScreen key={userId} />;
}
