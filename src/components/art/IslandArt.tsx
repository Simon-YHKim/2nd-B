// Floating pixel island art (premium closing pack). Renders the 512×512
// transparent island sprites as decorative node artwork on the graph. The
// image layer is purely decorative (pointer-events none in the caller); the
// interactive hitbox + label live in the graph node component, so the island
// can be drawn larger than the touch target.
//
// PNGs are require()'d so Metro bundles them for web + native. image-rendering
// pixelated keeps the pixel art crisp when scaled up.

import { Image, StyleSheet, type ViewStyle, type StyleProp } from "react-native";

const ISLANDS = {
  core: require("../../../public/assets/premium-closing/islands/png/core_center_island.png"),
  work_growth: require("../../../public/assets/premium-closing/islands/png/domain_work_growth_island.png"),
  relationship: require("../../../public/assets/premium-closing/islands/png/domain_relationship_island.png"),
  knowledge: require("../../../public/assets/premium-closing/islands/png/domain_knowledge_island.png"),
  records: require("../../../public/assets/premium-closing/islands/png/domain_records_island.png"),
  imagine: require("../../../public/assets/premium-closing/islands/png/domain_imagine_island.png"),
  inspiration: require("../../../public/assets/premium-closing/islands/png/domain_inspiration_island.png"),
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

export function IslandArt({ id, size, style }: { id: IslandId; size: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Image
      source={ISLANDS[id]}
      style={[{ width: size, height: size }, styles.pixelated, style as never]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      // decorative — the graph node owns the a11y label
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function ShardArt({ id, size, style }: { id: ShardId; size: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Image
      source={SHARDS[id]}
      style={[{ width: size, height: size }, styles.pixelated, style as never]}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  // imageRendering is a web-only CSS prop; ignored on native. Keeps the
  // upscaled pixel art crisp instead of blurry.
  pixelated: { imageRendering: "pixelated" } as unknown as ViewStyle,
});
