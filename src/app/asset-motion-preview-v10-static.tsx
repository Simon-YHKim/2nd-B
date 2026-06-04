// v10 clean-cutout static preview — a STATIC showcase of the tesseract-v10
// asset set (public/assets/tesseract-v10). No animation: every asset renders as
// a plain <Image> (resizeMode="contain" + pixelated, no blur). Grouped +
// labeled by tier so the full v10 set can be reviewed side by side, PLUS a
// "tier depth" demo row that renders one core at tier 1→4 using tierSize +
// depthStyleForTier (size + saturate + opacity) so the new distance feeling is
// reviewable in one glance.
//
// Route: /asset-motion-preview-v10-static
// Sibling previews: /asset-motion-preview (v45 + graph),
// /asset-motion-preview-v48, /asset-motion-preview-v49-static.
//
// NOTE: tier-4 Log + pattern_link have no v10 art — those stay v49 (this preview
// only shows the v10 cores + pattern-data, which is the full v10 package).

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
import { depthStyleForTier } from "@/lib/graph/depth-style";
import { fontFamilies } from "@/theme/typography";

// imageRendering is a web-only CSS prop, absent from RN's ImageStyle type. It
// keeps the pixel art crisp (no blur) when scaled.
const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;

// Web-only saturate filter for the depth demo (mirrors NavGraph). Ignored on
// native — size + opacity still convey depth there.
function depthSaturateStyle(tier: 1 | 2 | 3 | 4): ImageStyle | null {
  const { saturate } = depthStyleForTier(tier);
  if (saturate >= 1) return null;
  return { filter: `saturate(${saturate})` } as unknown as ImageStyle;
}

// Tier scale mirrors NavGraph.tierSize (88/44/35/28) so the depth row reads at
// the real on-graph proportions.
const TIER_SIZE: Record<1 | 2 | 3 | 4, number> = { 1: 88, 2: 44, 3: 35, 4: 28 };

// require() paths MUST be string literals so Metro statically bundles them.
const CORE_TILES: Array<{ label: string; source: ImageSourcePropType }> = [
  { label: "Soul Core", source: require("../../public/assets/tesseract-v10/soul_core.png") },
];

const PATTERN_CORE_TILES: Array<{ label: string; source: ImageSourcePropType }> = [
  { label: "Growth Core", source: require("../../public/assets/tesseract-v10/growth_core.png") },
  { label: "Bond Core", source: require("../../public/assets/tesseract-v10/bond_core.png") },
  { label: "Wisdom Core", source: require("../../public/assets/tesseract-v10/wisdom_core.png") },
  { label: "Narrative Core", source: require("../../public/assets/tesseract-v10/narrative_core.png") },
  { label: "Muse Core", source: require("../../public/assets/tesseract-v10/muse_core.png") },
];

const PATTERN_DATA_TILES: Array<{ color: PatternDataColorKey; source: ImageSourcePropType }> = [
  { color: "red", source: require("../../public/assets/tesseract-v10/pattern_data_red.png") },
  { color: "orange", source: require("../../public/assets/tesseract-v10/pattern_data_orange.png") },
  { color: "yellow", source: require("../../public/assets/tesseract-v10/pattern_data_yellow.png") },
  { color: "green", source: require("../../public/assets/tesseract-v10/pattern_data_green.png") },
  { color: "blue", source: require("../../public/assets/tesseract-v10/pattern_data_blue.png") },
  { color: "indigo", source: require("../../public/assets/tesseract-v10/pattern_data_indigo.png") },
  { color: "violet", source: require("../../public/assets/tesseract-v10/pattern_data_violet.png") },
  { color: "white", source: require("../../public/assets/tesseract-v10/pattern_data_white.png") },
  { color: "black", source: require("../../public/assets/tesseract-v10/pattern_data_black.png") },
];

// One core rendered across the four tiers for the depth demo.
const DEPTH_DEMO_SOURCE: ImageSourcePropType = require("../../public/assets/tesseract-v10/soul_core.png");

export default function AssetMotionPreviewV10Static() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.root}>
      <StarNoiseLayer width={width} height={height} count={90} />
      <View style={styles.toolbar} pointerEvents="box-none">
        <View style={styles.brandPill}>
          <Text style={styles.brandText}>v10 Clean Cutout</Text>
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

        {/* Distance feeling demo: the SAME core at tier 1→4 — size (tierSize) +
            opacity + (web-only) saturate from depthStyleForTier, so the new
            depth falloff is reviewable. tier 1 is full vivid; deeper tiers
            shrink + dim + desaturate. */}
        <Section title="Tier depth (size + saturate + opacity)">
          {([1, 2, 3, 4] as const).map((tier) => {
            const sz = TIER_SIZE[tier];
            const ds = depthStyleForTier(tier);
            return (
              <View key={tier} style={styles.depthCell}>
                <View style={styles.depthArtBox}>
                  <Image
                    source={DEPTH_DEMO_SOURCE}
                    style={[{ width: sz, height: sz, opacity: ds.opacity }, PIXELATED, depthSaturateStyle(tier)]}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.tileLabel} numberOfLines={2}>
                  {`tier ${tier}\n${sz}px · sat ${ds.saturate} · op ${ds.opacity}`}
                </Text>
              </View>
            );
          })}
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
    alignItems: "flex-end",
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
  // Depth demo cell: a fixed-height art box so the four tiers sit on a shared
  // baseline and the size falloff reads clearly.
  depthCell: {
    width: 104,
    minHeight: 132,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.mistGray, 0.26),
    backgroundColor: withAlpha(cosmic.space900, 0.72),
  },
  depthArtBox: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    color: cosmic.mistGray,
    fontSize: 11,
    fontFamily: fontFamilies.sans,
    letterSpacing: 0,
    textAlign: "center",
    marginTop: 8,
  },
});
