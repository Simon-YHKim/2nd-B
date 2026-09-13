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
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { HOME_STAR_IDS } from "@/lib/persona/home-stars";

import { pixelStarSpan } from "../../pixel/pixel-star";
import {
  POLARIS_LABEL,
  STAR_LABEL,
  layoutStarLabels,
  polarisLabelFrame,
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

/** 화면 폭 winW(dp) 에서 ConstellationHome 이 계산하는 것과 같은 자리. */
function homeLayout(winW: number) {
  const boxW = Math.min(380, winW - 24);
  const k = boxW / 380;
  const u = boxW / VBW;
  const boxH = (VBH + VB_TOP) * u;
  const px = (x: number) => x * u;
  const py = (y: number) => (y + VB_TOP) * u;
  const coreHalfSpan = pixelStarSpan(DOMAIN_CORE_R * k * DOMAIN_FOCUS_MULT);
  const stars = STARS.map((s) => ({ id: s.id, cx: px(s.x), cy: py(s.y) }));
  const polaris = { cx: px(POLARIS.x), cy: py(POLARIS.y) };
  const labels = layoutStarLabels({ stars, k, coreHalfSpan, polaris, stage: { w: boxW, h: boxH } });
  return { boxW, boxH, k, stars, coreHalfSpan, labels, polarisFrame: polarisLabelFrame(polaris.cx, polaris.cy, k) };
}

/** T1a 기기 가로 폭 (1440px / 3.5) 과 흔한 폰 폭들. 404dp 이상은 상자가 380 으로 같다. */
const T1A_WIDTH = 1440 / 3.5;
const WIDTHS = [320, 360, 375, 393, T1A_WIDTH, 430];

// 테스트 안에서만 쓰는 독립 판정. 모듈의 판정 함수를 빌리지 않는다.
type Rect = { left: number; top: number; right: number; bottom: number };
const intersects = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const lineRect = (f: LabelFrame, line: number): Rect => ({
  left: f.left,
  right: f.left + f.width,
  top: f.top + f.lineHeight * line,
  bottom: f.top + f.lineHeight * (line + 1),
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

/** advance 폭 합 + 글자마다 자간. 글리프가 없으면 기기는 다른 글꼴로 넘어가므로 모델이 틀린다. */
function textWidth(text: string, fontSize: number): number {
  let em = 0;
  const chars = [...text];
  for (const ch of chars) {
    const glyph = glyphOf(ch.codePointAt(0) ?? 0);
    if (glyph === 0) throw new Error(`Pretendard-Regular.otf has no glyph for "${ch}" in "${text}"`);
    em += FONT.readUInt16BE(TABLES.hmtx + 4 * Math.min(glyph, H_METRICS - 1)) / UNITS_PER_EM;
  }
  return em * fontSize + chars.length * LETTER_SPACING;
}

/** 공백에서만 끊는 줄바꿈. 끊을 자리가 더 적으니 기기보다 줄이 길게 나온다. */
function wrap(text: string, width: number, fontSize: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (!current || textWidth(next, fontSize) <= width) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/** 로케일마다 일곱 별 이름 (home.json ds.star.<id>). 로케일 폴더를 읽으므로 새 언어도 들어온다. */
const LOCALES = readdirSync(join(ROOT, "locales"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const starNames = (locale: string): Record<string, string> =>
  (JSON.parse(readFileSync(join(ROOT, "locales", locale, "home.json"), "utf8")) as { ds: { star: Record<string, string> } }).ds
    .star;

function styleBlock(name: string): string {
  const start = SRC.indexOf(`  ${name}: {`);
  if (start < 0) throw new Error(`style ${name} not found`);
  return SRC.slice(start, SRC.indexOf("\n  },", start));
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

  it.each(WIDTHS)("가로 %sdp: 둘째 줄을 받은 이름표는 남의 자리를 덮지 않고 상자 안에 있다", (winW) => {
    const { stars, labels, coreHalfSpan, polarisFrame, boxW, boxH } = homeLayout(winW);
    for (const s of stars) {
      const mine = labels[s.id];
      if (mine.maxLines < 2) continue;
      const second = lineRect(mine.frame, 1);
      expect(second.left).toBeGreaterThanOrEqual(0);
      expect(second.right).toBeLessThanOrEqual(boxW);
      expect(second.bottom).toBeLessThanOrEqual(boxH);
      expect(intersects(second, lineRect(polarisFrame, 0))).toBe(false);
      for (const other of stars) {
        if (other.id === s.id) continue;
        const theirs = labels[other.id];
        expect(intersects(second, lineRect(theirs.frame, 0))).toBe(false);
        if (theirs.maxLines === 2) expect(intersects(second, lineRect(theirs.frame, 1))).toBe(false);
        const x = Math.round(other.cx);
        const y = Math.round(other.cy);
        const core = { left: x - coreHalfSpan, right: x + coreHalfSpan, top: y - coreHalfSpan, bottom: y + coreHalfSpan };
        expect(intersects(second, core)).toBe(false);
      }
    }
  });

  it("북극성 이름표가 별 이름표보다 작거나 흐려지지 않는다 (Visual Tier)", () => {
    expect(STAR_LABEL.fontSize).toBeLessThanOrEqual(POLARIS_LABEL.fontSize);
    expect(STAR_LABEL.lineHeight).toBeLessThanOrEqual(POLARIS_LABEL.lineHeight);
    const alpha = (block: string) => {
      const m = /homeAlpha\([^,]+,\s*([\d.]+)\)/.exec(block);
      if (!m) throw new Error("label colour is not a homeAlpha(...) value");
      return Number(m[1]);
    };
    expect(alpha(styleBlock("starLabel"))).toBeLessThan(alpha(styleBlock("polarisLabel")));
    // 줄 수는 둘까지다. 셋째 줄부터는 이름표가 아니라 문단이다.
    for (const winW of WIDTHS) {
      for (const label of Object.values(homeLayout(winW).labels)) expect(label.maxLines).toBeLessThanOrEqual(2);
    }
  });
});

describe(`다섯 언어 이름표 (${LOCALES.join(" · ")})`, () => {
  it("로케일 폴더가 다섯 개이고 모두 일곱 별 이름을 갖는다", () => {
    expect(LOCALES).toEqual(["en", "es", "id", "ko", "pt"]);
    for (const locale of LOCALES) {
      for (const s of STARS) expect(starNames(locale)[s.id]).toBeTruthy();
    }
  });

  it.each(WIDTHS)("가로 %sdp: 어느 언어의 어느 별 이름도 잘리지 않는다", (winW) => {
    const { stars, labels } = homeLayout(winW);
    const cut: string[] = [];
    for (const locale of LOCALES) {
      const names = starNames(locale);
      for (const s of stars) {
        const { frame, maxLines } = labels[s.id];
        const lines = wrap(names[s.id], frame.width, frame.fontSize);
        const tooWide = lines.some((line) => textWidth(line, frame.fontSize) > frame.width);
        if (lines.length > maxLines || tooWide) cut.push(`${locale}/${s.id} "${names[s.id]}" -> ${lines.join(" / ")}`);
      }
    }
    expect(cut).toEqual([]);
  });

  it.each(WIDTHS)("가로 %sdp: 줄바꿈된 이름표의 글자가 남의 글자·별 코어를 덮지 않는다", (winW) => {
    const { stars, labels, coreHalfSpan } = homeLayout(winW);
    const hits: string[] = [];
    for (const locale of LOCALES) {
      const names = starNames(locale);
      // 가운데 정렬이므로 줄마다 실제 글자 폭만큼의 상자를 만든다.
      const ink = stars.map((s) => {
        const { frame } = labels[s.id];
        return wrap(names[s.id], frame.width, frame.fontSize).map((line, n) => {
          const w = textWidth(line, frame.fontSize);
          const box = lineRect(frame, n);
          return { n, left: frame.left + (frame.width - w) / 2, right: frame.left + (frame.width + w) / 2, top: box.top, bottom: box.bottom };
        });
      });
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
  it("ConstellationHome 이 이 함수로 이름표를 놓는다 (한 줄 고정이 돌아오지 않는다)", () => {
    const block = SRC.slice(SRC.indexOf("{/* star labels"), SRC.indexOf("{/* tap targets"));
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain("numberOfLines={label.maxLines}");
    expect(block).toContain("label.frame");
    expect(block).toContain("polarisLabelFrame(px(POLARIS.x), py(POLARIS.y), k)");
    expect(block).not.toContain("left: px(s.x) - 40");
    // 테스트가 장애물로 쓰는 코어 크기와 화면이 넘기는 값이 같아야 한다.
    expect(SRC).toContain("coreHalfSpan: pixelStarSpan(DOMAIN_CORE_R * k * DOMAIN_FOCUS_MULT)");
    expect(SRC).toContain("const boxW = Math.min(380, winW - 24);");
    expect(SRC).toContain("const k = boxW / 380;");
    expect(SRC).toContain("const u = boxW / VBW;");
    expect(SRC).toContain("const boxH = (VBH + VB_TOP) * u;");
    expect(SRC).toContain("const py = (y: number) => (y + VB_TOP) * u;");
  });
});
