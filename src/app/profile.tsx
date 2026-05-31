// Profile (A-to-Z Phase 12) — user-facing "프로필". Structural placeholder:
// shows the account's identity (email) and a few preference placeholders,
// with handoffs to theme + data screens. Loading / error / normal states.

import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
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
        <SceneHero
          eyebrow={locale === "ko" ? "08-2. 프로필" : "08-2. Profile"}
          title={locale === "ko" ? `${displayName}의 마을 표식` : `${displayName}'s village mark`}
          subtitle={locale === "ko" ? "계정 · 언어 · 데이터 연결" : "Account · language · data links"}
          island="core"
          worker="archi"
          speech={
            locale === "ko"
              ? "계정 정보는 조용히 보관하고, 필요한 설정만 이어서 만져요."
              : "Your account stays quiet here, with only useful settings close by."
          }
          islandSize={250}
          workerSize={104}
          railIcons={["⌂", "◎", "◇", "▣"]}
        />

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
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  // Bottom tab-bar clearance is handled centrally by PremiumAppShell now; keep
  // only a normal content gap here so it doesn't double-pad.
  scroll: { gap: spacing.lg, paddingBottom: spacing.lg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: "#A78BFA",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: { letterSpacing: 1 },
  actions: { gap: spacing.md },
});
