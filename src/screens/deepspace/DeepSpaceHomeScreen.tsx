import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { SecondbHead, SecondbStatusHeader } from "@/components/deepspace";
import { colors, radius, spacing } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";

interface LensStar {
  key: string;
  top: number;
  left: number;
  size: number;
  tone: "bright" | "dim";
}

const LENS_STARS: LensStar[] = [
  { key: "possible", top: 224, left: 63, size: 10, tone: "bright" },
  { key: "recall", top: 189, left: 98, size: 10, tone: "bright" },
  { key: "values", top: 188, left: 128, size: 10, tone: "bright" },
  { key: "rhythm", top: 179, left: 167, size: 10, tone: "dim" },
  { key: "now", top: 206, left: 188, size: 9, tone: "dim" },
  { key: "relational", top: 174, left: 244, size: 10, tone: "bright" },
  { key: "seen", top: 136, left: 226, size: 10, tone: "bright" },
];

const LENS_ROUTES: Record<string, Href> = {
  now: "/big-five",
  recall: "/interview",
  seen: "/persona",
  rhythm: "/esm",
  relational: "/attachment",
  possible: "/imagine",
  values: "/audit",
};

export function DeepSpaceHomeScreen() {
  const router = useRouter();

  const openLens = (key: string) => router.push(LENS_ROUTES[key] ?? "/core-brain");
  const openPolaris = () => router.push("/core-brain");

  return (
    <View style={styles.screen}>
      <View style={styles.phoneShadow}>
        <View style={styles.phone}>
          <View style={styles.starField} pointerEvents="none">
          <View style={[styles.microStar, styles.microStarA]} />
          <View style={[styles.microStar, styles.microStarB]} />
          <View style={[styles.microStar, styles.microStarC]} />
          <View style={[styles.microStar, styles.microStarD]} />
        </View>

        <View style={styles.statusBar}>
          <RNText style={styles.statusText}>9:41</RNText>
          <RNText style={styles.statusText}>●●● ▮</RNText>
        </View>

        <SecondbStatusHeader
          mood="positive"
          text="오늘도 왔네요. 지금의 당신이 별 7개로 빛나고 있어요."
          tip="가장 어두운 별부터 채워보면 좋아요."
        />

        <View style={styles.body}>
          <View pointerEvents="none" style={styles.constellationGlow} />
          <Svg viewBox="0 0 320 248" width="320" height="248" style={styles.constellationLines} pointerEvents="none">
            <Line x1="226" y1="136" x2="140" y2="30" stroke={colors.soulLine} strokeWidth="1" strokeDasharray="2 5" />
            <Polyline
              points="63,224 98,189 128,188 167,179"
              fill="none"
              stroke={colors.borderHi}
              strokeWidth="1"
            />
            <Polyline
              points="167,179 188,206 244,174 226,136 167,179"
              fill="none"
              stroke={colors.borderHi}
              strokeWidth="1"
            />
          </Svg>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="북극성 소울코어 열기"
            onPress={openPolaris}
            style={({ pressed }) => [styles.polaris, pressed && styles.pressed]}
          />
          <Text variant="caption" style={styles.polarisLabel}>북극성 · 소울코어</Text>

          {LENS_STARS.map((star) => (
            <Pressable
              key={star.key}
              accessibilityRole="button"
              accessibilityLabel="자기이해 렌즈 열기"
              onPress={() => openLens(star.key)}
              style={({ pressed }) => [
                styles.lensStar,
                star.tone === "bright" ? styles.lensStarBright : styles.lensStarDim,
                { top: star.top, left: star.left, width: star.size, height: star.size, borderRadius: star.size / 2 },
                pressed && styles.pressed,
              ]}
            />
          ))}

          <Text variant="subtle" style={styles.hint}>별 7개를 눌러 자기이해 렌즈를 열어보세요</Text>
        </View>
        <View style={styles.secondbHero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SecondbHead mood="positive" size={118} />
        </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 40,
    backgroundColor: colors.bgDeep,
  },
  phoneShadow: {
    width: 320,
    height: 680,
    borderRadius: radius.phone,
    shadowColor: colors.bgDeep,
    shadowOpacity: 0.6,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 30 },
    elevation: 10,
    backgroundColor: "transparent",
  },
  phone: {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: radius.phone,
    backgroundColor: colors.bgDeep,
    borderWidth: 1,
    borderColor: colors.borderHi,
  },
  starField: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  microStar: {
    position: "absolute",
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.cyanDim,
    opacity: 0.5,
  },
  microStarA: { top: 82, left: 58 },
  microStarB: { top: 95, right: 58, opacity: 0.4 },
  microStarC: { top: 176, right: 114, opacity: 0.35 },
  microStarD: { top: 204, left: 115, opacity: 0.3 },
  statusBar: {
    position: "relative",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  statusText: {
    color: colors.textMid,
    fontFamily: fontFamilies.pixelKo,
    fontSize: 11,
    lineHeight: 16,
  },
  body: {
    position: "relative",
    height: 410,
    overflow: "hidden",
  },
  constellationGlow: {
    position: "absolute",
    left: 26,
    top: 36,
    width: 268,
    height: 220,
    borderRadius: 134,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  constellationLines: {
    position: "absolute",
    top: 10,
    left: 0,
  },
  polaris: {
    position: "absolute",
    top: 20,
    left: 120,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.soul,
    borderWidth: 1,
    borderColor: colors.soulLine,
    shadowColor: colors.soul,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  polarisLabel: {
    position: "absolute",
    top: 58,
    left: 0,
    width: "100%",
    textAlign: "center",
    color: colors.soul,
    opacity: 0.7,
    fontSize: 10,
  },
  lensStar: {
    position: "absolute",
    borderWidth: 0,
    shadowColor: colors.cyanBright,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  lensStarBright: {
    backgroundColor: colors.cyanSoft,
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  lensStarDim: {
    backgroundColor: colors.cyanDim,
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  hint: {
    position: "absolute",
    bottom: 14,
    left: 20,
    right: 20,
    textAlign: "center",
    color: colors.cyanBright,
    opacity: 0.5,
    fontSize: 11,
  },
  secondbHero: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.sm,
  },
});
