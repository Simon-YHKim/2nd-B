import { useMemo } from "react";
import { Platform, type ImageStyle } from "react-native";
import { Image } from "expo-image";
import { phoneFrameSvg, svgImageUri } from "@/lib/dashboard/phone-pixel-art";

const pixels = Platform.OS === "web" ? { imageRendering: "pixelated" } as ImageStyle : undefined;

export function PhoneFrame({ bounds }: { bounds: { left: number; top: number; width: number; height: number } }) {
  const uri = useMemo(() => svgImageUri(phoneFrameSvg(bounds.width, bounds.height)), [bounds.width, bounds.height]);
  return <Image testID="phone-uniform-frame" source={{ uri }} contentFit="fill" accessible={false} pointerEvents="none"
    style={[{ position: "absolute", ...bounds }, pixels]} />;
}
