import { useCallback, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect } from 'react-native-svg';

import { PixelPressable } from '@/components/pixel/PixelPressable';
import { PixelSurface } from '@/components/pixel/PixelSurface';
import { m3 } from '@/lib/theme/m3';
import { dialTurnDelta, telescopeDialAngle, TELESCOPE_DIAL_STEP } from '@/lib/motion/telescope-controls';
import { a11yValue } from '@/lib/a11y/accessibility-value';
import { useUiSound } from '@/lib/audio/use-ui-sound';

const TICK = require('../../../assets/audio/jrpg-text-blip.mp3');
const DIRECTIONS = [
  { key: 'up', dx: 0, dy: -1, mark: '↑', left: 44, top: 0 },
  { key: 'left', dx: -1, dy: 0, mark: '←', left: 0, top: 44 },
  { key: 'right', dx: 1, dy: 0, mark: '→', left: 88, top: 44 },
  { key: 'down', dx: 0, dy: 1, mark: '↓', left: 44, top: 88 },
] as const;

/** Only the instrument captures gestures. The sky remains tap-to-select. */
export function TelescopeControls({ zoom, maxZoom, onJog, onTurn, onReset }: {
  zoom: number;
  maxZoom: number;
  onJog: (dx: number, dy: number) => void;
  onTurn: (turns: number) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation('deepspace');
  const actions = useRef({ onJog, onTurn, onReset, zoom });
  actions.current = { onJog, onTurn, onReset, zoom };
  const tick = useUiSound(TICK, { volume: 0.045, playbackRate: 0.55, minIntervalMs: 160 });
  const turnAngle = useRef<number | null>(null);
  const centre = useRef({ x: 0, y: 0 });
  const turn = useCallback((delta: number) => { actions.current.onTurn(delta); tick(); }, [tick]);
  const dial = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event, gesture) => {
      const { locationX, locationY } = event.nativeEvent;
      centre.current = { x: gesture.x0 - locationX + 44, y: gesture.y0 - locationY + 44 };
      turnAngle.current = telescopeDialAngle(locationX - 44, locationY - 44);
    },
    onPanResponderMove: (_event, gesture) => {
      const x = gesture.moveX - centre.current.x;
      const y = gesture.moveY - centre.current.y;
      const next = telescopeDialAngle(x, y);
      if (next === null) { turnAngle.current = null; return; }
      if (turnAngle.current !== null) turn(dialTurnDelta(turnAngle.current, next) * 2);
      turnAngle.current = next;
    },
    onPanResponderRelease: () => { turnAngle.current = null; },
    onPanResponderTerminate: () => { turnAngle.current = null; },
  }), [turn]);
  return (
    <View style={styles.root} accessibilityLabel={t('telescope.label')}>
      <View style={styles.jog}>
        {DIRECTIONS.map((direction) => (
          <View key={direction.key} style={[styles.key, { left: direction.left, top: direction.top }]}>
            <PixelPressable
              accessibilityLabel={t(`telescope.${direction.key}`)}
              onPress={() => { onJog(direction.dx, direction.dy); tick(); }}
              contentStyle={styles.keyContent}
            ><Text style={styles.arrow}>{direction.mark}</Text></PixelPressable>
          </View>
        ))}
        <View style={[styles.key, styles.reset]}>
          <PixelPressable accessibilityLabel={t('telescope.reset')} onPress={() => { onReset(); tick(); }} contentStyle={styles.keyContent}>
            <Text style={styles.resetText}>◎</Text>
          </PixelPressable>
        </View>
      </View>
      <View style={styles.optics}>
        <View
          {...dial.panHandlers}
          style={styles.dial}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('telescope.dial')}
          accessibilityHint={t('telescope.hint')}
          {...a11yValue({ min: 100, max: maxZoom * 100, now: Math.round(zoom * 100), text: `${zoom.toFixed(1)}×` })}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={({ nativeEvent }) => turn(nativeEvent.actionName === 'increment' ? TELESCOPE_DIAL_STEP : -TELESCOPE_DIAL_STEP)}
        >
          <PixelSurface variant="inset" contentStyle={styles.dialFace}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg width={88} height={88}>
                {Array.from({ length: 12 }, (_, index) => {
                  const angle = index * Math.PI / 6;
                  return <Rect key={index} x={Math.round(42 + Math.sin(angle) * 33)} y={Math.round(42 - Math.cos(angle) * 33)} width={4} height={4} fill={m3.color.outline} />;
                })}
                <Rect x={Math.round(41 + Math.sin(Math.log2(zoom) * Math.PI) * 26)} y={Math.round(41 - Math.cos(Math.log2(zoom) * Math.PI) * 26)} width={6} height={6} fill={m3.color.primary} />
              </Svg>
            </View>
            <Text pointerEvents="none" style={styles.readout}>{zoom.toFixed(1)}×</Text>
          </PixelSurface>
        </View>
        <View style={styles.zoomKeys}>
          <PixelPressable accessibilityLabel={t('recordsGraph.a11yZoomOut')} disabled={zoom <= 1} onPress={() => turn(-TELESCOPE_DIAL_STEP)} contentStyle={styles.keyContent}>
            <Text style={styles.arrow}>−</Text>
          </PixelPressable>
          <PixelPressable accessibilityLabel={t('recordsGraph.a11yZoomIn')} disabled={zoom >= maxZoom} onPress={() => turn(TELESCOPE_DIAL_STEP)} contentStyle={styles.keyContent}>
            <Text style={styles.arrow}>+</Text>
          </PixelPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  jog: { width: 132, height: 132 },
  key: { position: 'absolute', width: 44, height: 44 },
  reset: { left: 44, top: 44 },
  keyContent: { width: 40, minHeight: 36, paddingVertical: 0, paddingHorizontal: 0, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontFamily: m3.font.mono, fontSize: 24, lineHeight: 26, color: m3.color.onSurface },
  resetText: { fontSize: 18, lineHeight: 24, color: m3.color.primary },
  optics: { width: 88, alignItems: 'center' },
  dial: { width: 88, height: 88 },
  dialFace: { width: 80, height: 80, paddingHorizontal: 0, paddingVertical: 0, alignItems: 'center', justifyContent: 'center' },
  readout: { fontFamily: m3.font.mono, fontSize: 12, lineHeight: 18, color: m3.color.onSurface },
  zoomKeys: { flexDirection: 'row', justifyContent: 'center', width: 88 },
});
