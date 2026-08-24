// 새 일곱 별의 L5 경로가 **끝까지 이어져 있는가** — 그리고 옛 경로와 섞이지 않는가.
//
// 이 경로는 다섯 부품으로 돼 있다: 타입 자리(proposal.ts) → 프롬프트 라벨
// (propose-self-model.ts) → 재료(seven-proposal-context.ts) → 화면 분기
// (DeepSpaceReviewScreen) → 원장 쓰기(recordSevenTiers + seven: 접두사).
// 하나라도 빠지면 "비준했는데 별이 안 밝아지는" 조용한 반쪽이 된다 — #1377 의
// 리프트가 그렇게 사라졌던 전례가 있어서, 이 파일이 이음매를 전부 짚는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildSelfModelProposalPrompt } from "../propose-self-model";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const SCREEN = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");

describe("프롬프트가 시기 별을 시기 별이라고 부른다", () => {
  it("sevenStar 라벨이 life-period 다 (폴백으로 새면 철학 문장으로 오라벨된다)", () => {
    const { system } = buildSelfModelProposalPrompt(
      { kind: "sevenStar", star: "school" },
      "before",
      "evidence",
      "en",
    );
    expect(system).toContain('life-period star "school"');
    expect(system).not.toContain("philosophy sentence");
  });

  it("옛 축 라벨은 그대로다 (병렬 유지)", () => {
    const { system } = buildSelfModelProposalPrompt(
      { kind: "star", star: "now" },
      "before",
      "evidence",
      "en",
    );
    expect(system).toContain('self-understanding star "now"');
  });
});

describe("화면 분기", () => {
  it("시기 별 후보를 로드하고 그린다", () => {
    expect(SCREEN).toContain("sevenRatifiableTargets(userId)");
    expect(SCREEN).toContain("generateSeven");
    // 이름은 홈과 같은 키에서 -- 화면마다 다른 이름 금지.
    expect(SCREEN).toContain("tHome(`ds.star.${getSevenStar(st.star).key}`)");
  });

  it("⚠ 비준 쓰기가 seven 경로로만 나간다", () => {
    // recordStarTiers 로 새 별을 적으면 접두사가 빠져 옛 축과 같은 칸에 들어가고,
    // activation_milestone 이 조용히 틀린 숫자로 나간다.
    expect(SCREEN).toMatch(
      /proposal\?\.target\.kind === "sevenStar"[\s\S]{0,900}?recordSevenTiers\(userId, \{ \[proposal\.target\.star\]: r\.resultingLevel \}, "ratify", evidenceRefs\)/,
    );
    const sevenBranch = /if \(decision === "ratify" && userId && proposal\?\.target\.kind === "sevenStar"\) \{[\s\S]*?\n    \}/.exec(SCREEN)?.[0] ?? "";
    expect(sevenBranch.length).toBeGreaterThan(0);
    // 주석은 걷는다 -- "recordStarTiers 재사용 금지" 라는 설명 문장 자체는 있어야
    // 하고(재발을 막는 건 그 설명이다), 막는 것은 **코드에서 부르는 것**이다.
    const code = sevenBranch
      .split("\n")
      .filter((line: string) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(code).not.toContain("recordStarTiers");
  });

  it("옛 축 분기는 그대로 산다 (검사 기반 비준을 걷어내지 않았다)", () => {
    expect(SCREEN).toContain("ratifiableTargets");
    expect(SCREEN).toMatch(/proposal\?\.target\.kind === "star"[\s\S]{0,600}?recordStarTiers\(/);
  });

  it("빈 상태는 두 후보군이 다 비었을 때만", () => {
    expect(SCREEN).toContain("targets.length === 0 && sevenTargets.length === 0");
  });
});

describe("원장 쓰기가 인용을 나른다 (0060)", () => {
  const src = read("src/lib/persona/seven-tier-history.ts");

  it("citations 파라미터가 있고 sanitize 를 통과한다", () => {
    expect(src).toContain("citations?: readonly string[]");
    expect(src).toContain("sanitizeCitations(citations)");
    expect(src).toContain("evidence_citations: cleanCitations");
  });
});
