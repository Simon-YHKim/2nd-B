import React from "react";
import { Redirect } from "expo-router";

import { useAuth } from "@/lib/auth/AuthContext";
import { markTTFVSeen } from "@/lib/onboarding/ttfv-gate";
import { TTFVScreen } from "@/screens/deepspace/onboarding/TTFVScreen";

export default function Ttfv() {
  const { userId, loading, isMinor } = useAuth();

  if (loading) return <TTFVScreen mode="auth-loading" />;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <TTFVScreen
      mode="authenticated"
      userId={userId}
      minor={isMinor !== false}
      onContentReady={markTTFVSeen}
    />
  );
}
