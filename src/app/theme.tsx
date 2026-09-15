// Route: /theme. The screen itself is DeepSpaceThemeScreen.
//
// The auth gate stays here because it decides whether the screen renders at
// all, which is not a skin question. The legacy-track copy of the screen that
// used to sit below it is now legacy/screens/theme.tsx, out of the build but
// still readable. Accessibility comes from the shared SelectRow (role=radio +
// checked state + label), not from hints written into this file.
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
import { DeepSpaceThemeScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function ThemeScreen() {
  const { t } = useTranslation(["theme", "deepspace"]);
  const { userId, loading, hasProfile, profileProbeFailed } = useAuth();
  const gate = profileGate({ loading, userId, hasProfile, profileProbeFailed });

  if (gate === "signed-out") return <Redirect href="/sign-in" />;
  if (gate === "profile-error") {
    return <ProfileProbeRetryScreen title={t("deepspace:theme.title")} />;
  }
  if (gate === "profile-incomplete") return <Redirect href="/complete-profile" />;
  if (gate !== "ready") {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("theme:loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  return <DeepSpaceThemeScreen />;
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
});
