// v49 static tesseract preview — a STATIC showcase of the cosmic-pixel-v4-
// tesseract-v49 asset set. No animation this pass: every asset renders as a
// plain <Image> (resizeMode="contain" + pixelated, no blur). Grouped + labeled
// by tier so the full v49 set can be reviewed side by side.
//
// Route: /asset-motion-preview-v49-static
// Sibling previews: /asset-motion-preview (v45 + graph), /asset-motion-preview-v48.

import type { ReactNode } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  useWindowDimensions,
} from "react-native";

import { StarNoiseLayer } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { cosmic, withAlpha } from "@/lib/theme/tokens";
import type { PatternDataColorKey } from "@/lib/graph/pattern-data-color";
import { fontFamilies } from "@/theme/typography";

// imageRendering is a web-only CSS prop, absent from RN's ImageStyle type. It
// keeps the pixel art crisp (no blur) when scaled.
const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

// require() paths MUST be string literals so Metro statically bundles them.
const CORE_TILES: Array<{ label: string; source: ImageSourcePropType }> = [
  { label: "Soul Core", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier1_soul_core_v49_256.png") },
];

const PATTERN_CORE_TILES: Array<{ label: string; source: ImageSourcePropType }> = [
  { label: "Growth Core", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier2_growth_core_v49_256.png") },
  { label: "Bond Core", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier2_bond_core_v49_256.png") },
  { label: "Wisdom Core", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier2_wisdom_core_v49_256.png") },
  { label: "Narrative Core", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier2_narrative_core_v49_256.png") },
  { label: "Muse Core", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier2_muse_core_v49_256.png") },
];

const PATTERN_DATA_TILES: Array<{ color: PatternDataColorKey; source: ImageSourcePropType }> = [
  { color: "red", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier3_pattern_data_red_v49_256.png") },
  { color: "orange", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier3_pattern_data_orange_v49_256.png") },
  { color: "yellow", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier3_pattern_data_yellow_v49_256.png") },
  { color: "green", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier3_pattern_data_green_v49_256.png") },
  { color: "blue", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier3_pattern_data_blue_v49_256.png") },
  { color: "indigo", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier3_pattern_data_indigo_v49_256.png") },
  { color: "violet", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier3_pattern_data_violet_v49_256.png") },
  { color: "white", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier3_pattern_data_white_v49_256.png") },
  { color: "black", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier3_pattern_data_black_v49_256.png") },
];

const LOG_TILES: Array<{ label: string; source: ImageSourcePropType }> = [
  { label: "Log", source: require("../../public/assets/cosmic-pixel-v4-tesseract-v49/app_256/tier4_log_v49_256.png") },
];

const PATTERN_LINK_SOURCE: ImageSourcePropType = require("../../public/assets/cosmic-pixel-v4-tesseract-v49/pattern_link/pattern-link-crystal-conduit-tile-v47-3.png");

export default function AssetMotionPreviewV49Static() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.root}>
      <StarNoiseLayer width={width} height={height} count={90} />
      <View style={styles.toolbar} pointerEvents="box-none">
        <View style={styles.brandPill}>
          <Text style={styles.brandText}>v49 Static Tesseract</Text>
        </View>
      </View>

      <ScrollView style={styles.pane} contentContainerStyle={styles.content}>
        <Section title="Tier 1 Soul Core">
          {CORE_TILES.map((tile) => (
            <AssetTile key={tile.label} label={tile.label}>
              <Image source={tile.source} style={[styles.coreArt, PIXELATED]} resizeMode="contain" />
            </AssetTile>
          ))}
        </Section>

        <Section title="Tier 2 Pattern Cores">
          {PATTERN_CORE_TILES.map((tile) => (
            <AssetTile key={tile.label} label={tile.label}>
              <Image source={tile.source} style={[styles.tileArtImg, PIXELATED]} resizeMode="contain" />
            </AssetTile>
          ))}
        </Section>

        <Section title="Tier 3 Pattern Data (9 colors)">
          {PATTERN_DATA_TILES.map((tile) => (
            <AssetTile key={tile.color} label={tile.color}>
              <Image source={tile.source} style={[styles.tileArtImg, PIXELATED]} resizeMode="contain" />
            </AssetTile>
          ))}
        </Section>

        <Section title="Tier 4 Log">
          {LOG_TILES.map((tile) => (
            <AssetTile key={tile.label} label={tile.label}>
              <Image source={tile.source} style={[styles.tileArtImg, PIXELATED]} resizeMode="contain" />
            </AssetTile>
          ))}
        </Section>

        <Section title="Pattern Link">
          <LinkTile label="Conduit Tile">
            <Image source={PATTERN_LINK_SOURCE} style={[styles.linkArtImg, PIXELATED]} resizeMode="contain" />
          </LinkTile>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.grid}>{children}</View>
    </View>
  );
}

function AssetTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileArt}>{children}</View>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function LinkTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.linkTile}>
      <View style={styles.linkArt}>{children}</View>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: cosmic.space950,
  },
  toolbar: {
    position: "absolute",
    top: 18,
    left: 14,
    right: 14,
    zIndex: 40,
    flexDirection: "row",
    alignItems: "center",
  },
  brandPill: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.signalMint, 0.34),
    backgroundColor: withAlpha(cosmic.space950, 0.82),
  },
  brandText: {
    color: cosmic.signalMint,
    fontFamily: fontFamilies.pixel,
    fontSize: 11,
    letterSpacing: 0,
  },
  pane: {
    flex: 1,
  },
  content: {
    paddingTop: 76,
    paddingHorizontal: 14,
    paddingBottom: 32,
    gap: 20,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: cosmic.moonWhite,
    fontFamily: fontFamilies.pixel,
    fontSize: 13,
    letterSpacing: 0,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: 104,
    minHeight: 116,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.mistGray, 0.26),
    backgroundColor: withAlpha(cosmic.space900, 0.72),
  },
  linkTile: {
    width: 220,
    minHeight: 92,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.mistGray, 0.26),
    backgroundColor: withAlpha(cosmic.space900, 0.72),
  },
  tileArt: {
    width: 86,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
  },
  coreArt: {
    width: 86,
    height: 86,
  },
  tileArtImg: {
    width: 78,
    height: 78,
  },
  linkArt: {
    width: 200,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  linkArtImg: {
    width: 200,
    height: 64,
  },
  tileLabel: {
    color: cosmic.mistGray,
    fontSize: 11,
    fontFamily: fontFamilies.sans,
    letterSpacing: 0,
    textAlign: "center",
  },
});
