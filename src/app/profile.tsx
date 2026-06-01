// '나' hub (menu restructure Phase 5) — /profile is no longer a thin account
// page. It's the 3-axis "me" hub that surfaces every self screen that used to
// hang off a single buried entry point: 나의 중심 + 평가 (알아가기 축), 분석
// (개인 비서 축), and 계정·설정. /trinity, which lost its graph entry in Phase 4,
// is re-homed here under 분석. Routing is unchanged — /profile is already the 나
// tab; only the screen body grows.

import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, type Href } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

interface HubLink {
  route: Href;
  ko: string;
  en: string;
}
interface HubSection {
  key: string;
  ko: string;
  en: string;
  accent: string;
  items: HubLink[];
}

// Every "me" destination, grouped by axis. The chips link straight to the
// existing screens — no new routes, just a single place they're all visible.
const HUB: HubSection[] = [
  {
    key: "center",
    ko: "나의 중심",
    en: "Center of me",
    accent: semantic.brand,
    items: [{ route: "/core-brain", ko: "나의 중심 열기", en: "Open center of me" }],
  },
  {
    key: "know",
    ko: "나를 알아가기",
    en: "Get to know me",
    accent: cosmic.soulViolet,
    items: [
      { route: "/persona", ko: "페르소나", en: "Persona" },
      { route: "/big-five", ko: "성격 5요인", en: "Big Five" },
      { route: "/mbti", ko: "MBTI", en: "MBTI" },
      { route: "/attachment", ko: "애착 유형", en: "Attachment" },
      { route: "/audit", ko: "과거의 나", en: "Past me" },
      { route: "/interview", ko: "스무고개", en: "Interview" },
    ],
  },
  {
    key: "analyze",
    ko: "분석",
    en: "Analysis",
    accent: cosmic.signalBlue,
    items: [
      { route: "/insights", ko: "인사이트", en: "Insights" },
      { route: "/trinity", ko: "Trinity", en: "Trinity" },
      { route: "/research", ko: "리서치", en: "Research" },
    ],
  },
  {
    key: "account",
    ko: "계정 · 설정",
    en: "Account & settings",
    accent: cosmic.mistGray,
    items: [
      { route: "/settings", ko: "설정", en: "Settings" },
      { route: "/privacy", ko: "개인정보 보호", en: "Privacy" },
      { route: "/theme", ko: "테마", en: "Theme" },
      { route: "/data", ko: "데이터 관리", en: "Data" },
      { route: "/formats", ko: "내 형식", en: "My formats" },
      { route: "/manual", ko: "안내서", en: "Manual" },
      { route: "/import", ko: "가져오기", en: "Import" },
      { route: "/inbox", ko: "받은편지함", en: "Inbox" },
      { route: "/support", ko: "지원", en: "Support" },
      { route: "/permissions", ko: "권한", en: "Permissions" },
    ],
  },
];

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
          eyebrow={locale === "ko" ? "나" : "Me"}
          title={locale === "ko" ? `${displayName}의 마을 표식` : `${displayName}'s village mark`}
          subtitle={locale === "ko" ? "나를 알아가고 · 활용하고 · 관리하는 곳" : "Know, use, and manage yourself"}
          island="core"
          worker="archi"
          speech={
            locale === "ko"
              ? "나에 관한 건 다 여기 모아 뒀어요. 천천히 둘러봐요."
              : "Everything about you is gathered here. Take your time."
          }
          islandSize={250}
          workerSize={104}        />

        {/* Account — compact now that the hub is the focus. */}
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

        {/* 3-axis hub — every "me" screen, grouped and one tap away. */}
        {HUB.map((section) => (
          <View key={section.key} style={[styles.section, { borderLeftColor: section.accent }]}>
            <Text variant="caption" color="textMuted" style={styles.eyebrow}>
              {locale === "ko" ? section.ko : section.en}
            </Text>
            <View style={styles.chipRow}>
              {section.items.map((item) => (
                <Pressable
                  key={String(item.route)}
                  onPress={() => router.push(item.route)}
                  style={styles.chip}
                  accessibilityRole="button"
                  accessibilityLabel={locale === "ko" ? item.ko : item.en}
                >
                  <Text variant="subtle" color="textMuted">{locale === "ko" ? item.ko : item.en}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
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
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: { letterSpacing: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: semantic.surfaceAlt,
  },
});
