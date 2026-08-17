// 비서 허브가 자기 도구들을 링크하는가 (Simon 2026-08-18, D7).
//
// 왜 이 검사가 필요한가: 이 저장소에는 비서 도구가 8개 있는데 (focus·ledger·
// meals·milestones·reading·side-project·srs·reminders) **허브가 그중 하나도
// 링크하지 않았다.** 전부 만들어져 있고, 대부분 허브와 같은 파일이 렌더하고,
// 파일 주석에 `ops domain` 태그까지 붙어 있는데, 도달할 방법이 딥링크뿐이었다.
//
// "기능이 없다" 가 아니라 "이어져 있지 않다" 였다는 것이 이 라운드의 발견이고,
// 그런 종류의 결함은 조용히 재발한다 - 화면을 리팩터링하다 섹션 하나를 지우면
// 끝이다. 그래서 라우트 파일의 존재와 허브의 링크를 **양쪽 다** 고정한다.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const HUB = readFileSync(join(ROOT, "src", "screens", "deepspace", "ops", "screens.tsx"), "utf8");

/** 허브가 링크해야 하는 비서 도구. 라우트는 실제 파일과 대조한다. */
const TOOLS = [
  "reading",
  "milestones",
  "ledger",
  "side-project",
  "meals",
  "focus",
  "srs",
  "reminders",
] as const;

describe("비서 허브 ↔ 도구 배선", () => {
  it.each(TOOLS)("/%s 라우트가 실재한다", (tool) => {
    // 링크만 있고 라우트가 없으면 죽은 링크가 된다.
    expect(existsSync(join(ROOT, "src", "app", `${tool}.tsx`))).toBe(true);
  });

  it.each(TOOLS)("허브가 /%s 로 가는 길을 연다", (tool) => {
    expect(HUB).toContain(`route: "/${tool}"`);
  });

  it("도구 목록과 실제 링크 수가 같다", () => {
    // 목록에 추가해 놓고 렌더를 빼먹는 실수를 잡는다.
    const listed = HUB.match(/route: "\/[a-z-]+"/g) ?? [];
    expect(listed).toHaveLength(TOOLS.length);
  });

  it("도구 격자가 실제로 렌더된다", () => {
    // 배열만 있고 컴포넌트를 안 부르면 아무 일도 일어나지 않는다 - 그게 직전
    // 상태였다.
    expect(HUB).toContain("<OpsToolsGrid />");
  });

  it("추천과 도구가 다른 역할로 표시된다", () => {
    // Simon: "역할구분을 확실히 하자". 제목과 한 줄 설명이 없으면 추천 카드와
    // 같은 덩어리로 읽힌다.
    expect(HUB).toContain("c.toolsTitle");
    expect(HUB).toContain("c.toolsHint");
  });

  it("도구 라벨이 EN·KO 양쪽에 있다", () => {
    const copy = readFileSync(join(ROOT, "src", "components", "deepspace", "ops", "copy.ts"), "utf8");
    // 이 파일은 ko 를 en 모양으로 타입 고정하므로 컴파일이 parity 를 잡지만,
    // 값이 비어 있는 것까지는 못 잡는다.
    for (const key of ["toolsTitle", "toolsHint", "toolReading", "toolReminders"]) {
      const hits = copy.match(new RegExp(`${key}: "[^"]+"`, "g")) ?? [];
      expect(hits.length).toBeGreaterThanOrEqual(2); // en + ko
    }
  });
});
