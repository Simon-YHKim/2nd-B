// 세션 01(2026-05, Simon 자기분석 실전 한 판)에서 실증된 카피 네 건이
// 화면에 실재하는지. 근거는 그 대화에서 실제로 작동한 기법이다:
//
//   ① "모르겠다도 데이터" 선언 -- 답을 꾸미려는 압력을 낮춘다
//   ② 발판 문구가 같은 취지를 나른다
//   ③ 이른 시기 씨앗 질문은 감각 앵커형 -- "말이 안 되어도 됨"
//   ④ 거절 결과가 명시적 철회로 읽힌다 + 시트가 거울 카피를 갖는다
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { seedQuestion } from "../probe";
import { formatProposalForDisplay } from "../../persona/proposal-display";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

describe("① 인트로 선언", () => {
  it("다섯 로케일에 drill.intro 가 있고 '모르겠다' 취지를 나른다", () => {
    for (const loc of LOCALES) {
      const d = JSON.parse(read(`locales/${loc}/interview.json`)) as { drill: Record<string, string> };
      expect(typeof d.drill.intro).toBe("string");
      expect(d.drill.intro.length).toBeGreaterThan(10);
    }
    const ko = JSON.parse(read("locales/ko/interview.json")) as { drill: Record<string, string> };
    expect(ko.drill.intro).toContain("모르겠다");
  });

  it("화면이 그 키를 실제로 그린다", () => {
    expect(read("src/app/interview.tsx")).toContain('t("drill.intro")');
  });
});

describe("② 발판 문구", () => {
  it("scaffoldNote 가 '모르겠다도 데이터' 취지를 나른다 (ko)", () => {
    const ko = JSON.parse(read("locales/ko/interview.json")) as { drill: Record<string, string> };
    expect(ko.drill.scaffoldNote).toContain("데이터");
  });
});

describe("③ 감각 앵커 씨앗", () => {
  it("영유아기·학창시절 씨앗이 감각 어휘를 담는다 (ko)", () => {
    const infancy = seedQuestion("infancy", "ko");
    const school = seedQuestion("school", "ko");
    // 감각 앵커의 정의: 장면 서사가 아니라 감각 채널을 직접 부른다.
    expect(infancy).toMatch(/빛|냄새|소리|자세/);
    expect(school).toMatch(/냄새|소리|자리/);
    // "말이 안 되어도 됨" -- 세션 01 의 핵심 허가 문장.
    expect(infancy).toContain("말이 안 되어도");
  });

  it("en 도 감각 앵커형이다", () => {
    expect(seedQuestion("infancy", "en")).toMatch(/light|smell|sound/);
    expect(seedQuestion("school", "en")).toMatch(/smell|sound|seat/);
  });
});

describe("④ 거절 철회 + 거울 카피", () => {
  it("시트가 mirrorNote 를 갖고 그린다", () => {
    const d = formatProposalForDisplay(
      {
        target: { kind: "sevenStar", star: "school" },
        before: "b", after: "a", rationale: "r", citations: [], targetLevel: 5,
      },
      "ko",
    );
    expect(d.mirrorNote).toContain("거울");
    expect(read("src/components/persona/RatifySheet.tsx")).toContain("d.mirrorNote");
  });

  it("⚠ sevenStar 제안이 시트에서 오라벨되지 않는다", () => {
    // 분기가 없으면 폴백이 "북극성 (철학)" 으로 오라벨 -- 사용자가 엉뚱한 것을
    // 승인하는 줄 알게 된다.
    const d = formatProposalForDisplay(
      { target: { kind: "sevenStar", star: "school" }, before: "b", after: "a", rationale: "r", citations: [], targetLevel: 5 },
      "ko",
    );
    expect(d.targetLabel).toContain("school");
    expect(d.targetLabel).not.toContain("철학");
  });

  it("거절 결과줄이 철회로 읽힌다 (딥스페이스 5로케일 + 레거시)", () => {
    for (const loc of LOCALES) {
      const d = JSON.parse(read(`locales/${loc}/deepspace.json`)) as Record<string, string>;
      expect(d.reviewLeftAsIs.length).toBeGreaterThan(10);
    }
    const ko = JSON.parse(read("locales/ko/deepspace.json")) as Record<string, string>;
    expect(ko.reviewLeftAsIs).toContain("기록에 남지 않습니다");
    expect(read("src/app/review.tsx")).toContain("기록에 남지 않습니다");
  });
});
