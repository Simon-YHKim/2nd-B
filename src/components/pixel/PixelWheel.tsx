import { PhonePressable as Pressable, PhoneView as View } from "@/components/phone/PhoneUIKit";
// PIXEL-CLAY 휠 한 칸 (Simon 2026-09-30, /data-connections 시간 설정 피드백).
//
// 참조 사진은 가운데 값 위아래로 이웃 값을 흐리게 보여 주는 폰 기본 휠이었다.
// 읽는 방식은 그대로 두고 옷만 PIXEL-CLAY 로 바꾼다:
//   - 흐림은 불투명도가 아니라 한 단 어두운 토큰 색이다(절대 규칙 4).
//   - 선택 줄 위아래 선은 2px 정수 막대다. 곡선도 그림자도 없다(규칙 1·3).
//   - 값은 한 칸씩 끊어서 넘어간다. 끄는 중에도 매끄러운 스크롤이 없다(규칙 5, 계단 모션).
//
// 조작 경로는 다섯이다: 위아래 이웃 값 누르기, 세로로 끌기, 스크린리더 증감 동작
// (adjustable), 웹 방향키·Home·End, 웹 마우스 휠. 계산은 전부 `time-wheel.ts` 에 있다.
import { useEffect, useMemo, useRef } from "react";
import { PanResponder, Platform, StyleSheet, useWindowDimensions, type ViewStyle } from "react-native";

import { m3TextStyle } from "@/components/m3/typeface";
import { PlainText as Text } from "@/components/ui/PlainText";
import { a11yValue } from "@/lib/a11y/accessibility-value";
import { m3 } from "@/lib/theme/m3";

import { dragSteps, wheelKeyTarget, wheelNeighbor, wheelStep } from "./time-wheel";

/** 줄 높이의 바닥. 이웃 값도 누르는 자리라 최소 터치 규격 위에 둔다. */
const MIN_ROW = 48;
/** 가운데 값(headlineSmall)의 줄 높이. 기기 글꼴 배율만큼 줄이 같이 커진다. */
const SELECTED_LINE = 36;
/** 마우스 휠 한 눈금으로 치는 세로 이동량. 트랙패드의 잔 이동은 모았다가 넘긴다. */
const WHEEL_NOTCH = 40;

type KeyEvent = { key: string; preventDefault: () => void };
const webTouchStyle: ViewStyle & { userSelect: "none"; touchAction: "none" } = {
  userSelect: "none",
  touchAction: "none",
};

export interface PixelWheelProps {
  /** 칸마다 보여 줄 글자. index 가 이 배열을 가리킨다. */
  labels: readonly string[];
  index: number;
  onChange: (index: number) => void;
  /** 스크린리더가 읽는 칸 이름 (예: 시, 분). */
  accessibilityLabel: string;
  /** 스크린리더가 읽을 값 (예: "7시"). 없으면 보이는 글자를 읽는다. */
  spokenLabels?: readonly string[];
  /** 끝에서 처음으로 도는가. 시·분은 돌고 오전/오후는 멈춘다. */
  wrap?: boolean;
}

export function PixelWheel({ labels, index, onChange, accessibilityLabel, spokenLabels, wrap = false }: PixelWheelProps) {
  const count = labels.length;
  const { fontScale } = useWindowDimensions();
  // 글꼴 배율에 상한을 걸지 않는다(Simon 결정 Q-260914-02). 대신 줄이 글자를 따라 커진다.
  const row = Math.max(MIN_ROW, Math.ceil(SELECTED_LINE * fontScale) + m3.spacing.s1);

  // 제스처와 웹 리스너는 한 번 만들고, 최신 값은 ref 로 읽는다.
  const latest = useRef({ index, count, wrap, onChange, row });
  useEffect(() => {
    latest.current = { index, count, wrap, onChange, row };
  });
  const dragFrom = useRef(index);
  // 웹 마우스로 이웃 줄 안에서 끌었다 놓으면 끌기 한 칸 뒤에 click 이 한 번 더 온다
  // (RN-web 의 onPress 는 응답자 시스템과 따로 DOM click 에서 불린다). 끄는 동안과 놓은
  // 직후 한 틱은 이웃 줄 누르기를 무시한다. 터치와 네이티브는 원래 겹치지 않는다.
  const dragging = useRef(false);
  const node = useRef<View>(null);

  const move = (delta: number) => {
    const next = wheelStep(index, delta, count, wrap);
    if (next !== index) onChange(next);
  };

  const pan = useMemo(() => PanResponder.create({
    // 이웃 값 줄(Pressable)에서 시작한 끌기도 칸이 가져간다. 세로가 더 길 때만.
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      dragging.current = true;
      dragFrom.current = latest.current.index;
    },
    onPanResponderMove: (_event, gesture) => {
      const current = latest.current;
      const next = wheelStep(dragFrom.current, dragSteps(gesture.dy, current.row), current.count, current.wrap);
      if (next !== current.index) current.onChange(next);
    },
    onPanResponderRelease: () => {
      setTimeout(() => { dragging.current = false; }, 0);
    },
    onPanResponderTerminate: () => {
      setTimeout(() => { dragging.current = false; }, 0);
    },
    onPanResponderTerminationRequest: () => false,
  }), []);

  const tap = (delta: number) => {
    if (!dragging.current) move(delta);
  };

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const element = node.current as unknown as HTMLElement | null;
    if (!element || typeof element.addEventListener !== "function") return;
    let pending = 0;
    const onWheel = (event: WheelEvent) => {
      // 휠이 칸을 돌리는 동안 시트 뒤 화면이 스크롤되지 않게 한다.
      event.preventDefault();
      pending += event.deltaY;
      if (Math.abs(pending) < WHEEL_NOTCH) return;
      const current = latest.current;
      const next = wheelStep(current.index, Math.sign(pending), current.count, current.wrap);
      pending = 0;
      if (next !== current.index) current.onChange(next);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const above = wheelNeighbor(index, -1, count, wrap);
  const below = wheelNeighbor(index, 1, count, wrap);
  const current = labels[index] ?? "";
  const spoken = spokenLabels?.[index] ?? current;
  // 높이가 아니라 최소 높이: 가장 큰 글꼴에서 글자가 두 줄이 되면 줄이 같이 늘어난다.
  const rowStyle = { minHeight: row };

  return (
    <View
      ref={node}
      collapsable={false}
      {...pan.panHandlers}
      style={[styles.column, Platform.OS === "web" && webTouchStyle]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      {...a11yValue({ min: 0, max: Math.max(0, count - 1), now: index, text: spoken })}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "increment") move(1);
        else if (nativeEvent.actionName === "decrement") move(-1);
      }}
      {...(Platform.OS === "web" ? {
        tabIndex: 0,
        onKeyDown: (event: KeyEvent) => {
          const target = wheelKeyTarget(event.key, index, count, wrap);
          if (target === null) return;
          event.preventDefault();
          if (target !== index) onChange(target);
        },
      } : {})}
    >
      <WheelNeighbor label={above === null ? "" : labels[above]} height={row} onPress={above === null ? undefined : () => tap(-1)} />
      <View style={styles.rule} />
      <View style={[styles.selectedRow, rowStyle]}>
        <Text style={styles.selectedText}>{current}</Text>
      </View>
      <View style={styles.rule} />
      <WheelNeighbor label={below === null ? "" : labels[below]} height={row} onPress={below === null ? undefined : () => tap(1)} />
    </View>
  );
}

/**
 * 가운데 값 위아래의 흐린 이웃 줄. 누르면 한 칸 움직인다.
 * 칸 전체가 스크린리더의 조절 요소이므로 이 줄들은 접근성 트리에서 숨긴다 -
 * 같은 동작을 increment/decrement 가 이미 준다.
 * RN-web 은 accessible · importantForAccessibility · focusable 을 DOM 에 옮기지 않고 Pressable 에
 * 늘 tabIndex 0 을 준다(리뷰에서 헤드리스 Edge 로 실측). 그래서 웹에서는 tabIndex -1 과
 * aria-hidden 을 직접 준다 - 그러지 않으면 role=slider 안에 이름 없는 탭 정지가 다섯 개 생긴다.
 */
function WheelNeighbor({ label, height, onPress }: { label: string; height: number; onPress?: () => void }) {
  // Platform 은 렌더 때 읽는다(모듈 상단에서 읽으면 Platform 없는 react-native 목을 쓰는 테스트가 깨진다).
  const webHidden = Platform.OS === "web" ? { tabIndex: -1 as const, "aria-hidden": true as const } : {};
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessible={false}
      focusable={false}
      importantForAccessibility="no-hide-descendants"
      {...webHidden}
      style={[styles.neighborRow, { minHeight: height }]}
    >
      <Text style={styles.neighborText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, minWidth: 56, alignItems: "stretch" },
  neighborRow: { alignItems: "center", justifyContent: "center" },
  selectedRow: { alignItems: "center", justifyContent: "center" },
  // 참조 휠의 청록 선 자리. primary 2px 막대, 칸마다 따로 끊겨 칸 경계가 보인다.
  rule: { height: 2, marginHorizontal: m3.spacing.s2, backgroundColor: m3.color.primary },
  // 흐린 이웃: 불투명도 대신 onSurfaceVariant(패널 위 5.78:1). 크기도 한 단 작다.
  neighborText: { ...m3TextStyle("titleMedium"), color: m3.color.onSurfaceVariant, textAlign: "center" },
  selectedText: { ...m3TextStyle("headlineSmall"), color: m3.color.onSurface, textAlign: "center" },
});
