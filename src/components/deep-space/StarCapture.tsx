import { useEffect, useRef } from 'react';
import { Animated, AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion';
import { pixelStepsFor } from '@/lib/motion/pixel-physical';
import { CAMERA_SHUTTER, runCameraSequence } from '@/lib/motion/camera-sequence';
import { useUiSoundControl } from '@/lib/audio/use-ui-sound';

// Android stacking order, not a decorative shadow (ANDROID_QA_GUIDELINES).
const SHUTTER_LAYER = 100;
const SHUTTER = require('../../../assets/audio/observatory-shutter.wav');

/** Prepare during the approach; one exposure reuses that player without delaying navigation. */
export function StarCapture({ active, onComplete, onCancel }: { active: boolean; onComplete: () => void; onCancel: () => void }) {
  const { t } = useTranslation('deepspace');
  const reducedMotion = useReducedMotionPref();
  const progress = useRef(new Animated.Value(0)).current;
  const { play, stop: stopSound } = useUiSoundControl(SHUTTER, { volume: 0.2, minIntervalMs: 0 });
  const callbacks = useRef({ onComplete, onCancel });
  callbacks.current = { onComplete, onCancel };
  useEffect(() => {
    if (!active) return;
    if (reducedMotion) { callbacks.current.onComplete(); return; }
    progress.setValue(0);
    play();
    let live = true;
    const stop = runCameraSequence(CAMERA_SHUTTER, {
      animate: ({ to, duration }, complete) => {
        const animation = Animated.timing(progress, {
          toValue: to, duration, easing: pixelStepsFor(duration), useNativeDriver: Platform.OS !== 'web',
        });
        animation.start(({ finished }) => complete(finished));
        return animation;
      },
      onStep: () => {},
      onDone: () => { if (live) { live = false; stopSound(); callbacks.current.onComplete(); } },
    });
    const cancel = () => { if (live) { live = false; stop(); stopSound(); callbacks.current.onCancel(); } };
    const back = BackHandler.addEventListener('hardwareBackPress', () => { cancel(); return true; });
    const app = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', cancel) : undefined;
    const visibility = () => { if (document.hidden) cancel(); };
    const keydown = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } };
    if (Platform.OS === 'web') {
      window.addEventListener('blur', cancel);
      window.addEventListener('keydown', keydown);
      document.addEventListener('visibilitychange', visibility);
    }
    return () => {
      live = false; stop(); stopSound(); back.remove(); app.remove(); blur?.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('blur', cancel);
        window.removeEventListener('keydown', keydown);
        document.removeEventListener('visibilitychange', visibility);
      }
    };
  }, [active, play, progress, reducedMotion, stopSound]);
  if (!active || reducedMotion) return null;
  return (
    <View testID="star-camera-shutter" style={[StyleSheet.absoluteFill, styles.overlay]} accessibilityViewIsModal accessibilityLabel={t('camera.shutter')} onStartShouldSetResponder={() => true}>
      <Animated.View testID="star-camera-flash" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, {
        opacity: progress.interpolate({ inputRange: [0, 0.22, 0.6, 1], outputRange: [0, 0.65, 0.24, 0] }),
      }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: SHUTTER_LAYER, elevation: SHUTTER_LAYER },
  flash: { backgroundColor: '#eaf3ff' },
});
