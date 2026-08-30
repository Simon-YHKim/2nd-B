// First-run onboarding stays a PRE-AUTH four-slide carousel. Its final frame is
// only a handoff: date-of-birth input, consent, storage, and age-tier decisions
// remain owned by the real /sign-up and /complete-profile boundaries (C10).

import { useEffect, useState } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { PixelGateShell, PixelPressable, PixelSurface } from "@/components/pixel";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { canonFlows } from "@/lib/canon";
import { markOnboardingComplete, useOnboardingComplete } from "@/lib/onboarding/state";
import { m3 } from "@/lib/theme/m3";

interface Slide {
  icon: AnyGlyphName;
  tag: { ko: string; en: string };
  title: { ko: string; en: string };
  body: { ko: string; en: string };
}

// KO is verbatim canon copy. The existing approved EN mirror remains index-
// aligned; the final handoff uses the five-locale onboarding/auth resources.
const SLIDE_EN: { tag: string; title: string; body: string }[] = [
  {
    tag: "2ND-BRAIN",
    title: "An AI that gets\nto know you",
    body: "SecondB is curious about the stardust that makes you up. Show your stardust and tell it who you are!",
  },
  {
    tag: "Getting to know you",
    title: "Scattered days\nbecome a constellation",
    body: "Profile, early childhood, school years, your 20s, 30s and beyond, work, and now: seven stars for getting to know yourself at a glance.",
  },
  {
    tag: "Helping alongside you",
    title: "It helps\nas much as it knows",
    body: "The more it knows you, the better it assists: spending, rest, daily plans, all tuned to you.",
  },
  {
    tag: "Learning together",
    title: "Learn how the\nAI works, too",
    body: "What SecondB writes about you is a proposal; you decide what stays. The AI Museum unpacks how it works, simply.",
  },
];

const SLIDES: Slide[] = canonFlows.onboardingSlides.map((slide, index) => ({
  icon: slide.icon as AnyGlyphName,
  tag: { ko: slide.tag, en: SLIDE_EN[index]?.tag ?? slide.tag },
  title: { ko: slide.title, en: SLIDE_EN[index]?.title ?? slide.title },
  body: { ko: slide.body, en: SLIDE_EN[index]?.body ?? slide.body },
}));

const AUTH_STEP = SLIDES.length;
type HandoffDestination = "/" | "/sign-up" | "/sign-in";

export default function Onboarding() {
  const { t, i18n } = useTranslation(["deepspace", "auth", "common"]);
  const locale = i18n.resolvedLanguage?.split("-")[0] === "ko" ? "ko" : "en";
  // check:constraints pins the literal Korean skip label in this file.
  const skipLabel = locale === "ko" ? "건너뛰기" : "Skip";
  const { userId, loading } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  const [step, setStep] = useState(0);

  // Android hardware Back reverses one slide, including the final handoff frame.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step > 0) {
        setStep((current) => current - 1);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [step]);

  if (loading || onboardingComplete === null) return <InlineLoader />;
  if (onboardingComplete === true) return <Redirect href="/" />;

  // Completion is deliberately written only when a real destination is chosen.
  // Merely mounting the route, paging, or skipping to the handoff does not write.
  function finishOnboarding(destination: HandoffDestination) {
    markOnboardingComplete();
    if (destination === "/") {
      router.replace("/");
      return;
    }
    if (destination === "/sign-up") {
      router.replace("/sign-up");
      return;
    }
    router.replace("/sign-in");
  }

  const isAuth = step >= AUTH_STEP;
  const slide = SLIDES[Math.min(step, AUTH_STEP - 1)];
  const nextHint = t("onboarding.nextHint");
  const skipHint = t("onboarding.skipHint");
  const authHint = t("onboarding.authHint");

  return (
    <PixelGateShell contentContainerStyle={styles.shellContent}>
      <View style={styles.topBar}>
        {!isAuth ? (
          <PixelPressable
            variant="frame"
            background={m3.color.surfaceContainer}
            accessibilityLabel={skipLabel}
            accessibilityHint={skipHint}
            onPress={() => setStep(AUTH_STEP)}
            contentStyle={styles.skipContent}
          >
            <Text variant="caption" style={styles.skipText}>{skipLabel}</Text>
          </PixelPressable>
        ) : null}
      </View>

      {isAuth ? (
        <View style={styles.finalHero}>
          <SecondbHead
            size={120}
            mood="neutral"
            track={false}
            accessibilityLabel={t("onboarding.secondbName")}
          />
          <View style={styles.copyBlock}>
            <Text variant="heading" style={styles.title}>{t("onboarding.authTitle")}</Text>
            <Text variant="body" style={styles.body}>{t("onboarding.authBody")}</Text>
          </View>
          <PixelSurface
            variant="inset"
            background={m3.color.surfaceVariant}
            style={styles.ageSurface}
            contentStyle={styles.ageContent}
          >
            <PixelGlyph name="today" size={24} color={m3.color.primary} />
            <View style={styles.ageCopy}>
              <Text variant="body" style={styles.ageTitle}>{t("auth:signUp.ageNotice")}</Text>
              <Text variant="caption" style={styles.ageHelper}>{t("auth:signUp.birthDateHelper")}</Text>
            </View>
          </PixelSurface>
        </View>
      ) : (
        <View style={styles.slideHero}>
          <PixelSurface
            variant="bevel"
            background={m3.color.surfaceContainerHigh}
            style={styles.iconSurface}
            contentStyle={styles.iconContent}
          >
            <PixelGlyph name={slide.icon} size={48} color={m3.accent.entryTag} />
          </PixelSurface>
          <Text variant="caption" style={styles.tag}>{slide.tag[locale]}</Text>
          <Text variant="heading" style={styles.title}>{slide.title[locale]}</Text>
          <Text variant="body" style={styles.body}>{slide.body[locale]}</Text>
        </View>
      )}

      {isAuth ? (
        <View style={styles.authActions}>
          {userId ? (
            <PixelPressable
              fullWidth
              background={m3.color.primary}
              accessibilityLabel={t("common:actions.continue")}
              accessibilityHint={authHint}
              onPress={() => finishOnboarding("/")}
              contentStyle={styles.primaryButtonContent}
            >
              <Text variant="body" style={styles.primaryButtonText}>{t("common:actions.continue")}</Text>
              <PixelGlyph name="arrow_forward" size={24} color={m3.color.onPrimary} />
            </PixelPressable>
          ) : (
            <>
              <PixelPressable
                fullWidth
                background={m3.color.primary}
                accessibilityLabel={t("auth:signUp.submit")}
                accessibilityHint={t("auth:signIn.signUpHint")}
                onPress={() => finishOnboarding("/sign-up")}
                contentStyle={styles.primaryButtonContent}
              >
                <Text variant="body" style={styles.primaryButtonText}>{t("auth:signUp.submit")}</Text>
                <PixelGlyph name="arrow_forward" size={24} color={m3.color.onPrimary} />
              </PixelPressable>
              <PixelPressable
                fullWidth
                background={m3.color.surfaceContainerHigh}
                accessibilityLabel={t("auth:signIn.submit")}
                accessibilityHint={t("auth:signUp.signInHint")}
                onPress={() => finishOnboarding("/sign-in")}
                contentStyle={styles.secondaryButtonContent}
              >
                <Text variant="body" style={styles.secondaryButtonText}>{t("auth:signIn.submit")}</Text>
              </PixelPressable>
            </>
          )}
        </View>
      ) : (
        <View style={styles.bottomBar}>
          <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {SLIDES.map((_, index) => (
              <View
                key={index}
                style={[styles.dot, index === step ? styles.dotActive : styles.dotRest]}
              />
            ))}
          </View>
          <PixelPressable
            background={m3.color.primary}
            accessibilityLabel={t("onboarding.next")}
            accessibilityHint={nextHint}
            onPress={() => setStep((current) => Math.min(current + 1, AUTH_STEP))}
            contentStyle={styles.nextContent}
          >
            <Text variant="body" style={styles.primaryButtonText}>{t("onboarding.next")}</Text>
            <PixelGlyph name="arrow_forward" size={24} color={m3.color.onPrimary} />
          </PixelPressable>
        </View>
      )}
    </PixelGateShell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    flexGrow: 1,
    gap: m3.spacing.s4,
  },
  topBar: {
    minHeight: m3.minTouch,
    alignItems: "flex-end",
  },
  skipContent: {
    minHeight: m3.minTouch,
    paddingVertical: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s6,
  },
  skipText: {
    color: m3.color.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 16,
    paddingBottom: m3.spacing.s1,
  },
  slideHero: {
    flexGrow: 1,
    minHeight: 380,
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s8,
  },
  finalHero: {
    flexGrow: 1,
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s8,
  },
  iconSurface: {
    width: 100,
  },
  iconContent: {
    minHeight: 92,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s4,
  },
  copyBlock: {
    width: "100%",
    alignItems: "center",
    gap: m3.spacing.s4,
  },
  tag: {
    color: m3.accent.entryTag,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  title: {
    width: "100%",
    color: m3.color.onBackground,
    fontSize: 24,
    lineHeight: 32,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  body: {
    width: "100%",
    maxWidth: 320,
    color: m3.color.onSurfaceVariant,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    paddingBottom: m3.spacing.s2,
  },
  ageSurface: {
    width: "100%",
  },
  ageContent: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s6,
    paddingVertical: m3.spacing.s6,
    paddingHorizontal: m3.spacing.s8,
  },
  ageCopy: {
    flex: 1,
    gap: m3.spacing.s2,
  },
  ageTitle: {
    color: m3.color.onSurface,
    fontSize: 15,
    lineHeight: 22,
    paddingBottom: m3.spacing.s1,
  },
  ageHelper: {
    color: m3.color.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 18,
    paddingBottom: m3.spacing.s1,
  },
  bottomBar: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s8,
  },
  dots: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
  },
  dot: {
    height: m3.spacing.s2,
  },
  dotActive: {
    width: 24,
    backgroundColor: m3.color.primary,
  },
  dotRest: {
    width: m3.spacing.s4,
    backgroundColor: m3.color.surfaceBright,
  },
  nextContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s8,
  },
  authActions: {
    width: "100%",
    gap: m3.spacing.s4,
  },
  primaryButtonContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s8,
  },
  secondaryButtonContent: {
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s8,
  },
  primaryButtonText: {
    color: m3.color.onPrimary,
    fontSize: 15,
    lineHeight: 22,
    paddingBottom: m3.spacing.s1,
  },
  secondaryButtonText: {
    color: m3.color.onSurface,
    fontSize: 15,
    lineHeight: 22,
    paddingBottom: m3.spacing.s1,
  },
});
