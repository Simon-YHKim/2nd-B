import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { gameboy } from "@/lib/theme/gameboy-tokens";
import { cosmic } from "@/lib/theme/tokens";

const PIXEL_LOADER_CELLS = [0, 1, 2] as const;

export function PixelLoaderGlyph({
  color = cosmic.signalBlue,
  activeColor = cosmic.signalMint,
  cellSize = gameboy.grid,
  gap = gameboy.grid,
  style,
}: {
  color?: string;
  activeColor?: string;
  cellSize?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.root, { gap }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {PIXEL_LOADER_CELLS.map((cell) => (
        <View
          key={cell}
          style={[
            styles.cell,
            {
              width: cellSize,
              height: cellSize,
              backgroundColor: cell === 1 ? activeColor : color,
              opacity: cell === 1 ? 1 : 0.55,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cell: {
    borderRadius: gameboy.radius,
  },
});
