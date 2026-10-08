import { Platform, type ImageStyle } from "react-native";
import { Image } from "expo-image";
import { HUSTLEK_EXPRESSIONS, type HustleKExpressionId } from "@/lib/assets/hustlek";

const pixels = Platform.OS === "web" ? { imageRendering: "pixelated" } as ImageStyle : undefined;

/** Original transparent portrait, with no tint, crop, synthetic face layers or crossfade. */
export function HustleKPortrait({ expression = "A01", size = 48, accessibilityLabel }: {
  expression?: HustleKExpressionId;
  size?: number;
  accessibilityLabel?: string;
}) {
  const portrait = HUSTLEK_EXPRESSIONS[expression];
  return (
    <Image
      source={portrait.source}
      style={[{ width: Math.max(1, Math.round(size)), height: Math.max(1, Math.round(size)) }, pixels]}
      contentFit="contain"
      cachePolicy="memory-disk"
      transition={0}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel ?? ""}
      testID={`hustlek-portrait-${expression}`}
    />
  );
}
