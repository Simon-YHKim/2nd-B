// AI 뮤지엄 — rev2 2-axis timeline (P5). A horizontal time canvas
// (X = years, 100px/yr) split by one shared axis: WORLD lane above, AI lane
// below. Nodes are the full 43-event canon (25 base + 18 MZ_EXTRA, merged in
// museum-timeline-data.ts); bezier connectors draw the `rel` links; tapping a
// node opens the detail sheet (prev/next steps chronologically, the `here`
// terminal node routes home). The sheet renders the MZ_DETAIL canon: long copy,
// fact rows, cause/effect (배경/영향) and refs with refIcon glyphs + refKo
// labels. M2 interactions: dragging the year dial seeks the canvas (two-way
// bound via onScroll), swiping the sheet horizontally steps through events
// (prototype ±60px threshold).
//
// Prototype source of truth: rev2 `sb-museum.jsx` (geometry MZ + mzPlace, data
// 1:1 in museum-timeline-data.ts). Deep-space track only.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Line, Path } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton } from "@/components/m3";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { canonMuseum } from "@/lib/canon";
import {
  MUSEUM,
  MUSEUM_BY_YEAR,
  MUSEUM_REF_ICON,
  MUSEUM_REF_LABEL,
  MZ,
  MZ_CANVAS_W,
  MZ_LANES,
  museumDetailById,
  museumEventById,
  mzX,
  placeMuseumNodes,
} from "./museum-timeline-data";

// Material-Symbols glyphs the detail sheet needs (prototype refIcon set +
// south/north_east for 배경/영향 + open_in_new trailing mark), redrawn in the
// app's inline-SVG idiom (2dp currentColor strokes, round caps) — same pattern
// as DeepSpaceViews' CAPTURE_ICON_INNER. `link` is the prototype fallback for
// unknown ref kinds.
const MUSEUM_GLYPH_INNER: Record<string, string> = {
  article: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
  devices: '<path d="M4.5 17.5v-9A1.8 1.8 0 0 1 6.3 6.7H17.5"/><path d="M2.5 17.5H13"/><rect x="15.5" y="9.5" width="6" height="10.5" rx="1.6"/>',
  event: '<rect x="4" y="5.5" width="16" height="15" rx="2.2"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/><circle cx="14.8" cy="15.2" r="1.7"/>',
  movie: '<rect x="3" y="5.5" width="18" height="13.5" rx="2"/><path d="m4.5 5.5 2.4 4.2m2.7-4.2 2.4 4.2m2.7-4.2 2.4 4.2M3 9.7h18"/>',
  link: '<path d="M9.8 14.2 14.2 9.8"/><path d="m11.2 7.4 1.5-1.5a3.3 3.3 0 0 1 4.7 4.7l-1.6 1.6M12.8 16.6l-1.5 1.5a3.3 3.3 0 0 1-4.7-4.7l1.6-1.6"/>',
  south: '<path d="M12 4.5v15M6.5 14l5.5 5.5L17.5 14"/>',
  north_east: '<path d="M7 17 17 7M9 7h8v8"/>',
  open_in_new: '<path d="M13.5 4.5H19.5v6M19.5 4.5l-8 8"/><path d="M16.5 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V9A1.5 1.5 0 0 1 6 7.5h4.5"/>',
};

function MuseumGlyph({ name, color, size = 17 }: { name: string; color: string; size?: number }) {
  const inner = MUSEUM_GLYPH_INNER[name] ?? MUSEUM_GLYPH_INNER.link;
  const xml =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${inner}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
const DECADES = canonMuseum.decades;

export function MuseumTimelineScreen() {
  const { i18n } = useTranslation();
  const isKo = i18n.language === "ko";
  const scrollRef = useRef<ScrollView>(null);
  const didInitialSeek = useRef(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [year, setYear] = useState(2022);

  const placed = useMemo(() => placeMuseumNodes(MUSEUM), []);
  const sel = selId ? museumEventById(selId) : null;
  const selIdx = sel ? MUSEUM_BY_YEAR.findIndex((e) => e.id === sel.id) : -1;
  // MZ_DETAIL canon lookup — guarded: an event without a detail entry still
  // renders the base sheet (body/tags/rel/refs) and just skips the deep dive.
  const selDetail = sel ? museumDetailById(sel.id) : undefined;

  // Sheet entrance: prototype `sb-graph-sheet-up` / `mz-card-*` — one smooth
  // ease-out slide+fade, re-run per event so prev/next stepping reads as a
  // card change. No bounce (DESIGN.md motion rule).
  const sheetAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!selId) return;
    sheetAnim.setValue(0);
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [selId, sheetAnim]);

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
  const stepRef = useRef(step);
  stepRef.current = step;

  // M2: dial drag-seek — pointer X on the track maps to a year, two-way bound
  // to the canvas (scrollTo fires onScroll, which drives the readout back).
  // PanResponder goes on a plain View (NOT an Svg element - the /people F2
  // responder-prop leak is a react-native-svg-web quirk, Views are fine).
  const dialW = useRef(1);
  const seekToDialX = useCallback((x: number) => {
    const frac = Math.min(1, Math.max(0, x / Math.max(1, dialW.current)));
    const y = MZ.START + frac * (MZ.END - MZ.START);
    scrollRef.current?.scrollTo({ x: Math.max(0, mzX(y) - 195), animated: false });
  }, []);
  const dialPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => seekToDialX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => seekToDialX(e.nativeEvent.locationX),
      }),
    [seekToDialX],
  );

  // M2: sheet horizontal swipe steps prev/next (prototype ±60px threshold).
  // Horizontal-dominant guard keeps the sheet's vertical ScrollView working.
  const sheetPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -60) stepRef.current(1);
          else if (g.dx >= 60) stepRef.current(-1);
        },
      }),
    [],
  );

  const yearFrac = (year - MZ.START) / (MZ.END - MZ.START);

  return (
    // sb-app §4 museumLike chrome: the blurred top app bar (back + centered
    // "AI 뮤지엄") floats over the self-owned sky; DeepSpaceScreen reserves the
    // ~60px top inset. The range bar, dial and back-to-constellation stay in-body.
    <DeepSpaceScreen active="lens" variant="museumLike" title={isKo ? "AI 뮤지엄" : "AI Museum"} onBack={() => router.back()}>
      <View style={styles.body}>
        {/* range / hint bar */}
        <View style={styles.rangeRow}>
          <Text style={styles.rangeLabel}>{`${MZ.START} — 2026`}</Text>
          <Text style={styles.rangeHint}>{isKo ? "좌우로 시간 탐색" : "Swipe through time"}</Text>
        </View>

        {/* timeline viewport */}
        <View style={styles.viewport}>
          {/* pinned lane labels — sb-museum left rail: 9px accent dot + the
              vertical Korean lane name (prototype: writing-mode vertical-rl).
              RN has no vertical writing mode, so glyphs stack one per line
              (spaces dropped) — Korean stays upright like textOrientation:mixed.
              Tops center each block on the old 78/288 anchors (block heights
              ≈119/80 → 83-59, 293-40). */}
          <View pointerEvents="none" style={styles.laneCol}>
            {([MZ_LANES.world, MZ_LANES.ai] as const).map((L, i) => (
              <View key={L.id} style={[styles.laneTag, { top: i === 0 ? 24 : 253 }]}>
                <View style={[styles.laneDot, { backgroundColor: L.accent, shadowColor: L.accent }]} />
                <Text style={[styles.laneVertical, { color: L.ink }]}>
                  {L.label.replace(/\s+/g, "").split("").join("\n")}
                </Text>
              </View>
            ))}
          </View>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
            // contentOffset is iOS-only — on web/Android it silently no-ops and
            // the canvas opens at 1936 (an empty stretch) while the year readout
            // claims 2022 (QA F3). Seek on mount instead, cross-platform.
            onLayout={() => {
              if (didInitialSeek.current) return;
              didInitialSeek.current = true;
              scrollRef.current?.scrollTo({ x: mzX(2022) - 180, animated: false });
            }}
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
                    // sb-museum MzPlate: a faint lane-accent plate fill (RN
                    // approximation of the 135deg gradient) so the node reads as
                    // its lane's colour, brighter when selected.
                    { left: p.x, top: p.y, borderColor: active ? lane.accent : withAlpha(lane.accent, 0.35), backgroundColor: active ? lane.tint : withAlpha(lane.accent, 0.1) },
                    e.here && styles.nodeHere,
                  ]}
                >
                  {/* bottom scrim so the title stays legible over the plate */}
                  <View pointerEvents="none" style={styles.nodeScrim} />
                  {/* sb-museum small node: year (mono) + title only — no sub line */}
                  <Text style={[styles.nodeYear, { color: lane.accent }]}>{e.ylabel}</Text>
                  <Text style={styles.nodeTitle} numberOfLines={1}>{e.title}</Text>
                  {/* sb-museum: the here-node carries a mono NOW badge top-right */}
                  {e.here ? <Text style={[styles.nodeNow, { color: lane.accent }]}>NOW</Text> : null}
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
          <View
            style={styles.dialTrack}
            onLayout={(e) => {
              dialW.current = e.nativeEvent.layout.width;
            }}
            {...dialPan.panHandlers}
            accessibilityRole="adjustable"
            accessibilityLabel={isKo ? "연도 탐색" : "Seek year"}
            accessibilityValue={{ text: String(year) }}
          >
            <View pointerEvents="none" style={[styles.dialPlayhead, { left: `${Math.min(98, Math.max(0, yearFrac * 100))}%` }]} />
          </View>
        </View>

        {/* detail sheet */}
        {sel ? (
          <Animated.View
            style={[
              styles.sheet,
              {
                opacity: sheetAnim,
                transform: [
                  {
                    translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }),
                  },
                ],
              },
            ]}
            accessibilityViewIsModal
            {...sheetPan.panHandlers}
          >
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

              {/* MZ_DETAIL: deeper explanation (canon KO copy verbatim) */}
              {selDetail?.long ? <Text style={styles.longText}>{selDetail.long}</Text> : null}

              {/* MZ_DETAIL: key facts — prototype 2-column [label, value] grid */}
              {selDetail?.facts && selDetail.facts.length > 0 ? (
                <View style={styles.factsGrid}>
                  {selDetail.facts.map((f, i) => (
                    <View
                      key={`${f[0]}-${i}`}
                      style={[
                        styles.factCell,
                        {
                          backgroundColor: MZ_LANES[sel.lane].tint,
                          borderColor: withAlpha(MZ_LANES[sel.lane].accent, 0.13),
                        },
                      ]}
                    >
                      <Text style={[styles.factLabel, { color: MZ_LANES[sel.lane].accent }]}>{f[0]}</Text>
                      <Text style={styles.factValue}>{f[1]}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* MZ_DETAIL: cause → effect (prototype 배경/영향 card) */}
              {selDetail?.cause || selDetail?.effect ? (
                <View style={[styles.causeCard, { borderColor: withAlpha(MZ_LANES[sel.lane].accent, 0.15) }]}>
                  {selDetail.cause ? (
                    <View style={styles.causeRow}>
                      <View style={styles.causeIcon}>
                        <MuseumGlyph name="south" color={MZ_LANES[sel.lane].accent} size={15} />
                      </View>
                      <View style={styles.causeText}>
                        <Text style={[styles.causeLabel, { color: MZ_LANES[sel.lane].accent }]}>
                          {isKo ? "배경" : "Background"}
                        </Text>
                        <Text style={styles.causeBody}>{selDetail.cause}</Text>
                      </View>
                    </View>
                  ) : null}
                  {selDetail.cause && selDetail.effect ? (
                    <View style={[styles.causeDivider, { backgroundColor: withAlpha(MZ_LANES[sel.lane].accent, 0.12) }]} />
                  ) : null}
                  {selDetail.effect ? (
                    <View style={styles.causeRow}>
                      <View style={styles.causeIcon}>
                        <MuseumGlyph name="north_east" color={MZ_LANES[sel.lane].accent} size={15} />
                      </View>
                      <View style={styles.causeText}>
                        <Text style={[styles.causeLabel, { color: MZ_LANES[sel.lane].accent }]}>
                          {isKo ? "영향" : "Impact"}
                        </Text>
                        <Text style={styles.causeBody}>{selDetail.effect}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}

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
                  <Text style={styles.sectionLabel}>{isKo ? "자료 · 논문" : "References"}</Text>
                  {sel.refs.map((r) => (
                    <View
                      key={r.label}
                      style={styles.refRow}
                      accessible
                      accessibilityLabel={`${MUSEUM_REF_LABEL[r.kind]} ${r.label}`}
                    >
                      <View style={[styles.refIconBox, { backgroundColor: MZ_LANES[sel.lane].tint }]}>
                        <MuseumGlyph name={MUSEUM_REF_ICON[r.kind]} color={MZ_LANES[sel.lane].accent} size={17} />
                      </View>
                      <View style={styles.refBody}>
                        <Text style={styles.refLabel} numberOfLines={2}>{r.label}</Text>
                        <Text style={styles.refKind}>{MUSEUM_REF_LABEL[r.kind]}</Text>
                      </View>
                      <MuseumGlyph name="open_in_new" color="rgba(255,255,255,0.32)" size={15} />
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
          </Animated.View>
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
  laneTag: { position: "absolute", left: 0, width: 34, alignItems: "center", gap: 6 },
  laneDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  laneVertical: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 13,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
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
    overflow: "hidden",
    justifyContent: "space-between",
  },
  nodeScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "62%", backgroundColor: withAlpha(SHEET_SURFACE, 0.72) },
  nodeHere: { shadowColor: MZ_LANES.ai.accent, shadowOpacity: 0.7, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  nodeNow: { position: "absolute", top: 7, right: 9, fontFamily: m3.font.mono, fontSize: 8.5, fontWeight: "800", letterSpacing: 1 },
  nodeYear: { fontFamily: m3.font.mono, fontSize: 9 },
  nodeTitle: { fontSize: 12.5, fontWeight: "700", color: "#EAF2FF" },
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
  // MZ_DETAIL sections (prototype MzSheet: long copy, facts grid, 배경/영향)
  longText: { fontSize: 13, lineHeight: 22, color: "rgba(199,213,240,0.72)" },
  factsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  factCell: {
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 3,
  },
  factLabel: { fontFamily: m3.font.mono, fontSize: 10.5, letterSpacing: 1.1 },
  factValue: { fontSize: 13.5, fontWeight: "700", color: "#EAF2FF", lineHeight: 17.5 },
  causeCard: { borderWidth: 1, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.02)", overflow: "hidden" },
  causeRow: { flexDirection: "row", gap: 11, paddingHorizontal: 13, paddingVertical: 11 },
  causeIcon: { marginTop: 1 },
  causeText: { flex: 1, gap: 3 },
  causeLabel: { fontFamily: m3.font.mono, fontSize: 10.5, letterSpacing: 1.3 },
  causeBody: { fontSize: 13, lineHeight: 19.5, color: "rgba(214,226,248,0.82)" },
  causeDivider: { height: 1, marginHorizontal: 13 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tagChip: { borderRadius: 9999, borderWidth: 1, borderColor: withAlpha(deepSpace.accent, 0.3), paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, color: withAlpha(deepSpace.accentSoft, 0.9) },
  section: { gap: 6 },
  sectionLabel: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.2, color: withAlpha(deepSpace.accentSoft, 0.7) },
  relRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: withAlpha(deepSpace.accent, 0.2), borderRadius: 12, paddingHorizontal: 12 },
  relYear: { fontFamily: m3.font.mono, fontSize: 10, minWidth: 44 },
  relTitle: { flex: 1, fontSize: 13, color: "#EAF2FF" },
  relGo: { fontSize: 14, color: deepSpace.textHi },
  // refs — prototype rows: 32px tinted glyph box, label over refKo kind, dim open_in_new
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refIconBox: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  refBody: { flex: 1, gap: 1 },
  refKind: { fontFamily: m3.font.mono, fontSize: 10.5, color: withAlpha(deepSpace.accentSoft, 0.8) },
  refLabel: { fontSize: 13.5, fontWeight: "500", color: "#EAF2FF" },
});
