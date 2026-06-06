// OAuth callback route. Currently handles the Naver custom-OAuth return
// (?code&state): verifies the CSRF state echo, exchanges the code via the
// oauth-naver edge function, signs in, and routes onward (new users land on
// /complete-profile via the index redirect, like every provider). Web-only —
// the Supabase-native providers (Google/Apple/Kakao) don't use this route.

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { completeNaverOAuth } from "@/lib/supabase/auth";
import { cosmic } from "@/lib/theme/tokens";
import { InlineLoader } from "@/components/ui/InlineLoader";

export default function OAuthCallback() {
  const { t } = useTranslation("auth");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (typeof window === "undefined") {
        router.replace("/");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const providerError = params.get("error");
      const code = params.get("code") ?? "";
      const state = params.get("state") ?? "";
      if (providerError || !code) {
        if (!cancelled) setFailed(true);
        return;
      }
      try {
        await completeNaverOAuth({ code, state });
        if (!cancelled) router.replace("/");
      } catch (e) {
        if (!cancelled) setFailed(true);
        if (typeof console !== "undefined") console.warn("[auth] naver callback error", (e as Error).message);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    const failureMessage = t("oauthCallback.failureMessage");
    const retryLabel = t("oauthCallback.retryLabel");
    const retryHint = t("oauthCallback.retryHint");

    return (
      <View style={styles.root}>
        <Text style={styles.msg} accessibilityRole="alert">
          {failureMessage}
        </Text>
        <Pressable
          onPress={() => router.replace("/sign-in")}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={retryLabel}
          accessibilityHint={retryHint}
        >
          <Text style={styles.link}>{retryLabel}</Text>
        </Pressable>
      </View>
    );
  }
  return <InlineLoader />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: cosmic.space950,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  msg: { color: cosmic.moonWhite, fontSize: 15, textAlign: "center" },
  link: { color: cosmic.signalMint, fontSize: 13, textDecorationLine: "underline" },
});
