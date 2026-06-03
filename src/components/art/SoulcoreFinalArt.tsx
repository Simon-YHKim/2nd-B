import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { LivingAsset } from "@/components/motion/LivingAsset";
import { prefersReducedMotion } from "@/lib/motion/signature";

const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

export type FinalCoreId = "core" | "work_growth" | "relationship" | "knowledge" | "records" | "inspiration";
export type FinalPatternDataId = "bond" | "wisdom" | "narrative" | "muse" | "growth";
export type FinalLogId = "work" | "relationship" | "knowledge" | "love" | "hobby";
export type FinalPatternLinkId = "near" | "mid" | "far" | "current";

const FINAL_CORE_ART: Record<FinalCoreId, ImageSourcePropType> = {
  core: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier1_soul_core/soul_core_256.png"),
  work_growth: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier2_pattern_cores/growth_core_256.png"),
  relationship: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier2_pattern_cores/bond_core_256.png"),
  knowledge: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier2_pattern_cores/wisdom_core_256.png"),
  records: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier2_pattern_cores/narrative_core_256.png"),
  inspiration: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier2_pattern_cores/muse_core_256.png"),
};

const FINAL_PATTERN_DATA_ART: Record<FinalPatternDataId, ImageSourcePropType> = {
  bond: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/bond_pattern_data_96.png"),
  wisdom: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/wisdom_pattern_data_96.png"),
  narrative: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/narrative_pattern_data_96.png"),
  muse: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/muse_pattern_data_96.png"),
  growth: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier3_pattern_data/growth_pattern_data_96.png"),
};

const FINAL_LOG_ART: Record<FinalLogId, ImageSourcePropType> = {
  work: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier4_logs/work_log_96x72.png"),
  relationship: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier4_logs/relationship_log_96x72.png"),
  knowledge: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier4_logs/knowledge_log_96x72.png"),
  love: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier4_logs/love_log_96x72.png"),
  hobby: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/tier4_logs/hobby_log_96x72.png"),
};

const FINAL_PATTERN_LINK_ART: Record<FinalPatternLinkId, ImageSourcePropType> = {
  near: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/pattern_links/pattern_link_near_320x64.png"),
  mid: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/pattern_links/pattern_link_mid_320x64.png"),
  far: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/pattern_links/pattern_link_far_320x64.png"),
  current: require("../../../public/assets/cosmic-pixel-v3-soulcore/final-candidate-v45/pattern_links/pattern_link_current_320x64.png"),
};

export function hasFinalCoreArt(id: string): id is FinalCoreId {
  return id in FINAL_CORE_ART;
}

export function FinalCoreArt({
  id,
  size,
  style,
  animated = true,
}: {
  id: FinalCoreId;
  size: number;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}) {
  if (id === "core") return <SoulCoreArt size={size} style={style} animated={animated} />;
  return (
    <LivingAsset preset="patternCore" id={id} size={size} style={style} enabled={animated} pointerEvents="none">
      <Image source={FINAL_CORE_ART[id]} style={[{ width: size, height: size }, PIXELATED]} resizeMode="contain" />
    </LivingAsset>
  );
}

function SoulCoreArt({
  size,
  style,
  animated = true,
}: {
  size: number;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={[{ width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image source={FINAL_CORE_ART.core} style={[{ width: size, height: size }, PIXELATED]} resizeMode="contain" />
      <SoulFlameFlicker size={size} active={animated} />
    </View>
  );
}

function SoulFlameFlicker({ size, active }: { size: number; active: boolean }) {
  const flicker = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      flicker.setValue(0);
      spark.setValue(0);
      return;
    }
    const flameLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.24, duration: 180, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.78, duration: 260, easing: Easing.out(Easing.sin), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const sparkLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(spark, { toValue: 1, duration: 780, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(spark, { toValue: 0, duration: 80, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    flameLoop.start();
    sparkLoop.start();
    return () => {
      flameLoop.stop();
      sparkLoop.stop();
    };
  }, [active, flicker, spark]);

  if (!active || prefersReducedMotion()) return null;

  const overlayW = size * 0.25;
  const overlayH = size * 0.34;
  const px = Math.max(1.5, size * 0.018);
  const left = size * 0.5 - overlayW / 2;
  const top = size * 0.275;
  const flameOpacity = flicker.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.28, 0.78, 0.5],
  });
  const glowOpacity = flicker.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.12, 0.38, 0.2],
  });
  const translateY = flicker.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -size * 0.012, size * 0.004],
  });
  const sparkOpacity = spark.interpolate({
    inputRange: [0, 0.25, 0.7, 1],
    outputRange: [0, 0.95, 0.3, 0],
  });
  const sparkLift = spark.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -size * 0.12],
  });

  return (
    <View pointerEvents="none" style={[styles.flameLayer, { left, top, width: overlayW, height: overlayH }]}>
      <Animated.View
        style={[
          styles.flameGlow,
          {
            left: overlayW * 0.2,
            top: overlayH * 0.14,
            width: overlayW * 0.6,
            height: overlayH * 0.68,
            opacity: glowOpacity,
            transform: [{ translateY }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.pixelFlame,
          {
            opacity: flameOpacity,
            transform: [{ translateY }],
          },
        ]}
      >
        {FLAME_CELLS.map((cell, i) => (
          <View
            key={`${cell.x}-${cell.y}-${i}`}
            style={[
              styles.flameCell,
              {
                left: overlayW * 0.5 + (cell.x - 4.5) * px,
                top: overlayH * 0.03 + cell.y * px,
                width: px * cell.w,
                height: px * cell.h,
                backgroundColor: cell.color,
                opacity: cell.opacity ?? 1,
              },
            ]}
          />
        ))}
      </Animated.View>
      <Animated.View style={[styles.pixelFlame, { opacity: sparkOpacity, transform: [{ translateY: sparkLift }] }]}>
        {SPARK_CELLS.map((cell, i) => (
          <View
            key={`${cell.x}-${cell.y}-${i}`}
            style={[
              styles.flameCell,
              {
                left: overlayW * 0.5 + (cell.x - 4.5) * px,
                top: overlayH * 0.18 + cell.y * px,
                width: px * cell.w,
                height: px * cell.h,
                backgroundColor: cell.color,
                opacity: cell.opacity ?? 1,
              },
            ]}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const FLAME_CELLS: Array<{ x: number; y: number; w: number; h: number; color: string; opacity?: number }> = [
  { x: 4, y: 0, w: 1, h: 1, color: "#FFF7A8" },
  { x: 4, y: 1, w: 1, h: 1, color: "#FFD83D" },
  { x: 3, y: 2, w: 1, h: 1, color: "#FF7A1A" },
  { x: 4, y: 2, w: 1, h: 1, color: "#FFF06B" },
  { x: 5, y: 2, w: 1, h: 1, color: "#FF8E1F" },
  { x: 3, y: 3, w: 1, h: 1, color: "#FF5E00" },
  { x: 4, y: 3, w: 1, h: 1, color: "#FFD83D" },
  { x: 5, y: 3, w: 1, h: 1, color: "#FF6C00" },
  { x: 2, y: 4, w: 1, h: 1, color: "#FF6C00", opacity: 0.85 },
  { x: 3, y: 4, w: 1, h: 1, color: "#FFA51F" },
  { x: 4, y: 4, w: 1, h: 1, color: "#FFFFD2" },
  { x: 5, y: 4, w: 1, h: 1, color: "#FFC928" },
  { x: 6, y: 4, w: 1, h: 1, color: "#FF6C00", opacity: 0.85 },
  { x: 2, y: 5, w: 1, h: 1, color: "#FF4D00", opacity: 0.8 },
  { x: 3, y: 5, w: 1, h: 1, color: "#FFB329" },
  { x: 4, y: 5, w: 1, h: 1, color: "#FFF8C7" },
  { x: 5, y: 5, w: 1, h: 1, color: "#FFB329" },
  { x: 6, y: 5, w: 1, h: 1, color: "#FF4D00", opacity: 0.8 },
  { x: 3, y: 6, w: 1, h: 1, color: "#FF8317" },
  { x: 4, y: 6, w: 1, h: 1, color: "#FFE45C" },
  { x: 5, y: 6, w: 1, h: 1, color: "#FF8317" },
  { x: 3, y: 7, w: 1, h: 1, color: "#FF5E00", opacity: 0.72 },
  { x: 4, y: 7, w: 1, h: 1, color: "#FFB329" },
  { x: 5, y: 7, w: 1, h: 1, color: "#FF5E00", opacity: 0.72 },
  { x: 4, y: 8, w: 1, h: 1, color: "#FF7A1A", opacity: 0.7 },
];

const SPARK_CELLS: Array<{ x: number; y: number; w: number; h: number; color: string; opacity?: number }> = [
  { x: 3, y: 2, w: 0.8, h: 0.8, color: "#FFF8C7" },
  { x: 6, y: 3, w: 0.75, h: 0.75, color: "#FFD83D", opacity: 0.85 },
  { x: 5, y: 0, w: 0.7, h: 0.7, color: "#FF8E1F", opacity: 0.8 },
];

export function FinalPatternDataArt({
  id,
  size,
  style,
  animated = true,
}: {
  id: FinalPatternDataId;
  size: number;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}) {
  return (
    <LivingAsset preset="patternData" id={id} size={size} style={style} enabled={animated} pointerEvents="none">
      <Image source={FINAL_PATTERN_DATA_ART[id]} style={[{ width: size, height: size }, PIXELATED]} resizeMode="contain" />
    </LivingAsset>
  );
}

export function FinalLogArt({
  id,
  width,
  height,
  style,
  animated = true,
}: {
  id: FinalLogId;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}) {
  return (
    <LivingAsset preset="log" id={id} style={[{ width, height }, style]} enabled={animated} pointerEvents="none">
      <Image source={FINAL_LOG_ART[id]} style={[{ width, height }, PIXELATED]} resizeMode="contain" />
    </LivingAsset>
  );
}

export function FinalPatternLinkArt({
  id,
  width,
  height,
  style,
  animated = true,
}: {
  id: FinalPatternLinkId;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}) {
  return (
    <LivingAsset preset="patternLink" id={id} style={[{ width, height }, style]} enabled={animated} pointerEvents="none">
      <Image source={FINAL_PATTERN_LINK_ART[id]} style={[{ width, height }, PIXELATED]} resizeMode="contain" />
    </LivingAsset>
  );
}

export function finalPatternDataIdForDomain(domain: string | undefined): FinalPatternDataId {
  switch (domain) {
    case "work": return "growth";
    case "relation": return "bond";
    case "knowledge": return "wisdom";
    case "records": return "narrative";
    case "taste": return "muse";
    default: return "narrative";
  }
}

export function finalLogIdForGraphPiece(parentId: string | undefined, tags: readonly string[] = [], title = ""): FinalLogId {
  const text = [parentId ?? "", title, ...tags].join(" ").toLowerCase();
  if (/\b(work|career|growth|job|planning|sprint)\b/.test(text)) return "work";
  if (/\b(love|romance|promise)\b/.test(text)) return "love";
  if (/\b(relation|relationship|bond|family|care|trust)\b/.test(text)) return "relationship";
  if (/\b(knowledge|learning|book|question|wisdom|study)\b/.test(text)) return "knowledge";
  if (/\b(taste|hobby|music|playlist|muse|inspiration|curation)\b/.test(text)) return "hobby";
  return parentId === "records" ? "knowledge" : "work";
}

const styles = StyleSheet.create({
  flameLayer: {
    position: "absolute",
  },
  flameGlow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#FF9A22",
    shadowColor: "#FFD83D",
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  pixelFlame: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  flameCell: {
    position: "absolute",
    shadowColor: "#FFD83D",
    shadowOpacity: 0.55,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
});
