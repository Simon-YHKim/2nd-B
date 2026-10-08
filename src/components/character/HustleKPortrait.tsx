import { Platform, View, type ImageStyle } from "react-native";
import { Image } from "expo-image";
import { HUSTLEK_EXPRESSIONS, type HustleKExpressionId } from "@/lib/assets/hustlek";
import { hustlekPortraitLayout } from "@/lib/assets/hustlek-framing";
import { hustlekMouthLayout } from "@/lib/assets/hustlek-mouth";
import type { HustleKMouthPose } from "@/lib/companion/hustlek-life";

const pixels = Platform.OS === "web" ? { imageRendering: "pixelated" } as ImageStyle : undefined;

/** Original pixels in a fixed face viewport; optional speech clips only the mouth. */
export function HustleKPortrait({ expression = "A01", size = 48, accessibilityLabel, mouth }: {
  expression?: HustleKExpressionId;
  size?: number;
  accessibilityLabel?: string;
  mouth?: HustleKMouthPose | null;
}) {
  const portrait = HUSTLEK_EXPRESSIONS[expression];
  const layout = hustlekPortraitLayout(size, expression);
  const speech = mouth ? hustlekMouthLayout(size, mouth) : null;
  return (
    <View style={layout.frame} testID={`hustlek-portrait-${expression}`}>
      <Image
        source={portrait.source}
        style={[layout.image, pixels]}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel ?? ""}
      />
      {speech ? (
        <View style={speech.clip} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`hustlek-speaking-mouth-${mouth}`}>
          <Image source={HUSTLEK_EXPRESSIONS[speech.expression].source} style={[speech.image, pixels]} contentFit="contain" cachePolicy="memory-disk" transition={0} accessible={false} accessibilityLabel="" />
        </View>
      ) : null}
    </View>
  );
}
