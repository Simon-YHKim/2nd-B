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

import { GLYPH_ALIAS } from "@/components/pixel/pixel-glyphs";

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
    // 실제로 flag/wallet/leaf 를 썼다가 빈 아이콘이 될 뻔했다.
    //
    // 원래 이 검사는 소스에서 `CLONE_ICON` **객체의 키를 긁어서** 대조했다.
    // 아이콘이 픽셀 글리프 정본으로 옮겨가면서 그 객체가 이름 배열이 되자
    // 검사가 깨졌다 — 검사가 붙들고 있던 것이 뜻이 아니라 **모양**이었다는 뜻이다.
    // 이제는 소스 모양 대신 `GLYPH_ALIAS` 를 **실제로 import 해서** 본다.
    // 정본이 옮겨 다녀도 따라가고, 대조 대상도 더 정확하다.
    const used = (HUB.match(/icon: "(\w+)"/g) ?? []).map((x) => x.replace(/icon: "|"/g, ""));
    expect(used.length).toBeGreaterThan(0);
    for (const glyph of used) expect(Object.keys(GLYPH_ALIAS)).toContain(glyph);
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
