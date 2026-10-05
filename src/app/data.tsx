// Route: /data. The screen itself is DeepSpaceDataScreen.
//
// This file used to carry a second, full implementation of the same screen for
// the `EXPO_PUBLIC_UI=legacy` track and pick between them at render. That lever
// was removed on 2026-10-05 (Simon decision Q-261004-11), so the half is in no
// build. It is kept as a revive source (Q-261004-12) in legacy/screens/data.tsx,
// out of the build but still readable; once revived it moves to E:/Legacy.
//
// The gate below did NOT move (same as /account): it is shipped code, and
// styles.center stays for its loading state.
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";
import { ProfileProbeRetryScreen } from "@/components/deep-space/ProfileProbeRetry";
import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { profileGate } from "@/lib/auth/profile-probe";
import { DeepSpaceDataScreen } from "@/screens/deepspace/dds-data-screen";

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
});

export default function DataManagement() {
  const { t } = useTranslation(["data", "deepspace"]);
  const { userId, loading, hasProfile, profileProbeFailed } = useAuth();
  const gate = profileGate({ loading, userId, hasProfile, profileProbeFailed });

  if (gate === "signed-out") return <Redirect href="/sign-in" />;
  // A failed probe is unknown: the retryable error (no dock), not the loader it
  // used to share. The T1a emulator run (vibe r260913, item 2) found
  // `Loading data tools...` here with no way out after a server error, a DNS
  // failure and a timeout alike.
  if (gate === "profile-error") {
    return <ProfileProbeRetryScreen title={t("deepspace:account.navData")} />;
  }
  if (gate === "profile-incomplete") return <Redirect href="/complete-profile" />;
  if (gate !== "ready") {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("data:loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  return <DeepSpaceDataScreen />;
}
