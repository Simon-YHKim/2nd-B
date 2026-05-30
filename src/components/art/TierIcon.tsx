// Tier-icon + shard art (closeout-v3 #9). Tier-3/4 graph nodes are pieces of
// knowledge — paper, books, links, files, cubes, crystals, seeds, hearts,
// compasses, sparks — NOT generic robot glyphs. require()'d PNGs so Metro
// bundles them for web + native; image-rendering pixelated keeps them crisp.

import { Image, type ImageStyle, type StyleProp } from "react-native";

const TIER_ICONS = {
  paper_journal: require("../../../public/assets/2ndb-closeout-v3/tier-icons/paper_journal.png"),
  book_wiki: require("../../../public/assets/2ndb-closeout-v3/tier-icons/book_wiki.png"),
  link_capture: require("../../../public/assets/2ndb-closeout-v3/tier-icons/link_capture.png"),
  file_source: require("../../../public/assets/2ndb-closeout-v3/tier-icons/file_source.png"),
  cube_data: require("../../../public/assets/2ndb-closeout-v3/tier-icons/cube_data.png"),
  crystal_imagine: require("../../../public/assets/2ndb-closeout-v3/tier-icons/crystal_imagine.png"),
  seed_growth: require("../../../public/assets/2ndb-closeout-v3/tier-icons/seed_growth.png"),
  heart_relationship: require("../../../public/assets/2ndb-closeout-v3/tier-icons/heart_relationship.png"),
  compass_inspiration: require("../../../public/assets/2ndb-closeout-v3/tier-icons/compass_inspiration.png"),
  spark_recent: require("../../../public/assets/2ndb-closeout-v3/tier-icons/spark_recent.png"),
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

// Default tier-icon per domain id (closeout mapping_v3). Tier-3 nodes under a
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
