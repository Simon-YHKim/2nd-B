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

export type Box = { left: number; top: number; right: number; bottom: number };

/** 이름표 하나의 자리. 그대로 RN style 에 넣는다. */
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

type LabelSpec = typeof STAR_LABEL | typeof POLARIS_LABEL;

function labelFrame(spec: LabelSpec, cx: number, cy: number, k: number): LabelFrame {
  return {
    left: cx - spec.width / 2,
    top: cy + (spec.dropPerK * k + spec.drop),
    width: spec.width,
    fontSize: spec.fontSize * k,
    // lineHeight (~1.34x) gives the Korean names room for their 받침 descenders.
    // Android clips the last line of a numberOfLines Text without a padded line box.
    lineHeight: Math.round(spec.lineHeight * k),
  };
}

/** 북극성 이름표 자리. */
export function polarisLabelFrame(cx: number, cy: number, k: number): LabelFrame {
  return labelFrame(POLARIS_LABEL, cx, cy, k);
}

/** `line` 번째 줄(0 = 첫 줄)이 차지하는 상자. */
export function labelLineBox(frame: LabelFrame, line: number): Box {
  const top = frame.top + frame.lineHeight * line;
  return { left: frame.left, top, right: frame.left + frame.width, bottom: top + frame.lineHeight };
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
};

export function layoutStarLabels<Id extends string>(input: StarLabelInput<Id>): Record<Id, StarLabelFrame> {
  const { stars, k, coreHalfSpan, polaris, stage } = input;
  const frames = stars.map((s) => labelFrame(STAR_LABEL, s.cx, s.cy, k));
  const polarisLine = labelLineBox(polarisLabelFrame(polaris.cx, polaris.cy, k), 0);
  // PixelStarSvg 는 중심을 반올림해서 그린다. 같은 자리로 잰다.
  const coreBox = (s: { cx: number; cy: number }): Box => {
    const x = Math.round(s.cx);
    const y = Math.round(s.cy);
    return { left: x - coreHalfSpan, top: y - coreHalfSpan, right: x + coreHalfSpan, bottom: y + coreHalfSpan };
  };
  const inStage = (b: Box) => b.left >= 0 && b.top >= 0 && b.right <= stage.w && b.bottom <= stage.h;

  const free = frames.map((frame, i) => {
    const second = labelLineBox(frame, 1);
    if (!inStage(second) || boxesOverlap(second, polarisLine)) return false;
    return stars.every(
      (other, j) =>
        j === i || (!boxesOverlap(second, labelLineBox(frames[j], 0)) && !boxesOverlap(second, coreBox(other))),
    );
  });
  // 둘째 줄끼리 겹치면 둘 다 한 줄로 둔다. 누구에게 줄지 가를 근거가 좌표에는 없다.
  const twoLines = free.map(
    (ok, i) =>
      ok &&
      free.every(
        (otherOk, j) => j === i || !otherOk || !boxesOverlap(labelLineBox(frames[i], 1), labelLineBox(frames[j], 1)),
      ),
  );

  const out = {} as Record<Id, StarLabelFrame>;
  stars.forEach((s, i) => {
    out[s.id] = { frame: frames[i], maxLines: twoLines[i] ? 2 : 1 };
  });
  return out;
}
