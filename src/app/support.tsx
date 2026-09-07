// Route: /support — user-facing "지원" (A-to-Z Phase 12).
//
// The auth gate stays here because it decides whether the screen renders at
// all; the screen itself is DeepSpaceSupportDesignScreen. The legacy-track copy that
// used to sit below this gate is now legacy/screens/support.tsx, out of the build
// but still readable. Its accessibility hints moved with it — the live screen
// keys label/hint/role per action off its own data (see check:constraints A11y).
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { DeepSpaceSupportDesignScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function Support() {
  const { t } = useTranslation("support");
  const { userId, loading, hasProfile, profileProbeFailed } = useAuth();

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (profileProbeFailed || hasProfile === null) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  return <DeepSpaceSupportDesignScreen />;
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
});
