// 키보드 피하기 — 화면이 쓰는 단 하나의 입구.
//
// 화면은 RN `KeyboardAvoidingView` 를 직접 쓰지 않고 `KeyboardAvoidingArea` 를 쓴다.
// 플랫폼마다 하는 일(이유는 ./keyboard-avoidance.ts 머리말):
//
//   iOS     RN `KeyboardAvoidingView` + behavior "padding" + `iosKeyboardVerticalOffset`.
//           예전 `Platform.OS === "ios" ? "padding" : undefined` 의 iOS 쪽과 똑같다.
//   Android 뷰의 절대 아래 끝과 키보드 윗변이 겹친 만큼 paddingBottom 을 준다.
//           edge-to-edge 창에서는 adjustResize 가 창을 줄여 주지 않는다.
//   웹      RN `KeyboardAvoidingView` 를 behavior 없이 그대로(react-native-web 에서는
//           평범한 View 다). 예전과 똑같다.
//
// 화면에 플랫폼 분기가 다시 생기지 않는지는 `__tests__/keyboard-avoidance.test.ts` 가 지킨다.
//
// ⚠ 화면 몇 곳(capture · complete-profile · formats · people · profile-details · rest ·
//   PixelGateShell · 비밀번호 변경)은 Android 에서 ScrollView 끝에 `useKeyboard()` 높이를
//   더 붙인다. 창이 줄지 않던 동안 가려진 칸까지 스크롤로 닿게 하던 안전망이다. 이 영역이
//   키보드만큼 띄우면 그 여백은 키보드가 떠 있을 때 스크롤 끝의 빈칸이 될 뿐 아무것도 가리지
//   않는다. 에뮬레이터에서 이 영역이 확인되기 전까지 걷어내지 않는다.
//
// `useKeyboardReveal` 은 같은 Android 갈래의 짝이다. 영역이 ScrollView 를 줄인 뒤 입력칸
// 아래의 버튼(예: /capture "담기")까지 키보드 위로 내려 보인다(2026-10-07 실기 R2A-02 후속).
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  View,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type ViewProps,
} from "react-native";

import {
  IOS_KEYBOARD_BEHAVIOR,
  KEYBOARD_REVEAL_MARGIN,
  keyboardAvoidanceMode,
  keyboardOverlap,
  keyboardRevealScrollY,
  nextKeyboardPadding,
} from "./keyboard-avoidance";

// 키보드 높이 훅도 같은 입구로 꺼낼 수 있게 둔다(화면이 키보드 모듈 하나만 import 하도록).
export { useKeyboard } from "./useKeyboard";

export interface KeyboardAvoidingAreaProps extends ViewProps {
  /**
   * iOS 전용. RN `KeyboardAvoidingView` 의 keyboardVerticalOffset 으로 그대로 간다
   * (화면 위 끝에서 이 뷰의 부모까지의 거리). Android 는 재서 정하므로 쓰지 않는다.
   */
  iosKeyboardVerticalOffset?: number;
  /**
   * iOS 전용. true 면 iOS 에서는 평범한 View 다. 안쪽 ScrollView 가 iOS 전용 prop
   * `automaticallyAdjustKeyboardInsets` 로 키보드를 이미 피할 때 쓴다. 둘 다 띄우면
   * 스크롤 끝에 키보드 높이만큼 빈칸이 한 번 더 생긴다. Android · 웹은 이 값과 무관하게
   * 위 규칙 그대로다(그 prop 은 Android 에서 아무것도 하지 않는다. /capture 2026-10-05 QA).
   */
  iosHandledByScrollView?: boolean;
}

export function KeyboardAvoidingArea({
  iosKeyboardVerticalOffset = 0,
  iosHandledByScrollView = false,
  ...props
}: KeyboardAvoidingAreaProps) {
  const mode = keyboardAvoidanceMode(Platform.OS);
  if (mode === "ios-padding") {
    if (iosHandledByScrollView) return <View {...props} />;
    return (
      <KeyboardAvoidingView
        {...props}
        behavior={IOS_KEYBOARD_BEHAVIOR}
        keyboardVerticalOffset={iosKeyboardVerticalOffset}
      />
    );
  }
  if (mode === "android-measured") return <AndroidKeyboardArea {...props} />;
  return <KeyboardAvoidingView {...props} />;
}

function AndroidKeyboardArea({ style, onLayout, children, ...rest }: ViewProps) {
  const hostRef = useRef<View>(null);
  // 키보드 윗변(dp, RN 루트 기준). 키보드가 없으면 null.
  const keyboardTopRef = useRef<number | null>(null);
  // 이번 키보드가 뜬 뒤 높이가 있는 뷰를 한 번이라도 쟀는가.
  const measuredRef = useRef(false);
  const [padding, setPadding] = useState(0);

  const remeasure = useCallback((fromKeyboard: boolean) => {
    const keyboardTop = keyboardTopRef.current;
    if (keyboardTop == null) {
      setPadding(0);
      return;
    }
    hostRef.current?.measure((_x, _y, _width, height, _pageX, pageY) => {
      // 재는 사이에 키보드가 내려갔거나 바뀌었으면 이 값은 버린다.
      if (keyboardTopRef.current !== keyboardTop) return;
      const overlap = keyboardOverlap({ pageY, height }, keyboardTop);
      const mayGrow = fromKeyboard || !measuredRef.current;
      if (height > 0) measuredRef.current = true;
      setPadding((current) => nextKeyboardPadding(current, overlap, mayGrow));
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event: KeyboardEvent) => {
      keyboardTopRef.current = event.endCoordinates.screenY;
      measuredRef.current = false;
      remeasure(true);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTopRef.current = null;
      measuredRef.current = false;
      setPadding(0);
    });
    // 키보드가 떠 있는 채로 이 화면이 열렸을 때.
    const metrics = Keyboard.isVisible() ? Keyboard.metrics() : undefined;
    if (metrics) {
      keyboardTopRef.current = metrics.screenY;
      remeasure(true);
    }
    return () => {
      show.remove();
      hide.remove();
    };
  }, [remeasure]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
      remeasure(false);
    },
    [onLayout, remeasure],
  );

  return (
    <View
      {...rest}
      ref={hostRef}
      onLayout={handleLayout}
      style={padding > 0 ? [style, { paddingBottom: padding }] : style}
    >
      {children}
    </View>
  );
}

export interface KeyboardRevealOptions {
  /**
   * false 인 동안은 내리지 않는다(예: 첫 기록 안내가 입력칸 자리를 재어 가리키는 동안, 또는
   * 그 입력칸이 화면에서 빠진 동안). false 가 되면 포커스 기억도 지운다 - 빠진 입력칸은
   * onBlur 를 못 보낼 수 있다.
   */
  active?: boolean;
}

export interface KeyboardReveal {
  /** 그 ScrollView 에 펼친다. 높이(영역이 줄인 뒤)와 스크롤 위치를 잰다. */
  scrollProps: {
    onLayout?: (event: LayoutChangeEvent) => void;
    onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle?: number;
  };
  /** 위 끝을 화면 위로 넘기지 않을 묶음(입력칸을 감싼, 내용 컨테이너의 직계 자식)에 펼친다. */
  keepTopProps: { onLayout?: (event: LayoutChangeEvent) => void };
  /** 키보드 위에 보여야 하는 칸(내용 컨테이너의 직계 자식, 예: 담기 버튼 칸)에 펼친다. */
  targetProps: { onLayout?: (event: LayoutChangeEvent) => void };
  /** 그 입력칸(TextInput)에 펼친다. */
  inputProps: { onFocus?: () => void; onBlur?: () => void };
}

/**
 * 입력칸에 포커스가 있고 키보드가 떠 있을 때, 그 아래 칸(버튼)까지 키보드 위에 보이도록
 * ScrollView 를 내린다. Android 전용이다 - 위 영역이 재서 띄우는 갈래(`android-measured`)일
 * 때만 움직이고, iOS(ScrollView 가 스스로 inset 을 맡는다) · 웹에서는 빈 props 를 돌려준다.
 *
 * 언제 내리나: 키보드가 뜨면 영역이 아래를 띄우고 ScrollView 가 줄어 onLayout 이 다시 온다.
 * 그때(그리고 키보드가 이미 떠 있는 채로 입력칸을 누른 때) 한 번 계산한다. 얼마나 내릴지는
 * `keyboardRevealScrollY`(./keyboard-avoidance.ts, 숫자로 검증)가 정한다.
 *
 * 좌표: keepTopProps · targetProps 의 onLayout y 는 부모 기준이다. 그래서 둘 다 ScrollView
 * 내용 컨테이너의 **직계 자식**에 펼쳐야 내용 좌표가 된다.
 */
export function useKeyboardReveal(
  scrollRef: RefObject<ScrollView | null>,
  { active = true }: KeyboardRevealOptions = {},
): KeyboardReveal {
  const enabled = keyboardAvoidanceMode(Platform.OS) === "android-measured";
  const frameRef = useRef({
    focused: false,
    scrollY: 0,
    viewport: 0,
    keepTop: null as number | null,
    target: null as { y: number; height: number } | null,
  });
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
    if (!active) frameRef.current.focused = false;
  }, [active]);

  const reveal = useCallback(() => {
    const frame = frameRef.current;
    if (!activeRef.current || !frame.focused || frame.target == null || !Keyboard.isVisible()) return;
    const y = keyboardRevealScrollY({
      revealBottom: frame.target.y + frame.target.height + KEYBOARD_REVEAL_MARGIN,
      keepTop: frame.keepTop,
      viewportHeight: frame.viewport,
      scrollY: frame.scrollY,
    });
    if (y != null) scrollRef.current?.scrollTo({ y, animated: true });
  }, [scrollRef]);

  return useMemo<KeyboardReveal>(() => {
    if (!enabled) return { scrollProps: {}, keepTopProps: {}, targetProps: {}, inputProps: {} };
    return {
      scrollProps: {
        onLayout: (event) => {
          frameRef.current.viewport = event.nativeEvent.layout.height;
          reveal();
        },
        onScroll: (event) => {
          frameRef.current.scrollY = event.nativeEvent.contentOffset.y;
        },
        scrollEventThrottle: 16,
      },
      keepTopProps: {
        onLayout: (event) => {
          frameRef.current.keepTop = event.nativeEvent.layout.y;
        },
      },
      targetProps: {
        onLayout: (event) => {
          const { y, height } = event.nativeEvent.layout;
          frameRef.current.target = { y, height };
        },
      },
      inputProps: {
        onFocus: () => {
          frameRef.current.focused = true;
          reveal();
        },
        onBlur: () => {
          frameRef.current.focused = false;
        },
      },
    };
  }, [enabled, reveal]);
}
