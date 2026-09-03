/**
 * Shared constellation wallpaper — 1:1 port of the rev2 prototype's
 * SbStarfield (reference-app sb-app.jsx §"shared constellation wallpaper"):
 * a seed-locked LCG (70730219) scatters 96 stars over a 390×820 sky plus four
 * faint constellation figures, so the star positions are IDENTICAL to the
 * prototype on every run. `cosmic` additionally paints the SB_COSMIC nebula
 * washes under the stars (blue top wash + violet corner wash over cosmicBase),
 * for screens that don't paint their own stage background.
 *
 * Static render (no twinkle loop): the prototype animates 30% of the stars
 * between .28 and .95 opacity; here they sit at the midpoint so a screenshot
 * matches the reference's average frame without a per-star animation cost.
 *
 * ## PIXEL-CLAY 이주 (2026-08-26)
 *
 * 이 파일이 저장소에서 **규칙 1·4 위반이 가장 많이 그려지는 한 곳**이었다.
 * 소스에서는 `<Circle>` 세 줄이지만, 이 벽지는 **거의 모든 화면**에 깔린다 —
 * 실측으로 라우트 하나당 곡선 116개, 40개 라우트에서 4,519개였다.
 * 화면에 실제로 그려지던 곡선의 **96%가 여기서 나왔다.**
 *
 * 세 가지가 바뀌었다. **별의 위치·색·상대적 밝기 순서는 그대로다** —
 * 시드 고정 LCG 도, 96이라는 수도, 네 별자리 좌표도 건드리지 않았다.
 *
 *  (1) 규칙 1 — `<Circle r={0.6~2.3}>` → **정수 `<Rect>`**. 반지름을 1·2·3px
 *      로 끊고 좌표를 정수로 스냅한다. 별은 점이 아니라 셀이 된다.
 *  (2) 규칙 4 — 별마다 달랐던 `opacity`(0.28~0.9, 사실상 연속값) → **4단 색
 *      밴딩**. 미리 합성한 불투명 색 넷 중 하나로 그린다. 밝기의 순서는
 *      유지되지만 값이 셀 수 있는 개수가 된다 — 그게 규칙 4의 목적이다.
 *  (3) 별자리 선 `<Polyline>` → **rect 계단**. 대각선을 정수 셀로 놓는다.
 *
 * ⚠ 색 밴딩의 `ground` 는 `cosmicBase` 로 고정한다. 이 벽지가 실제로 깔리는
 *   바닥이 그 색이거나(cosmic) 그와 거의 같은 stageFloor 이기 때문이다.
 *   더 밝은 바닥 위에 이 컴포넌트를 쓰면 별이 어둡게 보인다 — 그럴 일이
 *   생기면 `ground` 를 prop 으로 받아야지, 알파로 되돌리지 말 것.
 */
import { Fragment, memo } from "react";
import { Platform, StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { flattenAlpha } from "@/lib/theme/tokens";
import { stepPolyline, type LineCell } from "@/components/pixel/pixel-line";
import { m3 } from "@/lib/theme/m3";

const SKY_W = 390;
const SKY_H = 820;

type SkyStar = { x: number; y: number; s: number; band: number; c: string };

const STARFIELD_A11Y_PROPS =
  Platform.OS === "web"
    ? ({ "aria-hidden": true } as const)
    : ({
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
      } as const);

// sb-app.jsx sbSkyRng — LCG, seed 70730219, >>> 0 wraparound.
function skyRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const STAR_COLS = [m3.accent.skyStarBlue, m3.accent.skyStarBlue, m3.accent.skyStarViolet, m3.accent.skyStarWhite];

/** 밝기를 끊는 단 수. 넷이면 눈에 층이 보이면서도 별이 납작해지지 않는다. */
const BANDS = 4;

/** 원래 opacity 범위(0.28~0.9)를 네 칸으로. 값이 아니라 칸을 고른다. */
function toBand(opacity: number): number {
  const t = (opacity - 0.28) / (0.9 - 0.28);
  return Math.max(0, Math.min(BANDS - 1, Math.floor(t * BANDS)));
}

/** 각 밴드의 대표 알파 — 칸 가운데 값. */
const BAND_ALPHA = Array.from({ length: BANDS }, (_, i) => 0.28 + ((i + 0.5) / BANDS) * (0.9 - 0.28));

/**
 * 색×밴드를 **미리 합성**해 둔다. 렌더 때 섞지 않는다 — 규칙 4.
 * 별 색이 셋뿐이라 표는 12칸이고, 모듈 로드 때 한 번만 만든다.
 */
const STAR_COLOR: Record<string, string[]> = Object.fromEntries(
  [...new Set(STAR_COLS)].map((c) => [c, BAND_ALPHA.map((a) => flattenAlpha(c, a, m3.accent.cosmicBase))]),
);

// Prototype twinkle range is .28–.95; static stand-in sits at the midpoint.
const TWINKLE_STATIC_OPACITY = 0.62;

/** 반지름 0.6~2.3 을 1·2·3px 셀로. 정수라야 계단이 흐려지지 않는다(규칙 1). */
function toCell(r: number): number {
  if (r < 1.1) return 1;
  if (r < 1.8) return 2;
  return 3;
}

const SKY_STARS: SkyStar[] = (() => {
  const r = skyRng(70730219);
  const out: SkyStar[] = [];
  for (let i = 0; i < 96; i += 1) {
    // ⚠ 뽑는 순서를 바꾸지 말 것 — LCG 라 한 번만 어긋나도 하늘 전체가 달라진다.
    const x = +(r() * SKY_W).toFixed(1);
    const y = +(r() * SKY_H).toFixed(1);
    const rad = +(0.6 + r() * 1.7).toFixed(2);
    const o = +(0.28 + r() * 0.62).toFixed(2);
    const tw = r() < 0.3;
    const c = STAR_COLS[(r() * STAR_COLS.length) | 0];
    r(); // dly draw (unused in the static render, kept so the sequence matches)

    const s = toCell(rad);
    out.push({
      // 셀 크기를 반영해 반올림 — 중심이 아니라 **왼쪽 위**를 잡는다(rect 는 그렇다).
      x: Math.round(x - s / 2),
      y: Math.round(y - s / 2),
      s,
      band: toBand(tw ? TWINKLE_STATIC_OPACITY : o),
      c,
    });
  }
  return out;
})();

// sb-app.jsx SB_SKY_CONST — four faint constellation figures.
const SKY_CONST: { c: string; o: number; pts: [number, number][] }[] = [
  { c: m3.accent.skyConstA, o: 0.5, pts: [[40, 120], [86, 150], [120, 118], [168, 160], [120, 118], [104, 206]] },
  { c: m3.accent.skyConstB, o: 0.42, pts: [[300, 92], [342, 134], [316, 196], [268, 166], [342, 134], [372, 108]] },
  { c: m3.accent.skyConstC, o: 0.4, pts: [[58, 642], [112, 612], [150, 662], [212, 628]] },
  { c: m3.accent.skyConstD, o: 0.34, pts: [[252, 470], [300, 500], [286, 558], [332, 540]] },
];

/**
 * 별자리 선을 놓는 셀 크기.
 *
 * 3px 인 이유: 원래 선 굵기가 0.7 이라 1px 셀로 놓으면 점선처럼 끊겨 보이고,
 * 그건 규칙이 아니라 그냥 망가진 그림이다.
 *
 * 계단 계산 자체는 `components/pixel/pixel-line.ts` 가 한다 — 뮤지엄 연결선도
 * 같은 계산을 쓴다. 화면마다 따로 만들면 격자가 안 맞는다.
 */
const LINK_CELL = 3;

/** 네 별자리를 미리 셀로 펼쳐 둔다 — 렌더마다 다시 계산하지 않는다. */
const SKY_CONST_CELLS = SKY_CONST.map((cn) => {
  const cells: LineCell[] = stepPolyline(cn.pts, LINK_CELL);
  return {
    // 선과 꼭짓점은 밝기가 다르다(원본도 0.32 : 0.8 이었다). 둘 다 미리 합성한다.
    line: flattenAlpha(cn.c, 0.32 * cn.o, m3.accent.cosmicBase),
    dot: flattenAlpha(cn.c, 0.8 * cn.o, m3.accent.cosmicBase),
    cells,
    pts: cn.pts,
  };
});

// The whole 96-star + 4-constellation sky is derived from module-level constants
// (seed-locked), so `cosmic` is its only input. Memoize it: DeepSpaceScreen and
// ConstellationHome re-render on every keystroke / star tap, and without memo
// this SVG re-reconciles each time. React.memo skips it while `cosmic`
// is unchanged.
export const SbStarfield = memo(function SbStarfield({ cosmic = false }: { cosmic?: boolean }) {
  return (
    <Svg
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, cosmic && { backgroundColor: m3.accent.cosmicBase }]}
      viewBox={`0 0 ${SKY_W} ${SKY_H}`}
      preserveAspectRatio="xMidYMid slice"
      {...STARFIELD_A11Y_PROPS}
    >
      {cosmic ? (
        <>
          <Defs>
            <RadialGradient id="sb-nebula-blue" cx="50%" cy="-6%" rx="122%" ry="72%">
              <Stop offset="0" stopColor={m3.accent.nebulaBlue} stopOpacity={0.34} />
              <Stop offset="0.6" stopColor={m3.accent.nebulaBlue} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="sb-nebula-violet" cx="86%" cy="12%" rx="86%" ry="54%">
              <Stop offset="0" stopColor={m3.accent.nebulaViolet} stopOpacity={0.2} />
              <Stop offset="0.58" stopColor={m3.accent.nebulaViolet} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={SKY_W} height={SKY_H} fill="url(#sb-nebula-blue)" />
          <Rect x={0} y={0} width={SKY_W} height={SKY_H} fill="url(#sb-nebula-violet)" />
        </>
      ) : null}
      {SKY_CONST_CELLS.map((cn, i) => (
        <Fragment key={`c${i}`}>
          {cn.cells.map((p, j) => (
            <Rect key={`c${i}l${j}`} x={p.x} y={p.y} width={LINK_CELL} height={LINK_CELL} fill={cn.line} />
          ))}
          {cn.pts.map((p, j) => (
            <Rect key={`c${i}d${j}`} x={p[0] - 2} y={p[1] - 2} width={4} height={4} fill={cn.dot} />
          ))}
        </Fragment>
      ))}
      {SKY_STARS.map((s, i) => (
        <Rect key={`s${i}`} x={s.x} y={s.y} width={s.s} height={s.s} fill={STAR_COLOR[s.c][s.band]} />
      ))}
    </Svg>
  );
});
