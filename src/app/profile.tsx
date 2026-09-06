// Profile hub. Route structure and accents stay in code; all user-facing hub
// labels and hints live in the profile locale namespace.

import { useEffect, useState, type ReactNode } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, type Href } from "expo-router";

import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Text } from "@/components/ui/Text";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, mascot, semantic, spacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useProgression } from "@/lib/progression/useProgression";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { canonGlyph } from "@/components/pixel/pixel-glyphs";
import { DeepSpaceLinks } from "@/components/deep-space/DeepSpaceLinks";

interface HubRoute {
  sectionKey: string;
  key: string;
  route: Href;
  accent: string;
}

type HubCopy = {
  label: string;
  items: Record<string, { label: string; hint: string }>;
};

type DeepSpaceProfileSection = "know" | "analyze";

const PRIMARY_HUB_ITEMS: HubRoute[] = [
  { sectionKey: "center", key: "coreBrain", route: "/core-brain", accent: semantic.brand },
  { sectionKey: "center", key: "esm", route: "/esm", accent: semantic.brand },
  { sectionKey: "know", key: "persona", route: "/persona", accent: cosmic.soulViolet },
  { sectionKey: "analyze", key: "insights", route: "/insights", accent: cosmic.signalBlue },
  { sectionKey: "analyze", key: "trinity", route: "/trinity", accent: mascot.trinity },
  // Live QA 2026-06-11: /inbox (클립 수신함) had NO forward entry anywhere in
  // the app - the locale label existed but no surface rendered it. This row
  // is its single entry point (home -> 나 -> 받은편지함, 2 taps).
  { sectionKey: "account", key: "inbox", route: "/inbox", accent: cosmic.signalMint },
];

// Frame — 이 화면의 껍데기. 딥스페이스에서는 공용 셸을 쓴다.
//
// 왜 생겼나(2026-08-30): `/account` 는 딥스페이스에서 전용 화면으로 **갈아탔는데**
// (`account.tsx:395` 의 이른 return) `/profile` 은 갈아타지 않았다. 딥스페이스
// 색만 덧칠한 채 레거시 PremiumAppShell 위에 그대로 서 있었고, 그 셸에는 하단
// 탭바가 없다 — 레퍼런스 profile 프레임의 글자 6개 중 5개가 바로 그 독이다.
// 그래서 대조 점수 17%는 카피 문제가 아니라 **껍데기가 통째로 빠진 것**이었다.
//
// 전체 전환(전용 딥스페이스 화면 신설)은 별건이다. 여기서는 껍데기만 공용으로
// 돌린다 — 안은 손대지 않는다.
//
// ⚠ active="account" 는 TABS(home·capture·chat·wiki·settings) 밖이다. 그래서
// 어떤 탭도 잘못 켜지지 않고, DeepSpaceScreen 의 하드웨어 뒤로가기 특례(루트 탭
// → 홈)도 걸리지 않는다. 화면 자체의 뒤로가기(아래 BackGlyph)가 유일한 뒤로다.
function Frame({ children }: { children: ReactNode }) {
  if (isDeepSpaceUI()) {
    return (
      <DeepSpaceScreen active="account" header="none">
        {children}
      </DeepSpaceScreen>
    );
  }
  return <PremiumAppShell>{children}</PremiumAppShell>;
}

// M3 back arrow (same path as MdTopAppBar) — 딥스페이스 profile 은 위 Frame 의
// 독으로 탭 이동은 되지만 상단 앱바가 없다. 이 컨트롤이 유일한 '뒤로'다.
function BackGlyph({ color }: { color: string }) {
  return <PixelGlyph name="arrow_back" color={color} size={22} />;
}

// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
// 여기 있던 여섯 개는 인라인 JSX 곡선이었다(문자열 레지스트리가 아니라서
// 레지스트리 스캔에도 안 잡혔다). DOM 실측이 화면에서 잡아냈다.
function SettingsGlyph({ color }: { color: string }) {
  return <PixelGlyph name="settings" color={color} size={22} />;
}

function PlanGlyph({ color }: { color: string }) {
  return <PixelGlyph name="task_alt" color={color} size={34} />;
}

/** 허브 항목별 아이콘. 모르는 키는 일반 표시로 떨어진다. */
const HUB_GLYPH: Record<string, string> = {
  coreBrain: "target",
  esm: "check",
  persona: "person",
  insights: "trending_up",
  trinity: "hub",
};

function HubGlyph({ itemKey, color }: { itemKey: string; color: string }) {
  return <PixelGlyph name={canonGlyph(HUB_GLYPH[itemKey] ?? "inbox")} color={color} size={24} />;
}

export default function Profile() {
  const { t } = useTranslation("profile");
  const { t: tDeepSpace } = useTranslation("deepspace");
  const { t: tHome } = useTranslation("home");
  const { t: tPlans } = useTranslation("plans");
  const { t: tCommon } = useTranslation("common");
  const { userId, loading } = useAuth();
  const progression = useProgression();
  const sections = t("sections", { returnObjects: true }) as Record<string, HubCopy>;
  const deepSpaceMode = isDeepSpaceUI();
  const [activeDeepSpaceSection, setActiveDeepSpaceSection] = useState<DeepSpaceProfileSection>("know");

  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const supabase = getSupabaseClient();
        // Identity display must be offline-resilient. getUser() hits the network to
        // re-validate the JWT, so when the backend is unreachable a signed-in user's
        // email returns null and the profile falls back to "Guest" / "Email unavailable"
        // -- misleading them into thinking they are signed out. getSession() reads the
        // locally-persisted session, so the real email shows even offline; "Guest" then
        // means genuinely signed out (no session), not "backend currently unreachable".
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setEmail(data.session?.user?.email ?? null);
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[profile] getSession failed", (e as Error).message);
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
      <Frame>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </Frame>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const displayName = email ? email.split("@")[0] : t("fallbackName");
  const profileTitle = t("hero.title", { displayName });
  // Monetization v2 (2026-06-10): every tier sells under its own name, so the
  // enum value is the plans.json card key directly (soma is live again).
  const planKey = progression.tier;
  const planName = progression.loading ? tPlans("loading") : tPlans(`tiers.${planKey}.name`);
  const planTagline = tPlans(`tiers.${planKey}.tagline`);
  const settingsCopy = sections.account.items.settings;
  const deepSpaceSections: {
    key: DeepSpaceProfileSection;
    label: string;
    group: { title: string; items: { key: string; label: string; route: Href }[] };
  }[] = [
    {
      key: "know",
      label: sections.know.label,
      group: {
        title: sections.know.label,
        items: [
          { key: "core-brain", label: sections.center.items.coreBrain.label, route: "/core-brain" },
          // D4 (2026-08-18): /persona 는 이제 /core-brain 으로 리다이렉트한다.
          // 바로 위 줄과 같은 곳으로 가는 항목이라 메뉴에서 뺐다 - 같은 자리를
          // 두 번 적어 두면 "둘이 뭐가 다르지" 를 사용자가 풀어야 한다.
          // 그 자리에 생활 정보(프로필 별을 채우는 화면)를 넣는다.
          { key: "profile-details", label: tDeepSpace("profileDetails.screenTitle"), route: "/profile-details" },
          { key: "insights", label: sections.analyze.items.insights.label, route: "/insights" },
          { key: "trends", label: tDeepSpace("trends.title"), route: "/brightness" },
          // a2z audit 2026-07-11: /growth (주간 변화 리뷰) shipped fully
          // data-wired but had ZERO reachable entry on the deep-space surface
          // (its only links lived in the legacy-only GraphScreen strip).
          { key: "growth", label: sections.know.items.growth.label, route: "/growth" },
        ],
      },
    },
    {
      key: "analyze",
      label: sections.analyze.label,
      group: {
        title: sections.analyze.label,
        items: [
          { key: "big-five", label: sections.know.items.bigFive.label, route: "/big-five" },
          { key: "ipip", label: sections.know.items.ipip.label, route: "/ipip-neo" },
          { key: "rlss", label: sections.know.items.rlss.label, route: "/rlss" },
          // MBTI was retired (weak validity — see src/app/mbti.tsx); /mbti is a
          // deep-link redirect to /persona, which has its own entry above, so a
          // menu item promising an MBTI screener was a broken promise.
          { key: "attachment", label: sections.know.items.attachment.label, route: "/attachment" },
          { key: "seen", label: tHome("ds.home.starName.seen"), route: "/seen" },
          // Trinity was retired from the canonical menu (CONCEPT.md: Brain
          // Trinity is legacy, rollback skin only — same reasoning as the MBTI
          // removal above); /trinity now redirects deep-space users to
          // /core-brain (북극성), so a menu item would be a broken promise.
          { key: "esm", label: sections.center.items.esm.label, route: "/esm" },
          { key: "interview", label: sections.know.items.interview.label, route: "/interview" },
          { key: "audit", label: sections.know.items.audit.label, route: "/audit" },
        ],
      },
    },
  ];
  const activeDeepSpaceGroup =
    deepSpaceSections.find((section) => section.key === activeDeepSpaceSection)?.group ?? deepSpaceSections[0].group;

  return (
    <Frame>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topBar}>
          {deepSpaceMode ? (
            <TouchableOpacity
              onPress={() => (router.canGoBack() ? router.back() : router.push("/"))}
              hitSlop={14}
              activeOpacity={0.7}
              style={[styles.settingsButton, styles.deepSpaceIconButton]}
              accessibilityRole="button"
              accessibilityLabel={tCommon("back")}
            >
              <BackGlyph color={semantic.deepSpaceText} />
            </TouchableOpacity>
          ) : null}
          {/* The a11y label sits on the title view (not the whole row) so the
              back/settings buttons stay individually reachable to readers. */}
          <View style={{ flex: 1 }} accessible accessibilityLabel={profileTitle}>
            <Text variant="caption" color="textMuted" style={[styles.eyebrow, deepSpaceMode && styles.deepSpaceMutedText]}>
              {t("hero.eyebrow")}
            </Text>
            <Text variant="heading" numberOfLines={1} style={deepSpaceMode && styles.deepSpaceText}>
              {displayName}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            hitSlop={14}
            activeOpacity={0.7}
            style={[styles.settingsButton, deepSpaceMode && styles.deepSpaceIconButton]}
            accessibilityRole="button"
            accessibilityLabel={settingsCopy.label}
            accessibilityHint={settingsCopy.hint}
          >
            <SettingsGlyph color={deepSpaceMode ? semantic.deepSpaceText : semantic.brand} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/plans")}
          activeOpacity={0.7}
          style={[styles.subscriptionCard, deepSpaceMode && styles.deepSpaceSubscriptionCard]}
          accessibilityRole="button"
          accessibilityLabel={`${tPlans("current")}: ${planName}`}
        >
          <View style={[styles.planIcon, deepSpaceMode && styles.deepSpacePlanIcon]}>
            <PlanGlyph color={deepSpaceMode ? semantic.deepSpaceAccent : semantic.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand" style={[styles.eyebrow, deepSpaceMode && styles.deepSpaceText]}>
              {tPlans("current")}
            </Text>
            <Text variant="heading" style={deepSpaceMode && styles.deepSpaceText}>
              {planName}
            </Text>
            <Text variant="subtle" color="textMuted" numberOfLines={2} style={deepSpaceMode && styles.deepSpaceMutedText}>
              {planTagline}
            </Text>
          </View>
          {progression.loading ? (
            <ActivityIndicator color={deepSpaceMode ? semantic.deepSpaceAccent : semantic.brand} />
          ) : (
            <Text variant="caption" color="brand" style={deepSpaceMode && styles.deepSpaceText}>
              {tPlans("hero.eyebrow")}
            </Text>
          )}
        </TouchableOpacity>

        {deepSpaceMode ? null : (
          <View style={styles.accountStrip}>
            {busy ? (
              <ActivityIndicator color={semantic.brand} />
            ) : (
              <Text variant="subtle" color="textMuted" numberOfLines={1}>
                {email ?? t("account.emailUnavailable")}
              </Text>
            )}
          </View>
        )}

        {deepSpaceMode ? null : (
          <View style={styles.quickGrid}>
            {PRIMARY_HUB_ITEMS.map((item) => {
              const itemCopy = sections[item.sectionKey].items[item.key];
              return (
                <TouchableOpacity
                  key={String(item.route)}
                  onPress={() => router.push(item.route)}
                  activeOpacity={0.7}
                  style={[styles.quickChip, { borderColor: item.accent }]}
                  accessibilityRole="button"
                  accessibilityLabel={itemCopy.label}
                  accessibilityHint={itemCopy.hint}
                >
                  <View style={styles.quickChipIcon}>
                    <HubGlyph itemKey={item.key} color={item.accent} />
                  </View>
                  <View style={styles.quickChipCopy}>
                    <Text variant="body" color="text" numberOfLines={2} style={styles.quickChipLabel}>
                      {itemCopy.label}
                    </Text>
                    <Text variant="subtle" color="textMuted" numberOfLines={2} style={styles.quickChipHint}>
                      {itemCopy.hint}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* O-31 Stage4/6: deep-space keeps one summary card above, then reveals
            one route cluster at a time instead of rendering the dense legacy hub. */}
        {isDeepSpaceUI() ? (
          <View style={styles.deepSpaceDisclosure}>
            <View style={styles.deepSpaceTabs} accessibilityRole="tablist">
              {deepSpaceSections.map((section) => {
                const selected = section.key === activeDeepSpaceSection;
                return (
                  <TouchableOpacity
                    key={section.key}
                    onPress={() => setActiveDeepSpaceSection(section.key)}
                    activeOpacity={0.72}
                    style={[styles.deepSpaceTab, selected && styles.deepSpaceTabActive]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={section.label}
                  >
                    <Text
                      variant="caption"
                      style={[styles.deepSpaceTabText, selected && styles.deepSpaceTabTextActive]}
                    >
                      {section.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <DeepSpaceLinks groups={[activeDeepSpaceGroup]} />
          </View>
        ) : null}
      </ScrollView>
    </Frame>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.lg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBar: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  settingsButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: semantic.surface,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: 0,
    ...pixelShadowStyle(),
  },
  subscriptionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: gameboy.borderWidth,
    borderStartWidth: gameboy.borderWidth,
    borderStartColor: semantic.brand,
    borderRadius: 0,
    padding: spacing.lg,
    gap: spacing.md,
    ...pixelShadowStyle(semantic.brand),
  },
  planIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: semantic.surfaceAlt,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: 0,
    ...pixelShadowStyle(),
  },
  accountStrip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  eyebrow: { letterSpacing: 0 },
  quickChip: {
    flexBasis: "48%",
    flexGrow: 1,
    borderWidth: gameboy.borderWidth,
    borderRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: semantic.surfaceAlt,
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    ...pixelShadowStyle(),
  },
  quickChipIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: semantic.surface,
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: 0,
  },
  quickChipCopy: { flex: 1, minWidth: 0, gap: 2 },
  quickChipLabel: { lineHeight: 20 },
  quickChipHint: { lineHeight: 16 },
  deepSpaceText: { color: semantic.deepSpaceText },
  deepSpaceMutedText: { color: semantic.deepSpaceTextMuted },
  deepSpaceIconButton: {
    backgroundColor: semantic.deepSpaceCard,
    borderColor: semantic.deepSpaceCardLine,
    borderWidth: 1,
    borderRadius: m3.shape.none,
    shadowOpacity: 0,
    elevation: 0,
  },
  deepSpaceSubscriptionCard: {
    backgroundColor: semantic.deepSpaceCard,
    borderColor: semantic.deepSpaceAccent,
    borderWidth: 1,
    borderStartWidth: 1,
    borderStartColor: semantic.deepSpaceAccent,
    borderRadius: m3.shape.none,
    shadowOpacity: 0,
    elevation: 0,
  },
  deepSpacePlanIcon: {
    backgroundColor: semantic.deepSpaceCard,
    borderColor: semantic.deepSpaceCardLine,
    borderWidth: 1,
    borderRadius: m3.shape.none,
    shadowOpacity: 0,
    elevation: 0,
  },
  deepSpaceDisclosure: { gap: spacing.md },
  deepSpaceTabs: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: 4,
    borderWidth: 1,
    borderRadius: m3.shape.none,
    borderColor: semantic.deepSpaceCardLine,
    backgroundColor: semantic.deepSpaceCard,
  },
  deepSpaceTab: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: semantic.deepSpaceCardLine,
  },
  deepSpaceTabActive: {
    borderColor: semantic.deepSpaceAccent,
    backgroundColor: semantic.deepSpaceCardPressed,
  },
  deepSpaceTabText: { color: semantic.deepSpaceTextMuted, letterSpacing: 0, textAlign: "center" },
  deepSpaceTabTextActive: { color: semantic.deepSpaceText },
});
