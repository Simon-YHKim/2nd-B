// Route: /account. The screen itself is DeepSpaceAccountScreen.
//
// This file used to carry a second, full implementation of the same screen for
// the `EXPO_PUBLIC_UI=legacy` track and pick between them at render. Every
// delivery path pins deep-space and `ui-mode.ts` defaults to it, so that branch
// had been unreachable for months; it now lives in legacy/screens/account.tsx,
// out of the build but still readable.
//
// ⚠ Unlike the other retirements, the gate below did NOT move. It is shipped:
// DeepSpaceAccountScreen gates on `loading` and `!userId` itself, but NOT on
// `hasProfile`, so dropping this block would let a signed-in user without a
// profile row into the account screen instead of /complete-profile — and would
// remove the F4 hold that keeps a transient profile-probe failure from ejecting
// a fully registered user into DOB + consent re-entry.
//
// styles.center stays for the same reason: the two loading states below use it.
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { DeepSpaceAccountScreen } from "@/screens/deepspace/dds-account-screen";

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
});

export default function Account() {
  const { t } = useTranslation("consent");
  const { userId, loading, hasProfile, profileProbeFailed } = useAuth();

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("account.loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (profileProbeFailed || hasProfile === null) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("account.loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  return <DeepSpaceAccountScreen />;
}
