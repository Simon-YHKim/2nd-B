// Premium wiki facet thumbnails (production-premium-v1 pack). Transparent
// 256x256 pixel illustrations for the three knowledge facets shown at the top
// of /wiki (Core / Library / Imagine). Decorative — the card owns the label and
// hitbox, so the art is hidden from the accessibility tree.
//
// PNGs are require()'d so Metro bundles them for web + native. image-rendering
// pixelated keeps the pixel art crisp when scaled (web-only CSS; ignored native).

import { Image, type ImageStyle, type StyleProp } from "react-native";

const THUMBS = {
  core_brain: require("../../../public/assets/2ndb-production-premium-v1/wiki/wiki_card_thumb_core_brain_premium.png"),
  library: require("../../../public/assets/2ndb-production-premium-v1/wiki/wiki_card_thumb_library_premium.png"),
  imagine: require("../../../public/assets/2ndb-production-premium-v1/wiki/wiki_card_thumb_imagine_premium.png"),
} as const;

export type WikiCardThumbId = keyof typeof THUMBS;

// imageRendering is a web-only CSS prop, not in RN's ImageStyle type.
const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

export function WikiCardThumb({ id, size, style }: { id: WikiCardThumbId; size: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={THUMBS[id]}
      style={[{ width: size, height: size }, PIXELATED, style]}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
