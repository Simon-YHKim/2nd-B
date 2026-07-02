// Cosmic Pixel Graph Village — premium background + app shell (Part 1).
//
// Deep cosmic navy with a violet core glow up top, a mint glow lower down,
// and a subtle, static star grain. Built with react-native-svg so it renders
// identically on native + web with no extra bundler config, and stays still
// (reduced-motion safe — no twinkle). The graph village background stays dark
// in every theme mode (constraint #4), so these read from `cosmic.*`
// directly rather than the theme palette.

import { useEffect, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname } from "expo-router";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop, Circle, Line } from "react-native-svg";
import ReAnimated, {
  cancelAnimation,
  Easing as ReEasing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { cosmic, deepSpace, spacing } from "@/lib/theme/tokens";
import { ForceDark } from "@/lib/theme/ThemeContext";
import { useConstellation } from "@/lib/constellation/useConstellation";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { backArrowVisible, isTabPath } from "@/components/ui/BackArrow";
import { TAB_BAR_HEIGHT } from "./tab-bar";
import { starField } from "./star-field";

/** Subtle static star grain, sized to the given box. Decorative. */
export function StarNoiseLayer({ width, height, count = 64 }: { width: number; height: number; count?: number }) {
  const stars = starField(width, height, count);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={cosmic.moonWhite} opacity={s.opacity} />
      ))}
    </Svg>
  );
}

// ─── Self-understanding constellation (북두칠성) ──────────────────────
// The Big Dipper drawn in the upper region as a low-priority ambient layer:
// it sits behind 세컨비 and all content (constraint: lower visual priority than
// content). Seven stars map 1:1 to the seven self-understanding stages; a star
// lights when ITS stage is done (per-stage, see selector.ts). Coordinates are
// authored in a 510×900 design box and scaled to the live viewport, anchored to
// the top so the dipper reads as sky above the content lane.

interface DipperPoint {
  name: string;
  x: number;
  y: number;
  r: number;
}

const DIPPER_BOX = { w: 510, h: 900 } as const;

// Handle → bowl order, 1:1 with selector.ts STAGES.
const DIPPER_POINTS: DipperPoint[] = [
  { name: "Alkaid", x: 126, y: 137, r: 3.2 },
  { name: "Mizar", x: 166, y: 107, r: 3.6 },
  { name: "Alioth", x: 210, y: 92, r: 3.4 },
  { name: "Megrez", x: 252, y: 116, r: 3.1 },
  { name: "Phecda", x: 262, y: 165, r: 3.1 },
  { name: "Merak", x: 326, y: 179, r: 3.5 },
  { name: "Dubhe", x: 342, y: 124, r: 3.8 },
];

// Star-index pairs forming the dipper outline. Static — drawn once, never
// recomputed per frame (no O(n²) neighbour search; native-friendly).
const DIPPER_LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 3],
];

// Alcor — the faint companion beside Mizar (double star). Decorative only.
const ALCOR: DipperPoint = { name: "Alcor", x: 174, y: 101, r: 1.35 };

// Animate the additive glow GROUP's opacity (one shared "breath") via a
// reanimated View wrapping an Svg — avoids per-star animated SVG props and the
// associated Hermes/native-prop surface area.
const AnimatedG = ReAnimated.View;

/**
 * Big Dipper background layer. Subscribes to the user's constellation state and
 * lights each star from its own stage's done flag. Dim stars use `mistGray`;
 * lit stars use the deep-space cyan accent + an additive radial glow. Signed
 * out / offline resolves to all-dim outlines — the layer never blanks.
 *
 * Motion: a single shared "ambient" opacity gently breathes the glow group
 * (one looped timing, not per-star); reduced-motion pins it static. Stars and
 * edges themselves are static geometry.
 */
export function ConstellationLayer({ width, height }: { width: number; height: number }) {
  const { state } = useConstellation();
  const reduced = useReducedMotionPref();

  // Uniform scale that fits the 510×900 design box into the viewport, anchored
  // to the top so the dipper sits in the upper sky. The box is taller than wide,
  // so width is the binding constraint on phones — scale by width and let the
  // (top-anchored) extra height fall below the dipper, off the drawn region.
  const scale = width / DIPPER_BOX.w;
  const ox = 0;
  const oy = 0;
  const px = (x: number) => ox + x * scale;
  const py = (y: number) => oy + y * scale;
  const pr = (r: number) => r * scale;

  // One ambient breath shared by the whole glow group. Static when reduced.
  const breath = useSharedValue(reduced ? 1 : 0.78);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(breath);
      breath.value = 1;
      return;
    }
    // Slow, low-frequency pulse — sky ambience, not a UI tell. Soft ease only.
    breath.value = withRepeat(
      withTiming(1, { duration: 3200, easing: ReEasing.inOut(ReEasing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [reduced, breath]);

  const glowAnimStyle = useAnimatedStyle(() => ({ opacity: breath.value }));

  const litByStar = new Map<string, boolean>();
  for (const s of state.stages) litByStar.set(s.star, s.done);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Static layer: edges + star cores (no animation, drawn once). */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Edges: lit when BOTH endpoints are lit, else dim. Static geometry. */}
        {DIPPER_LINKS.map(([a, b], i) => {
          const pa = DIPPER_POINTS[a];
          const pb = DIPPER_POINTS[b];
          const lit = (litByStar.get(pa.name) ?? false) && (litByStar.get(pb.name) ?? false);
          return (
            <Line
              key={`e${i}`}
              x1={px(pa.x)}
              y1={py(pa.y)}
              x2={px(pb.x)}
              y2={py(pb.y)}
              stroke={lit ? deepSpace.accent : cosmic.lineDim}
              strokeWidth={lit ? pr(1.1) : pr(0.5)}
              strokeOpacity={lit ? 0.5 : 0.22}
              strokeLinecap="round"
            />
          );
        })}

        {/* Star cores. */}
        {DIPPER_POINTS.map((p, i) => {
          const lit = litByStar.get(p.name) ?? false;
          return (
            <Circle
              key={`c${i}`}
              cx={px(p.x)}
              cy={py(p.y)}
              r={pr(p.r) * (lit ? 0.82 : 0.5)}
              fill={lit ? deepSpace.accentBright : cosmic.mistGray}
              fillOpacity={lit ? 0.8 : 0.32}
            />
          );
        })}

        {/* Alcor companion — always faint, decorative. */}
        <Circle
          cx={px(ALCOR.x)}
          cy={py(ALCOR.y)}
          r={pr(ALCOR.r)}
          fill={cosmic.moonWhite}
          fillOpacity={0.2}
        />
      </Svg>

      {/* Additive glow group — the only animated piece (one shared breath).
          The gradient Defs live INSIDE this Svg: react-native-svg only resolves
          url(#id) within the same Svg root, so the glow circles and their
          gradients must share this tree (not the static one above). */}
      <AnimatedG style={[StyleSheet.absoluteFill, glowAnimStyle]} pointerEvents="none">
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            {DIPPER_POINTS.map((p, i) => {
              const lit = litByStar.get(p.name) ?? false;
              const glowColor = lit ? deepSpace.accent : cosmic.mistGray;
              return (
                <RadialGradient key={`g${i}`} id={`starGlow${i}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={lit ? deepSpace.accentBright : cosmic.mistGray} stopOpacity={lit ? 0.5 : 0.1} />
                  <Stop offset="0.4" stopColor={glowColor} stopOpacity={lit ? 0.28 : 0.05} />
                  <Stop offset="1" stopColor={glowColor} stopOpacity="0" />
                </RadialGradient>
              );
            })}
          </Defs>
          {DIPPER_POINTS.map((p, i) => {
            const lit = litByStar.get(p.name) ?? false;
            const glow = pr(p.r) * (lit ? 5 : 2.4);
            return (
              <Circle
                key={`gl${i}`}
                cx={px(p.x)}
                cy={py(p.y)}
                r={glow}
                fill={`url(#starGlow${i})`}
              />
            );
          })}
        </Svg>
      </AnimatedG>
    </View>
  );
}

/**
 * Full-bleed cosmic background. Place behind screen content (absolute fill).
 * `glow` toggles the violet/mint nebula glows (on by default).
 * `constellation` toggles the self-understanding Big Dipper layer (on).
 */
export function CosmicBackground({
  glow = true,
  stars = true,
  constellation = true,
}: {
  glow?: boolean;
  stars?: boolean;
  constellation?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="cosmicBg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={cosmic.space900} />
            <Stop offset="0.5" stopColor={cosmic.space950} />
            <Stop offset="1" stopColor={cosmic.space950} />
          </LinearGradient>
          <RadialGradient id="violetGlow" cx="50%" cy="22%" r="60%">
            <Stop offset="0" stopColor={cosmic.soulViolet} stopOpacity="0.22" />
            <Stop offset="1" stopColor={cosmic.soulViolet} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="mintGlow" cx="50%" cy="92%" r="55%">
            <Stop offset="0" stopColor={cosmic.signalMint} stopOpacity="0.12" />
            <Stop offset="1" stopColor={cosmic.signalMint} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#cosmicBg)" />
        {glow ? (
          <>
            <Rect x="0" y="0" width={width} height={height} fill="url(#violetGlow)" />
            <Rect x="0" y="0" width={width} height={height} fill="url(#mintGlow)" />
          </>
        ) : null}
      </Svg>
      {stars ? <StarNoiseLayer width={width} height={height} /> : null}
      {constellation ? <ConstellationLayer width={width} height={height} /> : null}
    </View>
  );
}

/**
 * Premium app shell: a dark safe-area frame with the cosmic background
 * behind the screen content. Screens supply their own ScrollView/layout.
 */
export function PremiumAppShell({
  children,
  glow = true,
  stars = true,
  constellation = true,
  padded = true,
}: {
  children: ReactNode;
  glow?: boolean;
  stars?: boolean;
  constellation?: boolean;
  padded?: boolean;
}) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // When the floating back arrow is shown it sits above the content lane;
  // reserve top padding so first headings never collide with it. This also
  // applies to tab destinations, which still render full screen titles.
  const needsArrowHeadroom = backArrowVisible(pathname);
  // Tab screens render under the absolute bottom tab bar; reserve its height so
  // a screen's last element (e.g. the 세컨비 chat composer / send button) isn't
  // hidden behind it. Applies regardless of `padded` (horizontal-only).
  const onTabBar = isTabPath(pathname);

  // Dynamic bottom padding: clears the absolute bottom tab bar, safe area bottom (insets.bottom)
  // and maintains a visual gap on Android/iOS.
  const bottomClearance = onTabBar ? TAB_BAR_HEIGHT + spacing.lg + insets.bottom : insets.bottom;

  // Dynamic top padding: states insets.top, plus optional breathing room
  const topClearance = insets.top + (padded ? spacing.sm : 0) + (padded && needsArrowHeadroom ? 60 : 0);

  return (
    <ForceDark>
      <View style={styles.root}>
        <CosmicBackground glow={glow} stars={stars} constellation={constellation} />
        <View
          style={[
            styles.safe,
            {
              paddingTop: topClearance,
              paddingBottom: bottomClearance,
            },
            padded ? styles.padded : null,
          ]}
        >
          {children}
        </View>
      </View>
    </ForceDark>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cosmic.space950 },
  safe: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg },
});
