import { useEffect, useRef } from 'react';
import { Animated, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PixelPressable } from '@/components/pixel/PixelPressable';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion';
import { pixelStepsFor } from '@/lib/motion/pixel-physical';
import { starDestinationFrame } from '@/lib/motion/star-camera';
import { useUiSound } from '@/lib/audio/use-ui-sound';
import { m3 } from '@/lib/theme/m3';

const CAMERA_SWEEP = require('../../../assets/audio/telescope-zoom.mp3');
const FOCUS_CLICK = require('../../../assets/audio/jrpg-text-blip.mp3');

/** Keyed per direction: reversing releases the old sound and pending native seek. */
function CameraTransition({ active, progress, reducedMotion, onReturned }: {
  active: boolean; progress: Animated.Value; reducedMotion: boolean; onReturned: () => void;
}) {
  const sweep = useUiSound(CAMERA_SWEEP, { volume: 0.12, playbackRate: active ? 0.95 : 1.3, minIntervalMs: 0 });
  const lock = useUiSound(FOCUS_CLICK, { volume: 0.16, playbackRate: 1.25, minIntervalMs: 0 });
  const callbacks = useRef({ sweep, lock, onReturned });
  callbacks.current = { sweep, lock, onReturned };
  useEffect(() => {
    let live = true;
    const duration = reducedMotion ? 0 : active ? 960 : 640;
    const animation = Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration,
      easing: pixelStepsFor(duration),
      useNativeDriver: Platform.OS !== 'web',
    });
    if (!reducedMotion) callbacks.current.sweep();
    animation.start(({ finished }) => {
      if (!live || !finished) return;
      if (!active) callbacks.current.onReturned();
      else if (!reducedMotion) callbacks.current.lock();
    });
    return () => { live = false; animation.stop(); };
  }, [active, progress, reducedMotion]);
  return null;
}

/** Camera HUD only. The original world owns the star and all of its light. */
export function StarDestination({ active, progress, name, returnLabel, origin, originRadius, size, onReturn, onReturned }: {
  active: boolean;
  progress: Animated.Value;
  name: string;
  returnLabel: string;
  origin: { x: number; y: number };
  originRadius: number;
  size: { width: number; height: number };
  onReturn: () => void;
  onReturned: () => void;
}) {
  const reducedMotion = useReducedMotionPref();
  const callbacks = useRef({ onReturn, onReturned });
  callbacks.current = { onReturn, onReturned };
  useEffect(() => {
    if (!active) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { callbacks.current.onReturn(); return true; });
    return () => back.remove();
  }, [active]);
  const { diameter, radius, centre } = starDestinationFrame(size);
  const initialScale = originRadius / radius;
  return (
    <View style={StyleSheet.absoluteFill} testID="star-destination">
      <CameraTransition key={`${active}:${reducedMotion}`} active={active} progress={progress} reducedMotion={reducedMotion} onReturned={onReturned} />
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={returnLabel}
        onPress={onReturn}
      />
      <View style={styles.heading} pointerEvents="box-none">
        <PixelPressable onPress={onReturn} accessibilityLabel={returnLabel} contentStyle={styles.back}>
          <Text style={styles.backText}>←</Text>
        </PixelPressable>
        <Text style={styles.name} accessibilityRole="header">{name}</Text>
      </View>
      <Animated.View
        testID="star-camera-target"
        pointerEvents={active ? 'auto' : 'none'}
        style={{
          position: 'absolute', left: centre.x - radius, top: centre.y - radius,
          width: diameter, height: diameter,
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [origin.x - centre.x, 0, 0] }) },
            { translateY: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [origin.y - centre.y, 0, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.4, 0.8, 1], outputRange: [initialScale, initialScale, 1, 1] }) },
          ],
        }}
      />
      {/* The reticle never catches taps; the moving target's own hit box does. */}
      <Animated.View testID="star-camera-reticle" pointerEvents="none" style={{
        position: 'absolute', left: centre.x - radius - 12, top: centre.y - radius - 12,
        width: diameter + 24, height: diameter + 24,
        transform: [{ scale: progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1.2, 1.2, 1] }) }],
      }}>
        <View style={[styles.bracket, styles.topLeft]} />
        <View style={[styles.bracket, styles.topRight]} />
        <View style={[styles.bracket, styles.bottomLeft]} />
        <View style={[styles.bracket, styles.bottomRight]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bracket: { position: 'absolute', width: 12, height: 12, borderColor: m3.accent.star },
  topLeft: { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 },
  topRight: { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 },
  bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 },
  bottomRight: { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 },
  heading: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 2 },
  back: { width: 40, minHeight: 36, paddingVertical: 0, paddingHorizontal: 0, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, lineHeight: 26, color: m3.color.onSurface },
  name: { fontFamily: m3.font.brand, fontSize: 24, lineHeight: 30, color: m3.color.onSurface, flexShrink: 1 },
});
