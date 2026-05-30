// Floating pixel island art (premium closing pack). Renders the transparent
// island / shard PNG sprites as decorative node artwork on the graph. The
// image layer is decorative (the graph node owns the hitbox + label), so the
// island can be drawn larger than the touch target.
//
// PNGs are require()'d so Metro bundles them for web + native. image-rendering
// pixelated keeps the pixel art crisp when scaled up (web-only CSS; ignored
// on native).

import { Image, type ImageStyle, type StyleProp } from "react-native";

const ISLANDS = {
  core: require("../../../public/assets/2ndb-refine/islands/core_center_island_premium.png"),
  work_growth: require("../../../public/assets/2ndb-refine/islands/domain_work_growth_premium.png"),
  relationship: require("../../../public/assets/2ndb-refine/islands/domain_relationship_premium.png"),
  knowledge: require("../../../public/assets/2ndb-refine/islands/domain_knowledge_premium.png"),
  records: require("../../../public/assets/2ndb-refine/islands/domain_records_premium.png"),
  imagine: require("../../../public/assets/2ndb-refine/islands/domain_imagine_premium.png"),
  inspiration: require("../../../public/assets/2ndb-refine/islands/domain_inspiration_premium.png"),
} as const;

export type IslandId = keyof typeof ISLANDS;

const SHARDS = {
  core_violet: require("../../../public/assets/premium-closing/shards/png/shard_core_violet.png"),
  journal_gold: require("../../../public/assets/premium-closing/shards/png/shard_journal_gold.png"),
  wiki_blue: require("../../../public/assets/premium-closing/shards/png/shard_wiki_blue.png"),
  capture_mint: require("../../../public/assets/premium-closing/shards/png/shard_capture_mint.png"),
  imagine_pink: require("../../../public/assets/premium-closing/shards/png/shard_imagine_pink.png"),
} as const;

export type ShardId = keyof typeof SHARDS;

// imageRendering is a web-only CSS prop, not in RN's ImageStyle type.
const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

export function IslandArt({ id, size, style }: { id: IslandId; size: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={ISLANDS[id]}
      style={[{ width: size, height: size }, PIXELATED, style]}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function ShardArt({ id, size, style }: { id: ShardId; size: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={SHARDS[id]}
      style={[{ width: size, height: size }, PIXELATED, style]}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
