// Deep-space loaders (Claude Design loading.dc.html, A/B/C).
// Presentational + token-only. Replaces the bare ActivityIndicator (GraphLoading)
// across deep-space screens with the breathing SecondB + cyan dots / star-ignite,
// and the long-analysis variant that does NOT trap the user.
//
//   <DeepSpaceLoader variant="dots" />                       // A short transition
//   <DeepSpaceLoader variant="star" caption="별을 점등하는 중" /> // B
//   <DeepSpaceLoader variant="analysis" title="..." tip="..."  // C long analysis
//      onSendToBackground={sendToBackground} bgLabel="백그라운드에서 계속" />
//
// Motion is fade+bloom only (no bounce/elastic), matching SecondbHead's breathing.

import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";
import { SecondbHead } from "@/components/deepspace";

export type DeepSpaceLoaderVariant = "dots" | "star" | "analysis";

export interface DeepSpaceLoaderProps {
  variant?: DeepSpaceLoaderVariant;
  /** Headline for the analysis variant (and optional for star). */
  title?: string;
  /** Small caption under the loader. */
  caption?: string;
  /** Analysis only: helper line under the title. */
  tip?: string;
  /** Analysis only: "백그라운드에서 계속 · 다른 거 할게요" handler. */
  onSendToBackground?: () => void;
  bgLabel?: string;
}

function useBloom() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
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

function StarBloom({ phase }: { phase: Animated.Value }) {
  return (
    <View style={styles.starWrap}>
      <Animated.View
        style={[
          styles.starGlow,
          {
            opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.85] }),
            transform: [{ scale: phase.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.25] }) }],
          },
        ]}
      />
      <View style={styles.starCore} />
    </View>
  );
}

export function DeepSpaceLoader({
  variant = "dots",
  title,
  caption,
  tip,
  onSendToBackground,
  bgLabel = "백그라운드에서 계속",
}: DeepSpaceLoaderProps) {
  const phase = useBloom();
  const isAnalysis = variant === "analysis";

  return (
    <View style={[styles.wrap, isAnalysis ? styles.wrapFull : null]}>
      <SecondbHead size={isAnalysis ? 96 : 64} mood="neutral" />
      {variant === "star" ? <StarBloom phase={phase} /> : <Dots phase={phase} />}

      {title ? (
        <Text variant="heading" style={styles.title}>{title}</Text>
      ) : null}
      {tip ? <Text variant="body" style={styles.tip}>{tip}</Text> : null}
      {caption ? <Text variant="subtle" style={styles.caption}>{caption}</Text> : null}

      {isAnalysis && onSendToBackground ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSendToBackground}
          hitSlop={8}
          style={({ pressed }) => [styles.bgBtn, pressed ? styles.pressed : null]}
        >
          <Text variant="caption" style={styles.bgBtnText}>{bgLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", gap: deepSpaceSpacing.md, padding: deepSpaceSpacing.lg },
  wrapFull: { flex: 1, gap: deepSpaceSpacing.lg },

  dotsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: deepSpace.accent },

  starWrap: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  starGlow: { position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: deepSpace.soul },
  starCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: deepSpace.accentSoft },

  title: { fontSize: 16, color: deepSpace.accentBright, textAlign: "center", marginTop: 4 },
  tip: { fontSize: 14, color: deepSpace.textMid, textAlign: "center", paddingHorizontal: deepSpaceSpacing.lg },
  caption: { fontSize: 12, color: deepSpace.textLo, textAlign: "center" },

  bgBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: deepSpaceSpacing.lg,
    borderRadius: deepSpaceRadii.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    backgroundColor: deepSpace.card,
    marginTop: 4,
  },
  bgBtnText: { fontSize: 14, color: deepSpace.accentSoft },
  pressed: { opacity: 0.7 },
});
