// AI 뮤지엄 — rev2 2-axis timeline (P5, M1 slice). A horizontal time canvas
// (X = years, 100px/yr) split by one shared axis: WORLD lane above, AI lane
// below. Nodes are the 25 curated events; bezier connectors draw the `rel`
// links; tapping a node opens the detail sheet (prev/next steps chronologically,
// the `here` terminal node routes home). M2 (dial drag-seek + sheet swipe +
// twinkle polish) layers on top of this structure.
//
// Prototype source of truth: rev2 `sb-museum.jsx` (geometry MZ, data 1:1 in
// museum-timeline-data.ts). Deep-space track only.
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Line, Path } from "react-native-svg";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton } from "@/components/m3";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import {
  MUSEUM,
  MUSEUM_BY_YEAR,
  MUSEUM_REF_LABEL,
  MZ,
  MZ_CANVAS_W,
  MZ_LANES,
  museumEventById,
  mzX,
  type MuseumEvent,
} from "./museum-timeline-data";

// Lane row Ys (prototype mzPlace bands): world stacks ABOVE the axis, ai BELOW.
const ROW_Y: Record<"world" | "ai", [number, number]> = {
  world: [2, 96],
  ai: [212, 306],
};

/** Assign each lane's events to near/far rows so neighbors don't overlap
 *  (prototype mzPlace: nudge to the other row when Xs collide). */
function placeNodes(events: MuseumEvent[]): Map<string, { x: number; y: number }> {
  const placed = new Map<string, { x: number; y: number }>();
  const minGap = MZ.NODE_W + 8;
  (["world", "ai"] as const).forEach((lane) => {
    let lastX = [-Infinity, -Infinity];
    events
      .filter((e) => e.lane === lane)
      .sort((a, b) => a.year - b.year)
      .forEach((e) => {
        const x = mzX(e.year) - MZ.NODE_W / 2;
        const row = x - lastX[0] >= minGap ? 0 : 1;
        lastX[row] = x;
        placed.set(e.id, { x, y: ROW_Y[lane][row] });
      });
  });
  return placed;
}

const DECADES = [1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

export function MuseumTimelineScreen() {
  const { i18n } = useTranslation();
  const isKo = i18n.language === "ko";
  const scrollRef = useRef<ScrollView>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [year, setYear] = useState(2022);

  const placed = useMemo(() => placeNodes(MUSEUM), []);
  const sel = selId ? museumEventById(selId) : null;
  const selIdx = sel ? MUSEUM_BY_YEAR.findIndex((e) => e.id === sel.id) : -1;

  // Connectors: dedupe rel pairs, color by the earlier (source) node's lane.
  const connectors = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; d: string; accent: string; a: string; b: string }[] = [];
    for (const e of MUSEUM) {
      for (const rid of e.rel) {
        const key = [e.id, rid].sort().join("~");
        if (seen.has(key)) continue;
        seen.add(key);
        const other = museumEventById(rid);
        const pa = placed.get(e.id);
        const pb = other ? placed.get(other.id) : undefined;
        if (!other || !pa || !pb) continue;
        const ax = pa.x + MZ.NODE_W / 2;
        const bx = pb.x + MZ.NODE_W / 2;
        const src = e.year <= other.year ? e : other;
        // Both stems meet the axis — bow the curve through the axis midpoint.
        const d = `M ${ax} ${MZ.AXIS} Q ${(ax + bx) / 2} ${MZ.AXIS + (pa.y < MZ.AXIS === pb.y < MZ.AXIS ? (pa.y < MZ.AXIS ? -34 : 34) : 0)} ${bx} ${MZ.AXIS}`;
        out.push({ key, d, accent: MZ_LANES[src.lane].accent, a: e.id, b: rid });
      }
    }
    return out;
  }, [placed]);

  const onScroll = useCallback((ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const cx = ev.nativeEvent.contentOffset.x + ev.nativeEvent.layoutMeasurement.width / 2;
    const y = Math.round(MZ.START + (cx - MZ.PAD) / MZ.PXY);
    setYear(Math.min(MZ.END - 2, Math.max(MZ.START, y)));
  }, []);

  const jumpTo = useCallback(
    (id: string) => {
      const p = placed.get(id);
      if (!p) return;
      scrollRef.current?.scrollTo({ x: Math.max(0, p.x - 130), animated: true });
      setSelId(id);
    },
    [placed],
  );

  const step = useCallback(
    (d: 1 | -1) => {
      if (selIdx < 0) return;
      const next = MUSEUM_BY_YEAR[selIdx + d];
      if (next) jumpTo(next.id);
    },
    [selIdx, jumpTo],
  );

  const yearFrac = (year - MZ.START) / (MZ.END - MZ.START);

  return (
    <DeepSpaceScreen active="lens">
      <View style={styles.body}>
        {/* range / hint bar */}
        <View style={styles.rangeRow}>
          <Text style={styles.rangeLabel}>{`${MZ.START} — 2026`}</Text>
          <Text style={styles.rangeHint}>{isKo ? "좌우로 시간 탐색" : "Swipe through time"}</Text>
        </View>

        {/* timeline viewport */}
        <View style={styles.viewport}>
          {/* pinned lane labels */}
          <View pointerEvents="none" style={styles.laneCol}>
            <Text style={[styles.laneLabel, { color: MZ_LANES.world.ink, top: 78 }]}>{MZ_LANES.world.en}</Text>
            <Text style={[styles.laneLabel, { color: MZ_LANES.ai.ink, top: 288 }]}>{MZ_LANES.ai.en}</Text>
          </View>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
            contentOffset={{ x: mzX(2022) - 180, y: 0 }}
            contentContainerStyle={{ width: MZ_CANVAS_W, height: MZ.TH }}
          >
            <Svg width={MZ_CANVAS_W} height={MZ.TH} style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* decade gridlines + central axis + now marker */}
              {DECADES.map((dy) => (
                <Line key={dy} x1={mzX(dy)} y1={0} x2={mzX(dy)} y2={MZ.TH} stroke="rgba(127,178,255,0.09)" strokeWidth={1} />
              ))}
              <Line x1={0} y1={MZ.AXIS} x2={MZ_CANVAS_W} y2={MZ.AXIS} stroke="rgba(127,178,255,0.35)" strokeWidth={1.4} />
              <Line x1={mzX(2026)} y1={0} x2={mzX(2026)} y2={MZ.TH} stroke={MZ_LANES.ai.accent} strokeWidth={1} strokeDasharray="3 6" opacity={0.7} />
              {/* connectors */}
              {connectors.map((c) => {
                const active = selId === c.a || selId === c.b;
                return <Path key={c.key} d={c.d} stroke={c.accent} strokeWidth={active ? 2.2 : 1.2} opacity={active ? 0.95 : 0.4} fill="none" />;
              })}
              {/* stems */}
              {MUSEUM.map((e) => {
                const p = placed.get(e.id);
                if (!p) return null;
                const cx = p.x + MZ.NODE_W / 2;
                const nodeEdge = p.y < MZ.AXIS ? p.y + MZ.NODE_H : p.y;
                return <Line key={`s-${e.id}`} x1={cx} y1={nodeEdge} x2={cx} y2={MZ.AXIS} stroke={withAlpha(MZ_LANES[e.lane].accent, 0.5)} strokeWidth={1.2} />;
              })}
            </Svg>

            {/* decade labels on the axis */}
            {DECADES.map((dy) => (
              <Text key={`dl-${dy}`} style={[styles.decade, { left: mzX(dy) + 5, top: MZ.AXIS - 16 }]}>{`’${String(dy).slice(2)}`}</Text>
            ))}

            {/* nodes */}
            {MUSEUM.map((e) => {
              const p = placed.get(e.id);
              if (!p) return null;
              const lane = MZ_LANES[e.lane];
              const active = selId === e.id;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => setSelId(active ? null : e.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.ylabel} ${e.title}`}
                  style={[
                    styles.node,
                    { left: p.x, top: p.y, borderColor: active ? lane.accent : withAlpha(lane.accent, 0.35) },
                    active && { backgroundColor: lane.tint },
                    e.here && styles.nodeHere,
                  ]}
                >
                  <Text style={[styles.nodeYear, { color: lane.accent }]}>{e.ylabel}</Text>
                  <Text style={styles.nodeTitle} numberOfLines={1}>{e.title}</Text>
                  <Text style={styles.nodeSub} numberOfLines={1}>{e.sub}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* year readout + static dial track (M2 adds drag-seek) */}
        <View style={styles.dialBlock}>
          <View style={styles.dialHead}>
            <Text style={styles.dialYear}>{year}</Text>
            <Text style={styles.dialCap}>YEAR</Text>
          </View>
          <View style={styles.dialTrack}>
            <View style={[styles.dialPlayhead, { left: `${Math.min(98, Math.max(0, yearFrac * 100))}%` }]} />
          </View>
        </View>

        {/* detail sheet */}
        {sel ? (
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.sheetHead}>
              <Pressable onPress={() => step(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel={isKo ? "이전 사건" : "Previous"} style={styles.stepBtn}>
                <Text style={styles.stepGlyph}>‹</Text>
              </Pressable>
              <Text style={styles.sheetCount}>{`${selIdx + 1} / ${MUSEUM_BY_YEAR.length}`}</Text>
              <Pressable onPress={() => step(1)} hitSlop={12} accessibilityRole="button" accessibilityLabel={isKo ? "다음 사건" : "Next"} style={styles.stepBtn}>
                <Text style={styles.stepGlyph}>›</Text>
              </Pressable>
              <Pressable onPress={() => setSelId(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel={isKo ? "닫기" : "Close"} style={[styles.stepBtn, styles.closeBtn]}>
                <Text style={styles.stepGlyph}>×</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
              <View style={[styles.plate, { backgroundColor: MZ_LANES[sel.lane].tint }]}>
                <View style={styles.plateChipRow}>
                  <View style={[styles.laneChip, { borderColor: MZ_LANES[sel.lane].accent }]}>
                    <Text style={[styles.laneChipText, { color: MZ_LANES[sel.lane].ink }]}>{MZ_LANES[sel.lane].label}</Text>
                  </View>
                  {sel.here ? (
                    <View style={[styles.laneChip, styles.hereChip]}>
                      <Text style={[styles.laneChipText, { color: deepSpace.bgEdge }]}>{isKo ? "지금 여기" : "You are here"}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.plateYear, { color: MZ_LANES[sel.lane].accent }]}>{sel.ylabel}</Text>
                <Text variant="heading" style={styles.plateTitle}>{sel.title}</Text>
                <Text style={styles.plateSub}>{sel.sub}</Text>
              </View>

              <Text style={styles.bodyText}>{sel.body}</Text>

              {sel.tags.length > 0 ? (
                <View style={styles.tagRow}>
                  {sel.tags.map((t) => (
                    <View key={t} style={styles.tagChip}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {sel.rel.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{isKo ? "이어진 사건" : "Connected"}</Text>
                  {sel.rel.map((rid) => {
                    const r = museumEventById(rid);
                    if (!r) return null;
                    return (
                      <Pressable key={rid} onPress={() => jumpTo(rid)} accessibilityRole="button" accessibilityLabel={r.title} style={styles.relRow}>
                        <Text style={[styles.relYear, { color: MZ_LANES[r.lane].accent }]}>{r.ylabel}</Text>
                        <Text style={styles.relTitle} numberOfLines={1}>{r.title}</Text>
                        <Text style={styles.relGo}>→</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {sel.refs.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>{isKo ? "자료·논문" : "References"}</Text>
                  {sel.refs.map((r) => (
                    <View key={r.label} style={styles.refRow}>
                      <Text style={styles.refKind}>{MUSEUM_REF_LABEL[r.kind]}</Text>
                      <Text style={styles.refLabel} numberOfLines={2}>{r.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {sel.here ? (
                <MdButton
                  variant="filled"
                  label={isKo ? "별자리로 돌아가기" : "Back to the constellation"}
                  onPress={() => router.replace("/")}
                  accessibilityLabel={isKo ? "별자리로 돌아가기" : "Back to the constellation"}
                />
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </DeepSpaceScreen>
  );
}

const SHEET_SURFACE = "#0B1120"; // prototype sheet/node surface (deep-space navy)

const styles = StyleSheet.create({
  body: { flex: 1 },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rangeLabel: { fontFamily: m3.font.mono, fontSize: 11, color: deepSpace.textHi },
  rangeHint: { fontSize: 11, color: withAlpha(deepSpace.accentSoft, 0.7) },
  viewport: { flex: 1 },
  laneCol: { position: "absolute", left: 4, top: 0, bottom: 0, width: 42, zIndex: 2 },
  laneLabel: { position: "absolute", left: 0, fontFamily: m3.font.mono, fontSize: 9, letterSpacing: 1.2, opacity: 0.9 },
  decade: { position: "absolute", fontFamily: m3.font.mono, fontSize: 9, color: withAlpha(deepSpace.accentSoft, 0.6) },
  node: {
    position: "absolute",
    width: MZ.NODE_W,
    height: MZ.NODE_H,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: SHEET_SURFACE,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  nodeHere: { shadowColor: MZ_LANES.ai.accent, shadowOpacity: 0.7, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  nodeYear: { fontFamily: m3.font.mono, fontSize: 9 },
  nodeTitle: { fontSize: 12.5, fontWeight: "700", color: "#EAF2FF" },
  nodeSub: { fontSize: 10, color: withAlpha(deepSpace.accentSoft, 0.75) },
  dialBlock: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 6 },
  dialHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  dialYear: { fontFamily: m3.font.mono, fontSize: 26, color: "#CFFAFF" },
  dialCap: { fontFamily: m3.font.mono, fontSize: 9, letterSpacing: 1.4, color: withAlpha(deepSpace.accentSoft, 0.6) },
  dialTrack: { height: 10, borderRadius: 13, backgroundColor: withAlpha(deepSpace.accent, 0.12), overflow: "hidden" },
  dialPlayhead: { position: "absolute", top: 0, bottom: 0, width: 8, borderRadius: 4, backgroundColor: MZ_LANES.world.accent },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: 380,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: SHEET_SURFACE,
    borderTopWidth: 1,
    borderColor: withAlpha(deepSpace.accent, 0.25),
    paddingTop: spacing.sm,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, paddingBottom: spacing.xs },
  sheetCount: { fontFamily: m3.font.mono, fontSize: 11, color: withAlpha(deepSpace.accentSoft, 0.8), minWidth: 52, textAlign: "center" },
  stepBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  closeBtn: { position: "absolute", right: spacing.sm },
  stepGlyph: { fontSize: 22, color: deepSpace.textHi },
  sheetScroll: { flexGrow: 0 },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  plate: { borderRadius: 16, padding: spacing.md, gap: 4 },
  plateChipRow: { flexDirection: "row", gap: 8, marginBottom: 2 },
  laneChip: { borderWidth: 1, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3 },
  laneChipText: { fontSize: 10.5, fontWeight: "600" },
  hereChip: { backgroundColor: m3.accent.moodPositive, borderColor: m3.accent.moodPositive },
  plateYear: { fontFamily: m3.font.mono, fontSize: 12 },
  plateTitle: { color: "#EAF2FF" },
  plateSub: { fontSize: 13, color: withAlpha(deepSpace.accentSoft, 0.85) },
  bodyText: { fontSize: 13.5, lineHeight: 21, color: "#D7E4F5" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tagChip: { borderRadius: 9999, borderWidth: 1, borderColor: withAlpha(deepSpace.accent, 0.3), paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, color: withAlpha(deepSpace.accentSoft, 0.9) },
  section: { gap: 6 },
  sectionLabel: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.2, color: withAlpha(deepSpace.accentSoft, 0.7) },
  relRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: withAlpha(deepSpace.accent, 0.2), borderRadius: 12, paddingHorizontal: 12 },
  relYear: { fontFamily: m3.font.mono, fontSize: 10, minWidth: 44 },
  relTitle: { flex: 1, fontSize: 13, color: "#EAF2FF" },
  relGo: { fontSize: 14, color: deepSpace.textHi },
  refRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  refKind: { fontFamily: m3.font.mono, fontSize: 10, color: withAlpha(deepSpace.accentSoft, 0.7), minWidth: 30 },
  refLabel: { flex: 1, fontSize: 12.5, color: "#D7E4F5" },
});
