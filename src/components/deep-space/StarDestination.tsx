import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PixelPressable } from '@/components/pixel/PixelPressable';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion';
import { pixelStepsFor } from '@/lib/motion/pixel-physical';
import { STAR_CAMERA_STOPS, starDestinationFrame } from '@/lib/motion/star-camera';
import { CAMERA_APPROACH, CAMERA_RETURN, runCameraSequence, type CameraPhase } from '@/lib/motion/camera-sequence';
import { CameraCue } from './CameraCue';
import { m3 } from '@/lib/theme/m3';

/** Keyed per direction: reversing releases the old sound and pending native seek. */
function CameraTransition({ active, progress, reducedMotion, onReturned, onReady, onPhase }: {
  active: boolean; progress: Animated.Value; reducedMotion: boolean; onReturned: () => void;
  onReady: () => void; onPhase: (phase: CameraPhase) => void;
}) {
  const [phase, setPhase] = useState<CameraPhase>(active ? 'aim' : 'return');
  const callbacks = useRef({ onReturned, onReady, onPhase });
  callbacks.current = { onReturned, onReady, onPhase };
  useEffect(() => {
    const updatePhase = (next: CameraPhase) => { setPhase(next); callbacks.current.onPhase(next); };
    const done = () => {
      if (active) { updatePhase('ready'); callbacks.current.onReady(); }
      else callbacks.current.onReturned();
    };
    if (reducedMotion) { progress.setValue(active ? 1 : 0); done(); return; }
    return runCameraSequence(active ? CAMERA_APPROACH : CAMERA_RETURN, {
      animate: ({ to, duration }, complete) => {
        const animation = Animated.timing(progress, {
          toValue: to, duration, easing: pixelStepsFor(duration), useNativeDriver: Platform.OS !== 'web',
        });
        animation.start(({ finished }) => complete(finished));
        return animation;
      },
      onStep: updatePhase,
      onDone: done,
    });
  }, [active, progress, reducedMotion]);
  return reducedMotion ? null : <CameraCue key={phase} phase={phase} />;
}

/** Camera HUD only. The original world owns the star and all of its light. */
export function StarDestination({ active, progress, name, returnLabel, origin, originRadius, size, onReturn, onReturned, onReady }: {
  active: boolean;
  progress: Animated.Value;
  name: string;
  returnLabel: string;
  origin: { x: number; y: number };
  originRadius: number;
  size: { width: number; height: number };
  onReturn: () => void;
  onReturned: () => void;
  onReady: () => void;
}) {
  const { t } = useTranslation('deepspace');
  const reducedMotion = useReducedMotionPref();
  const [phase, setPhase] = useState<CameraPhase>('aim');
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
      <CameraTransition key={`${active}:${reducedMotion}`} active={active} progress={progress} reducedMotion={reducedMotion} onReturned={onReturned} onReady={onReady} onPhase={setPhase} />
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
            { scale: progress.interpolate({ inputRange: STAR_CAMERA_STOPS, outputRange: [initialScale, initialScale, 1, 1.025, 1] }) },
          ],
        }}
      />
      {/* The reticle never catches taps; the moving target's own hit box does. */}
      <Animated.View testID="star-camera-reticle" pointerEvents="none" style={{
        position: 'absolute', left: centre.x - radius - 12, top: centre.y - radius - 12,
        width: diameter + 24, height: diameter + 24,
        transform: [{ scale: progress.interpolate({ inputRange: [0, 0.4, 0.8, 0.88, 0.94, 1], outputRange: [1.3, 1.2, 1.2, 0.96, 1.04, 1] }) }],
      }}>
        <View style={[styles.bracket, styles.topLeft, phase === 'ready' && styles.locked]} />
        <View style={[styles.bracket, styles.topRight, phase === 'ready' && styles.locked]} />
        <View style={[styles.bracket, styles.bottomLeft, phase === 'ready' && styles.locked]} />
        <View style={[styles.bracket, styles.bottomRight, phase === 'ready' && styles.locked]} />
      </Animated.View>
      <Text testID={`star-camera-phase-${phase}`} pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.phase, { top: centre.y + radius + 32 }]}>{t(`camera.${phase}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bracket: { position: 'absolute', width: 12, height: 12, borderColor: m3.accent.star },
  locked: { borderColor: m3.color.onSurface, borderWidth: 3 },
  phase: { position: 'absolute', left: 12, right: 12, textAlign: 'center', fontFamily: m3.font.brand, fontSize: 12, lineHeight: 18, color: m3.color.onSurface },
  topLeft: { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 },
  topRight: { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 },
  bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 },
  bottomRight: { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 },
  heading: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 2 },
  back: { width: 40, minHeight: 36, paddingVertical: 0, paddingHorizontal: 0, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, lineHeight: 26, color: m3.color.onSurface },
  name: { fontFamily: m3.font.brand, fontSize: 24, lineHeight: 30, color: m3.color.onSurface, flexShrink: 1 },
});
