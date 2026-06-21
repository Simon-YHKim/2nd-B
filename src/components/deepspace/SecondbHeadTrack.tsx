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
import { Animated, StyleSheet, View, type GestureResponderEvent, type ViewStyle } from "react-native";

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

  const spring = (to: number) =>
    Animated.spring(engage, { toValue: to, useNativeDriver: false, friction: 7, tension: 55 }).start();

  const onTouch = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    touch.setValue({ x: pageX, y: pageY });
    if (!active.current) {
      active.current = true;
      spring(1); // smooth start
    }
  };
  const end = () => {
    if (active.current) {
      active.current = false;
      spring(0); // smooth return to origin
    }
  };

  return (
    <TrackingContext.Provider value={{ touch, engage }}>
      <View
        style={[styles.fill, style]}
        onTouchStart={onTouch}
        onTouchMove={onTouch}
        onTouchEnd={end}
        onTouchCancel={end}
      >
        {children}
      </View>
    </TrackingContext.Provider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
