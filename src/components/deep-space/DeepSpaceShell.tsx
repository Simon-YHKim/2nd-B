/**
 * O-23 Stage② — deep-space home shell skeleton (D-23 architecture C).
 *
 * Rendered only when EXPO_PUBLIC_UI=deep-space; the legacy gameboy track is
 * untouched. This is the VISUAL skeleton: the character (static fallback image
 * per D-23 — r3f/expo-gl is a later, perf-gated upgrade) on the deep-space body,
 * a speech bubble, and the four primary menu entries (D-22 IA). Real routing into
 * the existing 40 expo-router screens is wired in Stage③ (the deep-space shell
 * becomes the router home + the nav contract / deeplinks get documented + E2E'd);
 * for now the menu gives honest "coming next" feedback so nothing reads as broken.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";

import { deepSpace } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { loadStarLevels } from "@/lib/persona/load-star-levels";
import { SELF_UNDERSTANDING_STARS } from "@/lib/persona/stars";

const CHARACTER = require("../../../assets/deep-space/character-front.png");

// O-23 Stage③: the 4 primaries route into the existing screens (graph -> the
// shared /graph route; the rest to their own routes). See nav contract.
const PRIMARY: { key: string; ko: string; en: string; route: Href }[] = [
  { key: "graph", ko: "그래프", en: "graph", route: "/graph" },
  { key: "capture", ko: "담기", en: "capture", route: "/capture" },
  { key: "secondb", ko: "세컨비", en: "secondb", route: "/secondb" },
  { key: "profile", ko: "나", en: "profile", route: "/profile" },
];

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function DeepSpaceShell() {
  // O-23 Stage⑤ (F2/F3): the shell speaks the user's locale — non-Korean users get
  // a readable CTA + menu instead of hardcoded Korean (persona-sim culture-axis gap).
  const { i18n } = useTranslation();
  const isKo = i18n.language === "ko";
  const { userId } = useAuth();
  const [brightness, setBrightness] = useState<{ pct: number; lit: number } | null>(null);
  const profileLabel = isKo ? "나 · 프로필" : "Me · profile";
  const settingsLabel = isKo ? "설정" : "Settings";
  const characterLabel = isKo ? "세컨드 브레인 캐릭터" : "Second Brain character";
  useEffect(() => {
    if (!userId) return;
    let active = true;
    // Cheap, no-Gemini path so the home shows Soul Core brightness on mount.
    loadStarLevels(userId)
      .then(({ starLevels, soulCoreBrightness }) => {
        if (!active) return;
        const lit = SELF_UNDERSTANDING_STARS.filter((s) => starLevels[s.id] >= 2).length;
        setBrightness({ pct: Math.round(soulCoreBrightness * 100), lit });
      })
      .catch(() => {
        // Offline / no data yet: leave the indicator hidden rather than error.
      });
    return () => {
      active = false;
    };
  }, [userId]);
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {/* O-23 Stage③ finish: head-right icons (D-22 nav). Settings is an icon, not
          a tab — this is the only entry point for /settings from the shell. */}
      <View style={styles.icons}>
        <Pressable
          style={({ pressed }) => [styles.icon, pressed && styles.iconPressed]}
          onPress={() => router.push("/profile")}
          accessibilityRole="button"
          accessibilityLabel={profileLabel}
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
          <Text style={styles.iconGlyph}>⚙</Text>
        </Pressable>
      </View>
      <View style={styles.stage}>
        <Image
          source={CHARACTER}
          style={styles.character}
          contentFit="contain"
          // expo-image (not RN Image) + memory-disk cache keeps the 860KB hero off
          // the OOM path the QA backlog flagged for hi-res RN Image.
          cachePolicy="memory-disk"
          accessibilityLabel={characterLabel}
        />

        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>
            {isKo ? "무엇을 기록해볼까?" : "What would you like to note?"}
          </Text>
        </View>

        {brightness ? (
          <Text style={styles.brightness}>
            {isKo
              ? `소울 코어 밝기 ${brightness.pct}% · 별 ${brightness.lit}/7 켜짐`
              : `Soul Core ${brightness.pct}% · ${brightness.lit}/7 stars lit`}
          </Text>
        ) : null}

        <View style={styles.menu}>
          {PRIMARY.map((item) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => router.push(item.route)}
              accessibilityRole="button"
              accessibilityLabel={isKo ? item.ko : titleCase(item.en)}
            >
              <Text style={styles.itemKo}>{isKo ? item.ko : titleCase(item.en)}</Text>
              {isKo ? <Text style={styles.itemEn}>{item.en}</Text> : null}
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
  iconPressed: { borderColor: deepSpace.accent, backgroundColor: "rgba(70,182,255,0.12)" },
  iconGlyph: { color: deepSpace.text, fontSize: 17 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  character: { width: 260, height: 260, marginBottom: 18 },
  bubble: {
    maxWidth: 320,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    marginBottom: 26,
  },
  bubbleText: { color: deepSpace.text, fontSize: 14, textAlign: "center" },
  brightness: { color: deepSpace.textMuted, fontSize: 12, textAlign: "center", marginBottom: 20 },
  menu: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  item: {
    minWidth: 120,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    alignItems: "center",
  },
  itemPressed: { borderColor: deepSpace.accent, backgroundColor: "rgba(70,182,255,0.12)" },
  itemKo: { color: deepSpace.text, fontSize: 15, marginBottom: 2 },
  itemEn: { color: deepSpace.textMuted, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" },
});
