// 5×N 진행 행렬이 **화면에 붙어 있는가**, 그리고 붙은 방식이 규율을 지키는가.
//
// 이 컴포넌트는 `/interview` 를 위해 만들어졌는데 호출부가 0건이었다. 붙이지
// 못했던 이유는 보여줄 데이터가 없어서다 -- 커버리지가 화면 상태로만 살았다.
// 0143 이 그걸 저장하게 되면서 이제 의미가 있다.
//
// 붙이는 자리는 **대화가 끝난 뒤**다. 이건 취향이 아니라 판단이다:
// 말하는 동안 채점표를 보여주면 사람은 칸을 채우려고 말하게 된다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LIFE_PERIODS } from "../probe";
import { livedPeriods } from "../periods";

const SCREEN = readFileSync(
  join(__dirname, "..", "..", "..", "app", "interview.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const COMPONENT = readFileSync(
  join(__dirname, "..", "..", "..", "components", "ui", "DrillProgress.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("행렬이 화면에 붙어 있다", () => {
  it("`/interview` 가 DrillProgress 를 그린다", () => {
    expect(SCREEN).toContain('import { DrillProgress } from "@/components/ui/DrillProgress"');
    expect(SCREEN).toContain("<DrillProgress");
  });

  it("대화 중이 아니라 **끝난 뒤**에 그린다", () => {
    // done 분기 안에 있어야 한다. 대화 중에 채점표를 띄우면 사람이 칸을 채우려고
    // 말하게 된다 -- 그러면 밝기가 대화를 왜곡한다.
    const doneBranch = /\{done \?[\s\S]*?\) : \(/.exec(SCREEN)?.[0] ?? "";
    expect(doneBranch.length).toBeGreaterThan(0);
    expect(doneBranch).toContain("<DrillProgress");
  });

  it("누적 커버리지를 넘긴다 (이번 세션 것만이 아니다)", () => {
    // 화면의 `coverage` 는 지난 세션 것을 이어받아 시작한다(0143).
    expect(SCREEN).toContain("coverage={coverage}");
  });
});

describe("⚠ 살지 않은 시기는 열이 되지 않는다", () => {
  it("화면이 나이에서 만든 목록을 넘긴다", () => {
    expect(SCREEN).toContain("livedPeriods(age)");
    expect(SCREEN).toContain("periods={coveredPeriods}");
    // LIFE_PERIODS 를 그대로 넘기면 스물다섯 살에게 70대 열이 보인다.
    expect(SCREEN).not.toContain("periods={LIFE_PERIODS}");
  });

  it("컴포넌트가 periods 를 **필수**로 받는다 (기본값이 있으면 재발한다)", () => {
    expect(COMPONENT).toContain("periods: readonly LifePeriod[];");
    expect(COMPONENT).not.toMatch(/periods\s*=\s*LIFE_PERIODS/);
  });

  it("컴포넌트가 LIFE_PERIODS 를 직접 그리지 않는다", () => {
    // 주석에는 남아 있어도 된다 -- 왜 필수 prop 인지를 설명하는 문장이고,
    // 그 설명이야말로 재발을 막는다. 막는 것은 **코드에서 다시 쓰는 것**이다.
    const code = COMPONENT.split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(code).not.toContain("LIFE_PERIODS");
  });

  it("나이에 따라 열 수가 달라진다", () => {
    // 숫자를 박지 않는다 — 별 구조가 바뀌면 자리 수도 바뀐다.
    expect(livedPeriods(25).length).toBeLessThan(livedPeriods(46).length);
    expect(livedPeriods(25)).not.toContain("later");
    // 그리고 그 값들은 전부 행렬이 아는 시기여야 한다.
    for (const age of [14, 25, 46, 75]) {
      for (const p of livedPeriods(age)) expect(LIFE_PERIODS).toContain(p);
    }
  });
});

describe("좁은 화면에서 넘치지 않는다", () => {
  it("칸이 flex 로 나눠 갖는다 (고정 폭이 아니다)", () => {
    // 열 수가 사람마다 다르므로 고정 폭이면 6열부터 넘친다.
    expect(COMPONENT).toMatch(/cell:\s*\{[^}]*flex:\s*1/);
  });
});
