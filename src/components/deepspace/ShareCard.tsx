// ShareCard — the "자기이해 한 컷" shareable square card, rev2 composition
// (reference-app sb-more ShareCardScreen 1:1).
//
// Two variants:
//   - "A" 통찰 카드: mono eyebrow "2ND-BRAIN · 이번 주", the insight sentence
//     centered, 세컨비 head + "세컨비가 함께 본 한 주" footer.
//   - "B" 별자리 카드: localized constellation eyebrow, the 7 domain dots at the
//     prototype's fixed positions (litCount lit, rest dim) around a bright
//     polaris core, then "N개 별이 빛나는 중" + the "2nd-Brain · N개 별가루"
//     signature line (sb-more verbatim; the prototype hardcodes 124).
//
// The prototype previews at 330px and exports at 1080; every value below is
// expressed in the 330 space and scaled by `size/330`, so the on-screen
// preview and the 1080 off-screen capture are the same card.
//
// Privacy contract: one sentence + a star count + a piece count. The user's
// handle stays OFF the card (share-sheet text only) — counts reveal less.
// Colors come from m3.accent share tokens (values transcribed from the
// prototype); the eyebrow uses Roboto Mono — no pixel fonts on the rev2 track.

import { Fragment } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { flattenAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { PixelStarSvg } from "@/components/pixel/PixelStarSvg";

/**
 * 공유 카드의 별 색 — 발광은 `RadialGradient` 였다. 픽셀에서 발광은
 * **한 겹 큰 별을 어두운 색으로** 깔아 만든다(규칙 1·4).
 * 바닥은 카드 배경이다.
 */
const SHARE_GROUND = m3.accent.shareBgTop;
const SHARE_LIT_HALO = flattenAlpha(m3.accent.shareStarOn, 0.3, SHARE_GROUND);
const SHARE_POLARIS_HALO = flattenAlpha(m3.accent.polarisSoft, 0.35, SHARE_GROUND);
const SHARE_STAR_OFF = flattenAlpha(m3.accent.shareEyebrow, 0.4, SHARE_GROUND);
import { fontFamilies } from "@/theme/typography";

const headFront = require("../../../assets/deepspace/secondb-head-front.png");

export interface ShareCardProps {
  variant: "A" | "B";
  /** The 북극성 sentence — dynamic, supplied by the caller (core-brain). */
  insight: string;
  /** Total captured pieces (별가루) for the signature line. null/undefined = hide the count. */
  pieceCount?: number | null;
  /** How many of the 7 domain stars are lit (0..7). Default 4. */
  litCount?: number;
  /** Rendered side length. Capture scales this to 1080. Default 330 (prototype base). */
  size?: number;
  /** @deprecated Card copy now localizes through i18n (react-i18next); this prop is ignored. Retained for caller compatibility. */
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
// ⚠ 미리 합성한 색이다(PIXEL-CLAY 규칙 4). 바탕은 이 파일이 이미 선언한 `SHARE_GROUND`.
const softInk = (a: number) => ({ color: flattenAlpha(m3.accent.shareInkSoft, a, SHARE_GROUND) });

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

export function ShareCard({ variant, insight, pieceCount, litCount = 4, size = BASE }: ShareCardProps) {
  const { t } = useTranslation("deepspace");
  const k = size / BASE;
  const lit = Math.max(0, Math.min(CARD_STARS.length, litCount));

  return (
    <View
      style={[
        styles.card,
        {
          width: size,
          height: size,
          borderRadius: m3.shape.none * k,
          // ⚠ 미리 합성한 색(규칙 4). 바탕은 `SHARE_GROUND`.
          borderColor: flattenAlpha(m3.accent.shareEyebrow, 0.18, SHARE_GROUND),
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
            {t("deepspace:shareCardImg.eyebrowWeek")}
          </Text>
          <View style={styles.insightWrap}>
            <Text style={[styles.insight, inkColor(), { fontSize: 27 * k, lineHeight: 27 * k * 1.4 }]}>{insight}</Text>
          </View>
          <View style={[styles.footerRow, { gap: 10 * k }]}>
            <Image source={headFront} style={{ width: 34 * k, height: 34 * k }} resizeMode="contain" />
            <Text style={[styles.footerText, softInk(0.7), { fontSize: 13 * k }]}>
              {t("deepspace:shareCardImg.footerWeek")}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.inner, { padding: 26 * k }]}>
          <Text style={[styles.eyebrow, styles.center, eyebrowColor(), { fontSize: 11 * k, letterSpacing: 11 * k * 0.18 }]}>
            {t("deepspace:shareCardImg.eyebrowConstellation")}
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
                    {/* 별은 원이 아니라 4방향 rect 별이다(규칙 1). 켜진 별의
                        발광은 그라디언트가 아니라 **한 겹 큰 별**이다. */}
                    {on ? <PixelStarSvg cx={cx} cy={cy} r={14} fill={SHARE_LIT_HALO} /> : null}
                    <PixelStarSvg
                      cx={cx}
                      cy={cy}
                      r={on ? 5.5 : 3}
                      fill={on ? m3.accent.shareStarOn : SHARE_STAR_OFF}
                    />
                  </Fragment>
                );
              })}
              <PixelStarSvg cx={165} cy={110} r={20} fill={SHARE_POLARIS_HALO} />
              <PixelStarSvg cx={165} cy={110} r={8} fill={m3.accent.shareInk} />
            </Svg>
          </View>
          <View style={{ marginTop: 6 * k, alignItems: "center" }}>
            <Text style={[styles.litLine, inkColor(), { fontSize: 19 * k }]}>
              {t("deepspace:shareCardImg.starsLit", { count: lit })}
            </Text>
            <Text style={[styles.sigLine, softInk(0.65), { fontSize: 13 * k, marginTop: 2 * k }]}>
              {pieceCount == null
                ? "2nd-Brain"
                : t("deepspace:shareCardImg.signature", { count: pieceCount })}
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
  sigLine: { fontFamily: fontFamilies.readable },
});
