import { StyleSheet } from "react-native";

import { m3 } from "@/lib/theme/m3";
import { flattenAlpha } from "@/lib/theme/tokens";

import { MZ, type MuseumLaneId } from "./museum-timeline-data";

export const MUSEUM_GROUND = m3.accent.stageFloor;
export const MUSEUM_PANEL = m3.color.surfaceContainerLow;
export const MUSEUM_GRID = flattenAlpha(m3.accent.entryTag, 0.09, MUSEUM_GROUND);
export const MUSEUM_AXIS = flattenAlpha(m3.accent.entryTag, 0.35, MUSEUM_GROUND);
export const MUSEUM_TODAY = flattenAlpha(m3.accent.skyConstB, 0.7, MUSEUM_GROUND);
export const MUSEUM_SECTION_WASH = flattenAlpha(
  m3.accent.skyStarWhite,
  0.03,
  MUSEUM_PANEL,
);

const TEXT = m3.color.onSurface;
const MUTED = m3.color.onSurfaceVariant;
const SECTION_BORDER = flattenAlpha(m3.accent.skyStarWhite, 0.1, MUSEUM_PANEL);
const BODY_SOFT = flattenAlpha(m3.accent.shareInkSoft, 0.82, MUSEUM_PANEL);

export const MUSEUM_LANE_TONE: Record<
  MuseumLaneId,
  { accent: string; ink: string; wash: string; selected: string; mutedLine: string }
> = {
  world: {
    accent: m3.accent.skyConstA,
    ink: m3.accent.skyStarBlue,
    wash: flattenAlpha(m3.accent.skyConstA, 0.14, MUSEUM_GROUND),
    selected: flattenAlpha(m3.accent.skyConstA, 0.28, MUSEUM_GROUND),
    mutedLine: flattenAlpha(m3.accent.skyConstA, 0.4, MUSEUM_GROUND),
  },
  ai: {
    accent: m3.accent.skyConstB,
    ink: m3.accent.skyStarViolet,
    wash: flattenAlpha(m3.accent.skyConstB, 0.14, MUSEUM_GROUND),
    selected: flattenAlpha(m3.accent.skyConstB, 0.28, MUSEUM_GROUND),
    mutedLine: flattenAlpha(m3.accent.skyConstB, 0.4, MUSEUM_GROUND),
  },
};

export const museumTimelineStyles = StyleSheet.create({
  body: { flex: 1, minHeight: 0 },
  rangeRow: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s2,
    paddingVertical: m3.spacing.s3,
    paddingHorizontal: m3.spacing.s6,
  },
  rangeLabel: {
    fontFamily: m3.font.mono,
    fontSize: 12,
    lineHeight: 18,
    color: m3.accent.skyTextHi,
  },
  rangeHint: { fontSize: 10, lineHeight: 15, color: MUTED },
  viewport: { flex: 1, minHeight: 0, overflow: "hidden" },
  timelineCanvas: { width: MZ.PAD * 2 + (MZ.END - MZ.START) * MZ.PXY, height: MZ.TH },
  laneColumn: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 46,
    zIndex: 6,
  },
  laneMarker: { position: "absolute", left: 0, width: 42 },
  laneMarkerContent: {
    alignItems: "center",
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s2,
    paddingVertical: m3.spacing.s3,
  },
  laneSquare: { width: 8, height: 8 },
  laneVertical: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  decadeMarker: { position: "absolute" },
  decadeMarkerContent: { paddingHorizontal: m3.spacing.s2, paddingVertical: 0 },
  decadeText: {
    fontFamily: m3.font.mono,
    fontSize: 10,
    lineHeight: 15,
    color: MUTED,
  },
  nodeRoot: { position: "absolute", width: MZ.NODE_W, height: MZ.NODE_H },
  nodeContent: {
    width: MZ.NODE_W - m3.spacing.s2,
    height: MZ.NODE_H - m3.spacing.s2,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s3,
  },
  nodeTextLayer: { flex: 1, zIndex: 1, justifyContent: "space-between" },
  nodeYear: { fontFamily: m3.font.mono, fontSize: 10, lineHeight: 15 },
  nodeNow: {
    position: "absolute",
    top: 0,
    right: 0,
    fontFamily: m3.font.mono,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
  },
  nodeTitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: TEXT,
    paddingBottom: m3.spacing.s1,
  },
  dialBlock: {
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s2,
    gap: m3.spacing.s2,
  },
  dialHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: m3.spacing.s4,
  },
  dialYear: {
    fontFamily: m3.font.mono,
    fontSize: 24,
    lineHeight: 36,
    color: m3.accent.star,
  },
  dialCaption: {
    fontFamily: m3.font.mono,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1,
    color: MUTED,
  },
  dialHitArea: { minHeight: m3.minTouch },
  dialSurface: { minHeight: m3.minTouch },
  dialSurfaceContent: {
    height: m3.minTouch - m3.spacing.s2,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "center",
  },
  dialTrack: { height: 8, backgroundColor: m3.color.surfaceContainerHighest },
  dialPlayhead: {
    position: "absolute",
    top: -4,
    width: 8,
    height: 16,
    backgroundColor: m3.accent.skyConstA,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: 440,
    zIndex: 20,
  },
  sheetCompact: { maxHeight: 460 },
  sheetSurfaceContent: {
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
    paddingBottom: m3.spacing.s2,
  },
  sheetActionRoot: { width: m3.minTouch },
  sheetActionContent: { minHeight: m3.minTouch, alignItems: "center", padding: 0 },
  sheetCountSurface: { flex: 1 },
  sheetCountContent: {
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  sheetCount: {
    fontFamily: m3.font.mono,
    fontSize: 12,
    lineHeight: 18,
    color: MUTED,
  },
  sheetScroll: { flexGrow: 0 },
  sheetBody: { paddingBottom: m3.spacing.s8, gap: m3.spacing.s6 },
  plate: {
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s4,
  },
  plateMeta: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s2 },
  squareBadge: {
    borderWidth: 2,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
  },
  squareBadgeText: { fontSize: 10, lineHeight: 15, fontWeight: "700" },
  hereBadge: {
    borderWidth: 2,
    borderColor: m3.accent.moodPositive,
    backgroundColor: m3.accent.moodPositive,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
  },
  hereBadgeText: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
    color: m3.accent.onAccentInk,
  },
  plateYear: { fontFamily: m3.font.mono, fontSize: 12, lineHeight: 18 },
  plateTitle: { color: TEXT, paddingBottom: m3.spacing.s1 },
  plateSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: MUTED,
    paddingBottom: m3.spacing.s1,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 23,
    color: m3.accent.shareInkSoft,
    paddingBottom: m3.spacing.s1,
  },
  longText: {
    fontSize: 12,
    lineHeight: 20,
    color: BODY_SOFT,
    paddingBottom: m3.spacing.s1,
  },
  factGrid: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s4 },
  factSurface: { flexBasis: "47%", flexGrow: 1 },
  factSurfaceCompact: { flexBasis: "100%" },
  factCell: {
    minHeight: 70,
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  factLabel: {
    fontFamily: m3.font.mono,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1,
  },
  factValue: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: TEXT,
    paddingBottom: m3.spacing.s1,
  },
  causeCard: {
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  causeRow: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s4 },
  causeText: { flex: 1, gap: m3.spacing.s2 },
  causeLabel: {
    fontFamily: m3.font.mono,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1,
  },
  causeBody: {
    fontSize: 12,
    lineHeight: 20,
    color: BODY_SOFT,
    paddingBottom: m3.spacing.s1,
  },
  causeDivider: { height: 2, backgroundColor: SECTION_BORDER },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s2 },
  tagBadge: {
    borderWidth: 2,
    borderColor: m3.color.outline,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
  },
  tagText: { fontSize: 10, lineHeight: 15, color: MUTED },
  section: { gap: m3.spacing.s2 },
  sectionLabel: {
    fontFamily: m3.font.mono,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1,
    color: MUTED,
  },
  relatedRow: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
  },
  relatedYear: {
    minWidth: 44,
    fontFamily: m3.font.mono,
    fontSize: 10,
    lineHeight: 15,
  },
  relatedTitle: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: TEXT,
    paddingBottom: m3.spacing.s1,
  },
  referenceRow: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s3,
  },
  referenceIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  referenceBody: { flex: 1, gap: m3.spacing.s1 },
  referenceLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    color: TEXT,
    paddingBottom: m3.spacing.s1,
  },
  referenceKind: {
    fontFamily: m3.font.mono,
    fontSize: 10,
    lineHeight: 15,
    color: MUTED,
  },
  homeAction: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
  },
  homeActionLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: m3.color.onPrimary,
  },
});
