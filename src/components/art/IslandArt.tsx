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
import { FinalCoreArt, hasFinalCoreArt, type FinalCoreId } from "@/components/art/SoulcoreFinalArt";

// Legacy island PNGs. Only ids that FinalCoreArt does NOT cover live here: every
// FinalCoreId is routed to <FinalCoreArt> below regardless of UI mode, so its
// *_premium_hq.png was a dead require() that Metro still baked into every
// APK/IPA (7 files, 14.7 MB; audit D6-06, 2026-09-05). The PNGs stay on disk in
// assets/legacy-art/ (deleting them is a separate decision); they are just no
// longer bundled.
const LEGACY_ISLANDS = {
  imagine: require("../../../assets/legacy-art/2ndb-production-premium-v1/graph/islands/domain_imagine_premium_hq.png"),
} as const;

type LegacyIslandId = keyof typeof LEGACY_ISLANDS;

export type IslandId = FinalCoreId | LegacyIslandId;

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
  // Worldview v-final: render the final transparent PNG tesseract set when it
  // exists; otherwise fall back to the legacy PNG for retired ids like imagine.
  // FinalCoreArt defaults to DEFAULT_ASSET_VARIANT (production = v10 clean
  // cutout); v49 + v45 stay available via its `variant` prop for comparison.
  // hasFinalCoreArt narrows `id`, so the fallback only ever sees a LegacyIslandId.
  if (hasFinalCoreArt(id)) return <FinalCoreArt id={id} size={size} style={style} animated={animated} />;
  return (
    <LivingAsset preset="patternCore" id={id} size={size} style={style} enabled={animated} pointerEvents="none">
      <Image
        source={LEGACY_ISLANDS[id]}
        style={[{ width: size, height: size }, PIXELATED]}
        contentFit="contain"
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
        contentFit="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </LivingAsset>
  );
}
