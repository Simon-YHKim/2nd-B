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
// 기기 글꼴 크기도 입력이다 (2026-09-14 생성물 게이트 F1, 2026-09-15 재게이트 F1-R1 과 Simon 결정
// Q-260914-02 ①). 이름표 Text 는 RN 기본값대로 기기 글꼴 설정을 따르고, 상한을 걸지 않는다. main 과
// 같은 확대다. 한때 1.2 배 상한(maxFontSizeMultiplier)을 걸었는데, 큰 글자를 쓰는 사람의 2 배 요청이
// 1.2 배로 그려져 main 보다 나빠졌다.
//   - RN 0.85 설치본 소스 기준으로 Android 는 글자 크기 · 줄 높이 · 자간을 기기 배율로 곱하고, iOS 는
//     글자 크기 · 줄 높이를 곱한다 (iOS 자간은 그대로). 웹(react-native-web)은 fontScale 이 늘 1 이다.
//   - style 의 fontSize · lineHeight 는 배율 1 값 그대로 둔다. RN 이 곱하므로 여기서 곱하면 두 번
//     커진다. 판정할 때만 줄 높이에 배율을 곱한다. 점 아래 자리(top)와 코어 크기는 글꼴과 무관하다.
//   - 상자 폭은 LABEL_FREE_GROWTH_SCALE 까지 배율만큼 넓힌다. 폭이 글자와 같이 커지므로 줄이 끊기는
//     자리가 배율 1 과 같다. 그 위에서는 넓어지는 좌우 띠가 빈 하늘일 때만 넓히고, 아니면 main 과 같은
//     폭(80 · 120)에 두어 main 처럼 말줄임한다. 조건 없이 끝까지 넓히면 긴 이름이 이웃 이름표에 닿아
//     main 보다 겹침이 늘었다 (5 개 언어 × 폭 242 개에서 1.75 배 826 경우, 2 배 962 경우).
//   - 2 배 같은 큰 글자에서 아예 겹치지 않는 전용 배치는 이 파일의 일이 아니다 (결정 ②, 후속).

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
 * 이름표 상자가 조건 없이 글꼴 배율만큼 넓어지는 배율. **글자 크기 상한이 아니다.** 글자는 기기 배율을
 * 끝까지 따른다.
 *
 *   - 이 배율까지: 상자를 넓혀도 main(폭 고정 · 한 줄 · 말줄임)에 없는 겹침이 생기지 않는다. 측정으로
 *     확인한 범위다 (테스트 "main 보다 겹치지 않는다"). 1.2 는 전에 글자 상한으로 쓰던 값이고, 그 아래의
 *     개선(말줄임 0)은 그대로 둔다.
 *   - 이 배율 위: 넓어지는 좌우 띠가 다른 이름표가 가장 넓어졌을 때의 첫 줄 · 다른 별 코어와 닿지 않고
 *     별자리 상자 안일 때만 넓힌다. 아니면 main 과 같은 폭이다. 넓어진 글자는 빈 하늘에만 놓이고 나머지
 *     글자는 main 이 그리던 자리 안에 있으므로, main 에 없는 겹침은 구성상 생기지 않는다.
 */
export const LABEL_FREE_GROWTH_SCALE = 1.2;

type LabelSpec = typeof STAR_LABEL | typeof POLARIS_LABEL;

/** 이름표 글자가 실제로 그려지는 배율. 상한 없이 기기 배율 그대로다. 못 읽으면 1. */
function labelFontScale(fontScale: number): number {
  return Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
}

function labelFrame(spec: LabelSpec, cx: number, cy: number, k: number, widthScale: number): LabelFrame {
  const width = spec.width * widthScale;
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
  /** 기기 글꼴 배율 (useWindowDimensions().fontScale) 그대로. */
  fontScale: number;
};

/** 일곱 별 이름표와 북극성 이름표의 자리. 북극성 이름표 폭도 별 이름표 자리에 따라 정해지므로 같이 낸다. */
export type HomeLabelLayout<Id extends string> = { stars: Record<Id, StarLabelFrame>; polaris: LabelFrame };

export function layoutStarLabels<Id extends string>(input: StarLabelInput<Id>): HomeLabelLayout<Id> {
  const { stars, k, coreHalfSpan, polaris, stage, fontScale } = input;
  const scale = labelFontScale(fontScale);
  const line = (frame: LabelFrame, n: number) => labelLineBox(frame, n, scale);
  // PixelStarSvg 는 중심을 반올림해서 그린다. 같은 자리로 잰다.
  const cores = stars.map((s): Box => {
    const x = Math.round(s.cx);
    const y = Math.round(s.cy);
    return { left: x - coreHalfSpan, top: y - coreHalfSpan, right: x + coreHalfSpan, bottom: y + coreHalfSpan };
  });
  const inStage = (b: Box) => b.left >= 0 && b.top >= 0 && b.right <= stage.w && b.bottom <= stage.h;

  // 배율만큼 넓힌 상자. LABEL_FREE_GROWTH_SCALE 까지는 이것이 자리다.
  const wide = stars.map((s) => labelFrame(STAR_LABEL, s.cx, s.cy, k, scale));
  const polarisWide = labelFrame(POLARIS_LABEL, polaris.cx, polaris.cy, k, scale);
  let frames = wide;
  let polarisFrame = polarisWide;
  if (scale > LABEL_FREE_GROWTH_SCALE) {
    // 넓어지는 좌우 띠가 빈 하늘일 때만 넓힌다. 장애물은 다른 이름표가 가장 넓어졌을 때의 첫 줄과
    // 다른 별 코어다. 가장 넓은 자리를 장애물로 쓰므로 누가 먼저 넓어지는지와 무관하다.
    const wideLines = wide.map((f) => line(f, 0));
    const widens = (grown: LabelFrame, narrow: LabelFrame, obstacles: Box[]) => {
      const g = line(grown, 0);
      const n = line(narrow, 0);
      const strips: Box[] = [
        { left: g.left, top: g.top, right: n.left, bottom: g.bottom },
        { left: n.right, top: g.top, right: g.right, bottom: g.bottom },
      ];
      return inStage(g) && strips.every((strip) => obstacles.every((o) => !boxesOverlap(strip, o)));
    };
    frames = stars.map((s, i) => {
      const narrow = labelFrame(STAR_LABEL, s.cx, s.cy, k, 1);
      const obstacles = [line(polarisWide, 0), ...wideLines.filter((_, j) => j !== i), ...cores.filter((_, j) => j !== i)];
      return widens(wide[i], narrow, obstacles) ? wide[i] : narrow;
    });
    const polarisNarrow = labelFrame(POLARIS_LABEL, polaris.cx, polaris.cy, k, 1);
    polarisFrame = widens(polarisWide, polarisNarrow, [...wideLines, ...cores]) ? polarisWide : polarisNarrow;
  }

  const polarisLine = line(polarisFrame, 0);
  const free = frames.map((frame, i) => {
    const second = line(frame, 1);
    if (!inStage(second) || boxesOverlap(second, polarisLine)) return false;
    return stars.every((_, j) => j === i || (!boxesOverlap(second, line(frames[j], 0)) && !boxesOverlap(second, cores[j])));
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
  return { stars: out, polaris: polarisFrame };
}
