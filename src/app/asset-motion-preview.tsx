import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";

import { IslandArt, type IslandId } from "@/components/art/IslandArt";
import {
  FinalLogArt,
  FinalPatternDataArt,
  FinalPatternLinkArt,
  type FinalLogId,
  type FinalPatternDataId,
  type FinalPatternLinkId,
} from "@/components/art/SoulcoreFinalArt";
import { NavGraph, type DataNode } from "@/components/graph/NavGraph";
import { StarNoiseLayer } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { cosmic } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

const PREVIEW_DATA: DataNode[] = [
  { id: "preview-work-1", title: "Sprint review", parentId: "work", tags: ["work", "growth", "focus"], summary: "Career growth signal." },
  { id: "preview-work-2", title: "Weekly goal", parentId: "work", tags: ["work", "planning", "focus"], summary: "A repeated work pattern." },
  { id: "preview-bond-1", title: "Long call", parentId: "relation", tags: ["relationship", "care", "family"], summary: "Bond pattern." },
  { id: "preview-love-1", title: "Promise kept", parentId: "relation", tags: ["love", "promise", "trust"], summary: "Warm connection." },
  { id: "preview-wisdom-1", title: "Book note", parentId: "knowledge", tags: ["knowledge", "learning", "philosophy"], summary: "Applied knowledge." },
  { id: "preview-wisdom-2", title: "Question", parentId: "knowledge", tags: ["knowledge", "learning", "question"], summary: "Wisdom shard." },
  { id: "preview-record-1", title: "Old journal", parentId: "records", tags: ["records", "memory", "archive"], summary: "Narrative pattern." },
  { id: "preview-record-2", title: "Timeline", parentId: "records", tags: ["records", "archive", "memory"], summary: "Story trace." },
  { id: "preview-muse-1", title: "Playlist", parentId: "taste", tags: ["taste", "music", "inspiration"], summary: "Muse spark." },
  { id: "preview-muse-2", title: "Mood board", parentId: "taste", tags: ["taste", "curation", "hobby"], summary: "Creative pattern." },
];

const CORE_TILES: Array<{ id: IslandId; label: string }> = [
  { id: "core", label: "Soul Core" },
  { id: "work_growth", label: "Growth Core" },
  { id: "relationship", label: "Bond Core" },
  { id: "knowledge", label: "Wisdom Core" },
  { id: "records", label: "Narrative Core" },
  { id: "inspiration", label: "Muse Core" },
];

const DATA_TILES: Array<{ id: FinalPatternDataId; label: string }> = [
  { id: "growth", label: "Growth Data" },
  { id: "bond", label: "Bond Data" },
  { id: "wisdom", label: "Wisdom Data" },
  { id: "narrative", label: "Narrative Data" },
  { id: "muse", label: "Muse Data" },
];

const LOG_TILES: Array<{ id: FinalLogId; label: string }> = [
  { id: "work", label: "Work Log" },
  { id: "relationship", label: "Relation Log" },
  { id: "knowledge", label: "Knowledge Log" },
  { id: "love", label: "Love Log" },
  { id: "hobby", label: "Hobby Log" },
];

const LINK_TILES: Array<{ id: FinalPatternLinkId; label: string }> = [
  { id: "near", label: "Near Link" },
  { id: "mid", label: "Mid Link" },
  { id: "far", label: "Far Link" },
  { id: "current", label: "Current Link" },
];

export default function AssetMotionPreview() {
  const [mode, setMode] = useState<"graph" | "assets">("graph");
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.root}>
      <StarNoiseLayer width={width} height={height} count={90} />
      <View style={styles.toolbar} pointerEvents="box-none">
        <View style={styles.brandPill}>
          <Text style={styles.brandText}>Final Tesseract Motion</Text>
        </View>
        <View style={styles.segment}>
          <SegmentButton active={mode === "graph"} label="Graph" onPress={() => setMode("graph")} />
          <SegmentButton active={mode === "assets"} label="Assets" onPress={() => setMode("assets")} />
        </View>
      </View>

      {mode === "graph" ? (
        <View style={StyleSheet.absoluteFill}>
          <NavGraph locale="ko" dataNodes={PREVIEW_DATA} glowNodeId="records" />
        </View>
      ) : (
        <ScrollView style={styles.assetPane} contentContainerStyle={styles.assetContent}>
          <Section title="Tier 1 / Tier 2 Cores">
            {CORE_TILES.map((tile) => (
              <AssetTile key={tile.id} label={tile.label}>
                <IslandArt id={tile.id} size={tile.id === "core" ? 90 : 78} />
              </AssetTile>
            ))}
          </Section>

          <Section title="Tier 3 Pattern Data">
            {DATA_TILES.map((tile) => (
              <AssetTile key={tile.id} label={tile.label}>
                <FinalPatternDataArt id={tile.id} size={58} />
              </AssetTile>
            ))}
          </Section>

          <Section title="Tier 4 Logs">
            {LOG_TILES.map((tile) => (
              <AssetTile key={tile.id} label={tile.label}>
                <FinalLogArt id={tile.id} width={70} height={52} />
              </AssetTile>
            ))}
          </Section>

          <Section title="Pattern Link">
            {LINK_TILES.map((tile) => (
              <LinkTile key={tile.id} label={tile.label}>
                <FinalPatternLinkArt id={tile.id} width={88} height={18} />
              </LinkTile>
            ))}
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

function SegmentButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segmentButton, active ? styles.segmentButtonActive : null]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
    </Pressable>
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
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function LinkTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.linkTile}>
      <View style={styles.linkArt}>{children}</View>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
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
    justifyContent: "space-between",
    gap: 10,
  },
  brandPill: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.34)",
    backgroundColor: "rgba(7,10,24,0.82)",
  },
  brandText: {
    color: cosmic.signalMint,
    fontFamily: fontFamilies.pixel,
    fontSize: 11,
    letterSpacing: 0,
  },
  segment: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(141,152,184,0.32)",
    backgroundColor: "rgba(13,21,48,0.86)",
    overflow: "hidden",
  },
  segmentButton: {
    minWidth: 72,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  segmentButtonActive: {
    backgroundColor: "rgba(114,242,199,0.16)",
  },
  segmentText: {
    color: cosmic.mistGray,
    fontFamily: fontFamilies.pixel,
    fontSize: 11,
    letterSpacing: 0,
  },
  segmentTextActive: {
    color: cosmic.signalMint,
  },
  assetPane: {
    flex: 1,
  },
  assetContent: {
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
    borderColor: "rgba(141,152,184,0.26)",
    backgroundColor: "rgba(13,21,48,0.72)",
  },
  linkTile: {
    width: 104,
    minHeight: 78,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(141,152,184,0.26)",
    backgroundColor: "rgba(13,21,48,0.72)",
  },
  tileArt: {
    width: 86,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
  },
  linkArt: {
    width: 88,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    color: cosmic.mistGray,
    fontSize: 11,
    fontFamily: fontFamilies.sans,
    letterSpacing: 0,
    textAlign: "center",
  },
});
