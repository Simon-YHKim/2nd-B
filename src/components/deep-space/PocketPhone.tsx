import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';

import { pixelStepsFor } from '@/lib/motion/pixel-physical';
import { markPhoneStowed, phoneLastStowedAt, shouldPlayPhoneGlare } from '@/lib/motion/phone-glare';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion';
import { POCKET_PHONE_CUE, pocketPhoneCueAllowed } from '@/lib/audio/app-cues';
import { useUiSound } from '@/lib/audio/use-ui-sound';
export const POCKET_PHONE_WIDTH = 104;
export const POCKET_PHONE_HEIGHT = 192;
export const POCKET_PHONE_PEEK = 44;
const PHONE_TRAVEL = POCKET_PHONE_HEIGHT - POCKET_PHONE_PEEK;
const SWIPE_THRESHOLD = 28;
type KeyEvent = { key: string; preventDefault: () => void };
/** Where the swiped-up phone landed, in window coordinates. null = no glare. */
export type PocketPhoneGlare = { x: number; y: number; width: number; height: number } | null;

/** Keep the handset inside the touch frame while cropping only the source's transparent margins. */
function PhoneArtwork() {
  return (
    <Image
      source={require('../../../assets/images/secondb-cellphone-night.png')}
      contentFit="fill"
      accessible={false}
      // Web: a mouse drag on an <img> starts the browser's own image drag,
      // which swallows the moves, so a desktop swipe never raised the phone.
      // expo-image passes this to the <img> only on web; native is unchanged.
      draggable={false}
      style={styles.artwork}
    />
  );
}

/** A swipe raises the phone clear of the camera panel; only the raised phone navigates. */
export function PocketPhone({ label, openLabel, revealHint, stowHint, active, onOpen, onExpandedChange, onGlare }: {
  label: string;
  openLabel: string;
  revealHint: string;
  stowHint: string;
  active: boolean;
  onOpen: () => void;
  onExpandedChange: (expanded: boolean) => void;
  /**
   * The glare (눈부심) is drawn by the home over everything, so it can spread
   * around the phone past this view's clip. This reports where to draw it
   * (once, when a swipe-up lands) and null when it must stop.
   */
  onGlare?: (glare: PocketPhoneGlare) => void;
}) {
  const reducedMotion = useReducedMotionPref();
  const slide = useRef(new Animated.Value(0)).current;
  const playPhoneCue = useUiSound(POCKET_PHONE_CUE.source, POCKET_PHONE_CUE);
  const expanded = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const dragStart = useRef(0);
  const lastSwipeAt = useRef(0);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const onExpandedChangeRef = useRef(onExpandedChange);
  onExpandedChangeRef.current = onExpandedChange;
  const onGlareRef = useRef(onGlare);
  onGlareRef.current = onGlare;
  const phoneRef = useRef<View>(null);
  // Lowering the raised phone ends any glare and starts the eyes' re-adaptation.
  const stow = useCallback(() => {
    markPhoneStowed(Date.now());
    onGlareRef.current?.(null);
  }, []);

  // `glare` is set only by the swipe release (Simon 2026-09-30: the glare is for
  // the swipe-up alone). Tap, ArrowUp and the a11y expand raise without it.
  const settle = useCallback((next: boolean, { glare = false }: { glare?: boolean } = {}) => {
    // Only a collapsed -> raised move takes the phone out. Re-settling an
    // already raised phone (a short drag) is not a new take-out.
    const raising = next && !expanded.current;
    // 폰 소리(Q-261006-05): settle 은 사람이 올리고 내릴 때만 불린다. 대시보드로 가며
    // 내려가는 것과 홈을 떠나며 되돌아가는 것은 settle 을 거치지 않아 무음이다.
    if (pocketPhoneCueAllowed({ wasRaised: expanded.current, raised: next, byUser: true, reducedMotion })) playPhoneCue();
    if (!next && expanded.current) stow();
    if (expanded.current !== next) onExpandedChangeRef.current(next);
    expanded.current = next;
    setIsExpanded(next);
    Animated.timing(slide, {
      toValue: next ? -PHONE_TRAVEL : 0,
      duration: reducedMotion ? 0 : 240,
      easing: pixelStepsFor(240),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      // The screen dazzles when the phone arrives in view (like raise-to-wake).
      // A raise cut short (grabbed again, opened, or lowered) plays nothing.
      if (!finished || !raising || !glare || !expanded.current) return;
      if (!shouldPlayPhoneGlare({ reducedMotion, nowMs: Date.now(), lastStowedAtMs: phoneLastStowedAt() })) return;
      // One measurement per glare, after the phone has stopped: no layout work
      // while it plays.
      phoneRef.current?.measureInWindow((x, y, width, height) => {
        if (expanded.current) onGlareRef.current?.({ x, y, width, height });
      });
    });
  }, [playPhoneCue, reducedMotion, slide, stow]);
  const activate = useCallback(() => {
    if (Date.now() - lastSwipeAt.current < 400) return;
    if (!expanded.current) { settle(true); return; }
    slide.stopAnimation();
    slide.setValue(0);
    // Opening the dashboard lowers the pocket phone; the dashboard itself plays
    // no glare, so the phone dazzles once per take-out.
    stow();
    expanded.current = false;
    setIsExpanded(false);
    onExpandedChangeRef.current(false);
    openRef.current();
  }, [settle, slide, stow]);
  useEffect(() => {
    if (active) return;
    slide.stopAnimation();
    slide.setValue(0);
    if (expanded.current) {
      onExpandedChangeRef.current(false);
      stow();
    }
    expanded.current = false;
    setIsExpanded(false);
  }, [active, slide, stow]);
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
      if (gesture.dy < -SWIPE_THRESHOLD || gesture.vy < -0.4) settle(true, { glare: true });
      else if (gesture.dy > SWIPE_THRESHOLD || gesture.vy > 0.4) settle(false);
      else settle(expanded.current);
    },
    onPanResponderTerminate: () => { lastSwipeAt.current = Date.now(); settle(expanded.current); },
  }), [settle, slide]);

  return (
    <Animated.View ref={phoneRef} {...pan.panHandlers} style={[styles.phone, { transform: [{ translateY: slide }] }]} testID="home-phone-asset">
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
