import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { Image } from "expo-image";
import { phoneWallpaperSvg } from "@/lib/dashboard/phone-wallpaper";
import { svgImageUri } from "@/lib/dashboard/phone-pixel-art";

export function PhoneWallpaper({ width, height }: { width: number; height: number }) {
  const uri = useMemo(() => svgImageUri(phoneWallpaperSvg(width, height)), [width, height]);
  return <Image testID="phone-constellation-wallpaper" source={{ uri }} pointerEvents="none" accessible={false}
    contentFit="fill" style={StyleSheet.absoluteFill} />;
}
