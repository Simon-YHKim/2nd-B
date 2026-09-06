// /side-project - Creative side project (Wave 2, side_project ops domain,
// vision axis 2). Keyless GitHub public activity, assembled from the shared
// Ops kit.
import { Redirect } from "expo-router";

import { SideProjectScreen } from "@/screens/deepspace/ops";
import { useAuth } from "@/lib/auth/AuthContext";

export default function SideProject() {
  const { userId, loading } = useAuth();

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Remounting by owner isolates local state and late async results on account changes.
  return <SideProjectScreen key={userId} userId={userId} />;
}
