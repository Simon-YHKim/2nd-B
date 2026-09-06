// /import-hub - Personal data import hub (sensitivity-tiered, consent-gated,
// propose→ratify). Extends the /import pipeline; the legacy /import (markdown
// paste) is left untouched.
import { Redirect } from "expo-router";

import { ImportHubScreen } from "@/screens/deepspace/import/ImportHubScreen";
import { useAuth } from "@/lib/auth/AuthContext";

export default function ImportHub() {
  const { userId, loading } = useAuth();

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  return <ImportHubScreen />;
}
