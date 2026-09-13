// Route: /support — user-facing "지원" (A-to-Z Phase 12).
//
// The auth gate stays here because it decides whether the screen renders at
// all; the screen itself is DeepSpaceSupportDesignScreen. The legacy-track copy that
// used to sit below this gate is now legacy/screens/support.tsx, out of the build
// but still readable. Its accessibility hints moved with it — the live screen
// keys label/hint/role per action off its own data (see check:constraints A11y).
//
// profileGate decides. A failed probe gets the retryable error (no dock),
// not the loader it used to share: the T1a emulator run (vibe r260913, item 2)
// found that shape stuck on /account and /data, and this route had it too.
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { ProfileProbeRetryScreen } from "@/components/deep-space/ProfileProbeRetry";
import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { profileGate } from "@/lib/auth/profile-probe";
import { DeepSpaceSupportDesignScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function Support() {
  const { t } = useTranslation(["support", "deepspace"]);
  const { userId, loading, hasProfile, profileProbeFailed } = useAuth();
  const gate = profileGate({ loading, userId, hasProfile, profileProbeFailed });

  if (gate === "signed-out") return <Redirect href="/sign-in" />;
  if (gate === "profile-error") {
    return <ProfileProbeRetryScreen title={t("deepspace:support.title")} />;
  }
  if (gate === "profile-incomplete") return <Redirect href="/complete-profile" />;
  if (gate !== "ready") {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("support:loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  return <DeepSpaceSupportDesignScreen />;
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
});
