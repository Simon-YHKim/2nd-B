import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, PanResponder, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { PlainText as Text } from "@/components/ui/PlainText";
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { Rect } from 'react-native-svg';
import { m3 } from '@/lib/theme/m3';
import { stepPolyline } from '@/components/pixel/pixel-line';
import { createCameraRemote, joystickInput, zoomFromPosition, zoomToPosition } from '@/lib/motion/camera-remote';
import { a11yValue } from '@/lib/a11y/accessibility-value';
import { useUiSound } from '@/lib/audio/use-ui-sound';
import { useMotionSound } from '@/lib/audio/use-motion-sound';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion';
import { flattenAlpha } from '@/lib/theme/tokens';
import { sampleTelescopeMotion, type TelescopeMotionTrack } from '@/lib/motion/telescope-preview';

const TICK = require('../../../assets/audio/observatory-ratchet.wav');
const STICK_SIZE = 64;
const THUMB_SIZE = 16;
const TRAVEL = 22;
const ZOOM_KEY_STEP = 0.03;
const ZOOM_HOLD_STEP = 0.015;
const HUD_IDLE_DELAY_MS = 1200;
const DEFAULT_STOPS = [1, 2, 3, 5];
const DIAL_TICK_SPACING = 6;
const DIAL_RANGE_RATIO = 0.72;
const webTouchStyle: ViewStyle & { userSelect: 'none'; touchAction: 'none' } = {
  userSelect: 'none',
  touchAction: 'none',
};
const BACKDROP_EDGE = flattenAlpha('#000000', 0.06, m3.accent.stageFloor);
const BACKDROP_SOFT = flattenAlpha('#000000', 0.20, m3.accent.stageFloor);
const BACKDROP_MID = flattenAlpha('#000000', 0.42, m3.accent.stageFloor);
const BACKDROP_CORE = flattenAlpha('#000000', 0.68, m3.accent.stageFloor);
const BACKDROP_BANDS = [
  { inset: 0, color: BACKDROP_EDGE },
  { inset: 3, color: BACKDROP_SOFT },
  { inset: 6, color: BACKDROP_MID },
  { inset: 9, color: BACKDROP_CORE },
] as const;

// Rect-only stepped corners keep the pixel surface's zero-radius rule while
// reading as a soft, rounded instrument housing at phone size.
function backdropRects(width: number, height: number) {
  return BACKDROP_BANDS.flatMap(({ inset, color }, index) => {
    const w = Math.max(0, width - inset * 2);
    const h = Math.max(0, height - inset * 2);
    if (w <= 24 || h <= 20) return [];
    return [
      <Rect key={`${index}-top`} x={inset + 12} y={inset} width={w - 24} height={h} fill={color} />,
      <Rect key={`${index}-middle`} x={inset + 6} y={inset + 4} width={w - 12} height={h - 8} fill={color} />,
      <Rect key={`${index}-body`} x={inset} y={inset + 10} width={w} height={h - 20} fill={color} />,
    ];
  });
}
const JOG_GUIDE = (() => {
  // Axis-aligned steps share edges; diagonal-only cells read as a dotted ring at 64px.
  const quadrant = stepPolyline([
    [32, 8], [40, 8], [40, 10], [44, 10], [44, 14], [48, 14],
    [48, 18], [52, 18], [52, 22], [54, 22], [54, 28], [56, 28], [56, 32],
  ], 2);
  const cells = new Map<string, { x: number; y: number }>();
  for (const cell of quadrant) {
    for (const x of [cell.x, STICK_SIZE - 2 - cell.x]) {
      for (const y of [cell.y, STICK_SIZE - 2 - cell.y]) cells.set(`${x}-${y}`, { x, y });
    }
  }
  return [...cells.values()];
})();
type KeyEvent = { key: string; preventDefault: () => void };

const dialColor = (fraction: number, active: boolean) => {
  const edge = Math.min(fraction, 1 - fraction);
  if (edge < 0.025) return m3.color.surface;
  if (edge < 0.05) return m3.color.surfaceContainerLow;
  if (edge < 0.08) return m3.color.outlineVariant;
  if (edge < 0.12) return m3.color.surfaceBright;
  return active && Math.abs(fraction - 0.5) < 0.035 ? m3.accent.starCore : m3.color.onSurfaceVariant;
};

/** PTZ input: zoom is absolute position; the spring stick commands velocity. */
export function TelescopeControls({ zoom, minZoom, maxZoom, zoomStops = DEFAULT_STOPS, enabled = true, cameraMotion, onMove, onZoom, onReset }: {
  zoom: number; minZoom: number; maxZoom: number; zoomStops?: readonly number[]; enabled?: boolean;
  cameraMotion?: { progress: Animated.Value; track: TelescopeMotionTrack; playSound?: boolean };
  onMove: (dx: number, dy: number) => void;
  onZoom: (value: number) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation('deepspace');
  const reducedMotion = useReducedMotionPref();
  const [backdropSize, setBackdropSize] = useState({ width: 0, height: 0 });
  const actions = useRef({ onMove, onZoom, onReset, zoom, enabled });
  actions.current = { onMove, onZoom, onReset, zoom, enabled };
  const playTick = useUiSound(TICK, { volume: 0.08, minIntervalMs: 160 });
  const tick = () => { if (!reducedMotion) playTick(); };
  const motionSound = useMotionSound();
  const sound = useRef(motionSound);
  sound.current = motionSound;
  const knob = useRef(new Animated.ValueXY()).current;
  const [speed, setSpeed] = useState(0);
  const [direction, setDirection] = useState({ x: 0, y: 0 });
  const [hudActive, setHudActive] = useState(false);
  const [previewZoom, setPreviewZoom] = useState<number | null>(null);
  const hudIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [railWidth, setRailWidth] = useState(100);
  const rail = useRef({ width: 100 });
  const dragZoomPosition = useRef(0);
  const centre = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const stickDragged = useRef(false);
  const stickCanceled = useRef(false);
  const sliderHeld = useRef(false);
  const quickZoomTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const quickZoomPosition = useRef(0);
  const longZoom = useRef(false);
  const keys = useRef(new Set<string>());
  const setHudMotion = useCallback((active: boolean) => {
    if (hudIdleTimer.current !== null) clearTimeout(hudIdleTimer.current);
    hudIdleTimer.current = null;
    if (active) setHudActive(true);
    else hudIdleTimer.current = setTimeout(() => { setHudActive(false); hudIdleTimer.current = null; }, HUD_IDLE_DELAY_MS);
  }, []);
  const remote = useMemo(() => createCameraRemote({
    zoom: actions.current.zoom, minZoom, maxZoom,
    onZoom: value => actions.current.onZoom(value),
    onMove: (x, y) => actions.current.onMove(x, y),
    onMotionChange: active => { sound.current(active); setHudMotion(active); },
    requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
  }), [minZoom, maxZoom, setHudMotion]);
  useEffect(() => { remote.syncZoom(zoom); }, [remote, zoom]);

  const stopQuickZoom = useCallback(() => {
    if (quickZoomTimer.current !== null) clearInterval(quickZoomTimer.current);
    quickZoomTimer.current = null;
  }, []);
  const changeZoom = (delta: number) => {
    if (!actions.current.enabled) return;
    const next = zoomToPosition(actions.current.zoom, minZoom, maxZoom) + delta;
    remote.setZoom(zoomFromPosition(next, minZoom, maxZoom));
  };
  const holdZoom = (sign: -1 | 1) => {
    stopQuickZoom();
    if (!actions.current.enabled) return;
    longZoom.current = true;
    quickZoomPosition.current = zoomToPosition(actions.current.zoom, minZoom, maxZoom);
    const advance = () => {
      const next = Math.max(0, Math.min(1, quickZoomPosition.current + sign * ZOOM_HOLD_STEP));
      quickZoomPosition.current = next;
      remote.setZoom(zoomFromPosition(next, minZoom, maxZoom));
      if (next === 0 || next === 1) stopQuickZoom();
    };
    advance();
    if (quickZoomPosition.current > 0 && quickZoomPosition.current < 1) {
      quickZoomTimer.current = setInterval(advance, 50);
    }
  };
  const tapZoom = (sign: -1 | 1) => {
    if (longZoom.current) { longZoom.current = false; return; }
    changeZoom(sign * ZOOM_KEY_STEP);
  };

  const stopStick = useCallback(() => {
    remote.stopPanTilt(); held.current = false; keys.current.clear(); setSpeed(0); setDirection({ x: 0, y: 0 });
    knob.stopAnimation();
    Animated.timing(knob, { toValue: { x: 0, y: 0 }, duration: reducedMotion ? 0 : 110, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [knob, reducedMotion, remote]);
  const failSafeStop = useCallback(() => {
    stickCanceled.current = true; sliderHeld.current = false; stopQuickZoom(); stopStick(); remote.stop();
    if (hudIdleTimer.current !== null) clearTimeout(hudIdleTimer.current);
    hudIdleTimer.current = null;
    setHudActive(false);
  }, [remote, stopQuickZoom, stopStick]);
  const resetView = useCallback(() => {
    failSafeStop();
    actions.current.onReset();
    if (!reducedMotion) playTick();
  }, [failSafeStop, playTick, reducedMotion]);
  useEffect(() => { if (!enabled) failSafeStop(); }, [enabled, failSafeStop]);
  useEffect(() => {
    if (!cameraMotion) { setPreviewZoom(null); return; }
    let previous = cameraMotion.track.stops[0];
    knob.stopAnimation();
    setPreviewZoom(cameraMotion.track.zoom[0]);
    const listener = cameraMotion.progress.addListener(({ value }) => {
      const frame = sampleTelescopeMotion(cameraMotion.track, value, previous);
      previous = value;
      knob.setValue({ x: frame.x, y: frame.y });
      setDirection({ x: Math.sign(frame.x), y: Math.sign(frame.y) });
      setPreviewZoom(frame.zoom);
      setHudActive(frame.x !== 0 || frame.y !== 0 || value > 0 && value < 1);
      if (cameraMotion.playSound) sound.current(value > 0 && value < 1);
    });
    return () => {
      cameraMotion.progress.removeListener(listener);
      knob.setValue({ x: 0, y: 0 });
      sound.current(false);
    };
  }, [cameraMotion, knob]);
  useFocusEffect(useCallback(() => {
    setSpeed(0);
    setHudActive(false);
    const app = AppState.addEventListener('change', state => { if (state !== 'active') failSafeStop(); });
    const appBlur = Platform.OS === 'android' ? AppState.addEventListener('blur', failSafeStop) : undefined;
    const release = () => { if (held.current) stopStick(); stopQuickZoom(); };
    const visibility = () => { if (document.hidden) failSafeStop(); };
    if (Platform.OS === 'web') {
      window.addEventListener('blur', failSafeStop);
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', failSafeStop);
      document.addEventListener('visibilitychange', visibility);
    }
    return () => {
      stopQuickZoom(); remote.stop(); knob.stopAnimation(); knob.setValue({ x: 0, y: 0 });
      if (hudIdleTimer.current !== null) clearTimeout(hudIdleTimer.current);
      hudIdleTimer.current = null;
      held.current = false; sliderHeld.current = false; keys.current.clear();
      app.remove(); appBlur?.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('blur', failSafeStop);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', failSafeStop);
        document.removeEventListener('visibilitychange', visibility);
      }
    };
  }, [failSafeStop, knob, remote, stopQuickZoom, stopStick]));

  const aim = useCallback((x: number, y: number) => {
    if (!actions.current.enabled) return;
    held.current = true;
    const length = Math.max(1, Math.hypot(x, y));
    knob.stopAnimation(); knob.setValue({ x: x / length * TRAVEL, y: y / length * TRAVEL });
    const v = joystickInput(x, y);
    remote.setPanTiltVelocity(v.x, v.y); setSpeed(Math.round(Math.hypot(v.x, v.y) * 100));
    setDirection({ x: Math.abs(v.x) > 0.02 ? Math.sign(v.x) : 0, y: Math.abs(v.y) > 0.02 ? Math.sign(v.y) : 0 });
  }, [knob, remote]);
  const stick = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => actions.current.enabled,
    onMoveShouldSetPanResponder: () => actions.current.enabled,
    onPanResponderGrant: (event, gesture) => {
      setHudMotion(true);
      const { locationX, locationY } = event.nativeEvent;
      centre.current = { x: gesture.x0 - locationX + STICK_SIZE / 2, y: gesture.y0 - locationY + STICK_SIZE / 2 };
      stickDragged.current = false;
      stickCanceled.current = false;
    },
    onPanResponderMove: (_event, gesture) => {
      if (stickCanceled.current) return;
      if (Math.hypot(gesture.dx, gesture.dy) < 6 && !stickDragged.current) return;
      stickDragged.current = true;
      aim((gesture.moveX - centre.current.x) / TRAVEL, (gesture.moveY - centre.current.y) / TRAVEL);
    },
    onPanResponderRelease: () => {
      if (stickCanceled.current || stickDragged.current) stopStick();
      else resetView();
      setHudMotion(false);
      stickDragged.current = false;
      stickCanceled.current = false;
    },
    onPanResponderTerminate: failSafeStop,
  }), [aim, failSafeStop, resetView, setHudMotion, stopStick]);
  const slider = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => actions.current.enabled,
    onMoveShouldSetPanResponder: () => actions.current.enabled,
    onPanResponderGrant: () => {
      sliderHeld.current = true;
      setHudMotion(true);
      dragZoomPosition.current = zoomToPosition(actions.current.zoom, minZoom, maxZoom);
    },
    onPanResponderMove: (_event, gesture) => {
      if (sliderHeld.current) remote.setZoom(zoomFromPosition(
        dragZoomPosition.current - gesture.dx / Math.max(1, rail.current.width * DIAL_RANGE_RATIO), minZoom, maxZoom,
      ));
    },
    onPanResponderRelease: () => { sliderHeld.current = false; setHudMotion(false); /* Zoom retains its position. */ },
    onPanResponderTerminate: failSafeStop,
  }), [failSafeStop, maxZoom, minZoom, remote, setHudMotion]);
  const displayZoom = previewZoom ?? zoom;
  const displayMaxZoom = Math.max(maxZoom, ...(cameraMotion?.track.zoom ?? []));
  const position = zoomToPosition(displayZoom, minZoom, displayMaxZoom);
  const keyboardAim = () => {
    const x = Number(keys.current.has('ArrowRight')) - Number(keys.current.has('ArrowLeft'));
    const y = Number(keys.current.has('ArrowDown')) - Number(keys.current.has('ArrowUp'));
    if (!x && !y) stopStick(); else { const length = Math.hypot(x, y); aim(x / length * 0.65, y / length * 0.65); }
  };
  const major = useMemo(() => [...new Set([minZoom, ...zoomStops.filter(value => value > minZoom && value < displayMaxZoom), displayMaxZoom])].sort((a, b) => a - b), [minZoom, displayMaxZoom, zoomStops]);
  const dialBandWidth = railWidth * 3;
  const dialRangeWidth = railWidth * DIAL_RANGE_RATIO;
  const dialOrigin = railWidth;
  const dialOffset = Math.round(railWidth / 2 - dialOrigin - position * dialRangeWidth);
  const firstTick = Math.max(0, Math.floor((-dialOffset - 2) / DIAL_TICK_SPACING));
  const lastTick = Math.min(Math.floor(dialBandWidth / DIAL_TICK_SPACING), Math.ceil((railWidth - dialOffset + 2) / DIAL_TICK_SPACING));
  const dialTrack = useMemo(() => <Svg width={railWidth} height={36} style={styles.dialArtwork}>
    {Array.from({ length: Math.ceil(railWidth / 4) }, (_, i) => <Rect key={i} x={i * 4} y={25}
      width={Math.min(4, railWidth - i * 4)} height={1} fill={dialColor(i * 4 / railWidth, hudActive)} />)}
  </Svg>, [hudActive, railWidth]);
  return (
    <View collapsable={false} style={[styles.root, Platform.OS === 'web' && webTouchStyle]} accessibilityLabel={t('telescope.label')} testID="telescope-remote"
      onLayout={({ nativeEvent: { layout } }) => setBackdropSize((current) => current.width === layout.width && current.height === layout.height
        ? current : { width: layout.width, height: layout.height })}>
      {backdropSize.width > 0 ? <Svg pointerEvents="none" width={backdropSize.width} height={backdropSize.height} style={styles.backdrop}>
        {backdropRects(backdropSize.width, backdropSize.height)}
      </Svg> : null}
      <View style={styles.direction}>
        <View collapsable={false} {...stick.panHandlers} style={styles.joystick} testID="telescope-joystick"
          accessible accessibilityRole="adjustable" accessibilityLabel={t('telescope.joystick')} accessibilityHint={t('telescope.joystickHint')}
          accessibilityState={{ disabled: !enabled }} {...a11yValue({ min: 0, max: 100, now: speed })}
          accessibilityActions={[...['up', 'down', 'left', 'right'].map(name => ({ name, label: t('telescope.' + name) })), { name: 'activate', label: t('telescope.reset') }]}
          onAccessibilityAction={({ nativeEvent: { actionName } }) => {
            if (!enabled) return;
            if (actionName === 'activate') { resetView(); return; }
            const x = actionName === 'right' ? 1 : actionName === 'left' ? -1 : 0;
            const y = actionName === 'down' || actionName === 'decrement' ? 1 : actionName === 'up' || actionName === 'increment' ? -1 : 0;
            onMove(x * 0.03, y * 0.03);
            setHudMotion(true); setHudMotion(false);
            tick();
          }}
          {...(Platform.OS === 'web' ? {
            tabIndex: enabled ? 0 : -1,
            onKeyDown: (event: KeyEvent) => {
              if (event.key === 'Escape') { event.preventDefault(); failSafeStop(); }
              else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); resetView(); }
              else if (event.key.startsWith('Arrow')) { event.preventDefault(); keys.current.add(event.key); keyboardAim(); }
            },
            onKeyUp: (event: KeyEvent) => { if (event.key.startsWith('Arrow')) { event.preventDefault(); keys.current.delete(event.key); keyboardAim(); } },
            onBlur: stopStick,
          } : {})}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width={STICK_SIZE} height={STICK_SIZE}>
              {JOG_GUIDE.map(cell => <Rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={2} height={2} fill={m3.color.outlineVariant} />)}
              <Rect x={31} y={16} width={2} height={7} fill={m3.color.outlineVariant} />
              <Rect x={31} y={41} width={2} height={7} fill={m3.color.outlineVariant} />
              <Rect x={16} y={31} width={7} height={2} fill={m3.color.outlineVariant} />
              <Rect x={41} y={31} width={7} height={2} fill={m3.color.outlineVariant} />
              <Rect x={30} y={10} width={4} height={2} fill={direction.y < 0 ? m3.accent.starCore : m3.color.onSurfaceVariant} />
              <Rect x={31} y={8} width={2} height={2} fill={direction.y < 0 ? m3.accent.starCore : m3.color.onSurfaceVariant} />
              <Rect x={30} y={52} width={4} height={2} fill={direction.y > 0 ? m3.accent.starCore : m3.color.onSurfaceVariant} />
              <Rect x={31} y={54} width={2} height={2} fill={direction.y > 0 ? m3.accent.starCore : m3.color.onSurfaceVariant} />
              <Rect x={10} y={30} width={2} height={4} fill={direction.x < 0 ? m3.accent.starCore : m3.color.onSurfaceVariant} />
              <Rect x={8} y={31} width={2} height={2} fill={direction.x < 0 ? m3.accent.starCore : m3.color.onSurfaceVariant} />
              <Rect x={52} y={30} width={2} height={4} fill={direction.x > 0 ? m3.accent.starCore : m3.color.onSurfaceVariant} />
              <Rect x={54} y={31} width={2} height={2} fill={direction.x > 0 ? m3.accent.starCore : m3.color.onSurfaceVariant} />
            </Svg>
            <Animated.View testID="telescope-stick-thumb" style={[styles.thumb, { transform: knob.getTranslateTransform() }]}>
              <View style={[styles.centreDot, hudActive && styles.centreDotActive]} />
            </Animated.View>
          </View>
        </View>
      </View>
      <View style={styles.zoomGroup} testID="telescope-zoom-group">
        <Pressable disabled={!enabled || zoom <= minZoom} accessibilityRole="button" accessibilityLabel={t('recordsGraph.a11yZoomOut')}
          onPressIn={() => { longZoom.current = false; setHudMotion(true); }} onLongPress={() => holdZoom(-1)} delayLongPress={350}
          onPressOut={() => { stopQuickZoom(); setHudMotion(false); }} onPress={() => tapZoom(-1)} style={styles.zoomKey}>
          <View collapsable={false} style={[styles.zoomKeyFace, styles.zoomKeyFaceStart, hudActive && styles.zoomKeyFaceStartActive]}><Text style={[styles.caption, hudActive && styles.captionActive]}>W</Text></View>
        </Pressable>
        <View collapsable={false} {...slider.panHandlers} style={styles.slider} testID="telescope-zoom-slider"
          onLayout={({ nativeEvent: { layout } }) => { rail.current.width = Math.max(1, layout.width); setRailWidth(layout.width); }}
          accessible accessibilityRole="adjustable" accessibilityLabel={t('telescope.slider')} accessibilityHint={t('telescope.hint')}
          accessibilityState={{ disabled: !enabled }}
          {...a11yValue({ min: minZoom * 100, max: displayMaxZoom * 100, now: Math.round(displayZoom * 100), text: displayZoom.toFixed(2) + '×' })}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) => changeZoom(nativeEvent.actionName === 'increment' ? 0.06 : -0.06)}
          {...(Platform.OS === 'web' ? { tabIndex: enabled ? 0 : -1, onKeyDown: (event: KeyEvent) => {
            if (!enabled) return;
            if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              if (event.key === 'Home' || event.key === 'End') remote.setZoom(event.key === 'Home' ? minZoom : maxZoom);
              else changeZoom(event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 0.03 : -0.03);
            }
          } } : {})}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {dialTrack}
            <View collapsable={false} testID="telescope-dial-band" style={[styles.movingBand, { width: dialBandWidth, transform: [{ translateX: dialOffset }] }]}>
              <Svg width={dialBandWidth} height={36} style={styles.dialArtwork}>
                {Array.from({ length: Math.max(0, lastTick - firstTick + 1) }, (_, i) => {
                  const index = firstTick + i;
                  const x = index * DIAL_TICK_SPACING;
                  const screenFraction = (x + dialOffset) / railWidth;
                  return <Rect key={index} x={x} y={index % 5 === 0 ? 20 : 22} width={1}
                    height={index % 5 === 0 ? 13 : 9} fill={dialColor(screenFraction, hudActive)} />;
                })}
                {major.map(value => {
                  const x = Math.round(dialOrigin + zoomToPosition(value, minZoom, displayMaxZoom) * dialRangeWidth);
                  const screenX = x + dialOffset;
                  if (screenX < -16 || screenX > railWidth + 16) return null;
                  return <Rect key={value} x={x} y={18} width={2} height={17} fill={dialColor(screenX / railWidth, hudActive)} />;
                })}
              </Svg>
              {major.map(value => {
                const x = Math.round(dialOrigin + zoomToPosition(value, minZoom, displayMaxZoom) * dialRangeWidth);
                const screenX = x + dialOffset;
                if (screenX < -16 || screenX > railWidth + 16) return null;
                return <Text key={value} style={[styles.tickText, { left: x - 13,
                  color: Math.min(screenX, railWidth - screenX) < railWidth * 0.08 ? m3.color.surfaceBright : m3.color.onSurfaceVariant }]}>{value}×</Text>;
              })}
            </View>
            <View collapsable={false} testID="telescope-zoom-indicator" style={[styles.zoomIndicator, { left: Math.round(railWidth / 2) - 1 }]}>
              <View collapsable={false} style={styles.zoomReadout}>
                <Text testID="telescope-zoom-readout" style={[styles.readout, hudActive && styles.readoutActive]} numberOfLines={1}>{displayZoom.toFixed(2)}×</Text>
              </View>
              <View testID="telescope-zoom-thumb" style={[styles.zoomThumb, hudActive && styles.zoomThumbActive]} />
            </View>
          </View>
        </View>
        <Pressable disabled={!enabled || zoom >= maxZoom} accessibilityRole="button" accessibilityLabel={t('recordsGraph.a11yZoomIn')}
          onPressIn={() => { longZoom.current = false; setHudMotion(true); }} onLongPress={() => holdZoom(1)} delayLongPress={350}
          onPressOut={() => { stopQuickZoom(); setHudMotion(false); }} onPress={() => tapZoom(1)} style={styles.zoomKey}>
          <View collapsable={false} style={[styles.zoomKeyFace, styles.zoomKeyFaceEnd, hudActive && styles.zoomKeyFaceEndActive]}><Text style={[styles.caption, hudActive && styles.captionActive]}>T</Text></View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, flexShrink: 1, minWidth: 224, maxWidth: 440, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 2 },
  backdrop: { position: 'absolute', left: 0, top: 0 },
  direction: { width: STICK_SIZE, alignItems: 'center', flexShrink: 0 },
  joystick: { width: STICK_SIZE, height: STICK_SIZE, aspectRatio: 1, flexShrink: 0 },
  thumb: { position: 'absolute', left: (STICK_SIZE - THUMB_SIZE) / 2, top: (STICK_SIZE - THUMB_SIZE) / 2, width: THUMB_SIZE, height: THUMB_SIZE, borderWidth: 1, borderColor: m3.color.outline, backgroundColor: m3.color.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  centreDot: { width: 4, height: 4, backgroundColor: m3.color.onSurfaceVariant },
  centreDotActive: { backgroundColor: m3.accent.starCore },
  zoomGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 2 },
  zoomKey: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zoomKeyFace: { width: 20, height: 24, alignItems: 'center', justifyContent: 'center' },
  zoomKeyFaceStart: { borderRightWidth: 1, borderRightColor: m3.color.outlineVariant },
  zoomKeyFaceEnd: { borderLeftWidth: 1, borderLeftColor: m3.color.outlineVariant },
  zoomKeyFaceStartActive: { borderRightColor: m3.color.onSurfaceVariant },
  zoomKeyFaceEndActive: { borderLeftColor: m3.color.onSurfaceVariant },
  caption: { fontFamily: m3.font.mono, fontSize: 12, lineHeight: 18, color: m3.color.onSurfaceVariant },
  captionActive: { color: m3.color.onSurface },
  slider: { flex: 1, minWidth: 48, height: 52, overflow: 'hidden' },
  dialArtwork: { position: 'absolute', left: 0, top: 0 },
  movingBand: { position: 'absolute', left: 0, top: 0, height: 52 },
  tickText: { position: 'absolute', top: 35, width: 26, textAlign: 'center', fontFamily: 'Galmuri9', fontSize: 10, lineHeight: 15, color: m3.color.onSurfaceVariant },
  zoomIndicator: { position: 'absolute', top: 0, width: 2, height: 38 },
  zoomReadout: { position: 'absolute', top: 0, left: -21, width: 44, alignItems: 'center' },
  zoomThumb: { position: 'absolute', top: 18, width: 2, height: 20, backgroundColor: m3.accent.starCore },
  zoomThumbActive: { backgroundColor: m3.accent.starCore },
  readout: { fontFamily: m3.font.mono, fontSize: 12, lineHeight: 18, color: m3.color.onSurfaceVariant },
  readoutActive: { color: m3.accent.starCore },
});
