// ShareCard — the "자기이해 한 컷" shareable square card, rev2 composition
// (reference-app sb-more ShareCardScreen 1:1).
//
// Two variants:
//   - "A" 통찰 카드: mono eyebrow "2ND-BRAIN · 이번 주", the insight sentence
//     centered, 세컨비 head + "세컨비가 함께 본 한 주" footer.
//   - "B" 별자리 카드: "MY CONSTELLATION" eyebrow, the 7 domain dots at the
//     prototype's fixed positions (litCount lit, rest dim) around a bright
//     polaris core, then "N개 별이 빛나는 중" + the handle line.
//
// The prototype previews at 330px and exports at 1080; every value below is
// expressed in the 330 space and scaled by `size/330`, so the on-screen
// preview and the 1080 off-screen capture are the same card.
//
// Privacy contract unchanged: one sentence + a star count + the handle.
// Colors come from m3.accent share tokens (values transcribed from the
// prototype); the eyebrow uses Roboto Mono — no pixel fonts on the rev2 track.

import { Fragment } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { fontFamilies } from "@/theme/typography";

const headFront = require("../../../assets/deepspace/secondb-head-front.png");

export interface ShareCardProps {
  variant: "A" | "B";
  /** The 북극성 sentence — dynamic, supplied by the caller (core-brain). */
  insight: string;
  /** Handle shown in the footer (without the @). */
  handle: string;
  /** How many of the 7 domain stars are lit (0..7). Default 4. */
  litCount?: number;
  /** Rendered side length. Capture scales this to 1080. Default 330 (prototype base). */
  size?: number;
  /** Card copy locale (KO is the prototype canonical). */
  isKo?: boolean;
}

// Prototype preview base (sb-more CARD = 330).
const BASE = 330;

// CYCLE NOTE: components/deepspace/index.ts has a known require cycle, so this
// module can evaluate BEFORE lib/theme/m3 under some entry orders — a
// module-scope m3.accent dereference then reads undefined and withAlpha
// crashes (seen live on the /settings path). Every m3-dependent color is
// therefore resolved at RENDER time through these helpers; StyleSheet.create
// below carries layout only.
const eyebrowColor = () => ({ fontFamily: m3.font.mono, color: m3.accent.shareEyebrow });
const inkColor = () => ({ color: m3.accent.shareInk });
const softInk = (a: number) => ({ color: withAlpha(m3.accent.shareInkSoft, a) });

// sb-more ShareCardScreen star map — percentage positions inside the 220-tall
// constellation band. The prototype hardcodes which are lit; here the first
// `litCount` light up in this order so the card stays honest to the data.
const CARD_STARS = [
  { x: 50, y: 16 },
  { x: 80, y: 34 },
  { x: 86, y: 66 },
  { x: 60, y: 84 },
  { x: 32, y: 80 },
  { x: 16, y: 56 },
  { x: 22, y: 26 },
] as const;

export function ShareCard({ variant, insight, handle, litCount = 4, size = BASE, isKo = true }: ShareCardProps) {
  const k = size / BASE;
  const lit = Math.max(0, Math.min(CARD_STARS.length, litCount));

  return (
    <View
      style={[
        styles.card,
        {
          width: size,
          height: size,
          borderRadius: 24 * k,
          borderColor: withAlpha(m3.accent.shareEyebrow, 0.18),
        },
      ]}
    >
      {/* radial(130% 100% at 50% 0%, #16203A → #070A13 75%) */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="share-bg" cx="50%" cy="0%" rx="130%" ry="100%">
            <Stop offset="0" stopColor={m3.accent.shareBgTop} />
            <Stop offset="0.75" stopColor={m3.accent.stageFloor} />
            <Stop offset="1" stopColor={m3.accent.stageFloor} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill="url(#share-bg)" />
      </Svg>

      {variant === "A" ? (
        <View style={[styles.inner, { padding: 30 * k }]}>
          <Text style={[styles.eyebrow, eyebrowColor(), { fontSize: 11 * k, letterSpacing: 11 * k * 0.18 }]}>
            {isKo ? "2ND-BRAIN · 이번 주" : "2ND-BRAIN · THIS WEEK"}
          </Text>
          <View style={styles.insightWrap}>
            <Text style={[styles.insight, inkColor(), { fontSize: 27 * k, lineHeight: 27 * k * 1.4 }]}>{insight}</Text>
          </View>
          <View style={[styles.footerRow, { gap: 10 * k }]}>
            <Image source={headFront} style={{ width: 34 * k, height: 34 * k }} resizeMode="contain" />
            <Text style={[styles.footerText, softInk(0.7), { fontSize: 13 * k }]}>
              {isKo ? "세컨비가 함께 본 한 주" : "A week seen together with SecondB"}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.inner, { padding: 26 * k }]}>
          <Text style={[styles.eyebrow, styles.center, eyebrowColor(), { fontSize: 11 * k, letterSpacing: 11 * k * 0.18 }]}>
            MY CONSTELLATION
          </Text>
          <View style={{ height: 220 * k, marginTop: 6 * k }}>
            <Svg width="100%" height="100%" viewBox="0 0 330 220">
              <Defs>
                <RadialGradient id="share-lit" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={m3.accent.shareStarOn} stopOpacity={0.8} />
                  <Stop offset="1" stopColor={m3.accent.shareStarOn} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="share-polaris" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={m3.accent.polarisSoft} stopOpacity={0.7} />
                  <Stop offset="1" stopColor={m3.accent.polarisSoft} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              {CARD_STARS.map((s, i) => {
                const on = i < lit;
                const cx = (s.x / 100) * 330;
                const cy = (s.y / 100) * 220;
                return (
                  <Fragment key={`s${i}`}>
                    {on ? <Circle cx={cx} cy={cy} r={14} fill="url(#share-lit)" /> : null}
                    <Circle
                      cx={cx}
                      cy={cy}
                      r={on ? 5.5 : 3}
                      fill={on ? m3.accent.shareStarOn : withAlpha(m3.accent.shareEyebrow, 0.4)}
                    />
                  </Fragment>
                );
              })}
              <Circle cx={165} cy={110} r={20} fill="url(#share-polaris)" />
              <Circle cx={165} cy={110} r={8} fill={m3.accent.shareInk} />
            </Svg>
          </View>
          <View style={{ marginTop: 6 * k, alignItems: "center" }}>
            <Text style={[styles.litLine, inkColor(), { fontSize: 19 * k }]}>
              {isKo ? `${lit}개 별이 빛나는 중` : `${lit} stars shining`}
            </Text>
            <Text style={[styles.handleLine, softInk(0.65), { fontSize: 13 * k, marginTop: 2 * k }]}>
              {`2nd-Brain · @${handle}`}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  inner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "column" },
  eyebrow: {},
  center: { textAlign: "center" },
  insightWrap: { flex: 1, justifyContent: "center" },
  insight: { fontWeight: "700", fontFamily: fontFamilies.readable },
  footerRow: { flexDirection: "row", alignItems: "center" },
  footerText: { fontFamily: fontFamilies.readable },
  litLine: { fontWeight: "700", fontFamily: fontFamilies.readable },
  handleLine: { fontFamily: fontFamilies.readable },
});
