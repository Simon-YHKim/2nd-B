import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion';
import { useLoopMedia } from './use-loop-media';

const RATCHET = require('../../../assets/audio/observatory-ratchet.wav');

/** Foreground only. Coming back never replays an old movement request. */
export function useMotionSound() {
  const setMoving = useLoopMedia(RATCHET, 0.08);
  const reducedMotion = useReducedMotionPref();
  const navigation = useNavigation();
  // Router's useFocusEffect waits for loaded navigation. The aim phase starts
  // at mount, so read the real initial focus instead of dropping its request.
  const gate = useRef({
    focused: navigation.isFocused(),
    foreground: AppState.currentState !== 'background' && AppState.currentState !== 'inactive'
      && (Platform.OS !== 'web' || typeof document === 'undefined' || !document.hidden),
  });
  useEffect(() => { if (reducedMotion) setMoving(false); }, [reducedMotion, setMoving]);
  useFocusEffect(useCallback(() => {
    gate.current.focused = true;
    const foreground = (value: boolean) => { gate.current.foreground = value; if (!value) setMoving(false); };
    foreground(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
    const app = AppState.addEventListener('change', state => foreground(state === 'active'));
    const blur = () => foreground(false);
    const focus = () => foreground(true);
    const visibility = () => foreground(!document.hidden);
    const androidBlur = Platform.OS === 'android' ? AppState.addEventListener('blur', blur) : undefined;
    const androidFocus = Platform.OS === 'android' ? AppState.addEventListener('focus', focus) : undefined;
    if (Platform.OS === 'web') {
      visibility(); window.addEventListener('blur', blur); window.addEventListener('focus', focus);
      document.addEventListener('visibilitychange', visibility);
    }
    return () => {
      gate.current.focused = false; setMoving(false); app.remove(); androidBlur?.remove(); androidFocus?.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
        document.removeEventListener('visibilitychange', visibility);
      }
    };
  }, [setMoving]));
  return useCallback((moving: boolean) => {
    setMoving(moving && navigation.isFocused() && gate.current.focused && gate.current.foreground && !reducedMotion);
  }, [navigation, reducedMotion, setMoving]);
}
