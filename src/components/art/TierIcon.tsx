import { Image } from "expo-image";
// Tier-icon art (refine premium pack). Tier-3/4 graph nodes are pieces of
// knowledge — paper, books, links, files, cubes, crystals, seeds, hearts,
// compasses, sparks — NOT generic robot glyphs. require()'d PNGs so Metro
// bundles them for web + native; image-rendering pixelated keeps them crisp.

import { type ImageStyle, type StyleProp } from "react-native";
import { type TierIconId } from "@/components/art/tier-icon-contract";

export { TIER_ICON_IDS, shardIconForSource, type TierIconId } from "@/components/art/tier-icon-contract";

const TIER_ICONS = {
  archive_scroll: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/archive_scroll_premium.png"),
  paper_journal: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/flying_paper_premium.png"),
  book_wiki: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/book_premium.png"),
  link_capture: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/link_chain_premium.png"),
  file_source: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/file_page_premium.png"),
  cube_data: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/data_cube_premium.png"),
  clock_time: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/clock_premium.png"),
  dream_crystal: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/dream_crystal_premium.png"),
  idea_lamp: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/idea_lamp_premium.png"),
  seed_growth: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/seed_growth_premium.png"),
  heart_relationship: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/heart_connection_premium.png"),
  compass_inspiration: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/compass_premium.png"),
  spark_recent: require("../../../public/assets/2ndb-production-premium-v1/tier-icons/star_spark_premium.png"),
} as const satisfies Record<TierIconId, unknown>;

// imageRendering is a web-only CSS prop, not in RN's ImageStyle type.
const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

export function TierIcon({ id, size, style }: { id: TierIconId; size: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={TIER_ICONS[id]}
      style={[{ width: size, height: size }, PIXELATED, style]}
      contentFit="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

// Default tier-icon per domain id. Tier-3 nodes under a
// domain show the domain's signature piece; tier-4 data shards pick by source.
export const DOMAIN_TIER_ICON: Record<string, TierIconId> = {
  work: "seed_growth",
  relation: "heart_relationship",
  knowledge: "book_wiki",
  records: "paper_journal",
  taste: "compass_inspiration",
};
