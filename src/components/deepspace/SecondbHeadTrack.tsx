// Touch-tracking provider for the big SecondB head (Claude Design deep-space home).
// Broadcasts the latest touch point (window coords) + a smooth engage 0..1 to any
// <SecondbHead track /> below it. Uses bubbling onTouch* (NOT the responder system),
// so it never steals taps from buttons/inputs underneath.
//
// Mount once high in the tree (e.g. around the Stack in app/_layout), or per screen.
// Small heads (track omitted) ignore this entirely.
//
//   <SecondbHeadTrackProvider>{children}</SecondbHeadTrackProvider>
//
// engage springs 0->1 on first touch (smooth start) and 1->0 on release (smooth
// return to origin). The head multiplies its offset by engage, so release eases it
// back to center even though the last touch point stays frozen.

import { createContext, useContext, useRef } from "react";
import { Animated, Platform, StyleSheet, View, type GestureResponderEvent, type ViewStyle } from "react-native";
import { PIXEL_STEP } from "@/lib/motion/pixel-physical";

export interface SecondbTracking {
  touch: Animated.ValueXY; // window px of the active touch
  engage: Animated.Value; // 0 idle .. 1 fully tracking
}

const TrackingContext = createContext<SecondbTracking | null>(null);

export function useSecondbTracking(): SecondbTracking | null {
  return useContext(TrackingContext);
}

export function SecondbHeadTrackProvider({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const touch = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const engage = useRef(new Animated.Value(0)).current;
  const active = useRef(false);

  // PIXEL-CLAY 규칙 5 — 스프링은 연속 운동이라 계단 이징으로 바꿨다.
  // 머리가 손을 따라 붙었다 떨어지는 반응이라 상호작용 사다리의 base(120ms/3칸)다.
  // 이름은 spring 그대로 두었다 — 호출부가 뜻하는 바(붙기/놓기)는 안 바뀌었다.
  const spring = (to: number) =>
    Animated.timing(engage, {
      toValue: to,
      duration: PIXEL_STEP.base.duration,
      easing: PIXEL_STEP.base.easing,
      useNativeDriver: false,
    }).start();

  const move = (pageX: number, pageY: number) => {
    touch.setValue({ x: pageX, y: pageY });
    if (!active.current) {
      active.current = true;
      spring(1); // smooth start
    }
  };
  const onTouch = (e: GestureResponderEvent) => move(e.nativeEvent.pageX, e.nativeEvent.pageY);
  const end = () => {
    if (active.current) {
      active.current = false;
      spring(0); // smooth return to origin
    }
  };

  // Web has no touch events for a mouse, so the head wouldn't follow the cursor
  // on the live web build. Mirror the touch handlers onto mouse move/leave there.
  const webProps =
    Platform.OS === "web"
      ? ({
          onMouseMove: (e: { nativeEvent: { pageX: number; pageY: number } }) =>
            move(e.nativeEvent.pageX, e.nativeEvent.pageY),
          onMouseLeave: end,
        } as object)
      : null;

  return (
    <TrackingContext.Provider value={{ touch, engage }}>
      <View
        style={[styles.fill, style]}
        onTouchStart={onTouch}
        onTouchMove={onTouch}
        onTouchEnd={end}
        onTouchCancel={end}
        {...(webProps ?? {})}
      >
        {children}
      </View>
    </TrackingContext.Provider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
