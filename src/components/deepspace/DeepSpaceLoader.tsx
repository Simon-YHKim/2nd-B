// Deep-space loaders (Claude Design loading.dc.html, A/B/C).
// Presentational + token-only. Replaces the bare ActivityIndicator (GraphLoading)
// across deep-space screens:
//   A "dots"     short route transition  — breathing SecondB + cyan dots
//   B "ring"     sync / processing       — rotating ring around the breathing head
//   C "analysis" long star-ignition      — Big-Dipper twinkle + sweep bar, and a
//                                          "continue in background" exit (no trap)
// Motion is fade + breathe + rotate only (no bounce/elastic). Default copy uses
// a local shipped-locale table, so check:i18n parity is unaffected. Colors come
// only from deepSpace.* tokens (no hex literals).
//
//   <DeepSpaceLoader variant="dots" />
//   <DeepSpaceLoader variant="ring" />
//   <DeepSpaceLoader variant="analysis" etaSec={30} onSendToBackground={sendToBackground} />

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceSpacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { Text } from "@/components/ui/Text";
import { SecondbHead } from "@/components/deepspace/SecondbHead";

export type DeepSpaceLoaderVariant = "dots" | "ring" | "analysis";

export interface DeepSpaceLoaderProps {
  variant?: DeepSpaceLoaderVariant;
  /** Override the default headline (analysis) / caption. */
  title?: string;
  /** Override the small caption (dots/ring). */
  caption?: string;
  /** Override the helper line (ring sub / analysis hint). */
  tip?: string;
  /** Analysis: "~N seconds" hint (default 30). */
  etaSec?: number;
  /** Analysis: "백그라운드에서 계속" handler. */
  onSendToBackground?: () => void;
  bgLabel?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type LoaderLocale = "en" | "ko" | "es" | "pt" | "id";

const LOADER_COPY: Record<LoaderLocale, {
  analysisHeadline: string;
  analysisHint: (etaSec: number) => string;
  background: string;
  ringCaption: string;
  ringTip: string;
  dotsCaption: string;
}> = {
  en: {
    analysisHeadline: "Looking at you",
    analysisHint: (etaSec) => `This may take a while · ~${etaSec}s`,
    background: "Continue in background",
    ringCaption: "Tidying up",
    ringTip: "Just a moment",
    dotsCaption: "Loading",
  },
  ko: {
    analysisHeadline: "너를 살펴보는 중",
    analysisHint: (etaSec) => `길어질 수 있어요 · 약 ${etaSec}초`,
    background: "백그라운드에서 계속 · 다른 거 할게요",
    ringCaption: "정리하는 중",
    ringTip: "잠깐이면 돼요",
    dotsCaption: "불러오는 중",
  },
  es: {
    analysisHeadline: "Revisando tus registros",
    analysisHint: (etaSec) => `Puede tardar un poco · ~${etaSec}s`,
    background: "Continuar en segundo plano",
    ringCaption: "Ordenando",
    ringTip: "Solo un momento",
    dotsCaption: "Cargando",
  },
  pt: {
    analysisHeadline: "Analisando seus registros",
    analysisHint: (etaSec) => `Pode levar um pouco · ~${etaSec}s`,
    background: "Continuar em segundo plano",
    ringCaption: "Organizando",
    ringTip: "Só um momento",
    dotsCaption: "Carregando",
  },
  id: {
    analysisHeadline: "Membaca catatanmu",
    analysisHint: (etaSec) => `Mungkin perlu sebentar · ~${etaSec}d`,
    background: "Lanjutkan di latar belakang",
    ringCaption: "Merapikan",
    ringTip: "Sebentar saja",
    dotsCaption: "Memuat",
  },
};

function loaderLocale(language?: string): LoaderLocale {
  const base = language?.toLowerCase().split("-")[0];
  if (base === "ko" || base === "es" || base === "pt" || base === "id") return base;
  return "en";
}

// The locale the WEB static export bakes in. `expo export` prerenders on a build
// machine where neither localStorage nor a device locale exists, so
// detectLanguage() falls through to "en" and this loader is the only text in the
// prerendered body of an auth route (`/sign-in` ships exactly "Loading").
export const STATIC_EXPORT_LOCALE: LoaderLocale = "en";

/**
 * False on the server render and on the client's FIRST paint, true afterwards.
 *
 * Without it the client's first paint used the detected locale while the served
 * HTML carried the build-time one, the two texts disagreed, and React threw a
 * hydration mismatch (#418) on every auth route — measured on the live build at
 * /sign-in, /sign-up, /complete-profile, /consent-notice and /oauth-callback.
 * React does not just warn there: it discards the server HTML for the route and
 * re-renders the whole tree on the client, which is the worst thing to do to the
 * entry screen.
 *
 * Native has no hydration step, so it starts true and its first paint is
 * unchanged — no English flash on the app's own loading screen.
 */
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(Platform.OS !== "web");
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}

// Big-Dipper (북두칠성) layout from the design canon. dim = faint star.
const STARS = [
  { x: 28, y: 104, r: 3.5, dim: true },
  { x: 60, y: 86, r: 3.5, dim: false },
  { x: 96, y: 94, r: 3.5, dim: true },
  { x: 116, y: 68, r: 4, dim: false },
  { x: 150, y: 76, r: 3.5, dim: false },
  { x: 162, y: 44, r: 4, dim: false },
  { x: 168, y: 96, r: 3.5, dim: true },
] as const;

function useBloom() {
  const v = useRef(new Animated.Value(0)).current;
  // Honour the reduce-motion pref. This matters now that "dots" is the app-wide
  // loading state: the pixel glyph it replaced in PremiumLoadingState checked
  // this pref, and unifying must not quietly drop that promise. Settled at 1 =
  // fully lit dots, no breathing.
  const reduceMotion = useReducedMotionPref();
  useEffect(() => {
    if (reduceMotion) {
      v.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, reduceMotion]);
  return v;
}

function Dots({ phase }: { phase: Animated.Value }) {
  const dot = (i: number) => ({
    opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [0.25 + i * 0.12, 1] }),
    transform: [{ scale: phase.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }],
  });
  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} style={[styles.dot, dot(i)]} />
      ))}
    </View>
  );
}

// B: a rotating dashed-arc ring encircling the breathing head (canon: 128/74).
function Ring({ size = 104, head = 58 }: { size?: number; head?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.25;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={deepSpace.cardLine} strokeWidth={4} />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={deepSpace.accent}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circ - arc}`}
          />
        </Svg>
      </Animated.View>
      <SecondbHead size={head} mood="neutral" />
    </View>
  );
}

// C: the Big-Dipper igniting star by star (staggered twinkle).
function Constellation() {
  const vals = useRef(STARS.map(() => new Animated.Value(0.4))).current;
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loops: Animated.CompositeAnimation[] = [];
    vals.forEach((v, i) => {
      const lo = STARS[i].dim ? 0.25 : 0.5;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          Animated.timing(v, { toValue: lo, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        ]),
      );
      const t = setTimeout(() => loop.start(), i * 200);
      timers.push(t);
      loops.push(loop);
    });
    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
    };
  }, [vals]);
  return (
    <Svg width={180} height={140} viewBox="0 0 180 140">
      <Polyline
        points="28,104 60,86 96,94 116,68 150,76 162,44 168,96"
        fill="none"
        stroke={deepSpace.cardLine}
        strokeWidth={1}
      />
      {STARS.map((s, i) => (
        <AnimatedCircle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill={s.dim ? deepSpace.accentDim : deepSpace.accentSoft}
          fillOpacity={vals[i]}
        />
      ))}
    </Svg>
  );
}

// C: indeterminate sweep bar (canon: 148x4, accent gliding across a faint track).
function SweepBar() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-66, 148] });
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { transform: [{ translateX }] }]} />
    </View>
  );
}

export function DeepSpaceLoader({
  variant = "dots",
  title,
  caption,
  tip,
  etaSec = 30,
  onSendToBackground,
  bgLabel,
}: DeepSpaceLoaderProps) {
  const phase = useBloom();
  const { i18n } = useTranslation();
  // Match the server on the first paint, then swap to the real locale.
  const hydrated = useHydrated();
  const copy = LOADER_COPY[hydrated ? loaderLocale(i18n.language) : STATIC_EXPORT_LOCALE];

  if (variant === "analysis") {
    const headline = title ?? copy.analysisHeadline;
    const hint = tip ?? copy.analysisHint(etaSec);
    const bg = bgLabel ?? copy.background;
    return (
      <View style={[styles.wrap, styles.wrapFull]}>
        <Constellation />
        <Text variant="caption" style={styles.headline}>{headline}</Text>
        <SweepBar />
        <Text variant="subtle" style={styles.subCaption}>{hint}</Text>
        {onSendToBackground ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSendToBackground}
            hitSlop={8}
            style={styles.bgBtn}
            android_ripple={{ color: withAlpha(deepSpace.accentSoft, 0.12) }}
          >
            <Text variant="caption" style={styles.bgBtnText}>{bg}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (variant === "ring") {
    const cap = caption ?? copy.ringCaption;
    const sub = tip ?? copy.ringTip;
    return (
      <View style={styles.wrap}>
        <Ring />
        <Text variant="caption" style={styles.caption}>{cap}</Text>
        <Text variant="subtle" style={styles.subCaption}>{sub}</Text>
      </View>
    );
  }

  // A: dots
  const cap = caption ?? title ?? copy.dotsCaption;
  return (
    <View style={styles.wrap}>
      <SecondbHead size={64} mood="neutral" />
      <Dots phase={phase} />
      <Text variant="caption" style={styles.caption}>{cap}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", gap: deepSpaceSpacing.md, padding: deepSpaceSpacing.lg },
  wrapFull: { flex: 1, gap: deepSpaceSpacing.lg },

  dotsRow: { flexDirection: "row", gap: 9, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: m3.shape.none, backgroundColor: deepSpace.accent },

  headline: { fontSize: 15, color: deepSpace.textHi, textAlign: "center", marginTop: 4 },
  caption: { fontSize: 13, color: deepSpace.textMid, textAlign: "center" },
  subCaption: { fontSize: 12, color: deepSpace.textLo, textAlign: "center", paddingHorizontal: deepSpaceSpacing.lg },

  barTrack: {
    width: 148,
    height: 4,
    borderRadius: m3.shape.none,
    backgroundColor: deepSpace.cardLine,
    overflow: "hidden",
  },
  barFill: { width: 66, height: 4, borderRadius: m3.shape.none, backgroundColor: deepSpace.accent },

  bgBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.lg,
    borderRadius: m3.shape.medium,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    backgroundColor: deepSpace.card,
    marginTop: 4,
  },
  bgBtnText: { fontSize: 14, color: deepSpace.accentSoft },

});
