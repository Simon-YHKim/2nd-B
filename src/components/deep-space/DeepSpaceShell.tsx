/**
 * O-23 Stage② — deep-space home shell (D-23 architecture C); Phase C hero pass.
 *
 * Rendered only when EXPO_PUBLIC_UI=deep-space; the legacy gameboy track is
 * untouched. The HERO is now the constellation progress: a Tier-1 Soul Core orb
 * whose brightness IS the seven-star aggregate, with a "N/7 lit · next: <cheapest
 * step>" nudge and a single filled CTA into the cheapest activation engine. The
 * character recedes to a supporting sprite (D-23 static fallback — r3f/expo-gl is
 * a later, perf-gated upgrade). SecondB (the path to the conversion trigger) is
 * promoted out of the secondary grid; graph / capture / profile recede. One
 * message + one graphic per screen (Simon standing rule).
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router, type Href } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { deepSpace } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { loadStarLevels } from "@/lib/persona/load-star-levels";
import { SELF_UNDERSTANDING_STARS, type StarId } from "@/lib/persona/stars";
import type { LadderLevel } from "@/lib/persona/brightness";
import { nextActivationStep } from "../../lib/persona/next-step";
import { isCharacterFallback } from "../../lib/ui-mode";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { useOnboardingComplete } from "@/lib/onboarding/state";

const CHARACTER = require("../../../assets/deep-space/character-front.png");

// DEFERRED (AG task): downscaled assets/deep-space/character-front@low.png ~320px
// to serve the low-end fallback render box (132px) without decoding the 860KB hero.

// The receding secondary routes (D-22 IA). SecondB is lifted OUT of this grid and
// promoted below the hero, because it is the path to the conversion trigger.
const SECONDARY: { key: "graph" | "capture" | "profile"; route: Href }[] = [
  { key: "graph", route: "/graph" },
  { key: "capture", route: "/capture" },
  { key: "profile", route: "/profile" },
];

export function DeepSpaceShell() {
  // O-23 Stage⑤ (F2/F3) + Phase C: the shell speaks the user's locale via the
  // `home` namespace — no hardcoded Korean (persona-sim culture-axis gap).
  const { t, i18n } = useTranslation("home");
  const isKo = i18n.language === "ko";
  const { userId, hasProfile, loading } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  const [brightness, setBrightness] = useState<{
    pct: number;
    lit: number;
    starLevels: Record<StarId, LadderLevel>;
  } | null>(null);
  // Settings has no `home` key (it is not part of the activation funnel), so it
  // stays an inline locale label.
  const settingsLabel = isKo ? "설정" : "Settings";
  useEffect(() => {
    if (!userId) return;
    let active = true;
    // Cheap, no-Gemini path so the home shows Soul Core brightness on mount.
    loadStarLevels(userId)
      .then(({ starLevels, soulCoreBrightness }) => {
        if (!active) return;
        const lit = SELF_UNDERSTANDING_STARS.filter((s) => starLevels[s.id] >= 2).length;
        setBrightness({ pct: Math.round(soulCoreBrightness * 100), lit, starLevels });
      })
      .catch(() => {
        // Offline / no data yet: leave the indicator hidden rather than error.
      });
    return () => {
      active = false;
    };
  }, [userId]);

  // O-31 Stage3: the deep-space shell is a post-auth home — gate logged-out or
  // incomplete users to the correct entry instead of rendering home to them
  // (AG QA finding: deep-space bypassed the unauthenticated gate). These early
  // returns run AFTER the hooks above, so hook order stays stable.
  if (loading) return <InlineLoader />;
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (onboardingComplete === null) return <InlineLoader />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;

  const lowEnd = isCharacterFallback();
  // Tier-1 hero brightness: a dim core still reads (floor 0.25) so the orb never
  // vanishes before any data lands.
  const orbOpacity = brightness ? Math.max(0.25, brightness.pct / 100) : 0.25;
  // The cheapest next step to light a star, from the deterministic helper.
  const step = brightness ? nextActivationStep(brightness.starLevels) : null;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* O-23 Stage③ finish: head-right icons (D-22 nav). Settings is an icon, not
          a tab — this is the only entry point for /settings from the shell. */}
      <View style={styles.icons}>
        <Pressable
          style={({ pressed }) => [styles.icon, pressed && styles.iconPressed]}
          onPress={() => router.push("/profile")}
          accessibilityRole="button"
          accessibilityLabel={t("menu.profile")}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Circle cx={12} cy={8} r={4} fill={deepSpace.text} />
            <Path d="M4 20.5c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z" fill={deepSpace.text} />
          </Svg>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.icon, pressed && styles.iconPressed]}
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel={settingsLabel}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58ZM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z"
              fill={deepSpace.text}
            />
          </Svg>
        </Pressable>
      </View>

      <View style={styles.stage}>
        {/* HERO (Tier-1): the Soul Core orb. Its brightness IS the seven-star
            aggregate — the dominant graphic, 128px, max glow. */}
        <View style={styles.heroCore} accessibilityLabel={t("soulCore.a11y")}>
          <Svg width={128} height={128} viewBox="0 0 128 128">
            <Circle cx={64} cy={64} r={48} fill={deepSpace.accent} opacity={orbOpacity * 0.5} />
            <Circle cx={64} cy={64} r={30} fill={deepSpace.accentBright} opacity={orbOpacity} />
          </Svg>
        </View>

        {brightness ? (
          <Text style={[styles.litLine, { color: deepSpace.text }]}>
            {t("progress.lit", { lit: brightness.lit, total: 7 })}
            {step
              ? "  ·  " +
                t("progress.next", {
                  step: t("nextStep." + step.key + ".label"),
                  min: t("nextStep." + step.key + ".min"),
                })
              : ""}
          </Text>
        ) : null}

        {/* Supporting sprite — recedes behind the hero. 200px (132px low-end). */}
        <Image
          source={CHARACTER}
          style={[styles.character, lowEnd && styles.characterLow]}
          contentFit="contain"
          // expo-image (not RN Image) + memory-disk cache keeps the 860KB hero off
          // the OOM path the QA backlog flagged for hi-res RN Image.
          cachePolicy="memory-disk"
          accessibilityLabel={t("character.a11y")}
        />

        {/* The first-run lure: the bubble appears only when nothing is lit yet,
            then yields to the progress line + CTA once a star is on. */}
        {brightness?.lit === 0 ? (
          <View style={styles.bubble}>
            <Text style={[styles.bubbleText, { color: deepSpace.text }]}>{t("bubble.fresh")}</Text>
          </View>
        ) : null}

        {/* Primary CTA: the single filled tappable into the cheapest activation
            engine. Hidden once every offerable star is lit. */}
        {step ? (
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={() => router.push(step.route)}
            accessibilityRole="button"
            accessibilityLabel={t("nextStep." + step.key + ".cta")}
          >
            <Text style={[styles.ctaText, { color: deepSpace.bg }]}>
              {t("nextStep." + step.key + ".cta")}
            </Text>
          </Pressable>
        ) : null}

        {/* Promoted: SecondB is the path to the conversion trigger. */}
        <Pressable
          style={({ pressed }) => [styles.secondb, pressed && styles.secondbPressed]}
          onPress={() => router.push("/secondb")}
          accessibilityRole="button"
          accessibilityLabel={t("menu.secondb")}
        >
          <Text style={[styles.secondbText, { color: deepSpace.text }]}>{t("menu.secondb")}</Text>
        </Pressable>

        {/* Receding secondary routes. */}
        <View style={styles.menu}>
          {SECONDARY.map((item) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => router.push(item.route)}
              accessibilityRole="button"
              accessibilityLabel={t("menu." + item.key)}
            >
              <Text style={[styles.itemText, { color: deepSpace.textMuted }]}>
                {t("menu." + item.key)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: deepSpace.bg },
  icons: { position: "absolute", top: 0, right: 18, zIndex: 2, flexDirection: "row", gap: 10, paddingTop: 12 },
  icon: {
    width: 44, // O-23 Stage⑤ (F1): >= 44px touch target (persona-sim a11y)
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPressed: { borderColor: deepSpace.accent, backgroundColor: deepSpace.cardPressed },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  heroCore: { width: 128, height: 128, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  litLine: { textAlign: "center", marginBottom: 16, fontSize: 14 },
  character: { width: 200, height: 200, marginBottom: 18 },
  characterLow: { width: 132, height: 132 },
  bubble: {
    maxWidth: 320,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    marginBottom: 20,
  },
  bubbleText: { textAlign: "center" },
  cta: {
    minWidth: 220,
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: deepSpace.accentBright,
    alignItems: "center",
    marginBottom: 18,
  },
  ctaPressed: { backgroundColor: deepSpace.accent },
  ctaText: { fontWeight: "700", textAlign: "center" },
  secondb: {
    minWidth: 220,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: deepSpace.accent,
    backgroundColor: deepSpace.card,
    alignItems: "center",
    marginBottom: 22,
  },
  secondbPressed: { backgroundColor: deepSpace.cardPressed },
  secondbText: { fontWeight: "600", textAlign: "center" },
  menu: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  item: {
    minWidth: 96,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    alignItems: "center",
  },
  itemPressed: { borderColor: deepSpace.accent, backgroundColor: deepSpace.cardPressed },
  itemText: { fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase" },
});
