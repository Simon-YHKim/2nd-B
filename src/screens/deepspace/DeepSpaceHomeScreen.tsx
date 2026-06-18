import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";

import { SecondbStatusHeader } from "@/components/deepspace";
import { colors, radius } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";

interface LensStar {
  key: string;
  top: number;
  left: number;
  size: number;
  tone: "bright" | "dim";
}

const LENS_STARS: LensStar[] = [
  { key: "now", top: 78, left: 70, size: 14, tone: "bright" },
  { key: "recall", top: 112, left: 88, size: 13, tone: "bright" },
  { key: "seen", top: 144, left: 113, size: 13, tone: "bright" },
  { key: "rhythm", top: 144, left: 124, size: 11, tone: "dim" },
  { key: "relational", top: 204, left: 63, size: 12, tone: "dim" },
  { key: "possible", top: 226, left: 104, size: 13, tone: "bright" },
  { key: "values", top: 204, left: 144, size: 12, tone: "dim" },
];

export function DeepSpaceHomeScreen() {
  const router = useRouter();

  const openLens = () => router.push("/core-brain");
  const openPolaris = () => router.push("/iden");

  return (
    <View style={styles.screen}>
      <View style={styles.phone}>
        <View style={styles.starField} pointerEvents="none">
          <View style={[styles.microStar, styles.microStarA]} />
          <View style={[styles.microStar, styles.microStarB]} />
          <View style={[styles.microStar, styles.microStarC]} />
          <View style={[styles.microStar, styles.microStarD]} />
        </View>

        <View style={styles.statusBar}>
          <Text style={styles.statusText}>9:41</Text>
          <Text style={styles.statusText}>●●● ▮</Text>
        </View>

        <SecondbStatusHeader
          mood="positive"
          text="오늘도 왔네요. 지금의 당신이 별 7개로 빛나고 있어요."
          tip="가장 어두운 별부터 채워보면 좋아요."
        />

        <View style={styles.body}>
          <Svg viewBox="0 0 320 300" width="320" height="300" style={styles.constellationLines} pointerEvents="none">
            <Line x1="160" y1="40" x2="120" y2="150" stroke={colors.soulLine} strokeWidth="1" strokeDasharray="3 4" />
            <Polyline
              points="70,210 110,232 150,210 130,150 120,150 95,120 78,86"
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
          <Text style={styles.polarisLabel}>북극성 · 소울코어</Text>

          {LENS_STARS.map((star) => (
            <Pressable
              key={star.key}
              accessibilityRole="button"
              accessibilityLabel="자기이해 렌즈 열기"
              onPress={openLens}
              style={({ pressed }) => [
                styles.lensStar,
                star.tone === "bright" ? styles.lensStarBright : styles.lensStarDim,
                { top: star.top, left: star.left, width: star.size, height: star.size, borderRadius: star.size / 2 },
                pressed && styles.pressed,
              ]}
            />
          ))}

          <Text style={styles.hint}>별 7개를 눌러 자기이해 렌즈를 열어보세요</Text>
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
  phone: {
    position: "relative",
    width: 320,
    height: 680,
    overflow: "hidden",
    borderRadius: radius.phone,
    backgroundColor: colors.bgDeep,
    borderWidth: 1,
    borderColor: colors.borderHi,
    shadowColor: colors.bgDeep,
    shadowOpacity: 0.6,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 30 },
    elevation: 10,
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
    height: 482,
    overflow: "hidden",
  },
  constellationLines: {
    position: "absolute",
    top: 6,
    left: 0,
  },
  polaris: {
    position: "absolute",
    top: 26,
    left: 144,
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
    top: 60,
    left: 0,
    width: "100%",
    textAlign: "center",
    color: colors.soul,
    opacity: 0.7,
    fontFamily: fontFamilies.pixelKo,
    fontSize: 10,
    lineHeight: 15,
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
    fontFamily: fontFamilies.readable,
    fontSize: 11,
    lineHeight: 16,
  },
});
