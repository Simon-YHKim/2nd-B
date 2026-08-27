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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { useTranslation } from "react-i18next";
import Svg, { Line, Rect } from "react-native-svg";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelDither } from "@/components/pixel/PixelDither";
import { canonGlyph } from "@/components/pixel/pixel-glyphs";
import { stepQuad, type LineCell } from "@/components/pixel/pixel-line";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton } from "@/components/m3";
import { deepSpace, flattenAlpha, spacing, withAlpha } from "@/lib/theme/tokens";
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

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `m3.accent.stageFloor` — 뮤지엄은 무대 바닥 위에 바로 그린다(타임라인 캔버스).
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const mzAlpha = (c: string, a: number): string => flattenAlpha(c, a, m3.accent.stageFloor);

// Material-Symbols glyphs the detail sheet needs (prototype refIcon set +
// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
//
// 원래 이 자리에 `MUSEUM_GLYPH_INNER` 라는 여덟 개짜리 문자열 SVG 레지스트리가
// 있었다. 저장소에서 **일곱 번째**였고, 파일 주석이 스스로 "DeepSpaceViews 의
// CAPTURE_ICON_INNER 와 같은 방식" 이라고 적고 있었다 — 같은 방식을 복제하는 것이
// 문제라는 것을 아무도 몰랐다는 뜻이다.
//
// 모르는 ref 종류는 `link` 로 떨어지던 것이 기존 동작이었다. `canonGlyph()` 는
// 그 자리를 일반 대체 표시로 바꾸는데, "링크"라고 단정하지 않는 편이 더 정직하다.
function MuseumGlyph({ name, color, size = 17 }: { name: string; color: string; size?: number }) {
  return <PixelGlyph name={canonGlyph(name)} color={color} size={size} />;
}

// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
const DECADES = canonMuseum.decades;

export function MuseumTimelineScreen() {
  const { t } = useTranslation("deepspace");
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
      duration: 240, easing: pixelStepsFor(240),
      useNativeDriver: true,
    }).start();
  }, [selId, sheetAnim]);

  // Connectors: dedupe rel pairs, color by the earlier (source) node's lane.
  const connectors = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; cells: LineCell[]; accent: string; a: string; b: string }[] = [];
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
        //
        // 공식은 그대로다. 바뀐 것은 **그리는 방법**이다 — 2차 베지에 하나를
        // `<Path>` 로 놓던 것을 정수 셀 계단으로 바꾸었다(규칙 1).
        // 셀은 2px — 원래 굵기가 1.2 라 1px 로 놓으면 끊겨 보인다.
        const cx = (ax + bx) / 2;
        const cy = MZ.AXIS + (pa.y < MZ.AXIS === pb.y < MZ.AXIS ? (pa.y < MZ.AXIS ? -34 : 34) : 0);
        const cells = stepQuad(ax, MZ.AXIS, cx, cy, bx, MZ.AXIS, MZ_LINK_CELL);
        out.push({ key, cells, accent: MZ_LANES[src.lane].accent, a: e.id, b: rid });
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
    <DeepSpaceScreen active="lens" variant="museumLike" title={t("deepspace:museum.title")} onBack={() => router.back()}>
      <View style={styles.body}>
        {/* range / hint bar */}
        <View style={styles.rangeRow}>
          <Text style={styles.rangeLabel}>{`${MZ.START} — 2026`}</Text>
          <Text style={styles.rangeHint}>{t("deepspace:museum.rangeHint")}</Text>
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
                <Line key={dy} x1={mzX(dy)} y1={0} x2={mzX(dy)} y2={MZ.TH} stroke={MUSEUM_GRID_LINE} strokeWidth={1} />
              ))}
              <Line x1={0} y1={MZ.AXIS} x2={MZ_CANVAS_W} y2={MZ.AXIS} stroke={MUSEUM_AXIS_LINE} strokeWidth={1.4} />
              {/* ⚠ 오늘 표시선은 **미리 합성한 색**이다(규칙 4). 이 파일은 이미 `mzDimLink` 로
                  같은 일을 하고 있었는데 이 한 줄만 opacity 로 남아 있었다. */}
              <Line x1={mzX(2026)} y1={0} x2={mzX(2026)} y2={MZ.TH} stroke={MZ_TODAY_LINE} strokeWidth={1} strokeDasharray="3 6" />
              {/* connectors */}
              {connectors.map((c) => {
                const active = selId === c.a || selId === c.b;
                // 선을 굵게/진하게 하던 `strokeWidth`·`opacity` 대신, 셀 크기와
                // **미리 합성한 색**으로 강조를 표현한다(규칙 1·4).
                const w = active ? MZ_LINK_CELL * 2 : MZ_LINK_CELL;
                const fill = active ? c.accent : mzDimLink(c.accent);
                return (
                  <Fragment key={c.key}>
                    {c.cells.map((p, i) => (
                      <Rect key={i} x={p.x} y={p.y} width={w} height={w} fill={fill} />
                    ))}
                  </Fragment>
                );
              })}
              {/* stems */}
              {MUSEUM.map((e) => {
                const p = placed.get(e.id);
                if (!p) return null;
                const cx = p.x + MZ.NODE_W / 2;
                const nodeEdge = p.y < MZ.AXIS ? p.y + MZ.NODE_H : p.y;
                return <Line key={`s-${e.id}`} x1={cx} y1={nodeEdge} x2={cx} y2={MZ.AXIS} stroke={mzAlpha(MZ_LANES[e.lane].accent, 0.5)} strokeWidth={1.2} />;
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
                    { left: p.x, top: p.y, borderColor: active ? lane.accent : mzAlpha(lane.accent, 0.35), backgroundColor: active ? lane.tint : mzAlpha(lane.accent, 0.1) },
                    e.here && styles.nodeHere,
                  ]}
                >
                  {/* bottom scrim so the title stays legible over the plate */}
                  {/* 넘치는 글을 가리는 층. 원래 `rgba(surface, 0.72)` 한 겹이었다 —
                      **픽셀아트는 흐리게 하지 않고 디더로 가린다**(규칙 4). 75% 체커 하나로
                      비슷한 어둡기를 내되 반투명은 한 픽셀도 없다. */}
                  <View pointerEvents="none" style={styles.nodeScrim}>
                    <PixelDither density={75} style={mzScrimTint} />
                  </View>
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
            accessibilityLabel={t("deepspace:museum.seekYear")}
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
              <Pressable onPress={() => step(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("deepspace:museum.prevEvent")} style={styles.stepBtn}>
                <Text style={styles.stepGlyph}>‹</Text>
              </Pressable>
              <Text style={styles.sheetCount}>{`${selIdx + 1} / ${MUSEUM_BY_YEAR.length}`}</Text>
              <Pressable onPress={() => step(1)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("deepspace:museum.nextEvent")} style={styles.stepBtn}>
                <Text style={styles.stepGlyph}>›</Text>
              </Pressable>
              <Pressable onPress={() => setSelId(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("deepspace:museum.close")} style={[styles.stepBtn, styles.closeBtn]}>
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
                      <Text style={[styles.laneChipText, { color: deepSpace.bgEdge }]}>{t("deepspace:museum.youAreHere")}</Text>
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
                          borderColor: mzAlpha(MZ_LANES[sel.lane].accent, 0.13),
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
                <View style={[styles.causeCard, { borderColor: mzAlpha(MZ_LANES[sel.lane].accent, 0.15) }]}>
                  {selDetail.cause ? (
                    <View style={styles.causeRow}>
                      <View style={styles.causeIcon}>
                        <MuseumGlyph name="south" color={MZ_LANES[sel.lane].accent} size={15} />
                      </View>
                      <View style={styles.causeText}>
                        <Text style={[styles.causeLabel, { color: MZ_LANES[sel.lane].accent }]}>
                          {t("deepspace:museum.background")}
                        </Text>
                        <Text style={styles.causeBody}>{selDetail.cause}</Text>
                      </View>
                    </View>
                  ) : null}
                  {selDetail.cause && selDetail.effect ? (
                    <View style={[styles.causeDivider, { backgroundColor: mzAlpha(MZ_LANES[sel.lane].accent, 0.12) }]} />
                  ) : null}
                  {selDetail.effect ? (
                    <View style={styles.causeRow}>
                      <View style={styles.causeIcon}>
                        <MuseumGlyph name="north_east" color={MZ_LANES[sel.lane].accent} size={15} />
                      </View>
                      <View style={styles.causeText}>
                        <Text style={[styles.causeLabel, { color: MZ_LANES[sel.lane].accent }]}>
                          {t("deepspace:museum.impact")}
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
                  <Text style={styles.sectionLabel}>{t("deepspace:museum.connected")}</Text>
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
                  <Text style={styles.sectionLabel}>{t("deepspace:museum.references")}</Text>
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
                      <MuseumGlyph name="open_in_new" color={MUSEUM_OPEN_ICON} size={15} />
                    </View>
                  ))}
                </View>
              ) : null}

              {sel.here ? (
                <MdButton
                  variant="filled"
                  label={t("deepspace:museum.backToConstellation")}
                  onPress={() => router.replace("/")}
                  accessibilityLabel={t("deepspace:museum.backToConstellation")}
                />
              ) : null}
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </DeepSpaceScreen>
  );
}

const SHEET_SURFACE = m3.color.surfaceContainerLow;

/** 디더 타일을 노드 표면색으로 물들인다 — 체커의 검은 칸이 카드색이 된다. */
const mzScrimTint = { tintColor: SHEET_SURFACE } as const;
const MUSEUM_TEXT_STRONG = m3.accent.shareInk;
const MUSEUM_TEXT_BODY = m3.accent.shareInkSoft;
const MUSEUM_TEXT_LONG = mzAlpha(m3.accent.consentFootnote, 0.72);
const MUSEUM_TEXT_CAUSE = mzAlpha(m3.accent.shareInkSoft, 0.82);
const MUSEUM_FAINT_WASH = mzAlpha(m3.accent.skyStarWhite, 0.02);
const MUSEUM_REF_WASH = mzAlpha(m3.accent.skyStarWhite, 0.03);
const MUSEUM_REF_BORDER = mzAlpha(m3.accent.skyStarWhite, 0.08);
/**
 * 연결선을 놓는 셀 크기. 원래 굵기가 1.2 라 2px 이다 — 1px 로 놓으면
 * 대각선이 점선처럼 끊겨 보인다.
 */
const MZ_LINK_CELL = 2;

/**
 * 연결선의 흰림 색 — 원래 `opacity={0.4}` 이 하던 일.
 * 미리 합성해 불투명 색 하나로 만든다(규칙 4).
 * 바닥은 무지엄 무대 바닥색이다.
 */
function mzDimLink(accent: string): string {
  return flattenAlpha(accent, 0.4, m3.accent.stageFloor);
}

/** 오늘(2026) 표시선 — 원래 `opacity={0.7}` 이 하던 일. 바닥은 무대 바닥색이다. */
const MZ_TODAY_LINE = flattenAlpha(MZ_LANES.ai.accent, 0.7, m3.accent.stageFloor);
const MUSEUM_OPEN_ICON = mzAlpha(m3.accent.skyStarWhite, 0.32);
const MUSEUM_GRID_LINE = mzAlpha(m3.accent.entryTag, 0.09);
const MUSEUM_AXIS_LINE = mzAlpha(m3.accent.entryTag, 0.35);
const MUSEUM_TEXT_SHADOW = withAlpha(m3.color.scrim, 0.9);

const styles = StyleSheet.create({
  body: { flex: 1 },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rangeLabel: { fontFamily: m3.font.mono, fontSize: 12, color: deepSpace.textHi },
  rangeHint: { fontSize: 11, color: mzAlpha(deepSpace.accentSoft, 0.7) },
  viewport: { flex: 1 },
  laneCol: { position: "absolute", left: 4, top: 0, bottom: 0, width: 42, zIndex: 2 },
  laneTag: { position: "absolute", left: 0, width: 34, alignItems: "center", gap: 6 },
  laneDot: {
    width: 9,
    height: 9,
    borderRadius: m3.shape.none,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  laneVertical: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 13,
    textAlign: "center",
    textShadowColor: MUSEUM_TEXT_SHADOW,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  decade: { position: "absolute", fontFamily: m3.font.mono, fontSize: 10, color: mzAlpha(deepSpace.accentSoft, 0.6) },
  node: {
    position: "absolute",
    width: MZ.NODE_W,
    height: MZ.NODE_H,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    backgroundColor: SHEET_SURFACE,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  nodeScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "62%", overflow: "hidden" },
  nodeHere: { shadowColor: MZ_LANES.ai.accent, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  nodeNow: { position: "absolute", top: 7, right: 9, fontFamily: m3.font.mono, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  nodeYear: { fontFamily: m3.font.mono, fontSize: 10 },
  nodeTitle: { fontSize: 12.5, fontWeight: "700", color: MUSEUM_TEXT_STRONG },
  dialBlock: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 6 },
  dialHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  dialYear: { fontFamily: m3.font.mono, fontSize: 24, color: deepSpace.accentBright },
  dialCap: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.4, color: mzAlpha(deepSpace.accentSoft, 0.6) },
  dialTrack: { height: 10, borderRadius: m3.shape.none, backgroundColor: mzAlpha(deepSpace.accent, 0.12), overflow: "hidden" },
  dialPlayhead: { position: "absolute", top: 0, bottom: 0, width: 8, borderRadius: m3.shape.none, backgroundColor: MZ_LANES.world.accent },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: 380,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: SHEET_SURFACE,
    borderTopWidth: 1,
    borderColor: mzAlpha(deepSpace.accent, 0.25),
    paddingTop: spacing.sm,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, paddingBottom: spacing.xs },
  sheetCount: { fontFamily: m3.font.mono, fontSize: 12, color: mzAlpha(deepSpace.accentSoft, 0.8), minWidth: 52, textAlign: "center" },
  stepBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  closeBtn: { position: "absolute", right: spacing.sm },
  stepGlyph: { fontSize: 22, color: deepSpace.textHi },
  sheetScroll: { flexGrow: 0 },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  plate: { borderRadius: m3.shape.none, padding: spacing.md, gap: 4 },
  plateChipRow: { flexDirection: "row", gap: 8, marginBottom: 2 },
  laneChip: { borderWidth: 1, borderRadius: m3.shape.none, paddingHorizontal: 10, paddingVertical: 3 },
  laneChipText: { fontSize: 10.5, fontWeight: "600" },
  hereChip: { backgroundColor: m3.accent.moodPositive, borderColor: m3.accent.moodPositive },
  plateYear: { fontFamily: m3.font.mono, fontSize: 12 },
  plateTitle: { color: MUSEUM_TEXT_STRONG },
  plateSub: { fontSize: 13, color: mzAlpha(deepSpace.accentSoft, 0.85) },
  bodyText: { fontSize: 13.5, lineHeight: 21, color: MUSEUM_TEXT_BODY },
  // MZ_DETAIL sections (prototype MzSheet: long copy, facts grid, 배경/영향)
  longText: { fontSize: 13, lineHeight: 22, color: MUSEUM_TEXT_LONG },
  factsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  factCell: {
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: m3.shape.none,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 3,
  },
  factLabel: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.1 },
  factValue: { fontSize: 13.5, fontWeight: "700", color: MUSEUM_TEXT_STRONG, lineHeight: 17.5 },
  causeCard: { borderWidth: 1, borderRadius: m3.shape.none, backgroundColor: MUSEUM_FAINT_WASH, overflow: "hidden" },
  causeRow: { flexDirection: "row", gap: 11, paddingHorizontal: 13, paddingVertical: 11 },
  causeIcon: { marginTop: 1 },
  causeText: { flex: 1, gap: 3 },
  causeLabel: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.3 },
  causeBody: { fontSize: 13, lineHeight: 19.5, color: MUSEUM_TEXT_CAUSE },
  causeDivider: { height: 1, marginHorizontal: 13 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tagChip: { borderRadius: m3.shape.none, borderWidth: 1, borderColor: mzAlpha(deepSpace.accent, 0.3), paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, color: mzAlpha(deepSpace.accentSoft, 0.9) },
  section: { gap: 6 },
  sectionLabel: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.2, color: mzAlpha(deepSpace.accentSoft, 0.7) },
  relRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: mzAlpha(deepSpace.accent, 0.2), borderRadius: m3.shape.none, paddingHorizontal: 12 },
  relYear: { fontFamily: m3.font.mono, fontSize: 10, minWidth: 44 },
  relTitle: { flex: 1, fontSize: 13, color: MUSEUM_TEXT_STRONG },
  relGo: { fontSize: 14, color: deepSpace.textHi },
  // refs — prototype rows: 32px tinted glyph box, label over refKo kind, dim open_in_new
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: MUSEUM_REF_BORDER,
    borderRadius: m3.shape.none,
    backgroundColor: MUSEUM_REF_WASH,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refIconBox: { width: 32, height: 32, borderRadius: m3.shape.none, alignItems: "center", justifyContent: "center" },
  refBody: { flex: 1, gap: 1 },
  refKind: { fontFamily: m3.font.mono, fontSize: 10, color: mzAlpha(deepSpace.accentSoft, 0.8) },
  refLabel: { fontSize: 13.5, fontWeight: "500", color: MUSEUM_TEXT_STRONG },
});
