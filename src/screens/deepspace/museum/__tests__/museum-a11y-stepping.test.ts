import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import {
  MUSEUM_INITIAL_YEAR,
  MUSEUM_VISIBLE_MAX_YEAR,
  clampMuseumYear,
  museumStepEventYear,
} from "../museum-interaction";
import { MUSEUM_BY_YEAR, MZ } from "../museum-timeline-data";

// 뮤지엄 다이얼이 "다음 사건"이라고 말해 놓고 한 해씩 움직이는 문제를 잡는다.
//
// 이 두 동작(increment·decrement)은 화면에 글자로 나타나지 않는다. 스크린리더
// 사용자에게만 읽힌다. 그래서 라벨과 동작이 어긋나도 눈으로 보는 사람은 영원히
// 모르고, 어긋남의 대가는 전부 그 사용자에게만 간다.
//
// 실측: 사건이 있는 해는 30개인데 다이얼이 닿는 범위는 91년이다. 사건 사이
// 간격은 중앙값 2년, 최대 11년. 한 해씩 움직이면 처음부터 끝까지 84번을 눌러야
// 하고, 그 중 절반 이상은 아무것도 없는 해에 선다.
const YEARS = [...new Set(MUSEUM_BY_YEAR.map((event) => event.year))].sort((a, b) => a - b);
const FILE = resolve(__dirname, "../MuseumTimelineScreen.tsx");
const SOURCE = readFileSync(FILE, "utf8");
const AST = ts.createSourceFile(FILE, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

describe("사건이 있는 해의 분포 (이 회차가 근거로 삼는 실측)", () => {
  test("사건은 30개 미만의 해에 몰려 있고 다이얼 범위는 그보다 훨씬 넓다", () => {
    expect(YEARS.length).toBeLessThan(MUSEUM_VISIBLE_MAX_YEAR - MZ.START);
    expect(YEARS[0]).toBeGreaterThanOrEqual(MZ.START);
    expect(YEARS[YEARS.length - 1]).toBeLessThanOrEqual(MUSEUM_VISIBLE_MAX_YEAR);
  });

  test("사건 사이에 빈 해가 있다 - 한 해씩 움직이면 빈 곳에 선다", () => {
    const gaps = YEARS.slice(1).map((year, index) => year - YEARS[index]);
    expect(Math.max(...gaps)).toBeGreaterThan(1);
    expect(gaps.filter((gap) => gap > 1).length).toBeGreaterThan(gaps.length / 2);
  });
});

describe("다이얼의 increment·decrement 는 사건 단위로 움직인다", () => {
  test("사건이 있는 해에서 다음으로 가면 그 다음 사건의 해에 선다", () => {
    for (let index = 0; index < YEARS.length - 1; index += 1) {
      expect(museumStepEventYear(YEARS[index], 1)).toBe(YEARS[index + 1]);
    }
  });

  test("거꾸로도 같다", () => {
    for (let index = YEARS.length - 1; index > 0; index -= 1) {
      expect(museumStepEventYear(YEARS[index], -1)).toBe(YEARS[index - 1]);
    }
  });

  test("빈 해에서 출발해도 그 방향의 가장 가까운 사건에 선다", () => {
    const gapStart = YEARS.find((year, index) => index > 0 && year - YEARS[index - 1] > 1);
    expect(gapStart).toBeDefined();
    const previous = YEARS[YEARS.indexOf(gapStart as number) - 1];
    const empty = previous + 1;
    expect(YEARS).not.toContain(empty);
    expect(museumStepEventYear(empty, 1)).toBe(gapStart);
    expect(museumStepEventYear(empty, -1)).toBe(previous);
  });

  test("양 끝에서는 넘어가지 않는다", () => {
    const first = YEARS[0];
    const last = YEARS[YEARS.length - 1];
    expect(museumStepEventYear(first, -1)).toBe(first);
    expect(museumStepEventYear(last, 1)).toBe(last);
  });

  test("돌려주는 값은 언제나 다이얼이 표시할 수 있는 해다", () => {
    for (const year of [MZ.START - 50, MZ.START, MUSEUM_INITIAL_YEAR, MUSEUM_VISIBLE_MAX_YEAR, MUSEUM_VISIBLE_MAX_YEAR + 50, Number.NaN]) {
      for (const direction of [-1, 1] as const) {
        const stepped = museumStepEventYear(year, direction);
        expect(stepped).toBe(clampMuseumYear(stepped));
        expect(Number.isFinite(stepped)).toBe(true);
      }
    }
  });

  test("처음부터 끝까지 가는 데 드는 누름 수가 해 단위가 아니라 사건 단위다", () => {
    let year = YEARS[0];
    let presses = 0;
    while (year < YEARS[YEARS.length - 1] && presses <= 200) {
      year = museumStepEventYear(year, 1);
      presses += 1;
    }
    expect(year).toBe(YEARS[YEARS.length - 1]);
    expect(presses).toBe(YEARS.length - 1);
    // 한 해씩 움직이던 시절의 비용. 회귀하면 이 단언이 먼저 깨진다.
    expect(presses).toBeLessThan(YEARS[YEARS.length - 1] - YEARS[0]);
  });
});

describe("화면이 그 헬퍼를 실제로 접근성 동작에 걸었다", () => {
  const actionHandler = () => {
    const match = SOURCE.match(/onAccessibilityAction=\{\(event\)[\s\S]*?\n {12}\}\}/);
    if (!match) throw new Error("onAccessibilityAction 핸들러를 찾지 못했다");
    return match[0];
  };

  test("increment·decrement 가 사건 단위 헬퍼를 쓴다", () => {
    const handler = actionHandler();
    expect(handler).toContain("museumStepEventYear");
    // 한 해씩 더하고 빼던 옛 배선이 남아 있으면 안 된다.
    expect(handler).not.toMatch(/seekToYear\(year [+-] 1/);
  });

  test("사건 단위로 부르는 라벨을 그대로 유지한다", () => {
    expect(SOURCE).toContain('name: "decrement", label: t("deepspace:museum.prevEvent")');
    expect(SOURCE).toContain('name: "increment", label: t("deepspace:museum.nextEvent")');
  });
});

describe("이 화면이 렌더하는 문자열에 em dash 가 없다", () => {
  // DESIGN.md 는 UI 문자열의 em dash 를 금지하는데 check:emdash 는 locales/ 만
  // 훑는다. 코드에 직접 박힌 것은 아무 검사도 보지 못한다. 주석은 AST 노드가
  // 아니므로 여기서 걸리지 않는다 - 이 저장소가 네 번 겪은 거짓양성의 원인이다.
  function renderedStrings(): { text: string; line: number }[] {
    const found: { text: string; line: number }[] = [];
    const visit = (node: ts.Node): void => {
      const at = (n: ts.Node) => AST.getLineAndCharacterOfPosition(n.getStart(AST)).line + 1;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.push({ text: node.text, line: at(node) });
      else if (ts.isTemplateExpression(node)) {
        found.push({ text: node.head.text, line: at(node) });
        for (const span of node.templateSpans) found.push({ text: span.literal.text, line: at(node) });
      } else if (ts.isJsxText(node) && node.text.trim()) found.push({ text: node.text.trim(), line: at(node) });
      node.forEachChild(visit);
    };
    visit(AST);
    return found;
  }

  test("문자열 리터럴·템플릿·JSX 텍스트 어디에도 없다", () => {
    const offenders = renderedStrings().filter((entry) => entry.text.includes("—"));
    expect(offenders).toEqual([]);
  });

  test("검사가 무디지 않다 - 문자열을 실제로 읽고 있다", () => {
    const strings = renderedStrings();
    expect(strings.length).toBeGreaterThan(10);
    expect(strings.some((entry) => entry.text.includes("deepspace:museum"))).toBe(true);
  });
});
