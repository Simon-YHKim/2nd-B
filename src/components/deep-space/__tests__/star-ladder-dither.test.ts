// 별 밝기 사다리가 **알파가 아니라 색과 디더 밀도**인가.
//
// PIXEL-CLAY 절대 규칙 4 · Simon 결정 2026-08-27 ("북극성까지 포함해 전부 디더 5단").
// 화면 실측에서 홈 `/` 의 반투명 17건이 전부 여기서 나왔다 — 도메인 별 7개 × 2층
// (광채 + 심) + 북극성 3층.
//
// 붙드는 것은 두 가지다:
//   1. 알파로 되돌아가지 않는가 (규칙)
//   2. 밝기가 여전히 다섯 단으로 **구분되는가** (의미)
//
// 2번이 중요하다. 규칙만 지키고 다섯 단이 뭉개지면 "내가 나를 얼마나 알아냈나"를
// 보여주던 신호가 사라진다. 규칙은 지키고 뜻은 잃는 셈이다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { m3 } from "@/lib/theme/m3";
import { ladderDitherCells, LADDER_ON_CELLS, ditherCells } from "@/components/pixel/pixel-dither-cells";

const SRC = readFileSync(join(__dirname, "..", "ConstellationHome.tsx"), "utf8");

/** 주석을 걷는다 — 이 파일은 이주 메모에 opacity 라는 낱말이 여러 번 나온다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

describe("별 사다리는 알파가 아니다", () => {
  const code = stripComments(SRC);

  it("별을 그리는 곳에 opacity 소품이 없다", () => {
    // JSX 의 opacity={...} 와 스타일의 opacity: 숫자 둘 다 본다.
    expect(code).not.toMatch(/\bopacity=\{/);
    expect(code).not.toMatch(/\bopacity\s*:\s*(?:0?\.\d+|1(?:\.0+)?)\b/);
  });

  it("옛 알파 계산이 남아 있지 않다", () => {
    expect(code).not.toMatch(/rev2StarOpacity/);
    expect(code).not.toMatch(/soulCoreOpacity\(/);
  });

  it("사다리 색과 디더 패턴을 쓴다", () => {
    expect(code).toMatch(/m3\.starLadder\./);
    expect(code).toMatch(/ds-star-l\$\{/);
    expect(code).toMatch(/ds-polaris-l\$\{/);
  });
});

describe("다섯 단이 실제로 구분된다", () => {
  it("도메인 별 심 색 다섯 개가 서로 다르다", () => {
    const rest = m3.starLadder.rest;
    expect(rest).toHaveLength(5);
    expect(new Set(rest).size).toBe(5);
  });

  it("사다리가 단조롭게 밝아진다", () => {
    // 밝기가 오르는데 색이 어두워지면 신호가 뒤집힌다.
    const lum = (hex: string) => {
      const h = hex.replace("#", "");
      return (
        0.2126 * parseInt(h.slice(0, 2), 16) +
        0.7152 * parseInt(h.slice(2, 4), 16) +
        0.0722 * parseInt(h.slice(4, 6), 16)
      );
    };
    for (const set of [m3.starLadder.rest, m3.starLadder.focus, m3.starLadder.polarisMid, m3.starLadder.polarisCore]) {
      for (let i = 1; i < set.length; i++) {
        expect(lum(set[i])).toBeGreaterThan(lum(set[i - 1]));
      }
    }
  });

  it("디더 밀도가 단조롭게 오르고 다섯 단이 서로 다르다", () => {
    const counts = [1, 2, 3, 4, 5].map((l) => ladderDitherCells(l).length);
    expect(counts).toEqual([...LADDER_ON_CELLS]);
    expect(new Set(counts).size).toBe(5);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    }
  });

  it("가장 어두운 단도 보인다 — 별은 탭 대상이기도 하다", () => {
    // 옛 코드가 바닥을 깐 이유와 같다: 안 밝은 별은 어두운 내비 노드지 없는 노드가 아니다.
    expect(ladderDitherCells(1).length).toBeGreaterThan(0);
    expect(m3.starLadder.rest[0]).not.toBe(m3.color.surface);
  });
});

describe("옛 화면과 같은 픽셀인가", () => {
  // 규칙을 지키면서 화면이 달라지면 그건 이주가 아니라 변경이다.
  // 옛 값: fill 색 × opacity(0.36 + L/5 × 0.64) 를 하늘 바닥 위에 얹은 것.
  const flatten = (hex: string, a: number, ground: string) => {
    const p = (v: string) => {
      const h = v.replace("#", "");
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    };
    const f = p(hex);
    const b = p(ground);
    return `#${f.map((c, i) => Math.round(a * c + (1 - a) * b[i])).map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  };

  it.each([1, 2, 3, 4, 5])("L%i 의 심 색이 옛 알파 합성과 같다", (level) => {
    const alpha = 0.36 + (level / 5) * 0.64;
    expect(m3.starLadder.rest[level - 1]).toBe(flatten(m3.accent.star, alpha, m3.color.surface));
    expect(m3.starLadder.focus[level - 1]).toBe(flatten(m3.accent.starFocus, alpha, m3.color.surface));
  });
});

describe("디더 격자 자체", () => {
  it("베이어라서 밀도가 덩어리로 자라지 않는다", () => {
    // 왼쪽부터 채우면 6칸이 한 줄 반이 된다. 베이어는 흩어져야 한다.
    const six = ditherCells(6);
    const rows = new Set(six.map((c) => c.y));
    const cols = new Set(six.map((c) => c.x));
    expect(rows.size).toBeGreaterThan(1);
    expect(cols.size).toBeGreaterThan(1);
  });

  it("낮은 밀도가 높은 밀도의 부분집합이다 — 단이 오를 때 켜진 칸이 꺼지지 않는다", () => {
    const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;
    for (let l = 2; l <= 5; l++) {
      const lower = new Set(ladderDitherCells(l - 1).map(key));
      const upper = new Set(ladderDitherCells(l).map(key));
      for (const k of lower) expect(upper.has(k)).toBe(true);
    }
  });

  it("범위 밖 등급도 화면을 비우지 않는다", () => {
    expect(ladderDitherCells(0).length).toBe(LADDER_ON_CELLS[0]);
    expect(ladderDitherCells(99).length).toBe(LADDER_ON_CELLS[4]);
  });
});
