import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 값이 있는 컨트롤이 웹에서 값을 하나도 말하지 않는 문제를 잡는다.
//
// React Native 는 accessibilityValue={{ min, max, now, text }} 객체를 읽지만
// React Native Web 의 createDOMProps 는 그 객체를 보지 않는다. 평평한
// accessibilityValueMin/Max/Now/Text (또는 aria-*) 만 읽고 객체는 조용히
// 버린다. 그래서 슬라이더·진행바가 웹에서 역할만 남고 값이 사라진다.
//
// 실측(2026-09-07, attested 웹 export 를 실제 브라우저로): 뮤지엄 연도 다이얼이
// role=slider · aria-label="연도 탐색" 로 나오는데 aria-valuenow·valuemin·
// valuemax 가 전부 null 이었다. 그리고 저장소의 12개 호출부가 전부 객체 형태만
// 쓰고 있었다.
const SRC_ROOT = resolve(__dirname, "../../..");

function sourceFiles(dir: string): string[] {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return /[.]tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("a11yValue 가 두 플랫폼 모두에 값을 넘긴다", () => {
  afterEach(() => {
    jest.resetModules();
  });

  function load(os: string) {
    jest.resetModules();
    jest.doMock("react-native", () => ({ Platform: { OS: os } }));
    return require("../accessibility-value") as typeof import("../accessibility-value");
  }

  test("웹에서는 평평한 prop 을 함께 낸다 - 그게 RN Web 이 읽는 유일한 형태다", () => {
    const { a11yValue } = load("web");
    expect(a11yValue({ min: 1936, max: 2026, now: 2022, text: "2022" })).toEqual({
      accessibilityValue: { min: 1936, max: 2026, now: 2022, text: "2022" },
      accessibilityValueMin: 1936,
      accessibilityValueMax: 2026,
      accessibilityValueNow: 2022,
      accessibilityValueText: "2022",
    });
  });

  test("네이티브에서는 객체만 낸다 - 뷰에 모르는 prop 을 얹지 않는다", () => {
    for (const os of ["ios", "android"]) {
      const { a11yValue } = load(os);
      expect(a11yValue({ min: 0, max: 5, now: 3 })).toEqual({
        accessibilityValue: { min: 0, max: 5, now: 3 },
      });
    }
  });

  test("빈 자리는 undefined 로 남는다 - 없는 값을 0 으로 지어내지 않는다", () => {
    const { a11yValue } = load("web");
    const output = a11yValue({ text: "3 / 12" }) as Record<string, unknown>;
    expect(output.accessibilityValueText).toBe("3 / 12");
    expect(output.accessibilityValueNow).toBeUndefined();
    expect(output.accessibilityValueMin).toBeUndefined();
    expect(output.accessibilityValueMax).toBeUndefined();
  });
});

describe("모든 호출부가 그 헬퍼를 지난다", () => {
  const files = sourceFiles(SRC_ROOT).filter((file) => !file.includes("__tests__"));

  test("스캐너가 실제로 소스를 읽고 있다", () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files.some((file) => file.endsWith("/lib/a11y/accessibility-value.ts"))).toBe(true);
  });

  test("객체 형태를 직접 쓰는 곳이 남아 있지 않다", () => {
    // 직접 쓰면 웹에서 값이 사라진다. 헬퍼를 지나야 한다.
    const offenders = files
      .map((file) => ({ file, source: readFileSync(file, "utf8") }))
      // `accessibilityValue=` and not just `={{`: one call site passes a
      // conditional (`indeterminate ? undefined : {...}`), which the narrower
      // pattern walks straight past. The guard has to see every JSX use.
      .filter(({ file, source }) => !file.endsWith("/lib/a11y/accessibility-value.ts") && /accessibilityValue=/.test(source))
      .map(({ file }) => file.slice(SRC_ROOT.length + 1));
    expect(offenders).toEqual([]);
  });

  test("헬퍼를 쓰는 곳이 실제로 여럿이다 - 검사가 공허하지 않다", () => {
    const users = files.filter((file) => /\ba11yValue\(/.test(readFileSync(file, "utf8")));
    expect(users.length).toBeGreaterThanOrEqual(10);
  });
});
