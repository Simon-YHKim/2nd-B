// DeepSpaceHomeScreen — clone of sb-home.jsx ConstellationHome inside the shared
// PhoneShell (variant="immersive"). Layout INTENT is reproduced with flex/% (not
// the prototype's literal px): 북극성 + 북두칠성 7 도메인 별 on a 280×230 viewBox
// (STARS coords), the dipper STAR_LINES + dashed POLARIS_GUIDE, then the big
// touch-tracking 세컨비 머리 and its speech bubble below. All copy is verbatim.
//
// Values (coords, gradients, glow, radii, copy) are pulled 1:1 from the
// reference source — never generic M3 — and expressed through m3.* tokens.

import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { SecondbHead } from "@/components/deepspace";
import { PhoneShell, SbIcon } from "@/components/deepspace/shell";
import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";

// sb-data.jsx STARS (coords on a 280×230 viewBox). polaris = layer C output
// (violet, dominant); the rest = layer A 7 domain stars (cyan). Labels follow
// the canonical 7 도메인 (커리어·재정·관계·성장·건강·휴식·담아내기) — the "Soul Core"
// name is dropped: the root is simply 북극성.
interface HomeStar {
  id: string;
  x: number;
  y: number;
  label: string;
  big?: boolean;
  level?: number;
}
const STARS: HomeStar[] = [
  { id: "polaris", x: 140, y: -16, label: "북극성", big: true },
  { id: "career", x: 228, y: 90, label: "커리어", level: 3 },
  { id: "finance", x: 230, y: 131, label: "재정", level: 2 },
  { id: "relation", x: 174, y: 152, label: "관계", level: 3 },
  { id: "growth", x: 151, y: 126, label: "성장", level: 3 },
  { id: "health", x: 108, y: 135, label: "건강", level: 2 },
  { id: "leisure", x: 76, y: 143, label: "휴식", level: 2 },
  { id: "collect", x: 50, y: 187, label: "담아내기", level: 4 },
];

// sb-data.jsx STAR_LINES (dipper bowl + handle) and POLARIS_GUIDE (pointer).
const STAR_LINES = ["M228,90 L230,131 L174,152 L151,126 Z", "M151,126 L108,135 L76,143 L50,187"];
const POLARIS_GUIDE = "M230,131 L228,90 L140,-16";

const VBW = 280;
const VBH = 230;
const DOT = 12;
const BIG_DOT = 18;

// sb-home starOpacity: big -> 1, else 0.36 + level/5 * 0.64.
function starOpacity(s: HomeStar): number {
  if (s.big) return 1;
  const lv = s.level ?? 3;
  return 0.36 + (lv / 5) * 0.64;
}

function StarDot({ star, cx, cy }: { star: HomeStar; cx: number; cy: number }) {
  const dot = star.big ? BIG_DOT : DOT;
  const gid = `star-${star.id}`;
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.dotWrap,
          {
            left: cx - dot / 2,
            top: cy - dot / 2,
            width: dot,
            height: dot,
            opacity: starOpacity(star),
            shadowColor: star.big ? m3.accent.polarisGlow : m3.accent.starCore,
            shadowRadius: star.big ? 16 : 11,
          },
        ]}
      >
        <Svg width={dot} height={dot}>
          <Defs>
            {star.big ? (
              <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={m3.accent.skyStarWhite} />
                <Stop offset="0.48" stopColor={m3.accent.polarisSoft} />
                <Stop offset="0.84" stopColor={m3.accent.moodNeutral} />
              </RadialGradient>
            ) : (
              <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={m3.accent.star} />
                <Stop offset="0.72" stopColor={m3.accent.starCore} />
              </RadialGradient>
            )}
          </Defs>
          <Circle cx={dot / 2} cy={dot / 2} r={dot / 2} fill={`url(#${gid})`} />
        </Svg>
      </View>
      <Text
        pointerEvents="none"
        numberOfLines={1}
        style={[
          styles.starLabel,
          {
            left: cx - 40,
            top: cy + dot / 2 + 8,
            color: star.big ? withAlpha(m3.accent.polarisSoft, 0.92) : withAlpha(m3.accent.starLabel, 0.78),
          },
        ]}
      >
        {star.label}
      </Text>
    </>
  );
}

export function DeepSpaceHomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const boxW = Math.min(width - 20, 400);
  const boxH = boxW * (VBH / VBW);
  const sx = boxW / VBW;
  const sy = boxH / VBH;

  return (
    <PhoneShell variant="immersive" activeNav="home">
      <View style={styles.stage}>
        {/* deep-space neural field — radial stage glow + vignette (sb-home bg) */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="home-stage" cx="50%" cy="26%" r="80%">
              <Stop offset="0" stopColor={m3.accent.stageGlow} stopOpacity={0.5} />
              <Stop offset="0.42" stopColor={m3.accent.skySurface} stopOpacity={0.3} />
              <Stop offset="0.76" stopColor={m3.accent.stageFloor} stopOpacity={1} />
            </RadialGradient>
            <RadialGradient id="home-vignette" cx="50%" cy="30%" r="75%">
              <Stop offset="0.4" stopColor={m3.accent.stageFloor} stopOpacity={0} />
              <Stop offset="0.72" stopColor={m3.accent.stageFloor} stopOpacity={0.3} />
              <Stop offset="1" stopColor={m3.accent.stageFloor} stopOpacity={0.62} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={m3.accent.stageFloor} />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#home-stage)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#home-vignette)" />
        </Svg>

        {/* home inbox bell — top-left, alert dot; no stray back button, no 9:41 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="알림"
          style={styles.bell}
          onPress={() => router.push("/inbox")}
        >
          <SbIcon name="notifications" size={20} color={m3.accent.bellGlyph} />
          <View style={styles.bellDot} />
        </Pressable>

        {/* constellation region */}
        <View style={styles.constellationRegion}>
          <View style={{ width: boxW, height: boxH }}>
            <Svg
              width={boxW}
              height={boxH}
              viewBox={`0 0 ${VBW} ${VBH}`}
              preserveAspectRatio="none"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              {STAR_LINES.map((d, i) => (
                <Path key={i} d={d} fill="none" stroke={withAlpha(m3.accent.dipperLine, 0.34)} strokeWidth={1.2} strokeLinejoin="round" />
              ))}
              <Path d={POLARIS_GUIDE} fill="none" stroke={withAlpha(m3.accent.moodNeutral, 0.45)} strokeWidth={1} strokeDasharray="2 5" />
            </Svg>
            {STARS.map((s) => (
              <StarDot key={s.id} star={s} cx={s.x * sx} cy={s.y * sy} />
            ))}
          </View>
        </View>

        {/* head + speech bubble */}
        <View style={styles.headRegion}>
          <SecondbHead mood="neutral" size={160} accessibilityLabel="세컨비" />
          <View style={styles.bubble}>
            <View style={styles.caret} />
            <Text style={styles.eyebrow}>소개</Text>
            <Text style={styles.bubbleBody}>안녕하세요, 저는 세컨비예요. 머리를 누르면 도와드릴게요.</Text>
          </View>
        </View>
      </View>
    </PhoneShell>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, minHeight: 0, paddingTop: 44 },
  bell: {
    position: "absolute",
    top: 48,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: m3.shape.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(m3.accent.bellSurface, 0.7),
    zIndex: 8,
  },
  bellDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: m3.accent.alertDot,
    shadowColor: m3.accent.alertDot,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  constellationRegion: { flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", paddingTop: 84 },
  dotWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  starLabel: {
    position: "absolute",
    width: 80,
    textAlign: "center",
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.2,
    fontFamily: m3.font.plain,
  },
  headRegion: { flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  bubble: {
    marginTop: 10,
    maxWidth: 268,
    width: "100%",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: withAlpha(m3.accent.starCore, 0.34),
    backgroundColor: withAlpha(m3.accent.bubbleSurface, 0.95),
    alignItems: "center",
  },
  caret: {
    position: "absolute",
    top: -7,
    width: 12,
    height: 12,
    transform: [{ rotate: "45deg" }],
    backgroundColor: withAlpha(m3.accent.bubbleSurface, 0.95),
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: withAlpha(m3.accent.starCore, 0.34),
  },
  eyebrow: {
    fontFamily: m3.font.mono,
    fontSize: 9,
    letterSpacing: 1.3,
    marginBottom: 6,
    color: withAlpha(m3.accent.moodNeutral, 0.9),
  },
  bubbleBody: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
    color: m3.accent.bubbleText,
    fontFamily: m3.font.plain,
  },
});
