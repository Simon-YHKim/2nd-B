import { Image } from "expo-image";
// Floating pixel island art (production-premium-v1 + refine premium packs).
// Renders the transparent island / shard PNG sprites as decorative node artwork on the graph. The
// image layer is decorative (the graph node owns the hitbox + label), so the
// island can be drawn larger than the touch target.
//
// PNGs are require()'d so Metro bundles them for web + native. image-rendering
// pixelated keeps the pixel art crisp when scaled up (web-only CSS; ignored
// on native).

import { type ImageStyle, type StyleProp, type ViewStyle } from "react-native";

import { LivingAsset } from "@/components/motion/LivingAsset";
import { FinalCoreArt, type FinalCoreId } from "@/components/art/SoulcoreFinalArt";

// Island art is the tesseract set in SoulcoreFinalArt; this module only routes to
// it. The legacy island PNGs left the bundle in two steps:
// - 2026-09-05 (audit D6-06): every FinalCoreId's *_premium_hq.png was a dead
//   require() (7 files, 14.7 MB) because FinalCoreArt drew those ids.
// - 2026-10-04 (L4-10): the last one, `imagine` (domain_imagine_premium_hq.png,
//   2.07 MB), had no caller that passes "imagine" (village-ui's island type has
//   no imagine, and src/app may not hard-code island=).
// The files themselves now live in E:/Legacy/2ndB (MANIFEST.jsonl, batch
// qa261004-art), not in assets/legacy-art/.
export type IslandId = FinalCoreId;

const SHARDS = {
  core_violet: require("../../../assets/legacy-art/2ndb-production-premium-v1/shards/shard_core_violet.png"),
  journal_gold: require("../../../assets/legacy-art/2ndb-production-premium-v1/shards/shard_journal_gold.png"),
  wiki_blue: require("../../../assets/legacy-art/2ndb-production-premium-v1/shards/shard_wiki_blue.png"),
  capture_mint: require("../../../assets/legacy-art/2ndb-production-premium-v1/shards/shard_capture_mint.png"),
  imagine_pink: require("../../../assets/legacy-art/2ndb-production-premium-v1/shards/shard_imagine_pink.png"),
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
  return <FinalCoreArt id={id} size={size} style={style} animated={animated} />;
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
        contentFit="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </LivingAsset>
  );
}
