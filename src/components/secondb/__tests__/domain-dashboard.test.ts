// 생활 여섯 영역이 **별자리에서 내려와 대시보드로 갔다** (Simon 결정 3/6, Step 3).
//
// 방향이 반대인 두 층을 갈라놓는 것이 이 단계의 요점이다:
//   별       = 나를 **알아가는** 자리 (시기 · 직장 · 지금)
//   대시보드 = 알아낸 것을 **쓰는** 자리 (커리어 · 재정 · 성장 · 관계 · 건강 · 휴식)
//
// 둘이 같은 화면에 별로 나란히 있어서 Simon 조차 "지금 렌즈가 맞는거야 별이
// 맞는거야?" 를 묻게 됐다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOMAIN_STARS } from "@/lib/persona/domain-stars";
import { HOME_STAR_IDS } from "@/lib/persona/home-stars";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const PANEL = read("src/components/secondb/DomainDashboard.tsx");
const SHELL = read("src/components/deep-space/DeepSpaceShell.tsx");
const CHAT = read("src/app/secondb.tsx");

describe("입구는 세컨비 머리다 (Simon 결정 6 = B)", () => {
  it("머리를 누르면 대시보드를 편 대화창이 열린다", () => {
    expect(SHELL).toContain('router.push("/secondb?panel=dashboard")');
  });

  it("대화창이 그 표시를 읽는다", () => {
    expect(CHAT).toContain('params.panel === "dashboard"');
    expect(CHAT).toContain("<DomainDashboard");
  });

  it("캐릭터 대화에는 안 뜬다 (그쪽은 세컨비의 자리가 아니다)", () => {
    expect(CHAT).toContain('params.panel === "dashboard" && !characterParam');
  });

  it("접을 수 있다 -- 매번 같은 판을 보고 시작하게 만들지 않는다", () => {
    expect(CHAT).toContain("onDismiss={() => setShowDashboard(false)}");
  });
});

describe("무엇이 실리는가", () => {
  it("생활 여섯이다 -- 담아내기는 빠진다", () => {
    // 담아내기는 생활 영역이 아니라 데이터가 흘러드는 통로다. 홈에도 그려진
    // 적이 없고, 여기서 한 칸을 차지하면 다른 것을 같은 줄에 세우는 셈이 된다.
    expect(PANEL).toContain('DOMAIN_STARS.filter((d) => d.id !== "collect")');
    expect(DOMAIN_STARS.filter((d) => d.id !== "collect")).toHaveLength(6);
  });

  it("⚠ 이 여섯 중 어느 것도 홈 별이 아니다", () => {
    for (const d of DOMAIN_STARS) {
      expect(HOME_STAR_IDS as readonly string[]).not.toContain(d.id);
    }
  });

  it("자세히는 기존 도메인 화면이 그대로 맡는다", () => {
    // 여기서 다 펼치면 화면 하나에 하나만 말한다는 규율이 깨진다.
    expect(PANEL).toContain("router.push(`/star/${d.id}`)");
  });

  it("못 읽으면 어두운 채로 둔다 -- 지어내지 않는다", () => {
    expect(PANEL).toMatch(/\.catch\(\(\) => \{\}\)/);
    expect(PANEL).toContain("levels?.[d.id] ?? 1");
  });
});

describe("좁은 화면에서 넘치지 않는다", () => {
  it("막대가 남은 폭을 flex 로 가져간다 (고정폭은 이름 칸뿐)", () => {
    expect(PANEL).toMatch(/track:\s*\{\s*flex:\s*1/);
  });
});
