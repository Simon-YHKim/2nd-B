// 격자 스프라이트 시트를 프레임 단위로 재생한다 (PIXEL-CLAY).
//
// ## 왜 이게 필요한가
//
// 오프닝이 **정지 초상 한 장의 `opacity`·`scale` 트윈**이 되어 있었다
// (`design/OPENING-AUDIT-260827.md`). 원본은 걸어와서 망원경을 보고 하늘로
// 시선을 옮기는 165프레임이었는데, 그건 셀이 여러 장이어야 가능한 표현이라
// 트윈을 아무리 다듬어도 복원되지 않는다. 그래서 재생기가 필요하다.
//
// ## 왜 낱장이 아니라 한 장인가
//
// 낱장 N개는 디코드가 N번 일어나고 그게 부팅마다 반복된다 (#857 이 6MB 디코드로
// 겪은 문제와 같은 종류다). 시트 한 장은 디코드가 한 번이다.
//
// ⚠ 한 줄로 늘어놓지 않는다 — 48프레임 × 320px = 15,360px 은 여러 기기의 최대
//   텍스처 크기를 넘고, 넘으면 **조용히 안 그려지거나 축소돼 흐려진다.**
//   그래서 격자로 접고 여기서 행·열을 계산한다.
//
// ## 규칙 5(계단 이징)와의 관계
//
// 프레임 재생은 그 자체가 계단이다. 보간이 없고 인덱스가 정수로만 움직인다.
// **여기에 곡선 이징을 얹지 말 것** — 얹는 순간 프레임 사이가 흐려진다.
import { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image as ExpoImage, type ImageSource } from "expo-image";

export interface PixelSpriteSheetProps {
  source: ImageSource | number;
  /** 시트 한 칸의 크기(원본 픽셀). */
  frameWidth: number;
  frameHeight: number;
  /** 격자 모양. `frames` 는 실제로 채워진 칸 수(마지막 줄이 덜 찰 수 있다). */
  cols: number;
  frames: number;
  /** 한 칸이 머무는 시간. */
  frameMs?: number;
  /** 화면에 그릴 크기. 원본의 정수배가 아니면 픽셀이 흐려진다. */
  displayWidth: number;
  /** 끝까지 가면 멈출지(기본) 되감을지. */
  loop?: boolean;
  /** 마지막 프레임에 닿았을 때. `loop` 면 안 불린다. */
  onEnd?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function PixelSpriteSheet({
  source,
  frameWidth,
  frameHeight,
  cols,
  frames,
  frameMs = 80,
  displayWidth,
  loop = false,
  onEnd,
  style,
}: PixelSpriteSheetProps) {
  const [index, setIndex] = useState(0);

  // 프레임은 **경과 시간**에서 계산한다. `setInterval` + 증가로 하면 리렌더가
  // 잦은 부모(타자기가 40ms 마다 상태를 바꾼다) 아래에서 틱이 밀리거나 사라진다.
  // 시작 시각을 기준으로 나누면 몇 번 리렌더되든 같은 프레임이 나온다.
  useEffect(() => {
    if (frames <= 1) return;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const raw = Math.floor(elapsed / frameMs);
      setIndex(loop ? raw % frames : Math.min(raw, frames - 1));
    }, Math.max(16, Math.floor(frameMs / 2)));
    return () => clearInterval(id);
  }, [frameMs, frames, loop]);

  useEffect(() => {
    if (!loop && index === frames - 1) onEnd?.();
  }, [index, frames, loop, onEnd]);

  // 정수배로만 키운다. 소수배는 NEAREST 여도 셀 경계가 어긋난다.
  const raw = displayWidth / frameWidth;
  // 1배 이상이면 정수배로만 키운다(소수배는 셀 경계가 어긋난다). 1배 미만이면
  // 축소라 그대로 쓴다. ⚠ 0 이 되면 창이 0×0 이 되어 **프레임은 도는데 화면은
  // 검은** 상태가 된다 — 실제로 겪었다. 바닥을 깐다.
  const fitScale = raw >= 1 ? Math.floor(raw) : Math.max(raw, 0.25);
  const winW = Math.round(frameWidth * fitScale);
  const winH = Math.round(frameHeight * fitScale);

  const col = index % cols;
  const row = Math.floor(index / cols);
  const rows = Math.ceil(frames / cols);

  return (
    <View
      style={[
        styles.window,
        { width: winW, height: winH },
        style,
      ]}
      pointerEvents="none"
    >
      <ExpoImage
        source={source}
        // 시트 전체를 늘려 놓고 창 밖으로 밀어낸다. `contentFit="fill"` 이라
        // 시트가 통째로 이 크기에 맞춰지고, 칸 하나가 정확히 창 크기가 된다.
        contentFit="fill"
        style={{
          position: "absolute",
          width: winW * cols,
          height: winH * rows,
          left: -col * winW,
          top: -row * winH,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  window: { overflow: "hidden" },
});
