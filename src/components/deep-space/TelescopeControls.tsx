import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, PanResponder, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { Rect } from 'react-native-svg';

import { PixelPressable } from '@/components/pixel/PixelPressable';
import { PixelSurface } from '@/components/pixel/PixelSurface';
import { m3 } from '@/lib/theme/m3';
import { createCameraRemote, joystickInput, zoomFromPosition, zoomToPosition } from '@/lib/motion/camera-remote';
import { a11yValue } from '@/lib/a11y/accessibility-value';
import { useUiSound } from '@/lib/audio/use-ui-sound';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion';

const TICK = require('../../../assets/audio/jrpg-text-blip.mp3');
const STICK_SIZE = 64;
const THUMB_SIZE = 28;
const TRAVEL = (STICK_SIZE - THUMB_SIZE) / 2;
const DEFAULT_STOPS = [1, 2, 3, 5];
// React Native Web accepts these CSS properties; native ViewStyle omits them.
const WEB_GESTURE_STYLE: ViewStyle & { userSelect: 'none'; touchAction: 'none' } = {
  userSelect: 'none', touchAction: 'none',
};
type KeyEvent = { key: string; preventDefault: () => void };

/** PTZ input: zoom is absolute position; the spring stick commands velocity. */
export function TelescopeControls({ zoom, minZoom, maxZoom, zoomStops = DEFAULT_STOPS, enabled = true, onMove, onZoom, onReset }: {
  zoom: number; minZoom: number; maxZoom: number; zoomStops?: readonly number[]; enabled?: boolean;
  onMove: (dx: number, dy: number) => void;
  onZoom: (value: number) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation('deepspace');
  const reducedMotion = useReducedMotionPref();
  const actions = useRef({ onMove, onZoom, onReset, zoom, enabled });
  actions.current = { onMove, onZoom, onReset, zoom, enabled };
  const tick = useUiSound(TICK, { volume: 0.045, playbackRate: 0.55, minIntervalMs: 160 });
  const knob = useRef(new Animated.ValueXY()).current;
  const [speed, setSpeed] = useState(0);
  const [railWidth, setRailWidth] = useState(100);
  const rail = useRef({ x: 0, width: 100 });
  const centre = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const sliderHeld = useRef(false);
  const keys = useRef(new Set<string>());
  const remote = useMemo(() => createCameraRemote({
    zoom: actions.current.zoom, minZoom, maxZoom,
    onZoom: value => actions.current.onZoom(value),
    onMove: (x, y) => actions.current.onMove(x, y),
    requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
  }), [minZoom, maxZoom]);
  useEffect(() => { remote.syncZoom(zoom); }, [remote, zoom]);

  const stopStick = useCallback(() => {
    remote.stopPanTilt(); held.current = false; keys.current.clear(); setSpeed(0);
    knob.stopAnimation();
    Animated.timing(knob, { toValue: { x: 0, y: 0 }, duration: reducedMotion ? 0 : 110, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [knob, reducedMotion, remote]);
  const failSafeStop = useCallback(() => { sliderHeld.current = false; stopStick(); remote.stop(); }, [remote, stopStick]);
  useEffect(() => { if (!enabled) failSafeStop(); }, [enabled, failSafeStop]);
  useFocusEffect(useCallback(() => {
    setSpeed(0);
    const app = AppState.addEventListener('change', state => { if (state !== 'active') failSafeStop(); });
    const appBlur = Platform.OS === 'android' ? AppState.addEventListener('blur', failSafeStop) : undefined;
    const release = () => { if (held.current) stopStick(); };
    const visibility = () => { if (document.hidden) failSafeStop(); };
    if (Platform.OS === 'web') {
      window.addEventListener('blur', failSafeStop);
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', failSafeStop);
      document.addEventListener('visibilitychange', visibility);
    }
    return () => {
      remote.stop(); knob.stopAnimation(); knob.setValue({ x: 0, y: 0 });
      held.current = false; sliderHeld.current = false; keys.current.clear();
      app.remove(); appBlur?.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('blur', failSafeStop);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', failSafeStop);
        document.removeEventListener('visibilitychange', visibility);
      }
    };
  }, [failSafeStop, knob, remote, stopStick]));

  const aim = useCallback((x: number, y: number) => {
    if (!actions.current.enabled) return;
    held.current = true;
    const length = Math.max(1, Math.hypot(x, y));
    knob.stopAnimation(); knob.setValue({ x: x / length * TRAVEL, y: y / length * TRAVEL });
    const v = joystickInput(x, y);
    remote.setPanTiltVelocity(v.x, v.y); setSpeed(Math.round(Math.hypot(v.x, v.y) * 100));
  }, [knob, remote]);
  const stick = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => actions.current.enabled,
    onMoveShouldSetPanResponder: () => actions.current.enabled,
    onPanResponderGrant: (event, gesture) => {
      const { locationX, locationY } = event.nativeEvent;
      centre.current = { x: gesture.x0 - locationX + STICK_SIZE / 2, y: gesture.y0 - locationY + STICK_SIZE / 2 };
      aim((locationX - STICK_SIZE / 2) / TRAVEL, (locationY - STICK_SIZE / 2) / TRAVEL); tick();
    },
    onPanResponderMove: (_event, gesture) => { if (held.current) aim((gesture.moveX - centre.current.x) / TRAVEL, (gesture.moveY - centre.current.y) / TRAVEL); },
    onPanResponderRelease: stopStick,
    onPanResponderTerminate: failSafeStop,
  }), [aim, failSafeStop, stopStick, tick]);
  const slider = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => actions.current.enabled,
    onMoveShouldSetPanResponder: () => actions.current.enabled,
    onPanResponderGrant: (event, gesture) => {
      sliderHeld.current = true;
      rail.current.x = gesture.x0 - event.nativeEvent.locationX;
      remote.setZoom(zoomFromPosition(event.nativeEvent.locationX / rail.current.width, minZoom, maxZoom)); tick();
    },
    onPanResponderMove: (_event, gesture) => { if (sliderHeld.current) remote.setZoom(zoomFromPosition((gesture.moveX - rail.current.x) / rail.current.width, minZoom, maxZoom)); },
    onPanResponderRelease: () => { sliderHeld.current = false; /* Zoom retains its position. */ },
    onPanResponderTerminate: failSafeStop,
  }), [failSafeStop, maxZoom, minZoom, remote, tick]);
  const position = zoomToPosition(zoom, minZoom, maxZoom);
  const changeZoom = (delta: number) => { if (enabled) { remote.setZoom(zoomFromPosition(position + delta, minZoom, maxZoom)); tick(); } };
  const keyboardAim = () => {
    const x = Number(keys.current.has('ArrowRight')) - Number(keys.current.has('ArrowLeft'));
    const y = Number(keys.current.has('ArrowDown')) - Number(keys.current.has('ArrowUp'));
    if (!x && !y) stopStick(); else { const length = Math.hypot(x, y); aim(x / length * 0.65, y / length * 0.65); }
  };
  const major = [...new Set([minZoom, ...zoomStops.filter(value => value > minZoom && value < maxZoom), maxZoom])].sort((a, b) => a - b);
  return (
    <View style={[styles.root, Platform.OS === 'web' && WEB_GESTURE_STYLE]} accessibilityLabel={t('telescope.label')} testID="telescope-remote">
      <View style={styles.direction}>
        <View {...stick.panHandlers} style={styles.joystick} testID="telescope-joystick"
          accessible accessibilityRole="adjustable" accessibilityLabel={t('telescope.joystick')} accessibilityHint={t('telescope.joystickHint')}
          accessibilityState={{ disabled: !enabled }} {...a11yValue({ min: 0, max: 100, now: speed })}
          accessibilityActions={['up', 'down', 'left', 'right'].map(name => ({ name, label: t('telescope.' + name) }))}
          onAccessibilityAction={({ nativeEvent: { actionName } }) => {
            if (!enabled) return;
            const x = actionName === 'right' ? 1 : actionName === 'left' ? -1 : 0;
            const y = actionName === 'down' || actionName === 'decrement' ? 1 : actionName === 'up' || actionName === 'increment' ? -1 : 0;
            onMove(x * 0.03, y * 0.03);
          }}
          {...(Platform.OS === 'web' ? {
            tabIndex: enabled ? 0 : -1,
            onKeyDown: (event: KeyEvent) => {
              if (event.key === 'Escape') { event.preventDefault(); failSafeStop(); }
              else if (event.key.startsWith('Arrow')) { event.preventDefault(); keys.current.add(event.key); keyboardAim(); }
            },
            onKeyUp: (event: KeyEvent) => { if (event.key.startsWith('Arrow')) { event.preventDefault(); keys.current.delete(event.key); keyboardAim(); } },
            onBlur: failSafeStop,
          } : {})}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width={STICK_SIZE} height={STICK_SIZE}>
              {[28, 18].flatMap((radius, ring) => Array.from({ length: 24 }, (_, i) => {
                const angle = i * Math.PI / 12;
                return <Rect key={ring + ':' + i} x={Math.round((31 + Math.cos(angle) * radius) / 2) * 2} y={Math.round((31 + Math.sin(angle) * radius) / 2) * 2} width={2} height={2} fill={ring ? m3.color.outlineVariant : m3.color.onSurfaceVariant} />;
              }))}
              <Rect x={31} y={8} width={2} height={48} fill={m3.color.outlineVariant} />
              <Rect x={8} y={31} width={48} height={2} fill={m3.color.outlineVariant} />
            </Svg>
            <Animated.View testID="telescope-stick-thumb" style={[styles.thumb, { transform: knob.getTranslateTransform() }]}>
              <PixelSurface variant="bevel" contentStyle={styles.thumbFace}><View style={styles.centreDot} /></PixelSurface>
            </Animated.View>
          </View>
        </View>
        <Text style={styles.status} numberOfLines={1}>{speed === 0 ? t('telescope.stopped') : t('telescope.speed', { value: speed })}</Text>
      </View>
      <View style={styles.zoomGroup} testID="telescope-zoom-group">
        <View style={styles.zoomHeader}>
        <PixelPressable disabled={!enabled || zoom <= minZoom} accessibilityLabel={t('recordsGraph.a11yZoomOut')} onPress={() => changeZoom(-0.06)} contentStyle={styles.zoomKey}><Text style={styles.caption}>W</Text></PixelPressable>
        <PixelPressable disabled={!enabled} accessibilityLabel={t('telescope.reset')} onPress={() => { failSafeStop(); onReset(); tick(); }} rootStyle={styles.resetButton} contentStyle={styles.resetKey}>
          <Text testID="telescope-zoom-readout" style={styles.readout} numberOfLines={1}>{zoom.toFixed(2)}×</Text>
        </PixelPressable>
        <PixelPressable disabled={!enabled || zoom >= maxZoom} accessibilityLabel={t('recordsGraph.a11yZoomIn')} onPress={() => changeZoom(0.06)} contentStyle={styles.zoomKey}><Text style={styles.caption}>T</Text></PixelPressable>
        </View>
        <View {...slider.panHandlers} style={styles.slider} testID="telescope-zoom-slider"
          onLayout={({ nativeEvent: { layout } }) => { rail.current.width = Math.max(1, layout.width); setRailWidth(layout.width); }}
          accessible accessibilityRole="adjustable" accessibilityLabel={t('telescope.slider')} accessibilityHint={t('telescope.hint')}
          accessibilityState={{ disabled: !enabled }}
          {...a11yValue({ min: minZoom * 100, max: maxZoom * 100, now: Math.round(zoom * 100), text: zoom.toFixed(2) + '×' })}
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
            <View style={styles.rail} />
            {Array.from({ length: 21 }, (_, i) => <View key={i} style={[styles.minorTick, { left: (i * 5) + '%' as `${number}%` }]} />)}
            {major.map(value => <View key={value} style={[styles.majorTick, { left: zoomToPosition(value, minZoom, maxZoom) * 100 + '%' as `${number}%` }]}><Text style={styles.tickText}>{value}×</Text></View>)}
            <View testID="telescope-zoom-thumb" style={[styles.zoomThumb, { left: position * railWidth - 4 }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, flexShrink: 1, minWidth: 224, maxWidth: 360, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderWidth: 1, borderColor: m3.color.outline, backgroundColor: m3.color.surfaceContainerLow },
  direction: { width: STICK_SIZE, alignItems: 'center', gap: 2, flexShrink: 0 },
  joystick: { width: STICK_SIZE, height: STICK_SIZE, flexShrink: 0 },
  thumb: { position: 'absolute', left: TRAVEL, top: TRAVEL, width: THUMB_SIZE, height: THUMB_SIZE },
  thumbFace: { width: THUMB_SIZE - 2 * m3.spacing.s1, height: THUMB_SIZE - 2 * m3.spacing.s1, padding: 0, alignItems: 'center', justifyContent: 'center' },
  centreDot: { width: 4, height: 4, backgroundColor: m3.color.primary },
  status: { fontFamily: m3.font.mono, fontSize: 12, lineHeight: 18, color: m3.color.onSurfaceVariant, maxWidth: '100%' },
  resetButton: { flex: 1, minWidth: 44 },
  resetKey: { minHeight: 40, padding: 0, alignItems: 'center', justifyContent: 'center' },
  caption: { fontFamily: m3.font.mono, fontSize: 12, lineHeight: 18, color: m3.color.onSurface },
  readout: { fontFamily: m3.font.mono, fontSize: 12, lineHeight: 18, color: m3.color.primary, flexShrink: 1 },
  zoomGroup: { flex: 1, minWidth: 0 },
  zoomHeader: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  zoomKey: { minHeight: 40, width: 40, padding: 0, alignItems: 'center', justifyContent: 'center' },
  slider: { height: 44, marginHorizontal: 18 },
  rail: { position: 'absolute', left: 0, right: 0, top: 12, height: 4, backgroundColor: m3.color.outline },
  minorTick: { position: 'absolute', top: 12, height: 8, width: 1, backgroundColor: m3.color.outline },
  majorTick: { position: 'absolute', top: 10, height: 12, width: 2, backgroundColor: m3.color.onSurface },
  tickText: { position: 'absolute', top: 12, left: -18, width: 36, textAlign: 'center', fontFamily: m3.font.mono, fontSize: 12, lineHeight: 18, color: m3.color.onSurfaceVariant },
  zoomThumb: { position: 'absolute', top: 7, width: 8, height: 16, backgroundColor: m3.color.primary },
});
