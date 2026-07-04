// First-run onboarding — a 4-slide deep-space carousel that renders PRE-AUTH
// (no sign-in required) and ends at the real age-tiered auth path. Rebuilt 1:1
// from the finalized reference (docs/clone-audit/reference-handoff/reference-app/
// sb-flows.jsx · OnboardingScreen) + the 02-onboard.png capture (pixel target).
//
// Render-broken fix: the old screen gated on `!userId` and redirected to
// /sign-in, so the carousel never showed for a signed-out user — the whole point
// of onboarding is that it comes BEFORE auth. We now gate on the onboarding-
// complete flag (onboarding/state.ts, the AsyncStorage/localStorage `sb_onboarded`
// equivalent), never on userId. The final slide hands off to the REAL sign-in
// screen (C10 age-tiered sign-up stays intact) — we never reimplement auth here.

import { useEffect, useState } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { MdButton } from "@/components/m3";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { DeepSpaceBackdrop } from "@/components/deepspace/DeepSpaceBackdrop";
import { SbIcon, type SbIconName } from "@/components/deepspace/shell/SbIcon";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { canonFlows } from "@/lib/canon";
import { useAuth } from "@/lib/auth/AuthContext";
import { markOnboardingComplete, useOnboardingComplete } from "@/lib/onboarding/state";

interface Slide {
  icon: SbIconName;
  tag: { ko: string; en: string };
  title: { ko: string; en: string };
  body: { ko: string; en: string };
}

// KO slide copy comes VERBATIM from the canon flows pack (public/proto/data/
// screens/flows.json via canonFlows.onboardingSlides) — the same 4 slides the
// reference sb-flows.jsx OnboardingScreen and the 02-onboard.png capture carry
// (slide 1 = "나를 알아가는 AI"). Canon values are a pixel contract: do not
// paraphrase or edit them app-side. EN mirrors stay app-side below, index-
// aligned with the canon slides.
const SLIDE_EN: { tag: string; title: string; body: string }[] = [
  {
    tag: "2ND-BRAIN",
    title: "An AI that gets\nto know you",
    body: "SecondB is curious about the stardust that makes you up. Show your stardust and tell it who you are!",
  },
  {
    tag: "Getting to know you",
    title: "Scattered days\nbecome a constellation",
    body: "Career, money, relationships, health, growth, rest: seven life stars show who you are at a glance.",
  },
  {
    tag: "Helping alongside you",
    title: "It helps\nas much as it knows",
    body: "The more it knows you, the better it assists: spending, rest, daily plans, all tuned to you.",
  },
  {
    tag: "Learning together",
    title: "Learn how the\nAI works, too",
    body: "See how SecondB understands you: the AI Museum unpacks the how in a simple, playful way.",
  },
];

const SLIDES: Slide[] = canonFlows.onboardingSlides.map((s, i) => ({
  icon: s.icon as SbIconName,
  tag: { ko: s.tag, en: SLIDE_EN[i]?.tag ?? s.tag },
  title: { ko: s.title, en: SLIDE_EN[i]?.title ?? s.title },
  body: { ko: s.body, en: SLIDE_EN[i]?.body ?? s.body },
}));

const AUTH_STEP = SLIDES.length;

export default function Onboarding() {
  const { i18n } = useTranslation();
  const locale = i18n.language === "ko" ? "ko" : "en";
  const ko = locale === "ko";
  const { userId, loading } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  const [step, setStep] = useState(0);

  // Android hardware back walks the carousel back a slide instead of tearing the
  // route down mid-flow (ANDROID_QA_GUIDELINES — hardware BackHandler wiring).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step > 0) {
        setStep((s) => s - 1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);

  if (loading) return <InlineLoader />;
  // Gate on the onboarding flag, NOT on userId: a signed-out user must see the
  // carousel. Only bounce home once onboarding is actually finished.
  if (onboardingComplete === true) return <Redirect href="/" />;

  const nextHint = ko ? "다음 소개로 넘어갑니다." : "Goes to the next slide.";
  const skipHint = ko ? "소개를 건너뛰고 로그인 화면으로 이동합니다." : "Skips the intro and opens the sign-in screen.";
  const authHint = ko ? "로그인 화면으로 이동합니다." : "Opens the sign-in screen.";

  // The final slide hands off to the REAL auth path (age-tiered sign-up, C10).
  // Already-signed-in users (reached onboarding post-auth) go straight home.
  function goToAuth() {
    markOnboardingComplete();
    if (userId) router.replace("/");
    else router.replace("/sign-in");
  }

  const isAuth = step >= AUTH_STEP;
  const authLabel = ko ? "로그인하고 시작하기" : "Log in to begin";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <DeepSpaceBackdrop />

      <View style={styles.top}>
        {!isAuth ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ko ? "건너뛰기" : "Skip"}
            accessibilityHint={skipHint}
            hitSlop={10}
            onPress={() => setStep(AUTH_STEP)}
          >
            <Text variant="caption" style={styles.skip}>{ko ? "건너뛰기" : "Skip"}</Text>
          </Pressable>
        ) : null}
      </View>

      {isAuth ? (
        <View style={styles.hero}>
          <SecondbHead size={168} mood="positive" track={false} accessibilityLabel={ko ? "세컨비" : "SecondB"} />
          <Text variant="heading" style={styles.title}>{ko ? "시작할까요?" : "Ready to begin?"}</Text>
          <Text variant="body" style={styles.body}>
            {ko
              ? "로그인하면 어느 기기에서나 당신의 별자리를 이어서 볼 수 있어요."
              : "Sign in to pick up your constellation on any device."}
          </Text>
        </View>
      ) : (
        <View style={styles.hero}>
          <View style={styles.iconCard}>
            <SbIcon name={SLIDES[step].icon} size={44} color={m3.accent.shareEyebrow} />
          </View>
          <Text variant="caption" style={styles.tag}>{SLIDES[step].tag[locale]}</Text>
          <Text variant="heading" style={styles.title}>{SLIDES[step].title[locale]}</Text>
          <Text variant="body" style={styles.body}>{SLIDES[step].body[locale]}</Text>
        </View>
      )}

      {isAuth ? (
        <View style={styles.authBar}>
          <MdButton
            variant="filled"
            label={authLabel}
            accessibilityLabel={authLabel}
            accessibilityHint={authHint}
            onPress={goToAuth}
            style={styles.authBtn}
          />
        </View>
      ) : (
        <View style={styles.bottomBar}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step
                    ? { width: 22, backgroundColor: deepSpace.accent }
                    : { width: 7, backgroundColor: withAlpha(m3.accent.skyStarWhite, 0.45) },
                ]}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ko ? "다음" : "Next"}
            accessibilityHint={nextHint}
            onPress={() => setStep((s) => s + 1)}
            style={({ pressed }) => [styles.nextBtn, pressed && styles.pressed]}
          >
            <Text variant="caption" style={styles.nextText}>{ko ? "다음" : "Next"}</Text>
            <SbIcon name="arrow_forward" size={18} color={deepSpace.onAccent} />
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: deepSpace.bgEdge,
    paddingHorizontal: 24,
  },
  top: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 20,
    minHeight: 44,
  },
  skip: { color: withAlpha(deepSpace.accentSoft, 0.7), fontSize: 14 },

  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  iconCard: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(deepSpace.accent, 0.14),
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accent, 0.3),
  },
  tag: {
    color: m3.accent.entryTag,
    fontSize: 11,
    letterSpacing: 2.2,
    textAlign: "center",
  },
  title: {
    color: deepSpace.textHi,
    fontSize: 26,
    lineHeight: 32,
    textAlign: "center",
  },
  body: {
    maxWidth: 270,
    color: withAlpha(m3.accent.entryBody, 0.72),
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
  },

  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingBottom: 28,
  },
  dots: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { height: 7, borderRadius: 9999 },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 22,
    borderRadius: 9999,
    backgroundColor: deepSpace.accent,
  },
  nextText: { color: deepSpace.onAccent, fontSize: 15 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },

  authBar: { paddingBottom: 28 },
  authBtn: { alignSelf: "stretch" },
});
