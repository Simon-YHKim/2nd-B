// Floating pixel island art (production-premium-v1 + refine premium packs).
// Renders the transparent island / shard PNG sprites as decorative node artwork on the graph. The
// image layer is decorative (the graph node owns the hitbox + label), so the
// island can be drawn larger than the touch target.
//
// PNGs are require()'d so Metro bundles them for web + native. image-rendering
// pixelated keeps the pixel art crisp when scaled up (web-only CSS; ignored
// on native).

import { Image, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";

import { LivingAsset } from "@/components/motion/LivingAsset";
import { FinalCoreArt, hasFinalCoreArt } from "@/components/art/SoulcoreFinalArt";

const ISLANDS = {
  core: require("../../../public/assets/2ndb-production-premium-v1/graph/islands/core_center_premium_hq.png"),
  work_growth: require("../../../public/assets/2ndb-production-premium-v1/graph/islands/domain_work_growth_premium_hq.png"),
  relationship: require("../../../public/assets/2ndb-production-premium-v1/graph/islands/domain_relationship_premium_hq.png"),
  knowledge: require("../../../public/assets/2ndb-production-premium-v1/graph/islands/domain_knowledge_premium_hq.png"),
  records: require("../../../public/assets/2ndb-production-premium-v1/graph/islands/domain_records_premium_hq.png"),
  imagine: require("../../../public/assets/2ndb-production-premium-v1/graph/islands/domain_imagine_premium_hq.png"),
  inspiration: require("../../../public/assets/2ndb-production-premium-v1/graph/islands/domain_inspiration_premium_hq.png"),
} as const;

export type IslandId = keyof typeof ISLANDS;

const SHARDS = {
  core_violet: require("../../../public/assets/2ndb-production-premium-v1/shards/shard_core_violet.png"),
  journal_gold: require("../../../public/assets/2ndb-production-premium-v1/shards/shard_journal_gold.png"),
  wiki_blue: require("../../../public/assets/2ndb-production-premium-v1/shards/shard_wiki_blue.png"),
  capture_mint: require("../../../public/assets/2ndb-production-premium-v1/shards/shard_capture_mint.png"),
  imagine_pink: require("../../../public/assets/2ndb-production-premium-v1/shards/shard_imagine_pink.png"),
} as const;

export type ShardId = keyof typeof SHARDS;

// imageRendering is a web-only CSS prop, not in RN's ImageStyle type.
const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

export function IslandArt({
  id,
  size,
  style,
  animated = true,
}: {
  id: IslandId;
  size: number;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}) {
  // Worldview v-final: render the final transparent PNG tesseract set when it
  // exists; otherwise fall back to the legacy PNG for retired ids like imagine.
  // FinalCoreArt defaults to the v49 static tesseract set (production); the v45
  // set stays available via its `variant` prop for side-by-side comparison.
  const useFinalArt = hasFinalCoreArt(id);
  const preset = id === "core" ? "soulCore" : "patternCore";
  if (useFinalArt) return <FinalCoreArt id={id} size={size} style={style} animated={animated} />;
  return (
    <LivingAsset preset={preset} id={id} size={size} style={style} enabled={animated} pointerEvents="none">
      <Image
        source={ISLANDS[id]}
        style={[{ width: size, height: size }, PIXELATED]}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </LivingAsset>
  );
}

export function ShardArt({
  id,
  size,
  style,
  animated = true,
}: {
  id: ShardId;
  size: number;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}) {
  return (
    <LivingAsset preset="shard" id={id} size={size} style={style} enabled={animated} pointerEvents="none">
      <Image
        source={SHARDS[id]}
        style={[{ width: size, height: size }, PIXELATED]}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </LivingAsset>
  );
}
