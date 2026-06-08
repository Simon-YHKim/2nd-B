import { StyleSheet, View, type ViewStyle } from "react-native";

import { gameboy } from "@/lib/theme/gameboy-tokens";

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface PixelCornerProps {
  corner: Corner;
  color?: string;
  inset?: number;
  pixelSize?: number;
}

const DEFAULT_INSET = 6;
const DEFAULT_PIXEL_SIZE = 3;

function cornerPosition(corner: Corner, inset: number): ViewStyle {
  switch (corner) {
    case "top-left":
      return { top: inset, left: inset };
    case "top-right":
      return { top: inset, right: inset };
    case "bottom-left":
      return { bottom: inset, left: inset };
    case "bottom-right":
      return { bottom: inset, right: inset };
  }
}

function pixelPosition(corner: Corner, index: number, pixelSize: number): ViewStyle {
  const edge = index === 0 ? 0 : pixelSize;
  switch (corner) {
    case "top-left":
      return index === 1 ? { top: 0, left: edge } : { top: edge, left: 0 };
    case "top-right":
      return index === 1 ? { top: 0, right: edge } : { top: edge, right: 0 };
    case "bottom-left":
      return index === 1 ? { bottom: 0, left: edge } : { bottom: edge, left: 0 };
    case "bottom-right":
      return index === 1 ? { bottom: 0, right: edge } : { bottom: edge, right: 0 };
  }
}

export function PixelCorner({
  corner,
  color = gameboy.accent,
  inset = DEFAULT_INSET,
  pixelSize = DEFAULT_PIXEL_SIZE,
}: PixelCornerProps) {
  const pixel = { width: pixelSize, height: pixelSize, backgroundColor: color };
  const boxSize = pixelSize * 2;
  return (
    <View
      pointerEvents="none"
      style={[styles.root, cornerPosition(corner, inset), { width: boxSize, height: boxSize }]}
    >
      <View style={[styles.pixel, pixel, pixelPosition(corner, 0, pixelSize)]} />
      <View style={[styles.pixel, pixel, pixelPosition(corner, 1, pixelSize)]} />
      <View style={[styles.pixel, pixel, pixelPosition(corner, 2, pixelSize)]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    zIndex: 2,
  },
  pixel: {
    position: "absolute",
  },
});
