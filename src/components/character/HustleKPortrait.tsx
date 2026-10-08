import { Platform, View, type ImageStyle } from "react-native";
import { Image } from "expo-image";
import { HUSTLEK_EXPRESSIONS, type HustleKExpressionId } from "@/lib/assets/hustlek";
import { hustlekPortraitLayout } from "@/lib/assets/hustlek-framing";

const pixels = Platform.OS === "web" ? { imageRendering: "pixelated" } as ImageStyle : undefined;

/** Original pixels in a fixed face viewport, without tint, face layers or crossfade. */
export function HustleKPortrait({ expression = "A01", size = 48, accessibilityLabel }: {
  expression?: HustleKExpressionId;
  size?: number;
  accessibilityLabel?: string;
}) {
  const portrait = HUSTLEK_EXPRESSIONS[expression];
  const layout = hustlekPortraitLayout(size, expression);
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
    </View>
  );
}
