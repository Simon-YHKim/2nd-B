// First-run onboarding is a three-slide carousel. It is not gated on auth, but
// since the login wall (Simon 2026-07-15: "/" sends signed-out visitors to
// /sign-in) the usual way in is AFTER sign-in, as a welcome; a signed-out visitor
// only arrives by opening /onboarding directly. Its final frame is only a
// handoff: date-of-birth input, consent, storage, and age-tier decisions remain
// owned by the real /sign-up and /complete-profile boundaries (C10).

import { useEffect, useState } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { renderedUiLanguage } from "@/lib/i18n/ui-language";
import { router } from "expo-router";
import { RedirectHome } from "@/lib/nav/go-home";

import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { canonGlyph, type AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { PixelGateShell, PixelPressable, PixelSurface } from "@/components/pixel";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { canonFlows } from "@/lib/canon";
import { markOnboardingComplete, useOnboardingComplete } from "@/lib/onboarding/state";
import { welcomeCueAllowed } from "@/lib/audio/app-cues";
import { requestGlobalCue } from "@/lib/audio/global-cues";
import { m3 } from "@/lib/theme/m3";

type SlideCopy = { tag: string; title: string; body: string };

interface Slide {
  icon: AnyGlyphName;
  /** Verbatim canon copy, painted when the UI is Korean. */
  ko: SlideCopy;
  /** deepspace keys painted in every other language; null past the key list. */
  keys: SlideCopy | null;
}

// KO is verbatim canon copy. Every other language reads these deepspace keys,
// index-aligned with the canon slides (Q-261005-01 = A, R2B-03). Until
// 2026-10-06 this was an EN mirror, so es/pt/id saw English slides under a
// translated "Next" button. The first tag is the brand label every locale
// already shares.
const SLIDE_KEYS: SlideCopy[] = [
  { tag: "auth.brandLabel", title: "onboarding.slides.intro.title", body: "onboarding.slides.intro.body" },
  { tag: "onboarding.slides.stars.tag", title: "onboarding.slides.stars.title", body: "onboarding.slides.stars.body" },
  { tag: "onboarding.slides.approve.tag", title: "onboarding.slides.approve.title", body: "onboarding.slides.approve.body" },
];

const SLIDES: Slide[] = canonFlows.onboardingSlides.map((slide, index) => ({
  // 캐논이 주는 것은 **검사되지 않은 문자열**이다. `as AnyGlyphName` 은 타입만
  // 만족시키고 값은 하나도 확인하지 않는다 - 캐논에 그림 없는 이름을 한 줄
  // 넣으면 그대로 렌더까지 흘러갔다. `canonGlyph` 는 그려진 이름으로 좁히고,
  // 없으면 `sparkle` 로 떨어뜨린다.
  icon: canonGlyph(slide.icon),
  ko: { tag: slide.tag, title: slide.title, body: slide.body },
  keys: SLIDE_KEYS[index] ?? null,
}));

const AUTH_STEP = SLIDES.length;
type HandoffDestination = "/" | "/sign-up" | "/sign-in";

export default function Onboarding() {
  const { t, i18n } = useTranslation(["deepspace", "auth", "common"]);
  const ko = renderedUiLanguage(i18n) === "ko";
  // check:constraints pins the literal Korean skip label in this file; every
  // other language reads onboarding.skip.
  const skipLabel = ko ? "건너뛰기" : t("onboarding.skip");
  const { userId, loading } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  const [step, setStep] = useState(0);
  // 환영 소리(Q-261006-06)는 건너뛰기를 누른 사람에게는 내지 않는다. 건너뛰기도 같은 마지막
  // 단계로 이어지므로, 눌렀다는 사실을 따로 기억한다.
  const [skipped, setSkipped] = useState(false);

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
  if (onboardingComplete === true) return <RedirectHome />;

  // Completion is deliberately written only when a real destination is chosen.
  // Merely mounting the route, paging, or skipping to the handoff does not write.
  function finishOnboarding(destination: HandoffDestination) {
    markOnboardingComplete();
    // 누르는 순간 화면이 바뀌어 이 화면의 소리는 잘린다. 루트의 GlobalCueHost 가 끝까지 낸다.
    if (welcomeCueAllowed({ destination, skipped })) requestGlobalCue("onboardingWelcome");
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
  const slideCopy = (field: keyof SlideCopy): string =>
    ko || !slide.keys ? slide.ko[field] : t(slide.keys[field]);
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
            onPress={() => { setSkipped(true); setStep(AUTH_STEP); }}
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
          {/* The sign-up age floor is for someone about to sign up, so only a
              signed-out visitor sees it, and it is said once. The login wall
              ("/" sends signed-out users to /sign-in) means most people reach
              this slide already signed in, where it read as a second, irrelevant
              notice; and the helper line repeated the same floor (QA 261004 W-11). */}
          {userId ? null : (
            <PixelSurface
              variant="inset"
              background={m3.color.surfaceVariant}
              style={styles.ageSurface}
              contentStyle={styles.ageContent}
            >
              <PixelGlyph name="today" size={24} color={m3.color.primary} />
              <View style={styles.ageCopy}>
                <Text variant="body" style={styles.ageTitle}>{t("auth:signUp.ageNotice")}</Text>
              </View>
            </PixelSurface>
          )}
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
          <Text variant="caption" style={styles.tag}>{slideCopy("tag")}</Text>
          <Text variant="heading" style={styles.title}>{slideCopy("title")}</Text>
          <Text variant="body" style={styles.body}>{slideCopy("body")}</Text>
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
