// Profile (A-to-Z Phase 12) — user-facing "프로필". Structural placeholder:
// shows the account's identity (email) and a few preference placeholders,
// with handoffs to theme + data screens. Loading / error / normal states.

import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function Profile() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setEmail(data.user?.email ?? null);
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[profile] getUser failed", (e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}><ActivityIndicator color={semantic.brand} /></View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const displayName = email ? email.split("@")[0] : locale === "ko" ? "마을 주민" : "Villager";

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <Text variant="caption" color="brand" style={{ letterSpacing: 1.5 }}>
            {locale === "ko" ? "설정" : "Settings"}
          </Text>
          <Text variant="heading">{locale === "ko" ? "프로필" : "Profile"}</Text>
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>
            {locale === "ko" ? "계정" : "Account"}
          </Text>
          <Text variant="heading" style={{ fontSize: 20 }}>{displayName}</Text>
          {busy ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: "flex-start" }} />
          ) : (
            <Text variant="body" color="textMuted">
              {email ?? (locale === "ko" ? "이메일 정보를 불러올 수 없어요." : "Email unavailable.")}
            </Text>
          )}
        </View>

        <View style={[styles.section, { borderLeftColor: cosmic.soulViolet }]}>
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>
            {locale === "ko" ? "환경설정" : "Preferences"}
          </Text>
          <Text variant="body" color="textMuted">
            {locale === "ko" ? `언어 · ${locale === "ko" ? "한국어" : "English"}` : `Language · English`}
          </Text>
          <Text variant="subtle" color="textSubtle">
            {locale === "ko" ? "더 많은 환경설정은 준비 중이에요." : "More preferences are on the way."}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button label={locale === "ko" ? "테마" : "Theme"} variant="secondary" onPress={() => router.push("/theme")} />
          <Button label={locale === "ko" ? "데이터 관리" : "Data management"} variant="secondary" onPress={() => router.push("/data")} />
          <Button label={locale === "ko" ? "설정으로" : "Back to settings"} variant="secondary" onPress={() => router.push("/settings")} />
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: { letterSpacing: 1 },
  actions: { gap: spacing.md },
});
