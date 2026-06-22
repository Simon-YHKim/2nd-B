// ShareCard — the "자기이해 한 컷" shareable square card (deep-space canon).
//
// Two variants from design sections ③ (A insight-forward) and ④ (B
// constellation-forward). 1:1 square, dynamically generated from user data,
// captured at 1080×1080 by src/lib/share/insight-card.ts.
//
//   <ShareCard variant="A" insight="깊이 이해하고, 더 나답게 산다." handle="simon" litCount={4} />
//   <ShareCard variant="B" insight="깊이 이해하고, 더 나답게 산다." handle="simon" />
//
// Visual contract:
//   - north-star = soul-violet orb (deepSpace.soul) + concentric soft halos +
//     a small 4-point cross glint at 12 o'clock.
//   - Big-Dipper polyline of 7 stars; `litCount` are lit (accentSoft cyan with
//     halo), the rest dim (accentDim, low opacity).
//   - The card IS the explanation — minimal text. One message + one graphic.
//
// Token-only: every color comes from deepSpace.* / withAlpha — zero hex literals.
// Fonts: pixelEn for eyebrows, Pretendard (sans) for the sentence. No
// glassmorphism / pill / emoji / em-dash / bounce.

import { StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export interface ShareCardProps {
  variant: "A" | "B";
  /** The 북극성 sentence — dynamic, supplied by the caller (core-brain). */
  insight: string;
  /** Handle shown in the footer (without the @). */
  handle: string;
  /** How many of the 7 Big-Dipper stars are lit (0..7). Default 4. */
  litCount?: number;
  /** Rendered side length. Capture scales this to 1080. Default 540 (design base). */
  size?: number;
}

// The design renders A/B at a 540px base. All geometry below is expressed as a
// fraction of that base so a single `size` prop scales the whole card (and the
// off-screen capture can render at 1080 = base 540 × scale 2).
const BASE = 540;

// 7 Big-Dipper star anchors, normalized to the 540-wide overview band. The first
// four are the "bowl/handle" lit candidates; the rest recede. Geometry traced
// from design sections ③ / ④ so the polyline reads as 북두칠성.
const DIPPER_A = [
  { x: 150, y: 170 },
  { x: 196, y: 150 },
  { x: 244, y: 162 },
  { x: 286, y: 138 },
  { x: 332, y: 150 },
  { x: 372, y: 120 },
  { x: 400, y: 166 },
];
const DIPPER_B = [
  { x: 120, y: 300 },
  { x: 186, y: 268 },
  { x: 252, y: 290 },
  { x: 312, y: 250 },
  { x: 372, y: 276 },
  { x: 420, y: 228 },
  { x: 456, y: 300 },
];

interface ConstellationGeom {
  /** SVG viewBox height (width is always BASE). */
  vbHeight: number;
  /** North-star center. */
  star: { x: number; y: number };
  /** Halo radii outer→inner; last is the solid core. */
  haloRadii: number[];
  coreR: number;
  /** Cross-glint half-length + gap from core edge. */
  glint: { len: number; gap: number; width: number };
  dipper: { x: number; y: number }[];
  /** Lit / dim star radius + halo radius. */
  litR: number;
  litHaloR: number;
  dimR: number;
  lineWidth: number;
}

const GEOM: Record<"A" | "B", ConstellationGeom> = {
  // ③ compact constellation, top band.
  A: {
    vbHeight: 230,
    star: { x: 270, y: 62 },
    haloRadii: [40, 22],
    coreR: 10,
    glint: { len: 10, gap: 28, width: 1.6 },
    dipper: DIPPER_A,
    litR: 5.5,
    litHaloR: 0,
    dimR: 3,
    lineWidth: 1.4,
  },
  // ④ big constellation, centered.
  B: {
    vbHeight: 420,
    star: { x: 270, y: 96 },
    haloRadii: [70, 46, 24],
    coreR: 13,
    glint: { len: 16, gap: 40, width: 2 },
    dipper: DIPPER_B,
    litR: 9,
    litHaloR: 17,
    dimR: 4,
    lineWidth: 2,
  },
};

function Constellation({ variant, litCount }: { variant: "A" | "B"; litCount: number }) {
  const g = GEOM[variant];
  const { star } = g;
  const lit = Math.max(0, Math.min(7, litCount));
  // gap = distance from core center to where each glint arm begins (core edge + air).
  const gap = g.glint.gap;

  return (
    <Svg viewBox={`0 0 ${BASE} ${g.vbHeight}`} width="100%" height="100%">
      <Defs>
        <RadialGradient id="northHalo" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={deepSpace.soul} stopOpacity={0.34} />
          <Stop offset="100%" stopColor={deepSpace.soul} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* north-star soft halos (outer→inner) */}
      {g.haloRadii.map((r, i) => (
        <Circle
          key={`halo-${i}`}
          cx={star.x}
          cy={star.y}
          r={r}
          fill={withAlpha(deepSpace.soul, 0.12 + i * 0.07)}
        />
      ))}
      {/* solid soul core */}
      <Circle cx={star.x} cy={star.y} r={g.coreR} fill={deepSpace.soul} />

      {/* 4-point cross glint (12 o'clock anchored, all four arms) */}
      <Line
        x1={star.x}
        y1={star.y - gap}
        x2={star.x}
        y2={star.y - gap - g.glint.len}
        stroke={deepSpace.soul}
        strokeWidth={g.glint.width}
        strokeLinecap="round"
        opacity={0.85}
      />
      <Line
        x1={star.x}
        y1={star.y + gap}
        x2={star.x}
        y2={star.y + gap + g.glint.len}
        stroke={deepSpace.soul}
        strokeWidth={g.glint.width}
        strokeLinecap="round"
        opacity={0.85}
      />
      <Line
        x1={star.x - gap}
        y1={star.y}
        x2={star.x - gap - g.glint.len}
        y2={star.y}
        stroke={deepSpace.soul}
        strokeWidth={g.glint.width}
        strokeLinecap="round"
        opacity={0.85}
      />
      <Line
        x1={star.x + gap}
        y1={star.y}
        x2={star.x + gap + g.glint.len}
        y2={star.y}
        stroke={deepSpace.soul}
        strokeWidth={g.glint.width}
        strokeLinecap="round"
        opacity={0.85}
      />

      {/* Big-Dipper polyline */}
      <Polyline
        points={g.dipper.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={withAlpha(deepSpace.accentSoft, variant === "B" ? 0.3 : 0.24)}
        strokeWidth={g.lineWidth}
      />

      {/* lit-star halos first (B only) so the bright core sits on top */}
      {g.litHaloR > 0
        ? g.dipper.map((p, i) =>
            i < lit ? (
              <Circle
                key={`h-${i}`}
                cx={p.x}
                cy={p.y}
                r={g.litHaloR}
                fill={withAlpha(deepSpace.accentSoft, 0.18)}
              />
            ) : null,
          )
        : null}

      {/* 7 stars: first `lit` are lit (accentSoft), rest dim (accentDim, low opacity) */}
      {g.dipper.map((p, i) => {
        const isLit = i < lit;
        if (isLit) {
          return (
            <Circle
              key={`s-${i}`}
              cx={p.x}
              cy={p.y}
              r={g.litR}
              fill={deepSpace.accentSoft}
            />
          );
        }
        return (
          <Circle
            key={`s-${i}`}
            cx={p.x}
            cy={p.y}
            r={g.dimR}
            fill={deepSpace.accentDim}
            opacity={0.42}
          />
        );
      })}
    </Svg>
  );
}

// Background star-field dots (positions traced from the design's layered
// radial-gradient sparkle). Rendered as an SVG layer so the capture is crisp.
const FIELD_A = [
  { x: 0.14, y: 0.2, r: 1.4, c: deepSpace.accentSoft, o: 0.5 },
  { x: 0.84, y: 0.14, r: 1.2, c: deepSpace.accentSoft, o: 0.4 },
  { x: 0.7, y: 0.3, r: 1, c: deepSpace.soul, o: 0.4 },
  { x: 0.3, y: 0.72, r: 1, c: deepSpace.accentSoft, o: 0.3 },
  { x: 0.9, y: 0.6, r: 1.2, c: deepSpace.accentSoft, o: 0.3 },
];
const FIELD_B = [
  { x: 0.12, y: 0.18, r: 1.6, c: deepSpace.accentSoft, o: 0.55 },
  { x: 0.86, y: 0.22, r: 1.3, c: deepSpace.accentSoft, o: 0.45 },
  { x: 0.76, y: 0.7, r: 1.2, c: deepSpace.soul, o: 0.45 },
  { x: 0.24, y: 0.64, r: 1, c: deepSpace.accentSoft, o: 0.35 },
  { x: 0.5, y: 0.88, r: 1.4, c: deepSpace.accentSoft, o: 0.3 },
  { x: 0.18, y: 0.4, r: 1, c: deepSpace.soul, o: 0.3 },
];

function StarField({ variant, size }: { variant: "A" | "B"; size: number }) {
  const dots = variant === "A" ? FIELD_A : FIELD_B;
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox={`0 0 ${size} ${size}`}
    >
      <Defs>
        <RadialGradient
          id="bgWash"
          cx="50%"
          cy={variant === "A" ? "18%" : "42%"}
          r={variant === "A" ? "90%" : "100%"}
        >
          <Stop offset="0%" stopColor={deepSpace.soul} stopOpacity={variant === "A" ? 0.22 : 0.26} />
          <Stop offset="44%" stopColor={deepSpace.bgMid} stopOpacity={0.5} />
          <Stop offset="82%" stopColor={deepSpace.bgEdge} stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={size} height={size} fill="url(#bgWash)" />
      {dots.map((d, i) => (
        <Circle
          key={`f-${i}`}
          cx={d.x * size}
          cy={d.y * size}
          r={d.r * (size / BASE)}
          fill={d.c}
          opacity={d.o}
        />
      ))}
    </Svg>
  );
}

export function ShareCard({
  variant,
  insight,
  handle,
  litCount = 4,
  size = BASE,
}: ShareCardProps) {
  const scale = size / BASE;
  const px = (v: number) => v * scale;

  return (
    <View style={[styles.card, { width: size, height: size }]}>
      {/* deep-space radial wash + star-field */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: deepSpace.bgEdge }]} />
      <StarField variant={variant} size={size} />

      {variant === "A" ? (
        <>
          {/* compact constellation, top band */}
          <View style={[styles.constellationA, { top: px(24), height: px(230) }]}>
            <Constellation variant="A" litCount={litCount} />
          </View>

          {/* insight-forward: eyebrow + big sentence */}
          <View style={[styles.bodyA, { top: px(260), paddingHorizontal: px(50) }]}>
            <Text
              style={[
                styles.eyebrow,
                { fontSize: px(9), letterSpacing: px(1.8), marginBottom: px(22) },
              ]}
            >
              YOUR NORTH STAR
            </Text>
            <Text style={[styles.insightA, { fontSize: px(34), lineHeight: px(48) }]}>
              {insight}
            </Text>
          </View>

          <Text style={[styles.footerA, { bottom: px(30), fontSize: px(14) }]}>
            {`@${handle} 의 자기이해 한 컷 · 2ndb.app`}
          </Text>
        </>
      ) : (
        <>
          {/* big constellation, centered */}
          <View style={[styles.constellationB, { top: px(54), height: px(420) }]}>
            <Constellation variant="B" litCount={litCount} />
          </View>

          {/* constellation-forward: smaller sentence near the bottom */}
          <View style={[styles.bodyB, { bottom: px(78), paddingHorizontal: px(60) }]}>
            <Text style={[styles.insightB, { fontSize: px(25), lineHeight: px(35) }]}>
              {insight}
            </Text>
          </View>

          <Text style={[styles.footerB, { bottom: px(34), fontSize: px(13) }]}>
            {`@${handle} · 2ndb.app`}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    backgroundColor: deepSpace.bgEdge,
  },

  // ── A: insight-forward ──
  constellationA: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  bodyA: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  eyebrow: {
    fontFamily: fontFamilies.pixelEn,
    color: deepSpace.soul,
    textAlign: "center",
  },
  insightA: {
    fontFamily: fontFamilies.sans,
    fontWeight: "800",
    color: deepSpace.textHi,
    textAlign: "center",
  },
  footerA: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    color: deepSpace.textLo,
    fontFamily: fontFamilies.sans,
  },

  // ── B: constellation-forward ──
  constellationB: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  bodyB: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  insightB: {
    fontFamily: fontFamilies.sans,
    fontWeight: "800",
    color: deepSpace.textHi,
    textAlign: "center",
  },
  footerB: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    color: deepSpace.textLo,
    fontFamily: fontFamilies.sans,
  },
});
