// v48 main graph preview — for comparing the tier-scale / clipping refactor
// and slotting GPT's upcoming assets. Renders the real NavGraph full-screen
// with the same 10-node PREVIEW_DATA used by asset-motion-preview, minus the
// assets/segment toggle, so the tier hierarchy reads in isolation.

import { StyleSheet, View, useWindowDimensions } from "react-native";

import { NavGraph, type DataNode } from "@/components/graph/NavGraph";
import { StarNoiseLayer } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { cosmic, withAlpha } from "@/lib/theme/tokens";
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

export default function AssetMotionPreviewV48() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.root}>
      <StarNoiseLayer width={width} height={height} count={90} />
      <View style={StyleSheet.absoluteFill}>
        <NavGraph locale="ko" dataNodes={PREVIEW_DATA} glowNodeId="records" />
      </View>
      <View style={styles.toolbar} pointerEvents="box-none">
        <View style={styles.brandPill}>
          <Text style={styles.brandText}>v48 Graph Preview</Text>
        </View>
      </View>
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
});
