import { PhoneAnimatedView, PhoneFlatList as FlatList, PhoneScrollView as ScrollView, PhoneView as View } from "@/components/phone/PhoneUIKit";
// AI museum: the full 43-event editorial canon on a two-lane PIXEL-CLAY
// timeline. The data conversion, stable ordering, geometry, and reference
// labels remain owned by museum-timeline-data.ts. This file owns rendering and
// local selection/seek state only.
import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BackHandler, AccessibilityInfo, Animated, PanResponder, StyleSheet, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Rect } from "react-native-svg";
import { router, useFocusEffect } from "expo-router";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
// MdButton and the M3 colour-token imports left with the renderer this PR
// replaced. The alpha-compositing helper in particular is banned on a migrated
// screen (rule 4 is dither, not transparency) and museum-pixel-screen.test.ts
// scans this file for the identifier -- so do not name it here either.
import { PixelDither } from "@/components/pixel/PixelDither";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { canonGlyph } from "@/components/pixel/pixel-glyphs";
import { stepQuad, type LineCell } from "@/components/pixel/pixel-line";
import { Text } from "@/components/ui/Text";
// Deliberately the ./museum subpath, not the @/lib/canon barrel: 458d3a8b kept
// the AI 뮤지엄 pack out of the canon index so it stays off the web entry, and
// web-bundle-shims.test.ts fails the build if anything else pulls it in.
import { CANON_MUSEUM_LANGUAGE, canonMuseum } from "@/lib/canon/museum";
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
  museumStepEventYear,
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
// The translation overlay (Simon 2026-09-07, R24-MUSEUM-04 ②). The canon pack
// stays Korean; an event with an English entry resolves to English AND reports
// English to assistive technology. One without keeps both. The screen never
// decides the language itself - see museum-translation.ts for why that pairing
// is the whole point.
import {
  museumContentLanguage,
  readsMuseumCanon,
  resolveMuseumDetail,
  resolveMuseumEvent,
  resolveMuseumRefKindLabel,
} from "./museum-translation";
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
import { a11yValue } from "@/lib/a11y/accessibility-value";

const DECADES = canonMuseum.decades;
const MUSEUM_IDS = new Set(MUSEUM.map((event) => event.id));
const MUSEUM_RECENT_FIRST = [...MUSEUM_BY_YEAR].reverse();
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

export interface MuseumPhonePresentation {
  /** Width of the phone's live display, not the desktop/browser window. */
  width: number;
  onBack: () => void;
  backLabel: string;
}

/** A phone page must give this screen a bounded flex height outside its FlatList. */
export function MuseumPhoneContent(props: MuseumPhonePresentation) {
  return <MuseumTimelineScreen phone={props} />;
}

function MuseumViewportHost({ phone, children }: { phone: boolean; children: React.ReactNode }) {
  if (!phone) return <>{children}</>;
  // The 400px two-lane canvas must scroll vertically on a short phone. Its own
  // timeline remains horizontal; the phone page itself must not scroll.
  return (
    <ScrollView style={styles.viewport} contentContainerStyle={styles.phoneViewportScroll} nestedScrollEnabled>
      {children}
    </ScrollView>
  );
}

function MuseumShell({ phone, title, onBack, backLabel, children }: {
  phone?: MuseumPhonePresentation;
  title: string;
  onBack: () => void;
  backLabel: string;
  children: React.ReactNode;
}) {
  if (phone) {
    return (
      <View style={styles.phoneRoot}>
        <PixelPressable
          onPress={onBack}
          accessibilityLabel={backLabel}
          fullWidth
          background={PANEL}
          contentStyle={styles.phoneHeader}
        >
          <PixelGlyph name="arrow_back" color={m3.accent.skyTextHi} size={24} />
          <Text variant="heading" numberOfLines={1} style={styles.phoneTitle}>{title}</Text>
        </PixelPressable>
        {children}
      </View>
    );
  }
  return (
    <DeepSpaceScreen active="lens" variant="museumLike" title={title} onBack={onBack}>
      {children}
    </DeepSpaceScreen>
  );
}

function MuseumSheetSurface({ phone, children }: { phone: boolean; children: React.ReactNode }) {
  if (phone) return <View style={styles.phoneSheetSurface}>{children}</View>;
  return (
    <PixelSurface variant="bevel" background={PANEL} contentStyle={styles.sheetSurfaceContent}>
      {children}
    </PixelSurface>
  );
}

export function MuseumTimelineScreen({ phone }: { phone?: MuseumPhonePresentation } = {}) {
  const { t, i18n } = useTranslation("deepspace");
  const locale = i18n.language ?? "en";
  const { width: windowWidth } = useWindowDimensions();
  const compact = (phone?.width ?? windowWidth) < 360;
  const compactTimeline = (phone?.width ?? windowWidth) < 600;
  const [mobileMode, setMobileMode] = useState<"overview" | "timeline">("overview");
  const reducedMotionPref = useReducedMotionPref();
  const [nativeReducedMotion, setNativeReducedMotion] = useState(false);
  const reducedMotion = reducedMotionPref || nativeReducedMotion;

  const scrollRef = useRef<ScrollView>(null);
  const didInitialSeek = useRef(false);
  const initialSeekYear = useRef(MUSEUM_INITIAL_YEAR);
  const viewportWidth = useRef(390);
  const dialWidth = useRef(1);
  const [dialMeasuredWidth, setDialMeasuredWidth] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [year, setYear] = useState(MUSEUM_INITIAL_YEAR);

  const placed = useMemo(() => placeMuseumNodes(MUSEUM), []);
  const canonSelected = selectedId ? museumEventById(selectedId) : undefined;
  const selected = canonSelected ? resolveMuseumEvent(canonSelected, locale) : undefined;
  const overviewFocus = selected ?? resolveMuseumEvent(
    MUSEUM_RECENT_FIRST.find((event) => event.year <= year) ?? MUSEUM_RECENT_FIRST[0],
    locale,
  );
  const selectedIndex = selected
    ? MUSEUM_BY_YEAR.findIndex((event) => event.id === selected.id)
    : -1;
  const selectedDetail = selected
    ? resolveMuseumDetail(selected.id, museumDetailById(selected.id), locale)
    : undefined;
  // The sheet tags one language for its whole body, so it has to be the
  // language of THIS event - not a constant, now that some events are English
  // and some are not.
  const selectedLanguage = selected
    ? museumContentLanguage(selected.id, locale)
    : CANON_MUSEUM_LANGUAGE;
  const previousId = stepMuseumSelection(MUSEUM_BY_YEAR, selectedId, -1);
  const nextId = stepMuseumSelection(MUSEUM_BY_YEAR, selectedId, 1);
  const phoneBack = phone?.onBack;
  const back = useCallback(() => {
    if (!phoneBack) {
      router.back();
    } else if (selectedId !== null) {
      setSelectedId(null);
    } else {
      phoneBack();
    }
  }, [phoneBack, selectedId]);

  useFocusEffect(useCallback(() => {
    if (!phoneBack) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      back();
      return true;
    });
    return () => subscription.remove();
  }, [back, phoneBack, selectedId]));

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
      const target = museumEventById(targetId);
      if (target) setYear(target.year);
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
    <MuseumShell
      phone={phone}
      title={t("deepspace:museum.title")}
      onBack={back}
      backLabel={selectedId ? t("deepspace:museum.close") : phone?.backLabel ?? t("deepspace:museum.title")}
    >
      <View style={styles.body}>
        {/* In the phone the mode buttons below already name the active view,
            and the 1936-2026 range costs the timeline its height on a short
            display (49px at 320x568, 2026-10-01 QA). */}
        {phone && compactTimeline ? null : <PixelSurface variant="inset" contentStyle={styles.rangeRow}>
          <Text style={styles.rangeLabel}>{`${MZ.START} - ${MUSEUM_VISIBLE_MAX_YEAR}`}</Text>
          <Text style={styles.rangeHint}>
            {compactTimeline && mobileMode === "overview"
              ? t("deepspace:museum.seekYear")
              : t("deepspace:museum.rangeHint")}
          </Text>
        </PixelSurface>}

        {compactTimeline ? (
          <View style={styles.mobileModeRow}>
            {(["overview", "timeline"] as const).map((mode) => (
              <PixelPressable
                key={mode}
                onPress={() => {
                  if (mode === "timeline") {
                    initialSeekYear.current = selected?.year ?? year;
                    didInitialSeek.current = false;
                  }
                  setMobileMode(mode);
                }}
                accessibilityLabel={t(mode === "overview" ? "deepspace:museum.seekYear" : "deepspace:museum.rangeHint")}
                accessibilityState={{ selected: mobileMode === mode }}
                rootStyle={styles.mobileModeButton}
                contentStyle={styles.mobileModeButtonContent}
                variant={mobileMode === mode ? "inset" : "bevel"}
              >
                <Text style={styles.mobileModeText}>
                  {t(mode === "overview" ? "deepspace:museum.seekYear" : "deepspace:museum.rangeHint")}
                </Text>
              </PixelPressable>
            ))}
          </View>
        ) : null}

        {compactTimeline && mobileMode === "overview" ? (
          <FlatList
            data={MUSEUM_RECENT_FIRST}
            keyExtractor={(event) => event.id}
            style={styles.overviewList}
            contentContainerStyle={styles.overviewListContent}
            ListHeaderComponent={
              <PixelSurface variant="inset" contentStyle={styles.overviewFocus}>
                <Text style={styles.overviewFocusYear}>{overviewFocus.year}</Text>
                <Text style={styles.overviewFocusTitle}>{overviewFocus.title}</Text>
              </PixelSurface>
            }
            renderItem={({ item }) => {
              const event = resolveMuseumEvent(item, locale);
              const tone = LANE_TONE[event.lane];
              const lane = MZ_LANES[event.lane];
              const eventLanguage = museumContentLanguage(event.id, locale);
              const laneLabel = eventLanguage === "ko" ? lane.label : lane.en;
              return (
                <PixelPressable
                  onPress={() => {
                    setYear(event.year);
                    initialSeekYear.current = event.year;
                    setSelectedId(event.id);
                  }}
                  accessibilityLabel={`${event.year} ${laneLabel} ${event.title}`}
                  accessibilityLanguage={eventLanguage}
                  accessibilityState={{ selected: selectedId === event.id }}
                  fullWidth
                  rootStyle={styles.overviewEvent}
                  contentStyle={styles.overviewEventContent}
                  background={tone.wash}
                >
                  <Text style={[styles.overviewEventYear, { color: tone.accent }]}>{event.year}</Text>
                  <View style={styles.overviewEventCopy}>
                    <Text style={styles.overviewEventTitle}>{event.title}</Text>
                    <Text style={[styles.overviewEventLane, { color: tone.ink }]}>
                      {laneLabel}
                    </Text>
                  </View>
                </PixelPressable>
              );
            }}
          />
        ) : null}

        {compactTimeline && mobileMode === "timeline" ? (
          <View style={styles.laneLegendRow}>
            {(["world", "ai"] as const).map((laneId) => {
              const lane = MZ_LANES[laneId];
              const tone = LANE_TONE[laneId];
              return (
                <PixelSurface
                  key={laneId}
                  variant="flat"
                  background={tone.wash}
                  style={[styles.laneLegendItem, phone && styles.phoneLaneLegendItem]}
                  contentStyle={styles.laneLegendContent}
                >
                  <View style={[styles.laneSquare, { backgroundColor: tone.accent }]} />
                  <Text style={[styles.laneLegendText, { color: tone.ink }]}>
                    {readsMuseumCanon(locale) ? lane.label : lane.en}
                  </Text>
                </PixelSurface>
              );
            })}
          </View>
        ) : null}

        {(!compactTimeline || mobileMode === "timeline") ? <MuseumViewportHost phone={!!phone}><View
          style={[styles.viewport, phone && styles.phoneViewport]}
          onLayout={(event) => {
            viewportWidth.current = Math.max(1, event.nativeEvent.layout.width);
            if (didInitialSeek.current) return;
            didInitialSeek.current = true;
            seekToYear(initialSeekYear.current, false);
          }}
        >
          {!compactTimeline ? <View pointerEvents="none" style={styles.laneColumn}>
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
          </View> : null}

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

            {MUSEUM.map((canonEvent) => {
              const position = placed.get(canonEvent.id);
              if (!position) return null;
              // Geometry is placed from the canon (ids and years do not move);
              // only the copy is resolved.
              const event = resolveMuseumEvent(canonEvent, locale);
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
                  // Per node, because the timeline is partly translated: an
                  // event with an English entry reports "en", one without keeps
                  // "ko". Reporting the LOCALE here instead would make every
                  // untranslated card claim to be English, which is worse than
                  // being untranslated - an English screen reader would voice
                  // Korean glyphs in an English voice and call it English.
                  // ⚠ Native only. React Native Web forwards neither `lang` nor
                  // `accessibilityLanguage`, so there is no web path for this
                  // through RN props - measured, not assumed.
                  accessibilityLanguage={museumContentLanguage(event.id, locale)}
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
        </View></MuseumViewportHost> : null}

        {(!compactTimeline || mobileMode === "timeline") ? <View style={styles.dialBlock}>
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
            {...a11yValue({
              min: MZ.START,
              max: MUSEUM_VISIBLE_MAX_YEAR,
              now: year,
              text: String(year),
            })}
            accessibilityActions={[
              { name: "decrement", label: t("deepspace:museum.prevEvent") },
              { name: "increment", label: t("deepspace:museum.nextEvent") },
            ]}
            onAccessibilityAction={(event) => {
              // These two actions are named "previous/next event", and they are
              // named nowhere else - only a screen reader ever speaks them. They
              // used to move one calendar year, which lands on an empty year more
              // often than not (30 event years across a 91-year range, gaps up to
              // 11). Move to the next year that actually has something.
              if (event.nativeEvent.actionName === "increment") seekToYear(museumStepEventYear(year, 1), false);
              if (event.nativeEvent.actionName === "decrement") seekToYear(museumStepEventYear(year, -1), false);
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
        </View> : null}

        {selected ? (
          <PhoneAnimatedView
            style={[
              styles.sheet,
              compact && styles.sheetCompact,
              phone && styles.phoneSheet,
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
            // One attribute on the container covers this event's whole detail
            // body: title, sub, long copy, fact rows, cause and effect. They
            // are resolved together, so one tag is still correct.
            accessibilityLanguage={selectedLanguage}
            accessibilityLiveRegion="polite"
            accessibilityState={{ expanded: true }}
            {...sheetPan.panHandlers}
          >
            <MuseumSheetSurface phone={!!phone}>
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
                style={[styles.sheetScroll, phone && styles.phoneSheetScroll]}
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
                        {selectedLanguage === "ko"
                          ? MZ_LANES[selected.lane].label
                          : MZ_LANES[selected.lane].en}
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
                      const canonRelated = safeId ? museumEventById(safeId) : undefined;
                      if (!canonRelated) return null;
                      const related = resolveMuseumEvent(canonRelated, locale);
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
                        accessibilityLabel={`${resolveMuseumRefKindLabel(reference.kind, MUSEUM_REF_LABEL[reference.kind], locale)} ${reference.label}`}
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
                              {resolveMuseumRefKindLabel(
                                reference.kind,
                                MUSEUM_REF_LABEL[reference.kind],
                                locale,
                              )}
                            </Text>
                          </View>
                        </PixelSurface>
                      </View>
                    ))}
                  </View>
                ) : null}

                {selected.here ? (
                  <PixelPressable
                    onPress={phoneBack ?? (() => router.replace("/"))}
                    accessibilityLabel={phone?.backLabel ?? t("deepspace:museum.backToConstellation")}
                    fullWidth
                    contentStyle={styles.homeAction}
                    background={m3.color.primary}
                  >
                    <MuseumGlyph name={phone ? "arrow_back" : "home"} color={m3.color.onPrimary} size={24} />
                    <Text style={styles.homeActionLabel}>
                      {phone?.backLabel ?? t("deepspace:museum.backToConstellation")}
                    </Text>
                  </PixelPressable>
                ) : null}
              </ScrollView>
            </MuseumSheetSurface>
          </PhoneAnimatedView>
        ) : null}
      </View>
    </MuseumShell>
  );
}
