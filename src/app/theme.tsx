// Route: /theme. The screen itself is DeepSpaceThemeScreen.
//
// The auth gate stays here because it decides whether the screen renders at
// all, which is not a skin question. The legacy-track copy of the screen that
// used to sit below it is now legacy/screens/theme.tsx, out of the build but
// still readable. Accessibility comes from the shared SelectRow (role=radio +
// checked state + label), not from hints written into this file.
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { DeepSpaceThemeScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function ThemeScreen() {
  const { t } = useTranslation("theme");
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
  return <DeepSpaceThemeScreen />;
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
});
