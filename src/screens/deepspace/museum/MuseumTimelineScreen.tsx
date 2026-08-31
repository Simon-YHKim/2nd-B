// AI museum: the full 43-event editorial canon on a two-lane PIXEL-CLAY
// timeline. The data conversion, stable ordering, geometry, and reference
// labels remain owned by museum-timeline-data.ts. This file owns rendering and
// local selection/seek state only.
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Rect } from "react-native-svg";
import { router } from "expo-router";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelDither } from "@/components/pixel/PixelDither";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { canonGlyph } from "@/components/pixel/pixel-glyphs";
import { stepQuad, type LineCell } from "@/components/pixel/pixel-line";
import { Text } from "@/components/ui/Text";
import { canonMuseum } from "@/lib/canon";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { m3 } from "@/lib/theme/m3";

import {
  MUSEUM_INITIAL_YEAR,
  MUSEUM_VISIBLE_MAX_YEAR,
  beginMuseumSheetTransition,
  clampMuseumYear,
  museumDialFractionForYear,
  museumScrollXForYear,
  museumTargetId,
  museumYearFromDial,
  museumYearFromScroll,
  stepMuseumSelection,
  toggleMuseumSelection,
} from "./museum-interaction";
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
  type MuseumLaneId,
} from "./museum-timeline-data";
import {
  MUSEUM_AXIS as AXIS,
  MUSEUM_GRID as GRID,
  MUSEUM_GROUND as GROUND,
  MUSEUM_LANE_TONE as LANE_TONE,
  MUSEUM_PANEL as PANEL,
  MUSEUM_SECTION_WASH as SECTION_WASH,
  MUSEUM_TODAY as TODAY,
  museumTimelineStyles as styles,
} from "./museum-timeline-styles";

const DECADES = canonMuseum.decades;
const MUSEUM_IDS = new Set(MUSEUM.map((event) => event.id));
const MZ_LINK_CELL = 2;
const MZ_TODAY_DASH = 8;
const MZ_TODAY_DASHES = Array.from(
  { length: Math.ceil(MZ.TH / MZ_TODAY_DASH) },
  (_, index) => index * MZ_TODAY_DASH,
);

function MuseumGlyph({ name, color, size = 24 }: { name: string; color: string; size?: number }) {
  return <PixelGlyph name={canonGlyph(name)} color={color} size={size} />;
}

function SheetAction({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <PixelPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      rootStyle={styles.sheetActionRoot}
      contentStyle={styles.sheetActionContent}
      background={disabled ? m3.disabled.surfaceContainerLow : m3.color.surfaceContainerHigh}
    >
      <MuseumGlyph
        name={icon}
        color={disabled ? m3.disabled.onSurface : m3.accent.skyTextHi}
        size={24}
      />
    </PixelPressable>
  );
}

export function MuseumTimelineScreen() {
  const { t } = useTranslation("deepspace");
  const { width: windowWidth } = useWindowDimensions();
  const compact = windowWidth < 360;
  const reducedMotionPref = useReducedMotionPref();
  const [nativeReducedMotion, setNativeReducedMotion] = useState(false);
  const reducedMotion = reducedMotionPref || nativeReducedMotion;

  const scrollRef = useRef<ScrollView>(null);
  const didInitialSeek = useRef(false);
  const viewportWidth = useRef(390);
  const dialWidth = useRef(1);
  const [dialMeasuredWidth, setDialMeasuredWidth] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [year, setYear] = useState(MUSEUM_INITIAL_YEAR);

  const placed = useMemo(() => placeMuseumNodes(MUSEUM), []);
  const selected = selectedId ? museumEventById(selectedId) : undefined;
  const selectedIndex = selected
    ? MUSEUM_BY_YEAR.findIndex((event) => event.id === selected.id)
    : -1;
  const selectedDetail = selected ? museumDetailById(selected.id) : undefined;
  const previousId = stepMuseumSelection(MUSEUM_BY_YEAR, selectedId, -1);
  const nextId = stepMuseumSelection(MUSEUM_BY_YEAR, selectedId, 1);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setNativeReducedMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setNativeReducedMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const sheetAnimation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    return beginMuseumSheetTransition(
      sheetAnimation,
      selectedId !== null,
      reducedMotion,
      () =>
        Animated.timing(sheetAnimation, {
          toValue: 1,
          duration: 120,
          easing: pixelStepsFor(120),
          useNativeDriver: true,
        }),
    );
  }, [reducedMotion, selectedId, sheetAnimation]);

  const connectors = useMemo(() => {
    const seen = new Set<string>();
    const output: {
      key: string;
      cells: LineCell[];
      lane: MuseumLaneId;
      firstId: string;
      secondId: string;
    }[] = [];
    for (const event of MUSEUM) {
      for (const relatedId of event.rel) {
        const key = [event.id, relatedId].sort().join("~");
        if (seen.has(key)) continue;
        seen.add(key);
        const related = museumEventById(relatedId);
        const first = placed.get(event.id);
        const second = related ? placed.get(related.id) : undefined;
        if (!related || !first || !second) continue;
        const firstX = first.x + MZ.NODE_W / 2;
        const secondX = second.x + MZ.NODE_W / 2;
        const source = event.year <= related.year ? event : related;
        const controlX = Math.round((firstX + secondX) / 2);
        const sameSide = (first.y < MZ.AXIS) === (second.y < MZ.AXIS);
        const controlY = MZ.AXIS + (sameSide ? (first.y < MZ.AXIS ? -34 : 34) : 0);
        output.push({
          key,
          cells: stepQuad(
            firstX,
            MZ.AXIS,
            controlX,
            controlY,
            secondX,
            MZ.AXIS,
            MZ_LINK_CELL,
          ),
          lane: source.lane,
          firstId: event.id,
          secondId: relatedId,
        });
      }
    }
    return output;
  }, [placed]);

  const seekToYear = useCallback((targetYear: number, animated: boolean) => {
    const safeYear = clampMuseumYear(targetYear);
    scrollRef.current?.scrollTo({
      x: museumScrollXForYear(safeYear, viewportWidth.current),
      animated,
    });
    setYear(Math.round(safeYear));
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setYear(
      museumYearFromScroll(
        event.nativeEvent.contentOffset.x,
        event.nativeEvent.layoutMeasurement.width,
      ),
    );
  }, []);

  const jumpTo = useCallback(
    (candidateId: string) => {
      const targetId = museumTargetId(candidateId, MUSEUM_IDS);
      const position = targetId ? placed.get(targetId) : undefined;
      if (!targetId || !position) return;
      scrollRef.current?.scrollTo({
        x: Math.max(
          0,
          Math.round(position.x + MZ.NODE_W / 2 - viewportWidth.current / 2),
        ),
        animated: true,
      });
      setSelectedId(targetId);
    },
    [placed],
  );

  const step = useCallback(
    (direction: -1 | 1) => {
      const targetId = stepMuseumSelection(MUSEUM_BY_YEAR, selectedId, direction);
      if (targetId) jumpTo(targetId);
    },
    [jumpTo, selectedId],
  );
  const stepRef = useRef(step);
  stepRef.current = step;

  const seekToDialX = useCallback(
    (pointerX: number) => {
      seekToYear(museumYearFromDial(pointerX, dialWidth.current), false);
    },
    [seekToYear],
  );
  const dialPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => seekToDialX(event.nativeEvent.locationX),
        onPanResponderMove: (event) => seekToDialX(event.nativeEvent.locationX),
      }),
    [seekToDialX],
  );

  const sheetPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx <= -60) stepRef.current(1);
          else if (gesture.dx >= 60) stepRef.current(-1);
        },
      }),
    [],
  );

  const yearFraction = museumDialFractionForYear(year);
  const playheadLeft = Math.round(
    Math.min(1, Math.max(0, yearFraction)) * Math.max(0, dialMeasuredWidth - 8),
  );

  return (
    <DeepSpaceScreen
      active="lens"
      variant="museumLike"
      title={t("deepspace:museum.title")}
      onBack={() => router.back()}
    >
      <View style={styles.body}>
        <PixelSurface variant="inset" contentStyle={styles.rangeRow}>
          <Text style={styles.rangeLabel}>{`${MZ.START} — ${MUSEUM_VISIBLE_MAX_YEAR}`}</Text>
          <Text style={styles.rangeHint}>{t("deepspace:museum.rangeHint")}</Text>
        </PixelSurface>

        <View
          style={styles.viewport}
          onLayout={(event) => {
            viewportWidth.current = Math.max(1, event.nativeEvent.layout.width);
            if (didInitialSeek.current) return;
            didInitialSeek.current = true;
            seekToYear(MUSEUM_INITIAL_YEAR, false);
          }}
        >
          <View pointerEvents="none" style={styles.laneColumn}>
            {(["world", "ai"] as const).map((laneId, index) => {
              const lane = MZ_LANES[laneId];
              const tone = LANE_TONE[laneId];
              return (
                <PixelSurface
                  key={laneId}
                  variant="flat"
                  background={tone.wash}
                  style={[styles.laneMarker, { top: index === 0 ? 18 : 246 }]}
                  contentStyle={styles.laneMarkerContent}
                >
                  <View style={[styles.laneSquare, { backgroundColor: tone.accent }]} />
                  <Text style={[styles.laneVertical, { color: tone.ink }]}>
                    {lane.label.replace(/\s+/g, "").split("").join("\n")}
                  </Text>
                </PixelSurface>
              );
            })}
          </View>

          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
            contentContainerStyle={styles.timelineCanvas}
          >
            <Svg
              width={MZ_CANVAS_W}
              height={MZ.TH}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              {DECADES.map((decade) => (
                <Rect
                  key={decade}
                  x={Math.round(mzX(decade))}
                  y={0}
                  width={1}
                  height={MZ.TH}
                  fill={GRID}
                />
              ))}
              <Rect x={0} y={MZ.AXIS} width={MZ_CANVAS_W} height={2} fill={AXIS} />
              {MZ_TODAY_DASHES.map((top) => (
                <Rect
                  key={top}
                  x={Math.round(mzX(MUSEUM_VISIBLE_MAX_YEAR))}
                  y={top}
                  width={2}
                  height={4}
                  fill={TODAY}
                />
              ))}

              {connectors.map((connector) => {
                const active =
                  selectedId === connector.firstId || selectedId === connector.secondId;
                const tone = LANE_TONE[connector.lane];
                const size = active ? MZ_LINK_CELL * 2 : MZ_LINK_CELL;
                return (
                  <Fragment key={connector.key}>
                    {connector.cells.map((cell, index) => (
                      <Rect
                        key={index}
                        x={cell.x}
                        y={cell.y}
                        width={size}
                        height={size}
                        fill={active ? tone.accent : tone.mutedLine}
                      />
                    ))}
                  </Fragment>
                );
              })}

              {MUSEUM.map((event) => {
                const position = placed.get(event.id);
                if (!position) return null;
                const centreX = Math.round(position.x + MZ.NODE_W / 2);
                const nodeEdge =
                  position.y < MZ.AXIS ? position.y + MZ.NODE_H : position.y;
                const top = Math.min(nodeEdge, MZ.AXIS);
                return (
                  <Rect
                    key={`stem-${event.id}`}
                    x={centreX}
                    y={Math.round(top)}
                    width={2}
                    height={Math.max(2, Math.round(Math.abs(MZ.AXIS - nodeEdge)))}
                    fill={LANE_TONE[event.lane].mutedLine}
                  />
                );
              })}
            </Svg>

            {DECADES.map((decade) => (
              <PixelSurface
                key={`decade-${decade}`}
                variant="flat"
                background={GROUND}
                style={[
                  styles.decadeMarker,
                  { left: mzX(decade) + 4, top: MZ.AXIS - 18 },
                ]}
                contentStyle={styles.decadeMarkerContent}
              >
                <Text style={styles.decadeText}>{`’${String(decade).slice(2)}`}</Text>
              </PixelSurface>
            ))}

            {MUSEUM.map((event) => {
              const position = placed.get(event.id);
              if (!position) return null;
              const active = selectedId === event.id;
              const tone = LANE_TONE[event.lane];
              return (
                <PixelPressable
                  key={event.id}
                  onPress={() =>
                    setSelectedId((current) =>
                      toggleMuseumSelection(current, event.id, MUSEUM_IDS),
                    )
                  }
                  accessibilityLabel={`${event.ylabel} ${event.title}`}
                  accessibilityState={{ selected: active, expanded: active }}
                  rootStyle={[
                    styles.nodeRoot,
                    { left: position.x, top: position.y },
                  ]}
                  contentStyle={styles.nodeContent}
                  background={active ? tone.selected : tone.wash}
                  variant={active ? "inset" : "bevel"}
                >
                  <PixelDither
                    density={active ? 50 : 25}
                    style={{ tintColor: active ? tone.accent : tone.wash }}
                  />
                  <View style={styles.nodeTextLayer}>
                    <Text style={[styles.nodeYear, { color: tone.accent }]}>
                      {event.ylabel}
                    </Text>
                    {event.here ? (
                      <Text style={[styles.nodeNow, { color: tone.ink }]}>NOW</Text>
                    ) : null}
                    <Text style={styles.nodeTitle} numberOfLines={2}>
                      {event.title}
                    </Text>
                  </View>
                </PixelPressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.dialBlock}>
          <View style={styles.dialHeading}>
            <Text style={styles.dialYear}>{year}</Text>
            <Text style={styles.dialCaption}>YEAR</Text>
          </View>
          <View
            style={styles.dialHitArea}
            onLayout={(event) => {
              const measured = Math.max(1, Math.round(event.nativeEvent.layout.width - 4));
              dialWidth.current = measured;
              setDialMeasuredWidth(measured);
            }}
            {...dialPan.panHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t("deepspace:museum.seekYear")}
            accessibilityValue={{
              min: MZ.START,
              max: MUSEUM_VISIBLE_MAX_YEAR,
              now: year,
              text: String(year),
            }}
            accessibilityActions={[
              { name: "decrement", label: t("deepspace:museum.prevEvent") },
              { name: "increment", label: t("deepspace:museum.nextEvent") },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "increment") seekToYear(year + 1, false);
              if (event.nativeEvent.actionName === "decrement") seekToYear(year - 1, false);
            }}
          >
            <PixelSurface
              variant="inset"
              style={styles.dialSurface}
              contentStyle={styles.dialSurfaceContent}
            >
              <View style={styles.dialTrack}>
                <View
                  pointerEvents="none"
                  style={[styles.dialPlayhead, { left: playheadLeft }]}
                />
              </View>
            </PixelSurface>
          </View>
        </View>

        {selected ? (
          <Animated.View
            style={[
              styles.sheet,
              compact && styles.sheetCompact,
              {
                transform: [
                  {
                    translateY: sheetAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [32, 0],
                    }),
                  },
                ],
              },
            ]}
            accessibilityViewIsModal
            accessibilityLiveRegion="polite"
            accessibilityState={{ expanded: true }}
            {...sheetPan.panHandlers}
          >
            <PixelSurface
              variant="bevel"
              background={PANEL}
              contentStyle={styles.sheetSurfaceContent}
            >
              <View style={styles.sheetHeader}>
                <SheetAction
                  icon="chevron_left"
                  label={t("deepspace:museum.prevEvent")}
                  disabled={!previousId}
                  onPress={() => step(-1)}
                />
                <PixelSurface
                  variant="inset"
                  style={styles.sheetCountSurface}
                  contentStyle={styles.sheetCountContent}
                >
                  <Text style={styles.sheetCount}>
                    {`${selectedIndex + 1} / ${MUSEUM_BY_YEAR.length}`}
                  </Text>
                </PixelSurface>
                <SheetAction
                  icon="chevron_right"
                  label={t("deepspace:museum.nextEvent")}
                  disabled={!nextId}
                  onPress={() => step(1)}
                />
                <SheetAction
                  icon="close"
                  label={t("deepspace:museum.close")}
                  onPress={() => setSelectedId(null)}
                />
              </View>

              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetBody}
                showsVerticalScrollIndicator={false}
              >
                <PixelSurface
                  variant="inset"
                  background={LANE_TONE[selected.lane].wash}
                  contentStyle={styles.plate}
                >
                  <View style={styles.plateMeta}>
                    <View
                      style={[
                        styles.squareBadge,
                        { borderColor: LANE_TONE[selected.lane].accent },
                      ]}
                    >
                      <Text
                        style={[
                          styles.squareBadgeText,
                          { color: LANE_TONE[selected.lane].ink },
                        ]}
                      >
                        {MZ_LANES[selected.lane].label}
                      </Text>
                    </View>
                    {selected.here ? (
                      <View style={styles.hereBadge}>
                        <Text style={styles.hereBadgeText}>
                          {t("deepspace:museum.youAreHere")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.plateYear,
                      { color: LANE_TONE[selected.lane].accent },
                    ]}
                  >
                    {selected.ylabel}
                  </Text>
                  <Text variant="heading" style={styles.plateTitle}>
                    {selected.title}
                  </Text>
                  <Text style={styles.plateSubtitle}>{selected.sub}</Text>
                </PixelSurface>

                <Text style={styles.bodyText}>{selected.body}</Text>
                {selectedDetail?.long ? (
                  <Text style={styles.longText}>{selectedDetail.long}</Text>
                ) : null}

                {selectedDetail?.facts && selectedDetail.facts.length > 0 ? (
                  <View style={styles.factGrid}>
                    {selectedDetail.facts.map((fact, index) => (
                      <PixelSurface
                        key={`${fact[0]}-${index}`}
                        variant="inset"
                        background={LANE_TONE[selected.lane].wash}
                        style={[styles.factSurface, compact && styles.factSurfaceCompact]}
                        contentStyle={styles.factCell}
                      >
                        <Text
                          style={[
                            styles.factLabel,
                            { color: LANE_TONE[selected.lane].accent },
                          ]}
                        >
                          {fact[0]}
                        </Text>
                        <Text style={styles.factValue}>{fact[1]}</Text>
                      </PixelSurface>
                    ))}
                  </View>
                ) : null}

                {selectedDetail?.cause || selectedDetail?.effect ? (
                  <PixelSurface
                    variant="frame"
                    background={SECTION_WASH}
                    contentStyle={styles.causeCard}
                  >
                    {selectedDetail.cause ? (
                      <View style={styles.causeRow}>
                        <MuseumGlyph
                          name="south"
                          color={LANE_TONE[selected.lane].accent}
                          size={24}
                        />
                        <View style={styles.causeText}>
                          <Text
                            style={[
                              styles.causeLabel,
                              { color: LANE_TONE[selected.lane].accent },
                            ]}
                          >
                            {t("deepspace:museum.background")}
                          </Text>
                          <Text style={styles.causeBody}>{selectedDetail.cause}</Text>
                        </View>
                      </View>
                    ) : null}
                    {selectedDetail.cause && selectedDetail.effect ? (
                      <View style={styles.causeDivider} />
                    ) : null}
                    {selectedDetail.effect ? (
                      <View style={styles.causeRow}>
                        <MuseumGlyph
                          name="north_east"
                          color={LANE_TONE[selected.lane].accent}
                          size={24}
                        />
                        <View style={styles.causeText}>
                          <Text
                            style={[
                              styles.causeLabel,
                              { color: LANE_TONE[selected.lane].accent },
                            ]}
                          >
                            {t("deepspace:museum.impact")}
                          </Text>
                          <Text style={styles.causeBody}>{selectedDetail.effect}</Text>
                        </View>
                      </View>
                    ) : null}
                  </PixelSurface>
                ) : null}

                {selected.tags.length > 0 ? (
                  <View style={styles.tagRow}>
                    {selected.tags.map((tag) => (
                      <View key={tag} style={styles.tagBadge}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {selected.rel.some((relatedId) => museumTargetId(relatedId, MUSEUM_IDS)) ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>
                      {t("deepspace:museum.connected")}
                    </Text>
                    {selected.rel.map((relatedId) => {
                      const safeId = museumTargetId(relatedId, MUSEUM_IDS);
                      const related = safeId ? museumEventById(safeId) : undefined;
                      if (!related) return null;
                      return (
                        <PixelPressable
                          key={related.id}
                          onPress={() => jumpTo(related.id)}
                          accessibilityLabel={related.title}
                          fullWidth
                          variant="inset"
                          contentStyle={styles.relatedRow}
                          background={LANE_TONE[related.lane].wash}
                        >
                          <Text
                            style={[
                              styles.relatedYear,
                              { color: LANE_TONE[related.lane].accent },
                            ]}
                          >
                            {related.ylabel}
                          </Text>
                          <Text style={styles.relatedTitle}>{related.title}</Text>
                          <MuseumGlyph
                            name="chevron_right"
                            color={m3.accent.skyTextHi}
                            size={24}
                          />
                        </PixelPressable>
                      );
                    })}
                  </View>
                ) : null}

                {selected.refs.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>
                      {t("deepspace:museum.references")}
                    </Text>
                    {selected.refs.map((reference, index) => (
                      <View
                        key={`${reference.kind}-${reference.label}-${index}`}
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={`${MUSEUM_REF_LABEL[reference.kind]} ${reference.label}`}
                      >
                        <PixelSurface
                          variant="inset"
                          background={SECTION_WASH}
                          contentStyle={styles.referenceRow}
                        >
                          <PixelSurface
                            variant="flat"
                            background={LANE_TONE[selected.lane].wash}
                            contentStyle={styles.referenceIcon}
                          >
                            <MuseumGlyph
                              name={MUSEUM_REF_ICON[reference.kind]}
                              color={LANE_TONE[selected.lane].accent}
                              size={24}
                            />
                          </PixelSurface>
                          <View style={styles.referenceBody}>
                            <Text style={styles.referenceLabel}>{reference.label}</Text>
                            <Text style={styles.referenceKind}>
                              {MUSEUM_REF_LABEL[reference.kind]}
                            </Text>
                          </View>
                        </PixelSurface>
                      </View>
                    ))}
                  </View>
                ) : null}

                {selected.here ? (
                  <PixelPressable
                    onPress={() => router.replace("/")}
                    accessibilityLabel={t("deepspace:museum.backToConstellation")}
                    fullWidth
                    contentStyle={styles.homeAction}
                    background={m3.color.primary}
                  >
                    <MuseumGlyph name="home" color={m3.color.onPrimary} size={24} />
                    <Text style={styles.homeActionLabel}>
                      {t("deepspace:museum.backToConstellation")}
                    </Text>
                  </PixelPressable>
                ) : null}
              </ScrollView>
            </PixelSurface>
          </Animated.View>
        ) : null}
      </View>
    </DeepSpaceScreen>
  );
}
