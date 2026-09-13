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
// remove the F4 rule that keeps a transient profile-probe failure from ejecting
// a fully registered user into DOB + consent re-entry.
//
// A failed probe is its own state (profileGate -> "profile-error"): the retryable
// error with the dock. It used to share the loading branch, and nothing on this
// route re-probes, so the T1a emulator run (vibe r260913, item 2) found
// `Loading account…` with no Retry, dock or back button after a server error, a
// DNS failure and a timeout alike, even once the network was back.
//
// styles.center stays for the loading state below.
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { ProfileProbeRetryScreen } from "@/components/deep-space/ProfileProbeRetry";
import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { profileGate } from "@/lib/auth/profile-probe";
import { DeepSpaceAccountScreen } from "@/screens/deepspace/dds-account-screen";

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
});

export default function Account() {
  const { t } = useTranslation(["consent", "deepspace"]);
  const { userId, loading, hasProfile, profileProbeFailed } = useAuth();
  const gate = profileGate({ loading, userId, hasProfile, profileProbeFailed });

  if (gate === "signed-out") return <Redirect href="/sign-in" />;
  if (gate === "profile-error") {
    return <ProfileProbeRetryScreen active="settings" title={t("deepspace:account.title")} />;
  }
  if (gate === "profile-incomplete") return <Redirect href="/complete-profile" />;
  if (gate !== "ready") {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("consent:account.loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  return <DeepSpaceAccountScreen />;
}
