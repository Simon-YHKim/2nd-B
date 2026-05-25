import { useTranslation } from "react-i18next";
import { View, StyleSheet, ScrollView, Image, Text } from "react-native";
import { Link, Redirect } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Button } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { colors, spacing, radius, fontSize, fontFamilies, fontWeights } from "@/theme";
import { useAuth } from "@/lib/auth/AuthContext";
import { getEnv, IS_DEMO_BUILD } from "@/lib/env";

// Logo with glow — resolves to the root assets/ dir.
const logo = require("../../assets/images/logo-glow.png");

// One phytoncide accent per pillar (spring leaf / sunlight / sky).
const ACCENTS = [colors.leaf, colors.sun, colors.skyDeep] as const;

export default function Landing() {
  const { t, i18n } = useTranslation();
  const { userId, hasProfile, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  // Auth still resolving — show the branded loading screen.
  if (loading) return <LoadingScreen />;

  // Signed in via OAuth but no public.users row yet — finish the C10 birth-date
  // prompt before letting them into the app.
  if (userId && hasProfile === false) return <Redirect href="/complete-profile" />;

  // Signed in and profile exists — the landing is for visitors only.
  if (userId && hasProfile) return <Redirect href="/journal" />;

  // Demo mode = deployed with no Supabase env vars set. Sign-in/save will
  // fail at the network layer; show a banner so the user knows why.
  let demoMode = false;
  try {
    demoMode = IS_DEMO_BUILD(getEnv().EXPO_PUBLIC_SUPABASE_URL);
  } catch {
    demoMode = false;
  }

  const serifDisplay = locale === "ko" ? fontFamilies.serifKo : fontFamilies.serifEn;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {demoMode ? (
          <View style={styles.demoBanner} accessibilityRole="alert">
            <Text style={styles.demoBannerTitle}>
              {locale === "ko" ? "데모 모드" : "DEMO MODE"}
            </Text>
            <Text style={styles.demoBannerBody}>
              {locale === "ko"
                ? "UI 미리보기 전용입니다. 로그인이나 데이터 저장은 작동하지 않아요."
                : "UI preview only — sign-in and data persistence are disabled."}
            </Text>
          </View>
        ) : null}

        {/* Hero — logo, brand eyebrow, serif display name, tagline. */}
        <View style={styles.hero}>
          <Image
            source={logo}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="2nd-Brain"
          />
          <Text style={styles.eyebrow}>2nd-Brain</Text>
          <Text style={[styles.display, { fontFamily: serifDisplay }]} accessibilityRole="header">
            {t("app.name")}
          </Text>
          <Text style={styles.tagline}>
            {locale === "ko"
              ? "노트 저장소가 아닌, 당신을 배우는 AI."
              : "Not a note vault — an AI that learns you."}
          </Text>
        </View>

        {/* Three pillars — guided capture, evolving self-model, portable RAG. */}
        <View style={styles.pillars}>
          {PILLARS[locale].map((p, i) => (
            <View key={p.title} style={[styles.pillarCard, { borderLeftColor: ACCENTS[i] }]}>
              <Text style={[styles.pillarEyebrow, { color: ACCENTS[i] }]}>{p.eyebrow}</Text>
              <Text style={styles.pillarTitle}>{p.title}</Text>
              <Text style={styles.pillarBody}>{p.body}</Text>
            </View>
          ))}
        </View>

        {/* Evidence card — what the inference is grounded in. */}
        <View style={styles.evidenceCard}>
          <Text style={styles.evidenceEyebrow}>
            {locale === "ko" ? "근거 기반" : "EVIDENCE-GROUNDED"}
          </Text>
          <Text style={styles.evidenceBody}>
            {locale === "ko"
              ? "Big Five · Self-Determination Theory · Attachment · VIA · Erikson — 검증된 학술 프레임만 인용합니다. MBTI나 점성술은 사용하지 않습니다."
              : "Big Five · Self-Determination Theory · Attachment · VIA · Erikson — we cite only validated frameworks. No MBTI, no astrology."}
          </Text>
        </View>

        {/* Calls to action. */}
        <View style={styles.actions}>
          <Link href="/sign-up" asChild>
            <Button label={locale === "ko" ? "시작하기" : "Get started"} variant="primary" />
          </Link>
          <Link href="/sign-in" asChild>
            <Button label={locale === "ko" ? "로그인" : "Sign in"} variant="secondary" />
          </Link>
          <Link href="/manual" asChild>
            <Button label={locale === "ko" ? "안내서 보기 (1분)" : "Read the manual (1 min)"} variant="secondary" />
          </Link>
        </View>

        <Text style={styles.disclosure}>
          {locale === "ko"
            ? "진단이 아닙니다. 치료 권고도 아닙니다. 자기 이해를 돕는 도구입니다."
            : "Not a diagnosis. Not therapeutic advice. A reflection scaffold."}
        </Text>
      </ScrollView>
    </Screen>
  );
}

// Three pillars per DESIGN.md voice ("companion, not coach") + blueprint §1
// differentiators (guided capture, portability, validated psychology).
const PILLARS: Record<"en" | "ko", { eyebrow: string; title: string; body: string }[]> = {
  en: [
    {
      eyebrow: "01 · CAPTURE",
      title: "Journal that asks back.",
      body: "Daily entries, life-audit interviews, and free-form notes — the questions are tuned to who you've been writing as.",
    },
    {
      eyebrow: "02 · INFER",
      title: "A self-model that updates.",
      body: "Patterns extracted across your entries — Big Five proxy, values, attachment cues — surfaced as observations, never verdicts.",
    },
    {
      eyebrow: "03 · OWN",
      title: "Portable RAG, your data.",
      body: "Export a Markdown knowledge base that works with Claude, ChatGPT, or whatever comes next. Your second brain travels.",
    },
  ],
  ko: [
    {
      eyebrow: "01 · 캡처",
      title: "되묻는 일기.",
      body: "매일의 기록, 라이프 오딧 인터뷰, 자유 노트. 질문은 당신이 어떻게 써왔는지에 맞춰 정교해집니다.",
    },
    {
      eyebrow: "02 · 추론",
      title: "업데이트되는 자기 모델.",
      body: "기록 전체에서 패턴을 추출합니다. Big Five 근사, 가치, 애착 단서를 단정이 아닌 관찰로 보여드려요.",
    },
    {
      eyebrow: "03 · 소유",
      title: "당신 데이터, 어디서든.",
      body: "Markdown 지식 베이스로 내보내면 Claude·ChatGPT·차세대 어떤 도구에도 가져갈 수 있어요. 두번째 뇌는 함께 이동합니다.",
    },
  ],
};

const styles = StyleSheet.create({
  scroll: { gap: spacing["2xl"], paddingBottom: spacing["4xl"] },

  // Demo-mode banner.
  demoBanner: {
    backgroundColor: colors.mist,
    borderColor: colors.amber,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  demoBannerTitle: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
    color: colors.amber,
  },
  demoBannerBody: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.45,
    color: colors.ink3,
    marginTop: 2,
  },

  // Hero.
  hero: { gap: spacing.sm },
  logo: { width: 84, height: 84, marginBottom: spacing.xs },
  eyebrow: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 2,
    color: colors.pineSoft,
  },
  display: {
    fontSize: fontSize["4xl"],
    lineHeight: fontSize["4xl"] * 1.12,
    color: colors.pine,
  },
  tagline: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSize.lg,
    lineHeight: fontSize.lg * 1.5,
    color: colors.ink2,
    marginTop: spacing.xs,
  },

  // Pillars.
  pillars: { gap: spacing.md },
  pillarCard: {
    backgroundColor: colors.paper2,
    borderColor: colors.rule,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  pillarEyebrow: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
  },
  pillarTitle: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSize.lg,
    fontWeight: fontWeights.semibold,
    color: colors.ink,
  },
  pillarBody: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.55,
    color: colors.ink2,
  },

  // Evidence.
  evidenceCard: {
    backgroundColor: colors.mist,
    borderColor: colors.rule,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: colors.pine,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  evidenceEyebrow: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
    color: colors.ink3,
  },
  evidenceBody: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.55,
    color: colors.ink2,
  },

  // CTAs + disclosure.
  actions: { gap: spacing.sm },
  disclosure: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSize.xs,
    lineHeight: fontSize.xs * 1.5,
    color: colors.ink3,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
