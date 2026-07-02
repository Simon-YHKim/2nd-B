/**
 * Shared constellation wallpaper — 1:1 port of the rev2 prototype's
 * SbStarfield (reference-app sb-app.jsx §"shared constellation wallpaper"):
 * a seed-locked LCG (70730219) scatters 96 stars over a 390×820 sky plus four
 * faint constellation figures, so the star positions are IDENTICAL to the
 * prototype on every run. `cosmic` additionally paints the SB_COSMIC nebula
 * washes under the stars (blue top wash + violet corner wash over cosmicBase),
 * for screens that don't paint their own stage background.
 *
 * Static render (no twinkle loop): the prototype animates 30% of the stars
 * between .28 and .95 opacity; here they sit at the midpoint so a screenshot
 * matches the reference's average frame without a per-star animation cost.
 */
import { Fragment } from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, Polyline, RadialGradient, Rect, Stop } from "react-native-svg";

import { withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";

const SKY_W = 390;
const SKY_H = 820;

type SkyStar = { x: number; y: number; r: number; o: number; tw: boolean; c: string };

// sb-app.jsx sbSkyRng — LCG, seed 70730219, >>> 0 wraparound.
function skyRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const STAR_COLS = [m3.accent.skyStarBlue, m3.accent.skyStarBlue, m3.accent.skyStarViolet, m3.accent.skyStarWhite];

const SKY_STARS: SkyStar[] = (() => {
  const r = skyRng(70730219);
  const out: SkyStar[] = [];
  for (let i = 0; i < 96; i += 1) {
    out.push({
      x: +(r() * SKY_W).toFixed(1),
      y: +(r() * SKY_H).toFixed(1),
      r: +(0.6 + r() * 1.7).toFixed(2),
      o: +(0.28 + r() * 0.62).toFixed(2),
      tw: r() < 0.3,
      c: STAR_COLS[(r() * STAR_COLS.length) | 0],
    });
    r(); // dly draw (unused in the static render, kept so the sequence matches)
  }
  return out;
})();

// sb-app.jsx SB_SKY_CONST — four faint constellation figures.
const SKY_CONST: { c: string; o: number; pts: [number, number][] }[] = [
  { c: m3.accent.skyConstA, o: 0.5, pts: [[40, 120], [86, 150], [120, 118], [168, 160], [120, 118], [104, 206]] },
  { c: m3.accent.skyConstB, o: 0.42, pts: [[300, 92], [342, 134], [316, 196], [268, 166], [342, 134], [372, 108]] },
  { c: m3.accent.skyConstC, o: 0.4, pts: [[58, 642], [112, 612], [150, 662], [212, 628]] },
  { c: m3.accent.skyConstD, o: 0.34, pts: [[252, 470], [300, 500], [286, 558], [332, 540]] },
];

// Prototype twinkle range is .28–.95; static stand-in sits at the midpoint.
const TWINKLE_STATIC_OPACITY = 0.62;

export function SbStarfield({ cosmic = false }: { cosmic?: boolean }) {
  return (
    <Svg
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, cosmic && { backgroundColor: m3.accent.cosmicBase }]}
      viewBox={`0 0 ${SKY_W} ${SKY_H}`}
      preserveAspectRatio="xMidYMid slice"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {cosmic ? (
        <>
          <Defs>
            <RadialGradient id="sb-nebula-blue" cx="50%" cy="-6%" rx="122%" ry="72%">
              <Stop offset="0" stopColor={m3.accent.nebulaBlue} stopOpacity={0.34} />
              <Stop offset="0.6" stopColor={m3.accent.nebulaBlue} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="sb-nebula-violet" cx="86%" cy="12%" rx="86%" ry="54%">
              <Stop offset="0" stopColor={m3.accent.nebulaViolet} stopOpacity={0.2} />
              <Stop offset="0.58" stopColor={m3.accent.nebulaViolet} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={SKY_W} height={SKY_H} fill="url(#sb-nebula-blue)" />
          <Rect x={0} y={0} width={SKY_W} height={SKY_H} fill="url(#sb-nebula-violet)" />
        </>
      ) : null}
      {SKY_CONST.map((cn, i) => (
        <Fragment key={`c${i}`}>
          <Polyline
            points={cn.pts.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={withAlpha(cn.c, 0.32 * cn.o)}
            strokeWidth={0.7}
          />
          {cn.pts.map((p, j) => (
            <Circle key={`c${i}d${j}`} cx={p[0]} cy={p[1]} r={1.4} fill={withAlpha(cn.c, 0.8 * cn.o)} />
          ))}
        </Fragment>
      ))}
      {SKY_STARS.map((s, i) => (
        <Circle key={`s${i}`} cx={s.x} cy={s.y} r={s.r} fill={s.c} opacity={s.tw ? TWINKLE_STATIC_OPACITY : s.o} />
      ))}
    </Svg>
  );
}
