// 별자리 홈 별 이름표가 잘리지도, 남의 자리를 덮지도 않는가.
//
// 재현 근거: vibe r260913 T1a 항목 5 (E:/Coding Infra/reports/vibe-r260913/T1a/result.md).
// 1440x3120 @560dpi (가로 411.4dp) · font_scale 1.0 · 영어에서 30대 이후 별 이름표가
// "Thirties and af…" 로 잘렸다 (shots/05-star-label-en-1-crop.png). 같은 별을 누르면
// 말풍선 제목은 온전했다. 문자열이 아니라 자리 문제다.
//
// 렌더 테스트는 막혀 있어서(RN 0.85 + jest) 두 가지를 따로 잰다.
//   1) 자리: star-label-layout.ts 를 여러 화면 폭에서 돌린다. 별 좌표와 상자 산식은
//      ConstellationHome.tsx 소스에서 읽는다 (constellation-canon-parity 와 같은 방식).
//   2) 글자 폭: 안드로이드가 싣는 글꼴 파일 assets/fonts/Pretendard-Regular.otf 의
//      advance 폭을 직접 읽어 다섯 언어 이름표를 잰다. 커닝은 빼고 자간(letterSpacing
//      0.2)은 글자마다 더한다. 이름표는 fontWeight 600 이지만 싣는 파일은 Regular
//      하나라서 굵기는 합성된다. 그래서 이 모델이 기기보다 좁게 재지 않는지를 T1a
//      스크린샷에서 잰 잉크 폭으로 먼저 확인한다 (아래 첫 테스트).
//
// 기기 글꼴 배율 (PR #1810 생성물 게이트 F1). T1a 는 font_scale 1.0 이었고 이 파일도 처음엔 배율
// 1 로만 쟀다. 이름표 Text 는 기기 글꼴 설정을 따르므로 이제 폭 × 배율 조합마다 잰다. RN 0.85 는
// 상한이 없으면 이름표 글자를 기기 배율 그대로 그리고 줄 높이도 같은 배율로 곱한다. 자간은 Android 만
// 곱한다. 여기서는 자간까지 곱해 iOS 보다 넓게 잰다.
//
// 상한은 없다 (재게이트 F1-R1, Simon 결정 Q-260914-02 ①). 한때 1.2 배 상한을 걸었다가 main 보다 큰 글자
// 사용자에게 나빠졌다. 그래서 1.2 배를 넘는 배율에서는 "잘리지 않는다" 가 아니라 "main 보다 나빠지지
// 않는다" 를 잰다. 상자는 LABEL_FREE_GROWTH_SCALE 까지만 조건 없이 넓어지고, 그 위에서는 빈 하늘일
// 때만 넓어진다 (star-label-layout.ts).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { HOME_STAR_IDS } from "@/lib/persona/home-stars";

import { pixelStarSpan } from "../../pixel/pixel-star";
import {
  LABEL_FREE_GROWTH_SCALE,
  POLARIS_LABEL,
  STAR_LABEL,
  layoutStarLabels,
  type LabelFrame,
} from "../star-label-layout";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SRC = readFileSync(join(__dirname, "..", "ConstellationHome.tsx"), "utf8").replace(/\r\n/g, "\n");

// ---------------------------------------------------------------------------
// 화면 소스에서 읽는 값
// ---------------------------------------------------------------------------

function constNumber(name: string): number {
  const m = new RegExp(`^const ${name} = (-?\\d+(?:\\.\\d+)?);$`, "m").exec(SRC);
  if (!m) throw new Error(`const ${name} not found in ConstellationHome.tsx`);
  return Number(m[1]);
}

/**
 * `REV2_STARS` 배열의 객체를 하나씩 읽는다. 속성 순서와 무관하다.
 *
 * 전에는 `{ id, x, y }` 순서를 통째로 맞추는 정규식 하나였다. 속성 순서만 바꿔도 그 객체를 조용히
 * 건너뛰었고, 아래 검사들은 남은 별만 돌며 초록이었다 (PR #1810 생성물 게이트 F2). 이제 배열 안의
 * 객체를 모두 읽고, 셋 중 하나라도 리터럴로 못 읽으면 던진다. 일곱을 다 읽었는지는 첫 검사가 본다.
 */
function renderedStars(): { id: string; x: number; y: number }[] {
  const decl = SRC.indexOf("const REV2_STARS");
  if (decl < 0) throw new Error("const REV2_STARS not found in ConstellationHome.tsx");
  const open = SRC.indexOf("= [", decl);
  const end = open < 0 ? -1 : SRC.indexOf("];", open);
  if (end < 0) throw new Error("REV2_STARS array literal not found in ConstellationHome.tsx");
  const objects = SRC.slice(open + 2, end).match(/\{[^{}]*\}/g) ?? [];
  return objects.map((obj) => {
    const id = /\bid:\s*"([^"]+)"\s*[,}]/.exec(obj)?.[1];
    const x = /\bx:\s*(-?\d+(?:\.\d+)?)\s*[,}]/.exec(obj)?.[1];
    const y = /\by:\s*(-?\d+(?:\.\d+)?)\s*[,}]/.exec(obj)?.[1];
    if (id === undefined || x === undefined || y === undefined) {
      throw new Error(`REV2_STARS entry is not { id: "<literal>", x: <number>, y: <number> }: ${obj}`);
    }
    return { id, x: Number(x), y: Number(y) };
  });
}

const STARS = renderedStars();
const POLARIS = (() => {
  const m = /const POLARIS = \{ x: (-?[\d.]+), y: (-?[\d.]+) \};/.exec(SRC);
  if (!m) throw new Error("const POLARIS not found in ConstellationHome.tsx");
  return { x: Number(m[1]), y: Number(m[2]) };
})();
const VBW = constNumber("VBW");
const VBH = constNumber("VBH");
const VB_TOP = constNumber("VB_TOP");
const DOMAIN_CORE_R = constNumber("DOMAIN_CORE_R");
const DOMAIN_FOCUS_MULT = constNumber("DOMAIN_FOCUS_MULT");

/** 화면 폭 winW(dp) · 기기 글꼴 배율 fontScale 에서 ConstellationHome 이 계산하는 것과 같은 자리. */
function homeLayout(winW: number, fontScale = 1) {
  const boxW = Math.min(380, winW - 24);
  const k = boxW / 380;
  const u = boxW / VBW;
  const boxH = (VBH + VB_TOP) * u;
  const px = (x: number) => x * u;
  const py = (y: number) => (y + VB_TOP) * u;
  const coreHalfSpan = pixelStarSpan(DOMAIN_CORE_R * k * DOMAIN_FOCUS_MULT);
  const stars = STARS.map((s) => ({ id: s.id, cx: px(s.x), cy: py(s.y) }));
  const polaris = { cx: px(POLARIS.x), cy: py(POLARIS.y) };
  const layout = layoutStarLabels({ stars, k, coreHalfSpan, polaris, stage: { w: boxW, h: boxH }, fontScale });
  return {
    boxW,
    boxH,
    k,
    stars,
    polaris,
    coreHalfSpan,
    labels: layout.stars,
    polarisFrame: layout.polaris,
    /** RN 이 이름표 글자를 실제로 그리는 배율. 상한이 없으므로 기기 배율 그대로다. */
    r: fontScale,
  };
}

/** T1a 기기 가로 폭 (1440px / 3.5) 과 흔한 폰 폭들. 404dp 이상은 상자가 380 으로 같다. */
const T1A_WIDTH = 1440 / 3.5;
const WIDTHS = [320, 360, 375, 393, T1A_WIDTH, 430];

/** 상자가 조건 없이 넓어지는 배율들: 1 아래 하나, 1, 그 사이 하나, 끝. 여기서는 어느 이름표도 잘리지 않는다. */
const FREE_SCALES = [0.85, 1, 1.15, LABEL_FREE_GROWTH_SCALE];
/** 그 위: 상자는 빈 하늘일 때만 넓어진다. 2 는 큰 글자 설정의 대표값이다. */
const SCALES = [...FREE_SCALES, 1.3, 1.5, 2];
const casesOf = (scales: number[]): [number, number][] =>
  WIDTHS.flatMap((w) => scales.map((s): [number, number] => [w, s]));
const FREE_CASES = casesOf(FREE_SCALES);
const CASES = casesOf(SCALES);

// 테스트 안에서만 쓰는 독립 판정. 모듈의 판정 함수를 빌리지 않는다.
type Rect = { left: number; top: number; right: number; bottom: number };
const intersects = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** `line` 번째 줄이 그려지는 상자. RN 은 style 줄 높이에 그리는 배율 r 을 곱한다. */
const lineRect = (f: LabelFrame, line: number, r: number): Rect => ({
  left: f.left,
  right: f.left + f.width,
  top: f.top + f.lineHeight * r * line,
  bottom: f.top + f.lineHeight * r * (line + 1),
});

// ---------------------------------------------------------------------------
// 글꼴 advance 폭 (OpenType cmap + hmtx)
// ---------------------------------------------------------------------------

const FONT = readFileSync(join(ROOT, "assets", "fonts", "Pretendard-Regular.otf"));
const TABLES: Record<string, number> = {};
for (let i = 0; i < FONT.readUInt16BE(4); i += 1) {
  const o = 12 + i * 16;
  TABLES[FONT.toString("latin1", o, o + 4)] = FONT.readUInt32BE(o + 8);
}
const UNITS_PER_EM = FONT.readUInt16BE(TABLES.head + 18);
const H_METRICS = FONT.readUInt16BE(TABLES.hhea + 34);

function glyphOf(cp: number): number {
  const base = TABLES.cmap;
  for (let i = 0; i < FONT.readUInt16BE(base + 2); i += 1) {
    const sub = base + FONT.readUInt32BE(base + 4 + i * 8 + 4);
    const format = FONT.readUInt16BE(sub);
    if (format === 12) {
      for (let g = 0; g < FONT.readUInt32BE(sub + 12); g += 1) {
        const o = sub + 16 + g * 12;
        if (cp >= FONT.readUInt32BE(o) && cp <= FONT.readUInt32BE(o + 4)) {
          return FONT.readUInt32BE(o + 8) + (cp - FONT.readUInt32BE(o));
        }
      }
    } else if (format === 4 && cp <= 0xffff) {
      const segX2 = FONT.readUInt16BE(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s += 1) {
        if (cp > FONT.readUInt16BE(ends + 2 * s)) continue;
        const first = FONT.readUInt16BE(starts + 2 * s);
        if (cp < first) break;
        const delta = FONT.readInt16BE(deltas + 2 * s);
        const range = FONT.readUInt16BE(ranges + 2 * s);
        if (range === 0) return (cp + delta) & 0xffff;
        const g = FONT.readUInt16BE(ranges + 2 * s + range + 2 * (cp - first));
        return g === 0 ? 0 : (g + delta) & 0xffff;
      }
    }
  }
  return 0;
}

const LETTER_SPACING = 0.2;
/** 글자별 advance 폭(em). 폭 × 배율 조합이 많아 한 번만 읽는다. */
const ADVANCE_EM = new Map<number, number>();

/**
 * advance 폭 합 + 글자마다 자간에 그리는 배율 r 을 곱한다.
 * 글리프가 없으면 기기는 다른 글꼴로 넘어가므로 모델이 틀린다.
 */
function textWidth(text: string, fontSize: number, r = 1): number {
  let em = 0;
  const chars = [...text];
  for (const ch of chars) {
    const cp = ch.codePointAt(0) ?? 0;
    let advance = ADVANCE_EM.get(cp);
    if (advance === undefined) {
      const glyph = glyphOf(cp);
      if (glyph === 0) throw new Error(`Pretendard-Regular.otf has no glyph for "${ch}" in "${text}"`);
      advance = FONT.readUInt16BE(TABLES.hmtx + 4 * Math.min(glyph, H_METRICS - 1)) / UNITS_PER_EM;
      ADVANCE_EM.set(cp, advance);
    }
    em += advance;
  }
  return (em * fontSize + chars.length * LETTER_SPACING) * r;
}

/** 공백에서만 끊는 줄바꿈. 끊을 자리가 더 적으니 기기보다 줄이 길게 나온다. */
function wrap(text: string, width: number, fontSize: number, r = 1): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (!current || textWidth(next, fontSize, r) <= width) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/** 로케일마다 home.json 의 일곱 별 이름(ds.star.<id>)과 북극성 이름. 로케일 폴더를 읽으므로 새 언어도 들어온다. */
const LOCALES = readdirSync(join(ROOT, "locales"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
type HomeCopy = { ds: { star: Record<string, string>; home: { polaris: string } } };
const HOME_COPY: Record<string, HomeCopy> = Object.fromEntries(
  LOCALES.map((locale) => [locale, JSON.parse(readFileSync(join(ROOT, "locales", locale, "home.json"), "utf8")) as HomeCopy]),
);
const starNames = (locale: string): Record<string, string> => HOME_COPY[locale].ds.star;

function styleBlock(name: string): string {
  const start = SRC.indexOf(`  ${name}: {`);
  if (start < 0) throw new Error(`style ${name} not found`);
  return SRC.slice(start, SRC.indexOf("\n  },", start));
}

/** 이 폭 · 배율에서 잘리는 이름표. 별 이름은 maxLines 줄 안에, 북극성 이름은 한 줄 안에 들어가야 한다. */
function cutLabels(winW: number, fontScale: number): string[] {
  const { stars, labels, polarisFrame, r } = homeLayout(winW, fontScale);
  const cut: string[] = [];
  for (const locale of LOCALES) {
    const names = starNames(locale);
    for (const s of stars) {
      const { frame, maxLines } = labels[s.id];
      const lines = wrap(names[s.id], frame.width, frame.fontSize, r);
      const tooWide = lines.some((line) => textWidth(line, frame.fontSize, r) > frame.width);
      if (lines.length > maxLines || tooWide) cut.push(`${locale}/${s.id} "${names[s.id]}" -> ${lines.join(" / ")}`);
    }
    const polaris = HOME_COPY[locale].ds.home.polaris;
    if (textWidth(polaris, polarisFrame.fontSize, r) > polarisFrame.width) cut.push(`${locale}/polaris "${polaris}"`);
  }
  return cut;
}

/**
 * 그려지는 줄마다의 글자 상자. 가운데 정렬이라 줄마다 실제 글자 폭만큼이다. `maxLines` 를 넘는 줄은
 * 그려지지 않고, 넘치면 마지막 줄이 말줄임되어 상자 폭을 다 쓴다. 한 단어가 상자보다 길어도 상자 폭까지다.
 */
function renderedInk(frame: LabelFrame, maxLines: number, text: string, r: number): (Rect & { n: number })[] {
  const lines = wrap(text, frame.width, frame.fontSize, r);
  return lines.slice(0, maxLines).map((line, n) => {
    const ellipsized = lines.length > maxLines && n === maxLines - 1;
    const w = ellipsized ? frame.width : Math.min(textWidth(line, frame.fontSize, r), frame.width);
    const box = lineRect(frame, n, r);
    return { n, left: frame.left + (frame.width - w) / 2, right: frame.left + (frame.width + w) / 2, top: box.top, bottom: box.bottom };
  });
}

// ---------------------------------------------------------------------------

describe("글꼴 모델이 기기보다 좁게 재지 않는다", () => {
  it("T1a 스크린샷에서 잰 영어 이름표 잉크 폭 이상, 5dp 이내로 나온다", () => {
    // shots/05-star-label-en-1.png (1440x3120, 3.5px/dp) 에서 이름표 줄 가운데 띠의
    // 글자색 픽셀 좌우 끝을 잰 값. 잉크 폭은 글자 양 끝 여백만큼 advance 폭보다 좁은 것이
    // 정상이라, 모델이 이보다 좁으면 글꼴을 잘못 읽은 것이다.
    const inkFromT1a: [string, number][] = [
      ["Right now", 46.9],
      ["Work", 23.7],
      ["Twenties", 40.9],
      ["School years", 61.1],
      ["Early childhood", 72.9],
      ["Profile", 30.0],
    ];
    for (const [text, ink] of inkFromT1a) {
      const model = textWidth(text, STAR_LABEL.fontSize);
      expect(model).toBeGreaterThanOrEqual(ink);
      expect(model - ink).toBeLessThanOrEqual(5);
    }
  });

  it("T1a 재현: 'Thirties and after' 는 한 줄 80 을 넘는다", () => {
    expect(textWidth("Thirties and after", STAR_LABEL.fontSize)).toBeGreaterThan(STAR_LABEL.width);
  });

  it("글꼴·자간 가정이 화면과 같다", () => {
    const typography = readFileSync(join(ROOT, "src", "theme", "typography.ts"), "utf8");
    expect(typography).toContain('android: "Pretendard"');
    expect(typography).toContain('require("../../assets/fonts/Pretendard-Regular.otf")');
    const star = styleBlock("starLabel");
    expect(star).toContain("fontFamily: fontFamilies.readable");
    expect(star).toContain(`letterSpacing: ${LETTER_SPACING}`);
  });
});

describe("별 이름표 자리", () => {
  it("화면 소스에서 일곱 별을 빠짐없이 읽었다 (파서가 줄면 아래 검사가 공허하게 통과한다)", () => {
    // 아래 검사는 모두 STARS 를 돈다. 파서가 별 몇 개를 조용히 놓치면 검사 범위가 그만큼 줄어든 채
    // 초록이 된다 (PR #1810 생성물 게이트 F2: 객체 속성 순서만 바꿔도 일곱이 하나로 줄었다).
    const ids = STARS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...HOME_STAR_IDS].sort());
    expect(ids).toHaveLength(7);
  });

  it("T1a 재현: 가로 411.4dp 에서 30대 이후 이름표는 둘째 줄을 받는다", () => {
    const { labels } = homeLayout(T1A_WIDTH);
    expect(labels.later.maxLines).toBe(2);
  });

  it.each(WIDTHS)("가로 %sdp: 첫 줄 자리는 전과 같다 (폭 80 가운데, 점 아래 6k+8)", (winW) => {
    const { k, stars, labels, polarisFrame, boxW, boxH } = homeLayout(winW);
    for (const s of stars) {
      expect(labels[s.id].frame).toEqual({
        left: s.cx - 40,
        top: s.cy + (6 * k + 8),
        width: 80,
        fontSize: 10.5 * k,
        lineHeight: Math.round(14 * k),
      });
    }
    const u = boxW / VBW;
    expect(boxH).toBeCloseTo((VBH + VB_TOP) * u);
    expect(polarisFrame).toEqual({
      left: POLARIS.x * u - 60,
      top: (POLARIS.y + VB_TOP) * u + (9 * k + 8),
      width: 120,
      fontSize: 10.5 * k,
      lineHeight: Math.round(14 * k),
    });
  });

  it.each(CASES)(
    `가로 %sdp · 글꼴 %s배: 상자 폭만 배율을 따르고 (${LABEL_FREE_GROWTH_SCALE}배 위에서는 main 폭일 수도 있다), 점 아래 자리와 style 글자 크기는 배율 1 그대로다`,
    (winW, fontScale) => {
      const { stars, labels, polarisFrame, boxW, r } = homeLayout(winW, fontScale);
      const one = homeLayout(winW, 1);
      // 그 배율까지는 배율만큼 넓다. 그 위에서는 배율만큼 넓거나 main 과 같은 폭(80 · 120)이다.
      const widths = (spec: number) => (r > LABEL_FREE_GROWTH_SCALE ? [spec * r, spec] : [spec * r]);
      for (const s of stars) {
        const f = labels[s.id].frame;
        const base = one.labels[s.id].frame;
        expect(widths(STAR_LABEL.width)).toContain(f.width);
        expect(f.left + f.width / 2).toBeCloseTo(s.cx, 9);
        expect(f.top).toBe(base.top);
        // RN 이 글꼴 배율을 곱하므로 style 값은 배율 1 그대로여야 한다. 여기서 곱하면 두 번 커진다.
        expect(f.fontSize).toBe(base.fontSize);
        expect(f.lineHeight).toBe(base.lineHeight);
      }
      expect(widths(POLARIS_LABEL.width)).toContain(polarisFrame.width);
      expect(polarisFrame.left + polarisFrame.width / 2).toBeCloseTo((POLARIS.x * boxW) / VBW, 9);
      expect(polarisFrame.top).toBe(one.polarisFrame.top);
      expect(polarisFrame.fontSize).toBe(one.polarisFrame.fontSize);
      expect(polarisFrame.lineHeight).toBe(one.polarisFrame.lineHeight);
    },
  );

  it.each(CASES)("가로 %sdp · 글꼴 %s배: 둘째 줄을 받은 이름표는 남의 자리를 덮지 않고 상자 안에 있다", (winW, fontScale) => {
    const { stars, labels, coreHalfSpan, polarisFrame, boxW, boxH, r } = homeLayout(winW, fontScale);
    for (const s of stars) {
      const mine = labels[s.id];
      if (mine.maxLines < 2) continue;
      const second = lineRect(mine.frame, 1, r);
      expect(second.left).toBeGreaterThanOrEqual(0);
      expect(second.right).toBeLessThanOrEqual(boxW);
      expect(second.bottom).toBeLessThanOrEqual(boxH);
      expect(intersects(second, lineRect(polarisFrame, 0, r))).toBe(false);
      for (const other of stars) {
        if (other.id === s.id) continue;
        const theirs = labels[other.id];
        expect(intersects(second, lineRect(theirs.frame, 0, r))).toBe(false);
        if (theirs.maxLines === 2) expect(intersects(second, lineRect(theirs.frame, 1, r))).toBe(false);
        const x = Math.round(other.cx);
        const y = Math.round(other.cy);
        const core = { left: x - coreHalfSpan, right: x + coreHalfSpan, top: y - coreHalfSpan, bottom: y + coreHalfSpan };
        expect(intersects(second, core)).toBe(false);
      }
    }
  });

  /** 이름표 여덟 개(별 일곱 + 북극성)를 한 목록으로. spec 은 main 의 고정 폭이다. */
  const entriesOf = (layout: ReturnType<typeof homeLayout>) => [
    ...layout.stars.map((s) => ({ id: s.id, frame: layout.labels[s.id].frame, spec: STAR_LABEL.width })),
    { id: "polaris", frame: layout.polarisFrame, spec: POLARIS_LABEL.width },
  ];
  const ABOVE_FREE = CASES.filter(([, s]) => s > LABEL_FREE_GROWTH_SCALE);

  it.each(ABOVE_FREE)("가로 %sdp · 글꼴 %s배: main 폭보다 넓어진 이름표는 넓어진 좌우 띠가 빈 하늘이다", (winW, fontScale) => {
    // 이 배율에서 "main 에 없는 겹침이 생기지 않는다" 가 구성으로 성립하는 근거가 이 성질이다 (아래
    // "main 보다 겹치지 않는다"). 장애물은 다른 이름표가 가장 넓어졌을 때의 첫 줄과 다른 별 코어다.
    const layout = homeLayout(winW, fontScale);
    const { stars, coreHalfSpan, boxW, boxH, r } = layout;
    const entries = entriesOf(layout);
    for (const e of entries.filter((x) => x.frame.width > x.spec)) {
      const first = lineRect(e.frame, 0, r);
      expect(first.left).toBeGreaterThanOrEqual(0);
      expect(first.top).toBeGreaterThanOrEqual(0);
      expect(first.right).toBeLessThanOrEqual(boxW);
      expect(first.bottom).toBeLessThanOrEqual(boxH);
      const cx = e.frame.left + e.frame.width / 2;
      const strips: Rect[] = [
        { ...first, right: cx - e.spec / 2 },
        { ...first, left: cx + e.spec / 2 },
      ];
      for (const other of entries) {
        if (other.id === e.id) continue;
        const ocx = other.frame.left + other.frame.width / 2;
        const widest = { ...lineRect(other.frame, 0, r), left: ocx - (other.spec * r) / 2, right: ocx + (other.spec * r) / 2 };
        for (const strip of strips) expect(intersects(strip, widest)).toBe(false);
      }
      for (const s of stars) {
        if (s.id === e.id) continue;
        const x = Math.round(s.cx);
        const y = Math.round(s.cy);
        const core = { left: x - coreHalfSpan, right: x + coreHalfSpan, top: y - coreHalfSpan, bottom: y + coreHalfSpan };
        for (const strip of strips) expect(intersects(strip, core)).toBe(false);
      }
    }
  });

  it(`${LABEL_FREE_GROWTH_SCALE}배 위에서 넓어지는 이름표와 main 폭에 남는 이름표가 둘 다 나온다 (위 검사가 공허하지 않다)`, () => {
    let widened = 0;
    let narrow = 0;
    for (const [winW, fontScale] of ABOVE_FREE) {
      for (const e of entriesOf(homeLayout(winW, fontScale))) {
        if (e.frame.width > e.spec) widened += 1;
        else if (e.frame.width === e.spec) narrow += 1;
      }
    }
    expect(widened).toBeGreaterThan(0);
    expect(narrow).toBeGreaterThan(0);
    expect(widened + narrow).toBe(ABOVE_FREE.length * 8);
  });

  it("북극성 이름표가 별 이름표보다 작거나 흐려지지 않는다 (Visual Tier)", () => {
    // 두 이름표 모두 상한 없이 같은 기기 배율을 따른다 (아래 화면 배선 검사). 그래서 이 비교는 어느 기기 배율에서도 같다.
    expect(STAR_LABEL.fontSize).toBeLessThanOrEqual(POLARIS_LABEL.fontSize);
    expect(STAR_LABEL.lineHeight).toBeLessThanOrEqual(POLARIS_LABEL.lineHeight);
    const alpha = (block: string) => {
      const m = /homeAlpha\([^,]+,\s*([\d.]+)\)/.exec(block);
      if (!m) throw new Error("label colour is not a homeAlpha(...) value");
      return Number(m[1]);
    };
    expect(alpha(styleBlock("starLabel"))).toBeLessThan(alpha(styleBlock("polarisLabel")));
    // 줄 수는 둘까지다. 셋째 줄부터는 이름표가 아니라 문단이다.
    for (const [winW, fontScale] of CASES) {
      for (const label of Object.values(homeLayout(winW, fontScale).labels)) expect(label.maxLines).toBeLessThanOrEqual(2);
    }
  });
});

describe(`다섯 언어 이름표 (${LOCALES.join(" · ")})`, () => {
  it("로케일 폴더가 다섯 개이고 모두 일곱 별 이름과 북극성 이름을 갖는다", () => {
    expect(LOCALES).toEqual(["en", "es", "id", "ko", "pt"]);
    for (const locale of LOCALES) {
      for (const s of STARS) expect(starNames(locale)[s.id]).toBeTruthy();
      expect(HOME_COPY[locale].ds.home.polaris).toBeTruthy();
    }
  });

  it.each(FREE_CASES)(
    `가로 %sdp · 글꼴 %s배 (${LABEL_FREE_GROWTH_SCALE}배까지): 어느 언어의 어느 이름표도 잘리지 않는다`,
    (winW, fontScale) => {
      expect(cutLabels(winW, fontScale)).toEqual([]);
    },
  );

  it(`가로 320~440dp 를 0.5dp 간격으로: 배율 1 과 ${LABEL_FREE_GROWTH_SCALE} 에서 어느 이름표도 잘리지 않는다`, () => {
    // 위 WIDTHS 에는 가장 빡빡한 폭이 없다. pt "Primeira infância" 가 두 줄이 필요해지는 399~404dp 에서
    // 둘째 줄이 프로필 코어에 닿는 배율이 가장 낮다 (399.5dp 에서 1.24). 잘리지 않는다고 말할 수 있는
    // 배율, 곧 상자가 조건 없이 넓어지는 배율은 그 아래여야 한다. 그 위는 "main 보다 나빠지지 않는다" 를 잰다.
    const cut: string[] = [];
    for (let winW = 320; winW <= 440; winW += 0.5) {
      for (const fontScale of [1, LABEL_FREE_GROWTH_SCALE]) {
        cut.push(...cutLabels(winW, fontScale).map((c) => `${winW}dp x${fontScale}: ${c}`));
      }
    }
    expect(cut).toEqual([]);
  });

  it.each(CASES)("가로 %sdp · 글꼴 %s배: 줄바꿈된 이름표의 글자가 남의 글자·별 코어를 덮지 않는다", (winW, fontScale) => {
    const { stars, labels, coreHalfSpan, r } = homeLayout(winW, fontScale);
    const hits: string[] = [];
    for (const locale of LOCALES) {
      const names = starNames(locale);
      // 가운데 정렬이므로 줄마다 실제 글자 폭만큼의 상자를 만든다. 그려지는 줄만 센다.
      const ink = stars.map((s) => renderedInk(labels[s.id].frame, labels[s.id].maxLines, names[s.id], r));
      stars.forEach((s, i) => {
        for (const line of ink[i]) {
          if (line.n === 0) continue; // 첫 줄끼리는 이 변경 전과 같다.
          stars.forEach((other, j) => {
            if (j === i) return;
            for (const theirs of ink[j]) {
              if (intersects(line, theirs)) hits.push(`${locale}: ${s.id} line ${line.n + 1} x ${other.id} line ${theirs.n + 1}`);
            }
            const x = Math.round(other.cx);
            const y = Math.round(other.cy);
            const core = { left: x - coreHalfSpan, right: x + coreHalfSpan, top: y - coreHalfSpan, bottom: y + coreHalfSpan };
            if (intersects(line, core)) hits.push(`${locale}: ${s.id} line ${line.n + 1} x ${other.id} core`);
          });
        }
      });
    }
    expect(hits).toEqual([]);
  });
});

describe("화면 배선", () => {
  const labelsBlock = SRC.slice(SRC.indexOf("{/* star labels"), SRC.indexOf("{/* tap targets"));

  it("ConstellationHome 이 이 함수로 이름표를 놓는다 (한 줄 고정이 돌아오지 않는다)", () => {
    expect(labelsBlock.length).toBeGreaterThan(0);
    expect(labelsBlock).toContain("const label = starLabels.stars[s.id];");
    expect(labelsBlock).toContain("numberOfLines={label.maxLines}");
    expect(labelsBlock).toContain("label.frame");
    // 북극성 이름표 폭도 별 이름표 자리에 따라 정해지므로 같은 계산에서 나온 값을 쓴다.
    expect(labelsBlock).toContain("style={[styles.polarisLabel, starLabels.polaris]}");
    expect(labelsBlock).not.toContain("left: px(s.x) - 40");
    // 테스트가 장애물로 쓰는 코어 크기와 화면이 넘기는 값이 같아야 한다.
    expect(SRC).toContain("coreHalfSpan: pixelStarSpan(DOMAIN_CORE_R * k * DOMAIN_FOCUS_MULT)");
    expect(SRC).toContain("const boxW = Math.min(380, winW - 24);");
    expect(SRC).toContain("const k = boxW / 380;");
    expect(SRC).toContain("const u = boxW / VBW;");
    expect(SRC).toContain("const boxH = (VBH + VB_TOP) * u;");
    expect(SRC).toContain("const py = (y: number) => (y + VB_TOP) * u;");
  });

  it("두 이름표가 기기 글꼴 배율을 자리 계산에 넣고, RN 에 글꼴 상한을 걸지 않는다 (게이트 F1 · 재게이트 F1-R1)", () => {
    expect(SRC).toContain("const { width: winW, fontScale } = useWindowDimensions();");
    const at = SRC.indexOf("const starLabels = layoutStarLabels({");
    expect(at).toBeGreaterThan(-1);
    expect(SRC.slice(at, SRC.indexOf("});", at))).toMatch(/^\s*fontScale,$/m);
    // 상한(maxFontSizeMultiplier)은 큰 글자를 쓰는 사람의 확대 요청을 자른다. main 처럼 기기 배율을 끝까지
    // 따른다. 두 Text 가 같은 배율로 커지므로 북극성 이름표 글자가 별 이름표 글자보다 작아지는 배율도 없다.
    expect(labelsBlock).not.toContain("maxFontSizeMultiplier");
    // 글꼴 확대를 끄는 것도 같은 이유로 안 된다.
    expect(labelsBlock).not.toContain("allowFontScaling");
  });
});
