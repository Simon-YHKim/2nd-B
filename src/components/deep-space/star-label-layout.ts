// 별자리 홈의 별 이름표 자리: 어디에 놓고, 몇 줄을 쓰는가.
//
// 화면(ConstellationHome.tsx)이 그리는 값과 테스트가 재는 값이 같도록 순수 함수로 뺐다.
// 이 저장소에서는 컴포넌트 렌더 테스트가 막혀 있다(RN 0.85 + jest).
//
// 첫 줄 자리는 그대로다. 폭 80 가운데 정렬, 점 아래 `6k + 8`, 글자 `10.5k`, 줄 `14k`
// (프로토타입 sb-home 의 값, k = 상자 폭 / 380). 한 줄에 들어가는 이름은 전과 같은
// 자리에 같은 모양으로 그려진다.
//
// 바뀐 것은 줄 수다 (2026-09-14). 영어 "Thirties and after" 가 가로 411dp 기기에서
// "Thirties and af…" 로 잘렸다 (vibe r260913 T1a 항목 5). 그 이름은 Pretendard 10.5 에서
// 폭 80 을 넘는다. 스페인어 "De los 30 en adelante", 포르투갈어 "Dos 30 em diante" 와
// "Primeira infância" 도 넘는다. 이름은 바꾸지 않고 둘째 줄로 푼다.
//
// 둘째 줄은 **그 자리가 비어 있을 때만** 준다. 둘째 줄 상자가
//   - 다른 별 이름표의 첫 줄,
//   - 둘째 줄을 받은 다른 별 이름표의 둘째 줄,
//   - 다른 별의 코어 (눌러서 커졌을 때 크기),
//   - 북극성 이름표
// 어느 것과도 겹치지 않고 별자리 상자 안에 있어야 한다. 지금 캐논 좌표에서는 20대 아래에
// 30대 이후 별이, 학창시절 아래에 영유아기 이름표가 있다. 그래서 그 둘은 한 줄로 남는다.
// 좌표에서 계산하므로 캐논 좌표가 바뀌면 판정도 따라온다.
//
// 헤일로(디더 광채)는 장애물로 세지 않는다. 지금 캐논에서도 첫 줄 이름표 상자가 이웃 별의
// 헤일로에 걸쳐 있다 (20대 이름표와 30대 이후 헤일로). 새 줄에만 더 엄격한 규칙을 걸 이유가
// 없고, 걸면 영유아기 둘째 줄이 프로필을 눌렀을 때 커지는 헤일로 끝 0.3px 때문에 막힌다.
//
// 기기 글꼴 크기도 입력이다 (2026-09-14, PR #1810 생성물 게이트 F1). 이름표 Text 는 RN 기본값대로
// 기기 글꼴 설정을 따르는데, 위 계산은 배율 1 로만 쟀다. 글꼴을 키우면 폭 80 을 넘어 다시 말줄임이
// 되고, 둘째 줄의 실제 높이가 계산한 상자보다 커져 남의 자리를 덮을 수 있었다.
//   - 글자는 min(기기 배율, LABEL_MAX_FONT_SCALE) 로 그려진다. 두 이름표 Text 에
//     maxFontSizeMultiplier 로 이 상한을 건다. RN 0.85 설치본 소스 기준으로 Android 는 글자 크기 ·
//     줄 높이 · 자간을 PixelUtil.toPixelFromSP(값, 상한) 으로 곱하고, iOS 는 글자 크기 · 줄 높이를
//     RCTEffectiveFontSizeMultiplierFromTextAttributes 로 곱한다 (iOS 자간은 그대로).
//   - 그 배율로 상자 폭과 줄 높이를 키워서 판정한다. 폭이 글자와 같이 커지므로 줄이 끊기는 자리는
//     배율 1 과 같다. 점 아래 자리(top)와 코어 크기는 글꼴과 무관해서 그대로다.
//   - style 의 fontSize · lineHeight 는 배율 1 값 그대로 둔다. RN 이 곱하므로 여기서 곱하면 두 번
//     커진다.
//   - 웹(react-native-web)은 fontScale 이 늘 1 이다.

export type Box = { left: number; top: number; right: number; bottom: number };

/**
 * 이름표 하나의 자리. 그대로 RN style 에 넣는다.
 * left · width 는 글꼴 배율을 반영한 값이고 fontSize · lineHeight 는 배율 1 값이다 (RN 이 곱한다).
 */
export type LabelFrame = {
  left: number;
  top: number;
  width: number;
  fontSize: number;
  lineHeight: number;
};

export type StarLabelFrame = { frame: LabelFrame; maxLines: 1 | 2 };

/** 별 이름표 (sb-home: 점 아래, 10.5px/600). */
export const STAR_LABEL = { width: 80, fontSize: 10.5, lineHeight: 14, dropPerK: 6, drop: 8 } as const;

/** 북극성 이름표. 구가 더 커서 `9k + 8` 아래에 놓이고 폭은 120 이다. 늘 한 줄이다. */
export const POLARIS_LABEL = { width: 120, fontSize: 10.5, lineHeight: 14, dropPerK: 9, drop: 8 } as const;

/**
 * 이름표 글자가 기기 글꼴 설정을 따라 커지는 상한. 별 · 북극성 이름표 Text 의
 * maxFontSizeMultiplier 에 같은 값을 건다.
 *
 * 1.2 인 이유 (가로 320~440dp 를 0.5dp 간격, 배율을 0.0025 간격으로 잰 값, 2026-09-14):
 *   - 가장 긴 로케일: pt "Primeira infância" 는 가로 399dp 이상에서 두 줄이 필요하다. 배율을 올리면
 *     그 둘째 줄이 눌린 프로필 별 코어에 닿아 한 줄로 돌아가고 다시 잘린다. 그 배율이 가장 빡빡한
 *     폭(399.5dp)에서 1.24 다. 1.2 에서 둘째 줄 아래 끝과 그 코어 사이는 최소 1.05dp 남는다. Android 는
 *     줄 높이를 물리 px 로 올림하므로(CustomLineHeightSpan, ceil) 둘째 줄 끝이 2px 미만 더 내려올 수
 *     있는데, 그 폭의 기기 밀도에서 1dp 보다 작다.
 *   - 겹침 금지: 둘째 줄은 이 배율로 키운 상자로 판정하므로 상한까지는 남의 자리를 덮지 않는다.
 *     첫 줄끼리는 판정하지 않는다 (배율 1 에서도 그렇다).
 *   - 북극성 우세: 두 이름표가 같은 상한을 쓰므로 어느 기기 배율에서도 북극성 글자가 별 글자보다
 *     작아지지 않는다.
 * 기기 배율이 상한을 넘으면 글자도 자리도 상한에서 멈춘다. 별의 온전한 이름은 스크린 리더
 * 레이블(accessibilityLabel)에 늘 있다.
 */
export const LABEL_MAX_FONT_SCALE = 1.2;

type LabelSpec = typeof STAR_LABEL | typeof POLARIS_LABEL;

/** 이름표 글자가 실제로 그려지는 배율. RN 은 1 이상인 maxFontSizeMultiplier 를 상한으로 쓴다. */
export function labelFontScale(fontScale: number): number {
  return Number.isFinite(fontScale) && fontScale > 0 ? Math.min(fontScale, LABEL_MAX_FONT_SCALE) : 1;
}

function labelFrame(spec: LabelSpec, cx: number, cy: number, k: number, scale: number): LabelFrame {
  const width = spec.width * scale;
  return {
    left: cx - width / 2,
    top: cy + (spec.dropPerK * k + spec.drop),
    width,
    fontSize: spec.fontSize * k,
    // lineHeight (~1.34x) gives the Korean names room for their 받침 descenders.
    // Android clips the last line of a numberOfLines Text without a padded line box.
    lineHeight: Math.round(spec.lineHeight * k),
  };
}

/** 북극성 이름표 자리. `fontScale` 은 기기 글꼴 배율 그대로 넘긴다 (상한은 여기서 건다). */
export function polarisLabelFrame(cx: number, cy: number, k: number, fontScale: number): LabelFrame {
  return labelFrame(POLARIS_LABEL, cx, cy, k, labelFontScale(fontScale));
}

/** `line` 번째 줄(0 = 첫 줄)이 그려지는 상자. 줄 높이는 style 값에 그리는 배율 `scale` 을 곱한 것이다. */
export function labelLineBox(frame: LabelFrame, line: number, scale: number): Box {
  const height = frame.lineHeight * scale;
  const top = frame.top + height * line;
  return { left: frame.left, top, right: frame.left + frame.width, bottom: top + height };
}

/** 모서리가 닿기만 하는 것은 겹침이 아니다. */
export function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export type StarLabelInput<Id extends string> = {
  /** 별 중심. 별자리 상자 안 px. */
  stars: readonly { id: Id; cx: number; cy: number }[];
  /** 상자 폭 / 380. */
  k: number;
  /** 별 코어가 가장 클 때(눌렸을 때) PixelStarSvg 가 그리는 반폭 px. */
  coreHalfSpan: number;
  /** 북극성 중심. */
  polaris: { cx: number; cy: number };
  /** 별자리 상자 크기. */
  stage: { w: number; h: number };
  /** 기기 글꼴 배율 (useWindowDimensions().fontScale) 그대로. 상한은 이 모듈이 건다. */
  fontScale: number;
};

export function layoutStarLabels<Id extends string>(input: StarLabelInput<Id>): Record<Id, StarLabelFrame> {
  const { stars, k, coreHalfSpan, polaris, stage, fontScale } = input;
  const scale = labelFontScale(fontScale);
  const frames = stars.map((s) => labelFrame(STAR_LABEL, s.cx, s.cy, k, scale));
  const line = (frame: LabelFrame, n: number) => labelLineBox(frame, n, scale);
  const polarisLine = line(polarisLabelFrame(polaris.cx, polaris.cy, k, fontScale), 0);
  // PixelStarSvg 는 중심을 반올림해서 그린다. 같은 자리로 잰다.
  const coreBox = (s: { cx: number; cy: number }): Box => {
    const x = Math.round(s.cx);
    const y = Math.round(s.cy);
    return { left: x - coreHalfSpan, top: y - coreHalfSpan, right: x + coreHalfSpan, bottom: y + coreHalfSpan };
  };
  const inStage = (b: Box) => b.left >= 0 && b.top >= 0 && b.right <= stage.w && b.bottom <= stage.h;

  const free = frames.map((frame, i) => {
    const second = line(frame, 1);
    if (!inStage(second) || boxesOverlap(second, polarisLine)) return false;
    return stars.every(
      (other, j) => j === i || (!boxesOverlap(second, line(frames[j], 0)) && !boxesOverlap(second, coreBox(other))),
    );
  });
  // 둘째 줄끼리 겹치면 둘 다 한 줄로 둔다. 누구에게 줄지 가를 근거가 좌표에는 없다.
  const twoLines = free.map(
    (ok, i) =>
      ok && free.every((otherOk, j) => j === i || !otherOk || !boxesOverlap(line(frames[i], 1), line(frames[j], 1))),
  );

  const out = {} as Record<Id, StarLabelFrame>;
  stars.forEach((s, i) => {
    out[s.id] = { frame: frames[i], maxLines: twoLines[i] ? 2 : 1 };
  });
  return out;
}
