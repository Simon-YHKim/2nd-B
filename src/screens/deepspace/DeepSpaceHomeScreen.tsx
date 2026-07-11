// DeepSpaceHomeScreen — clone of sb-home.jsx ConstellationHome inside the shared
// PhoneShell (variant="immersive"). Layout INTENT is reproduced with flex/% (not
// the prototype's literal px): 북극성 + 북두칠성 7 도메인 별 on a 280×230 viewBox
// (STARS coords), the dipper STAR_LINES + dashed POLARIS_GUIDE, then the big
// touch-tracking 세컨비 머리 and its speech bubble below. All copy is verbatim.
//
// Values (coords, gradients, glow, radii, copy) are pulled 1:1 from the
// reference source — never generic M3 — and expressed through m3.* tokens.
//
// Interactions (canonical wiring, same targets as deep-space/DeepSpaceShell):
//   · domain star → /records?tags=domain:<slug> (the 리스트업 view)
//   · 북극성 → /core-brain · head tap → 챗봇/비서 menu (sb-home HeadBubble)
//   · star brightness ← loadDomainLevels (no-LLM coverage path), gated on the
//     session restore like DeepSpaceShell (deep-space-shell-brightness-gate).

import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { SecondbHead } from "@/components/deepspace";
import { PhoneShell, SbIcon } from "@/components/deepspace/shell";
import { useAuth } from "@/lib/auth/AuthContext";
import { loadDomainLevels } from "@/lib/persona/load-domain-levels";
import { type DomainId } from "@/lib/persona/domain-stars";
import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";

// sb-data.jsx STARS (coords on a 280×230 viewBox). polaris = layer C output
// (violet, dominant); the rest = layer A 7 domain stars (cyan). Labels follow
// the canonical 7 도메인 (커리어·재정·관계·성장·건강·휴식·담아내기) — the "Soul Core"
// name is dropped: the root is simply 북극성. ids are the DomainId slugs so the
// records filter tag (domain:<slug>) matches what capture writes (휴식 =
// recreation per domain-stars.ts rev2 rename).
interface HomeStar {
  id: DomainId | "polaris";
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
  { id: "recreation", x: 76, y: 143, label: "휴식", level: 2 },
  { id: "collect", x: 50, y: 187, label: "담아내기", level: 4 },
];

// sb-data.jsx STAR_LINES (dipper bowl + handle) and POLARIS_GUIDE (pointer).
const STAR_LINES = ["M228,90 L230,131 L174,152 L151,126 Z", "M151,126 L108,135 L76,143 L50,187"];
const POLARIS_GUIDE = "M230,131 L228,90 L140,-16";

const VBW = 280;
const VBH = 230;
// Delicate stars (fidelity pass): dot core + a soft radial glow drawn INSIDE the
// SVG (no RN box-shadow, which rendered a dark rounded square behind the dot).
const DOT = 10;
const BIG_DOT = 15;
const GLOW = 26;
const BIG_GLOW = 42;
// Minimum touch target for a star (§20 UX: ≥44dp).
const HIT = 44;

// sb-home starOpacity: big -> 1, else 0.36 + level/5 * 0.64.
function starOpacity(s: HomeStar, liveLevel?: number): number {
  if (s.big) return 1;
  const lv = liveLevel ?? s.level ?? 3;
  return 0.36 + (lv / 5) * 0.64;
}

function StarDot({ star, cx, cy, liveLevel, onPress }: { star: HomeStar; cx: number; cy: number; liveLevel?: number; onPress: () => void }) {
  const dot = star.big ? BIG_DOT : DOT;
  const glow = star.big ? BIG_GLOW : GLOW;
  const core = `core-${star.id}`;
  const halo = `halo-${star.id}`;
  const glowColor = star.big ? m3.accent.polarisGlow : m3.accent.starCore;
  const c = glow / 2;
  return (
    <>
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: cx - c, top: cy - c, width: glow, height: glow, opacity: starOpacity(star, liveLevel) }}
      >
        <Svg width={glow} height={glow}>
          <Defs>
            <RadialGradient id={halo} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={glowColor} stopOpacity={star.big ? 0.85 : 0.7} />
              <Stop offset="0.4" stopColor={glowColor} stopOpacity={star.big ? 0.34 : 0.24} />
              <Stop offset="1" stopColor={glowColor} stopOpacity={0} />
            </RadialGradient>
            {star.big ? (
              <RadialGradient id={core} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={m3.accent.skyStarWhite} />
                <Stop offset="0.48" stopColor={m3.accent.polarisSoft} />
                <Stop offset="0.84" stopColor={m3.accent.moodNeutral} />
              </RadialGradient>
            ) : (
              <RadialGradient id={core} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={m3.accent.star} />
                <Stop offset="0.72" stopColor={m3.accent.starCore} />
              </RadialGradient>
            )}
          </Defs>
          <Circle cx={c} cy={c} r={c} fill={`url(#${halo})`} />
          <Circle cx={c} cy={c} r={dot / 2} fill={`url(#${core})`} />
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
      {/* bare touch surface ON TOP — visuals stay on sibling Views because
          Fabric Android drops styles handed to Pressable (PR 680 pattern). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${star.label} 별`}
        onPress={onPress}
        hitSlop={6}
        style={{ position: "absolute", left: cx - HIT / 2, top: cy - HIT / 2, width: HIT, height: HIT }}
      />
    </>
  );
}

export function DeepSpaceHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId, loading } = useAuth();
  const { width, height } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [levels, setLevels] = useState<Partial<Record<DomainId, number>> | null>(null);

  // Live brightness — same no-LLM coverage path + session-restore gate as
  // DeepSpaceShell (firing on userId alone raced the token attach at boot).
  useEffect(() => {
    if (loading || !userId) return;
    let alive = true;
    loadDomainLevels(userId)
      .then((b) => {
        if (alive) setLevels(b.domainLevels);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loading, userId]);

  // Canonical star targets (DeepSpaceShell wiring): a domain star opens that
  // domain's records (리스트업) via the domain: tag filter; 북극성 opens the
  // persona aggregate.
  const travel = (id: HomeStar["id"]) => {
    if (id === "polaris") router.push("/core-brain");
    // domain star → its rev2 11-star lens (/star/<id>), not the flat wiki list.
    else router.push(`/star/${id}`);
  };

  // Compact dipper anchored high (fidelity pass): smaller box + top-anchored so it
  // sits in the top ~45% and leaves the lower half for the head + bubble.
  const boxW = Math.min(width - 44, 330);
  const boxH = boxW * (VBH / VBW);
  const sx = boxW / VBW;
  const sy = boxH / VBH;

  return (
    <PhoneShell variant="immersive" activeNav="home">
      <View style={[styles.stage, { paddingTop: insets.top + 10 }]}>
        {/* deep-space neural field — a single FULL-BLEED radial wash + vignette.
            Sized to the window (not "100%") so react-native-svg fills edge-to-edge
            with no intrinsic-size seam. */}
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="home-stage" cx="50%" cy="24%" r="82%">
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
          <Rect x={0} y={0} width={width} height={height} fill={m3.accent.stageFloor} />
          <Rect x={0} y={0} width={width} height={height} fill="url(#home-stage)" />
          <Rect x={0} y={0} width={width} height={height} fill="url(#home-vignette)" />
        </Svg>

        {/* home inbox bell — top-left, alert dot; no stray back button, no 9:41.
            Chip visuals on the View (Fabric drops Pressable styles). */}
        <View style={[styles.bell, { top: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="알림"
            style={styles.bellPress}
            hitSlop={8}
            onPress={() => router.push("/inbox")}
          >
            <SbIcon name="notifications" size={20} color={m3.accent.bellGlyph} />
          </Pressable>
          <View pointerEvents="none" style={styles.bellDot} />
        </View>

        {/* constellation — top-anchored block */}
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
                <Path key={i} d={d} fill="none" stroke={withAlpha(m3.accent.dipperLine, 0.34)} strokeWidth={1.1} strokeLinejoin="round" />
              ))}
              <Path d={POLARIS_GUIDE} fill="none" stroke={withAlpha(m3.accent.moodNeutral, 0.45)} strokeWidth={1} strokeDasharray="2 5" />
            </Svg>
            {STARS.map((s) => (
              <StarDot
                key={s.id}
                star={s}
                cx={s.x * sx}
                cy={s.y * sy}
                liveLevel={s.id === "polaris" ? undefined : levels?.[s.id]}
                onPress={() => travel(s.id)}
              />
            ))}
          </View>
        </View>

        {/* head + speech bubble — lower ~55%. Head tap toggles the sb-home
            HeadBubble menu (챗봇 / 비서); the intro copy promises exactly this. */}
        <View style={styles.headRegion}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="세컨비에게 물어보기"
            onPress={() => setMenuOpen((v) => !v)}
            hitSlop={4}
          >
            <SecondbHead mood="neutral" size={160} accessibilityLabel="세컨비" />
          </Pressable>
          <View style={styles.bubble}>
            <View style={styles.caret} />
            <Text style={styles.eyebrow}>소개</Text>
            <Text style={styles.bubbleBody}>안녕하세요, 저는 세컨비예요. 머리를 누르면 도와드릴게요.</Text>
            {menuOpen ? (
              <View style={styles.menuRow}>
                <View style={styles.menuBtnWrap}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="챗봇"
                    hitSlop={10}
                    onPress={() => {
                      setMenuOpen(false);
                      router.push("/secondb");
                    }}
                    style={styles.menuPress}
                  >
                    <SbIcon name="forum" size={16} color={m3.color.onPrimary} />
                    <Text style={styles.menuBtnFilledText}>챗봇</Text>
                  </Pressable>
                </View>
                <View style={[styles.menuBtnWrap, styles.menuBtnTonal]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="비서"
                    hitSlop={10}
                    onPress={() => {
                      setMenuOpen(false);
                      router.push("/ops");
                    }}
                    style={styles.menuPress}
                  >
                    <SbIcon name="today" size={16} color={m3.color.onSecondaryContainer} />
                    <Text style={styles.menuBtnTonalText}>비서</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </PhoneShell>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, minHeight: 0 },
  bell: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: m3.shape.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(m3.accent.bellSurface, 0.7),
    zIndex: 8,
  },
  bellPress: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  bellDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: m3.accent.alertDot,
  },
  // Top-anchored (not flex-centered) so the dipper sits high; paddingTop matches
  // the prototype's stage offset and gives the negative-y 북극성 room to render.
  constellationRegion: { alignItems: "center", paddingTop: 84 },
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
  // Head-tap menu (sb-home HeadBubble 챗봇/비서). Visuals on wrapper Views —
  // Fabric Android drops Pressable styles (PR 680) — the Pressable stays bare.
  menuRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  menuBtnWrap: {
    borderRadius: m3.shape.full,
    backgroundColor: m3.color.primary,
    overflow: "hidden",
  },
  menuBtnTonal: { backgroundColor: m3.color.secondaryContainer },
  menuPress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 36,
  },
  menuBtnFilledText: { fontSize: 13, fontWeight: "700", color: m3.color.onPrimary, fontFamily: m3.font.plain },
  menuBtnTonalText: { fontSize: 13, fontWeight: "700", color: m3.color.onSecondaryContainer, fontFamily: m3.font.plain },
});
