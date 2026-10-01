// OAuth callback route. Currently handles the Naver custom-OAuth return
// (?code&state): verifies the CSRF state echo, exchanges the code via the
// oauth-naver edge function, signs in, and routes onward (new users land on
// /complete-profile via the index redirect, like every provider). Naver's
// current API does not provide the PKCE guarantee needed for a custom-scheme
// native callback, so this route is deliberately web-only.

import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { completeNaverOAuth } from "@/lib/supabase/auth";
import { useAuth } from "@/lib/auth/AuthContext";
import { observeAuthConversion } from "@/lib/analytics/auth-conversions";
import { cosmic, typography } from "@/lib/theme/tokens";
import { InlineLoader } from "@/components/ui/InlineLoader";

export default function OAuthCallback() {
  const { refresh } = useAuth();
  const { t } = useTranslation("auth");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      // Native RN defines a global `window` (so `typeof window` is never
      // "undefined"), but has no `window.location` — reading `.search` there
      // would throw. This route is web-only (Naver custom-OAuth return); guard
      // on the platform, not on `window`, and fail visibly on native.
      if (Platform.OS !== "web" || typeof window === "undefined" || !window.location) {
        if (!cancelled) setFailed(true);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      try {
        // Authorization codes are bearer credentials. Remove code + state from
        // the visible URL/history before any branch, log, network call, or render.
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname,
        );
      } catch {
        // If the browser cannot acknowledge the scrub, do not exchange.
        if (!cancelled) setFailed(true);
        return;
      }
      const providerError = params.get("error");
      const code = params.get("code") ?? "";
      const state = params.get("state") ?? "";
      if (providerError || !code) {
        if (!cancelled) setFailed(true);
        return;
      }
      try {
        const result = await completeNaverOAuth({ code, state });
        await refresh();
        void observeAuthConversion(result.userId, "login", "naver");
        if (!cancelled) router.replace("/");
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  if (failed) {
    const failureMessage = t("oauthCallback.failureMessage");
    const retryLabel = t("oauthCallback.retryLabel");
    const retryHint = t("oauthCallback.retryHint");

    return (
      <View style={styles.root}>
        <Text variant="body" style={styles.msg} accessibilityRole="alert">
          {failureMessage}
        </Text>
        <Pressable
          onPress={() => router.replace("/sign-in")}
          style={styles.retryLink}
          hitSlop={14}
          accessibilityRole="link"
          accessibilityLabel={retryLabel}
          accessibilityHint={retryHint}
        >
          <Text variant="caption" style={styles.link}>{retryLabel}</Text>
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
  msg: { color: cosmic.moonWhite, fontSize: typography.sizes.md, textAlign: "center" },
  retryLink: { minHeight: 44, minWidth: 44, justifyContent: "center", paddingHorizontal: 8 },
  link: { color: cosmic.signalMint, fontSize: typography.sizes.sm, textDecorationLine: "underline" },
});
