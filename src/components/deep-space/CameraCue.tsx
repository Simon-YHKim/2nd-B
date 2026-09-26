import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useUiSound } from '@/lib/audio/use-ui-sound';
import { useMotionSound } from '@/lib/audio/use-motion-sound';
import type { CameraPhase } from '@/lib/motion/camera-sequence';

const FOCUS = require('../../../assets/audio/observatory-focus-lock.wav');

/** Aim and zoom share one uninterrupted rhythm, followed by the focus-lock recording. */
export function CameraCue({ phase }: { phase: CameraPhase }) {
  const [cancelled, setCancelled] = useState(false);
  useFocusEffect(useCallback(() => {
    // Cancelling a journey's audio is permanent; returning to the app cannot
    // replay a stale focus-lock cue. A new journey mounts a new CameraCue.
    const stop = () => setCancelled(true);
    const visibility = () => { if (document.hidden) stop(); };
    if (AppState.currentState === 'background' || AppState.currentState === 'inactive') stop();
    const app = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    const androidBlur = Platform.OS === 'android' ? AppState.addEventListener('blur', stop) : undefined;
    if (Platform.OS === 'web') {
      visibility(); window.addEventListener('blur', stop); document.addEventListener('visibilitychange', visibility);
    }
    return () => {
      stop(); app.remove(); androidBlur?.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility);
      }
    };
  }, []));
  return cancelled ? null : <ActiveCameraCue phase={phase} />;
}

function ActiveCameraCue({ phase }: { phase: CameraPhase }) {
  const motor = useMotionSound();
  const moving = phase === 'aim' || phase === 'zoom' || phase === 'return';
  useEffect(() => { motor(moving); return () => motor(false); }, [motor, moving]);
  const play = useUiSound(FOCUS, { volume: 0.18, minIntervalMs: 0 });
  useEffect(() => { if (phase === 'ready') play(); }, [phase, play]);
  return null;
}
