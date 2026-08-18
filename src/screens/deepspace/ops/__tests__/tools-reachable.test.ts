// 비서 허브가 자기 도구들을 링크하는가 (Simon 2026-08-18, D7).
//
// ## 이 파일은 한 번 틀린 적이 있다
//
// 처음 쓴 버전은 `screens/deepspace/ops/screens.tsx` 를 읽어서 "허브가 도구를
// 링크한다" 를 확인했다. 통과했다. **그런데 그 파일의 허브(OpsHomeScreen)는
// 어떤 라우트도 렌더하지 않는 고아였다.** `/ops` 는
// `DeepSpaceDesignScreens.tsx` 의 `DeepSpaceOpsScreen` 을 렌더한다.
//
// 즉 소스에는 있고 화면에는 없는 것을 초록불로 보고했다. 실제 브라우저로 열어
// 보고서야 드러났다.
//
// 그래서 이 파일은 **파일 이름을 고정하지 않는다.** `src/app/ops.tsx` 가 실제로
// 무엇을 렌더하는지 먼저 읽고, 그 컴포넌트가 사는 파일을 검사한다. 라우트가
// 다른 화면을 가리키도록 바뀌면 이 검사도 따라간다.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const APP_OPS = readFileSync(join(ROOT, "src", "app", "ops.tsx"), "utf8");

/**
 * `/ops` 가 딥스페이스에서 렌더하는 컴포넌트가 사는 파일을 찾는다.
 *
 * 문자열로 파일 경로를 박아 두면 이 검사가 다시 거짓 초록불이 된다.
 */
function hubSourceFile(): string {
  const m = APP_OPS.match(/if\s*\(isDeepSpaceUI\(\)\)\s*return\s*<(\w+)\s*\/>/);
  if (!m) throw new Error("ops.tsx 의 딥스페이스 분기를 못 찾았다 - 구조가 바뀌었으면 이 검사를 고쳐야 한다");
  const component = m[1];
  const imp = APP_OPS.match(new RegExp(`import\\s*\\{[^}]*\\b${component}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`));
  if (!imp) throw new Error(`${component} 의 import 를 못 찾았다`);
  const rel = imp[1].replace(/^@\//, "src/");
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const p = join(ROOT, rel + ext);
    if (existsSync(p)) return p;
  }
  throw new Error(`${rel} 의 실제 파일을 못 찾았다`);
}

const HUB = readFileSync(hubSourceFile(), "utf8");

/** 허브 격자가 열어야 하는 비서 도구. */
const TOOLS = [
  "focus",
  "reminders",
  "imagine",
  "share-card",
  "srs",
  "call-reflection",
  "reading",
  "milestones",
  "ledger",
  "side-project",
  "meals",
] as const;

/** 오늘의 두 가지가 고를 수 있는 후보. 전부 갈 곳이 있어야 한다. */
const PICKS = ["routine", "milestone", "reading", "meals", "records", "esm"] as const;

describe("비서 허브 ↔ 도구 배선", () => {
  it("검사 대상이 실제로 /ops 가 렌더하는 파일이다", () => {
    // 이 한 줄이 이 파일의 존재 이유다.
    expect(hubSourceFile()).toContain("DeepSpaceDesignScreens");
  });

  it.each(TOOLS)("/%s 라우트 파일이 실재한다", (tool) => {
    expect(existsSync(join(ROOT, "src", "app", `${tool}.tsx`))).toBe(true);
  });

  it.each(TOOLS)("허브가 /%s 로 가는 길을 연다", (tool) => {
    expect(HUB).toContain(`route: "/${tool}"`);
  });

  it("오늘의 두 가지가 여섯 후보 전부에 갈 곳을 준다", () => {
    const block = HUB.slice(HUB.indexOf("const TODAY_ROUTE"));
    const table = block.slice(0, block.indexOf("};"));
    for (const id of PICKS) {
      expect(table).toContain(`${id}:`);
    }
  });

  it("오늘의 두 가지가 실제로 렌더된다", () => {
    // 상태만 두고 그리지 않으면 아무 일도 일어나지 않는다 - 그게 직전 실수였다.
    expect(HUB).toContain("todayPicks.picks.map");
    expect(HUB).toContain("todayPicks.suggestions.map");
  });

  it("빈 자리를 예시 데이터로 채우지 않는다", () => {
    // 카드가 아니라 "다음 걸음" 문구를 쓴다. 원본 대시보드 원리보다 한 걸음 더
    // 정직한 쪽 - lib/ops/today-picks.ts 헤더 참조.
    expect(HUB).toContain("today.nothingHint");
    expect(HUB).toContain("today.next.");
  });

  it("아이콘 이름이 실재하는 글리프다", () => {
    // CLONE_ICON 이 Record<string, string> 이라 타입이 오타를 못 잡는다.
    // 실제로 flag/wallet/leaf 를 썼다가 빈 아이콘이 될 뻔했다.
    const glyphBlock = HUB.slice(HUB.indexOf("const CLONE_ICON"));
    const known = new Set(
      (glyphBlock.slice(0, glyphBlock.indexOf("};")).match(/^\s+(\w+):/gm) ?? []).map((x) =>
        x.trim().replace(":", ""),
      ),
    );
    const used = (HUB.match(/icon: "(\w+)"/g) ?? []).map((x) => x.replace(/icon: "|"/g, ""));
    expect(used.length).toBeGreaterThan(0);
    for (const glyph of used) expect(known.has(glyph)).toBe(true);
  });
});

describe("고아 허브", () => {
  const ORPHAN = readFileSync(join(__dirname, "..", "screens.tsx"), "utf8");

  it("OpsHomeScreen 이 고아라는 사실이 파일에 적혀 있다", () => {
    // 적어 두지 않으면 다음 사람이 여기를 고치고 화면이 안 바뀌는 이유를 다시
    // 찾게 된다. 실제로 그렇게 한 번 잃었다.
    expect(ORPHAN).toContain("어떤 라우트도 렌더하지 않는다");
    expect(ORPHAN).toContain("DeepSpaceOpsScreen");
  });

  it("어떤 라우트도 OpsHomeScreen 을 렌더하지 않는다", () => {
    // 이 전제가 바뀌면 위 경고가 거짓말이 된다.
    const appDir = join(ROOT, "src", "app");
    const files = require("node:fs")
      .readdirSync(appDir)
      .filter((f: string) => f.endsWith(".tsx"));
    const renders = files.filter((f: string) =>
      /<OpsHomeScreen\s*\/>/.test(readFileSync(join(appDir, f), "utf8")),
    );
    expect(renders).toEqual([]);
  });
});
