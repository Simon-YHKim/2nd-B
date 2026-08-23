// 되돌릴 수 있는 것이 **근거가 있는 것과 일치하는가.**
//
// 이 파일이 막는 두 가지:
//  1. 근거 없는 축이 비준 대상으로 나가는 것 -- 앱이 지어낸 값을 사용자에게
//     승인시키는 꼴이고, propose->ratify 가 막으려던 바로 그 일이다.
//  2. 화면이 다시 한 축만 하드코딩하는 것 -- 원래 상태가 그랬다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PersonaCard } from "../build";
import { hasNothingToRatify, ratifiableTargets } from "../ratifiable";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const card = (over: Partial<PersonaCard> = {}): PersonaCard =>
  ({
    version: 1,
    traits: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
    traitsSource: "heuristic",
    mbti: null,
    attachment: null,
    values: [],
    patterns: {},
    markdownExport: "",
    ...over,
  }) as PersonaCard;

const starsOf = (c: PersonaCard) =>
  ratifiableTargets(c).map((r) => (r.target.kind === "star" ? r.target.star : r.target.kind));

describe("근거가 없으면 되돌릴 것도 없다", () => {
  it("빈 카드는 아무것도 안 내놓는다", () => {
    expect(ratifiableTargets(card())).toEqual([]);
    expect(hasNothingToRatify(card())).toBe(true);
  });

  it("일기 텍스트 추정(heuristic)은 비준 대상이 아니다", () => {
    // 사용자가 답한 값이 아니라 앱이 글에서 짐작한 값이다. 짐작을 비준시키면
    // 그 짐작이 "사용자 승인을 받은 사실" 로 굳는다.
    expect(starsOf(card({ traitsSource: "heuristic" }))).not.toContain("now");
  });

  it.each(["bfi", "ipip"] as const)("측정된 Big Five(%s)는 비준 대상이다", (src) => {
    expect(starsOf(card({ traitsSource: src }))).toContain("now");
  });

  it("애착은 ECR-S 를 실제로 했을 때만", () => {
    expect(starsOf(card())).not.toContain("relational");
    const withEcr = card({ attachment: { style: "secure", anxiety: 2.1, avoidance: 1.8 } });
    expect(starsOf(withEcr)).toContain("relational");
  });

  it("가치는 프레임워크가 하나라도 잡혔을 때만", () => {
    expect(starsOf(card({ values: [] }))).not.toContain("values");
    expect(starsOf(card({ values: ["자기주도"] }))).toContain("values");
  });
});

describe("어느 도구에서 왔는지 밝힌다", () => {
  it("BFI-44 와 IPIP-NEO-120 을 구분한다", () => {
    expect(ratifiableTargets(card({ traitsSource: "bfi" }))[0].sourceAssessmentId).toBe("bfi44");
    expect(ratifiableTargets(card({ traitsSource: "ipip" }))[0].sourceAssessmentId).toBe("ipipNeo120");
  });

  it("출처 id 가 assess 레지스트리의 id 와 같다", () => {
    // 두 레이어가 문자열로만 이어져 있으므로(페르소나가 assess 를 import 하지
    // 않는다) 여기서 대조한다. 한쪽 이름이 바뀌면 조용히 갈라진다.
    const registry = read("src/lib/assess/registry.ts");
    const full = card({
      traitsSource: "ipip",
      attachment: { style: "secure", anxiety: 2, avoidance: 2 },
      values: ["x"],
    });
    for (const rt of ratifiableTargets(full)) {
      expect(registry).toContain(`id: "${rt.sourceAssessmentId}"`);
    }
  });
});

describe("셋 다 있으면 셋 다 나온다", () => {
  const full = card({
    traitsSource: "bfi",
    // 회피는 낮고 불안이 높은 전형적인 preoccupied 값.
    attachment: { style: "preoccupied", anxiety: 4.2, avoidance: 2.0 },
    values: ["growth", "relation"],
  });

  it("세 축이 전부 후보다", () => {
    expect(starsOf(full)).toEqual(["now", "relational", "values"]);
  });

  it("되돌릴 것이 있다", () => {
    expect(hasNothingToRatify(full)).toBe(false);
  });
});

describe("화면이 한 축만 하드코딩하지 않는다", () => {
  // 원래 상태: `/review`(딥스페이스) 와 legacy 둘 다 `{ kind: "star", star:
  // "now" }` 를 박아둬서 Big Five 하나만 이의를 제기할 수 있었다. 애착과 가치는
  // 결과를 내고 페르소나에 들어가는데 되돌릴 자리가 없었다.
  const src = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");

  it("배포되는 비준 화면이 ratifiableTargets 를 쓴다", () => {
    expect(src).toContain("ratifiableTargets");
  });

  it("별을 손으로 안 박는다", () => {
    expect(src).not.toContain('{ kind: "star", star: "now" }');
    expect(src).not.toContain('proposalContextForStar(card, "now")');
  });

  it("되돌릴 것이 없을 때 빈 화면 대신 안내를 낸다", () => {
    expect(src).toContain("reviewNothingToReview");
  });

  it("축 라벨이 로케일 5종에 다 있다", () => {
    const keys = ["reviewAxisNow", "reviewAxisRelational", "reviewAxisValues", "reviewNothingToReview"];
    for (const locale of ["en", "ko", "es", "id", "pt"]) {
      const dict = JSON.parse(read(`locales/${locale}/deepspace.json`));
      for (const k of keys) expect(typeof dict[k]).toBe("string");
    }
  });
});
