// Tier-icon art (refine premium pack). Tier-3/4 graph nodes are pieces of
// knowledge — paper, books, links, files, cubes, crystals, seeds, hearts,
// compasses, sparks — NOT generic robot glyphs. require()'d PNGs so Metro
// bundles them for web + native; image-rendering pixelated keeps them crisp.

import { Image, type ImageStyle, type StyleProp } from "react-native";

const TIER_ICONS = {
  paper_journal: require("../../../public/assets/2ndb-refine/tier-icons/flying_paper_premium.png"),
  book_wiki: require("../../../public/assets/2ndb-refine/tier-icons/book_premium.png"),
  link_capture: require("../../../public/assets/2ndb-refine/tier-icons/link_chain_premium.png"),
  file_source: require("../../../public/assets/2ndb-refine/tier-icons/file_page_premium.png"),
  cube_data: require("../../../public/assets/2ndb-refine/tier-icons/data_cube_premium.png"),
  crystal_imagine: require("../../../public/assets/2ndb-refine/tier-icons/dream_crystal_premium.png"),
  seed_growth: require("../../../public/assets/2ndb-refine/tier-icons/seed_growth_premium.png"),
  heart_relationship: require("../../../public/assets/2ndb-refine/tier-icons/heart_connection_premium.png"),
  compass_inspiration: require("../../../public/assets/2ndb-refine/tier-icons/compass_premium.png"),
  spark_recent: require("../../../public/assets/2ndb-refine/tier-icons/star_spark_premium.png"),
} as const;

export type TierIconId = keyof typeof TIER_ICONS;

// imageRendering is a web-only CSS prop, not in RN's ImageStyle type.
const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

export function TierIcon({ id, size, style }: { id: TierIconId; size: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={TIER_ICONS[id]}
      style={[{ width: size, height: size }, PIXELATED, style]}
      resizeMode="contain"
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
  imagine: "crystal_imagine",
  taste: "compass_inspiration",
};

// Source/kind → tier-4 data-shard icon.
export function shardIconForSource(source: string): TierIconId {
  switch (source) {
    case "journal": return "paper_journal";
    case "wiki": return "book_wiki";
    case "capture": return "link_capture";
    case "interview": return "heart_relationship";
    case "audit": return "compass_inspiration";
    case "imagine": return "crystal_imagine";
    default: return "cube_data";
  }
}
