import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Animated, PanResponder, Platform, Pressable, StyleSheet } from 'react-native';

import { pixelStepsFor } from '@/lib/motion/pixel-physical';
import { markPhoneStowed, phoneLastStowedAt, pocketPhoneGlareGeometry, shouldPlayPhoneGlare } from '@/lib/motion/phone-glare';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion';

import { PhoneGlare } from './PhoneGlare';
export const POCKET_PHONE_WIDTH = 104;
export const POCKET_PHONE_HEIGHT = 192;
export const POCKET_PHONE_PEEK = 44;
const PHONE_TRAVEL = POCKET_PHONE_HEIGHT - POCKET_PHONE_PEEK;
const SWIPE_THRESHOLD = 28;
const GLARE = pocketPhoneGlareGeometry({ width: POCKET_PHONE_WIDTH, height: POCKET_PHONE_HEIGHT });
type KeyEvent = { key: string; preventDefault: () => void };

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
  // The glare (눈부심) run currently on screen, keyed so each raise mounts a
  // fresh one. null = none.
  const [glareRun, setGlareRun] = useState<number | null>(null);
  const glareSeq = useRef(0);
  // Lowering the raised phone ends any glare and starts the eyes' re-adaptation.
  const stow = useCallback(() => {
    markPhoneStowed(Date.now());
    setGlareRun(null);
  }, []);

  const settle = useCallback((next: boolean) => {
    // Only a collapsed -> raised move takes the phone out. Re-settling an
    // already raised phone (a short drag) is not a new take-out.
    const raising = next && !expanded.current;
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
      if (!finished || !raising || !expanded.current) return;
      if (!shouldPlayPhoneGlare({ reducedMotion, nowMs: Date.now(), lastStowedAtMs: phoneLastStowedAt() })) return;
      glareSeq.current += 1;
      setGlareRun(glareSeq.current);
    });
  }, [reducedMotion, slide, stow]);
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
      if (gesture.dy < -SWIPE_THRESHOLD || gesture.vy < -0.4) settle(true);
      else if (gesture.dy > SWIPE_THRESHOLD || gesture.vy > 0.4) settle(false);
      else settle(expanded.current);
    },
    onPanResponderTerminate: () => { lastSwipeAt.current = Date.now(); settle(expanded.current); },
  }), [settle, slide]);

  return (
    <>
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
    {/* Sibling, not child: the phone clips to its frame, and the bloom has to
        reach past it. Rides the same slide, takes no touch, and paints over
        the phone because it comes after it. */}
    {glareRun !== null ? (
      <Animated.View pointerEvents="none" style={[styles.glare, { transform: [{ translateY: slide }] }]}>
        <PhoneGlare
          key={glareRun}
          reducedMotion={reducedMotion}
          screen={GLARE.screen}
          width={GLARE.box.width}
          height={GLARE.box.height}
          onDone={() => setGlareRun(null)}
        />
      </Animated.View>
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  phone: { width: POCKET_PHONE_WIDTH, height: POCKET_PHONE_HEIGHT, overflow: 'hidden' },
  touch: { width: POCKET_PHONE_WIDTH, height: POCKET_PHONE_HEIGHT },
  artwork: { position: 'absolute', width: 180, height: 240, left: -39, top: -25 },
  glare: { position: 'absolute', ...GLARE.box },
});
