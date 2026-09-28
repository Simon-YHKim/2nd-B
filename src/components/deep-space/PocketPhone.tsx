import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Animated, PanResponder, Platform, Pressable, StyleSheet } from 'react-native';

import { pixelStepsFor } from '@/lib/motion/pixel-physical';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion';
export const POCKET_PHONE_WIDTH = 104;
export const POCKET_PHONE_HEIGHT = 192;
export const POCKET_PHONE_PEEK = 44;
const PHONE_TRAVEL = POCKET_PHONE_HEIGHT - POCKET_PHONE_PEEK;
const SWIPE_THRESHOLD = 28;
type KeyEvent = { key: string; preventDefault: () => void };

/** Keep the handset inside the touch frame while cropping only the source's transparent margins. */
function PhoneArtwork() {
  return (
    <Image
      source={require('../../../assets/images/secondb-cellphone-night.png')}
      contentFit="fill"
      accessible={false}
      style={styles.artwork}
    />
  );
}

/** A swipe raises the phone clear of the camera panel; only the raised phone navigates. */
export function PocketPhone({ label, openLabel, revealHint, stowHint, active, onOpen, onExpandedChange }: {
  label: string;
  openLabel: string;
  revealHint: string;
  stowHint: string;
  active: boolean;
  onOpen: () => void;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const reducedMotion = useReducedMotionPref();
  const slide = useRef(new Animated.Value(0)).current;
  const expanded = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const dragStart = useRef(0);
  const lastSwipeAt = useRef(0);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const onExpandedChangeRef = useRef(onExpandedChange);
  onExpandedChangeRef.current = onExpandedChange;

  const settle = useCallback((next: boolean) => {
    if (expanded.current !== next) onExpandedChangeRef.current(next);
    expanded.current = next;
    setIsExpanded(next);
    Animated.timing(slide, {
      toValue: next ? -PHONE_TRAVEL : 0,
      duration: reducedMotion ? 0 : 240,
      easing: pixelStepsFor(240),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [reducedMotion, slide]);
  const activate = useCallback(() => {
    if (Date.now() - lastSwipeAt.current < 400) return;
    if (!expanded.current) { settle(true); return; }
    slide.stopAnimation();
    slide.setValue(0);
    expanded.current = false;
    setIsExpanded(false);
    onExpandedChangeRef.current(false);
    openRef.current();
  }, [settle, slide]);
  useEffect(() => {
    if (active) return;
    slide.stopAnimation();
    slide.setValue(0);
    if (expanded.current) onExpandedChangeRef.current(false);
    expanded.current = false;
    setIsExpanded(false);
  }, [active, slide]);
  useEffect(() => () => slide.stopAnimation(), [slide]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => {
      const swiping = Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
      if (swiping) lastSwipeAt.current = Date.now();
      return swiping;
    },
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      slide.stopAnimation();
      dragStart.current = expanded.current ? -PHONE_TRAVEL : 0;
      lastSwipeAt.current = Date.now();
    },
    onPanResponderMove: (_event, gesture) => {
      lastSwipeAt.current = Date.now();
      slide.setValue(Math.max(-PHONE_TRAVEL, Math.min(0, dragStart.current + gesture.dy)));
    },
    onPanResponderRelease: (_event, gesture) => {
      lastSwipeAt.current = Date.now();
      if (gesture.dy < -SWIPE_THRESHOLD || gesture.vy < -0.4) settle(true);
      else if (gesture.dy > SWIPE_THRESHOLD || gesture.vy > 0.4) settle(false);
      else settle(expanded.current);
    },
    onPanResponderTerminate: () => { lastSwipeAt.current = Date.now(); settle(expanded.current); },
  }), [settle, slide]);

  return (
    <Animated.View {...pan.panHandlers} style={[styles.phone, { transform: [{ translateY: slide }] }]} testID="home-phone-asset">
      <Pressable
        onPress={activate}
        accessibilityRole="button"
        accessibilityLabel={isExpanded ? openLabel : label}
        accessibilityHint={isExpanded ? stowHint : revealHint}
        accessibilityState={{ expanded: isExpanded }}
        accessibilityActions={isExpanded ? [{ name: 'collapse', label: stowHint }] : [{ name: 'expand', label: revealHint }]}
        onAccessibilityAction={({ nativeEvent: { actionName } }) => {
          if (actionName === 'collapse') settle(false);
          if (actionName === 'expand') settle(true);
        }}
        style={styles.touch}
        testID="home-phone-touch"
        {...(Platform.OS === 'web' ? { onKeyDown: (event: KeyEvent) => {
          if (event.key === 'ArrowUp' && !expanded.current) { event.preventDefault(); settle(true); }
          if (event.key === 'ArrowDown' && expanded.current) { event.preventDefault(); settle(false); }
        } } : {})}
      >
        <PhoneArtwork />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  phone: { width: POCKET_PHONE_WIDTH, height: POCKET_PHONE_HEIGHT, overflow: 'hidden' },
  touch: { width: POCKET_PHONE_WIDTH, height: POCKET_PHONE_HEIGHT },
  artwork: { position: 'absolute', width: 180, height: 240, left: -39, top: -25 },
});
