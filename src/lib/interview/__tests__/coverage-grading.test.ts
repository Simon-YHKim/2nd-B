// 회상 별이 **회상을 재는가.**
//
// 2026-08-24 이전: `card.patterns` 에 `top_*` 키가 있으면 L2, 아니면 L1. 그 키는
// 저널 패턴 추출에서 나오고 인터뷰와 아무 상관이 없다 -- 회상 별이 회상을 재고
// 있지 않았다. 그걸 재려고 만든 `narrativeStarLevel` 은 호출부가 0건이었고,
// 이유는 커버리지가 어디에도 저장되지 않았기 때문이다(0143 이 고침).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { deriveStarLevels } from "../../persona/star-levels";
import type { PersonaCard } from "../../persona/build";

const MIGRATION = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0143_interview_coverage.sql"),
  "utf8",
);
const STORE = readFileSync(join(__dirname, "..", "coverage-store.ts"), "utf8");
const SCREEN = readFileSync(join(__dirname, "..", "..", "..", "app", "interview.tsx"), "utf8");
const BUILD = readFileSync(join(__dirname, "..", "..", "persona", "build.ts"), "utf8");

/** 등급 계산에 필요한 최소한의 카드. 나머지 별은 이 테스트의 관심이 아니다. */
function cardWith(patterns: Record<string, unknown>): PersonaCard {
  return {
    traits: {},
    patterns,
    values: [],
    rows: [],
  } as unknown as PersonaCard;
}

describe("회상 별이 인터뷰에서 나온다", () => {
  it("커버리지 등급이 있으면 그것을 쓴다", () => {
    const card = cardWith({});
    expect(deriveStarLevels(card, 0, {}, 4).recall).toBe(4);
    expect(deriveStarLevels(card, 0, {}, 3).recall).toBe(3);
  });

  it("⚠ 옛 top_* 신호를 **이긴다** (그게 이 변경의 요점)", () => {
    // top_* 가 있으면 예전에는 무조건 L2 였다. 인터뷰를 깊게 했으면 더 높아야 하고,
    // 인터뷰를 얕게 했으면 top_* 때문에 부풀어서는 안 된다.
    const withPatterns = cardWith({ top_kind: 3 });
    expect(deriveStarLevels(withPatterns, 0, {}, 4).recall).toBe(4);
    expect(deriveStarLevels(withPatterns, 0, {}, 1).recall).toBe(1);
  });

  it("인터뷰 기록이 없으면(null) 기존 신호로 떨어진다", () => {
    // 없는 것을 L1 로 단정하지 않는다. 저널만 쓴 사용자의 밝기를 깎으면 안 된다.
    expect(deriveStarLevels(cardWith({ top_kind: 3 }), 0, {}, null).recall).toBe(2);
    expect(deriveStarLevels(cardWith({}), 0, {}, null).recall).toBe(1);
  });

  it("비준된 등급은 여전히 이긴다 (F8 규율 유지)", () => {
    // propose->ratify 가 L5 로 가는 유일한 길이고, 재빌드가 그걸 되돌리면 안 된다.
    expect(deriveStarLevels(cardWith({}), 0, { recall: 5 }, 2).recall).toBe(5);
  });
});

describe("커버리지가 저장된다 (0143)", () => {
  it("테이블이 (사용자, 시기, 층) 을 키로 갖는다", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS public.interview_coverage");
    expect(MIGRATION).toContain("PRIMARY KEY (user_id, period, layer)");
    expect(MIGRATION).toContain("CHECK (answers >= 0)");
  });

  it("RLS 와 **테이블 GRANT 가 둘 다** 있다", () => {
    // 0139 는 정책만 있고 GRANT 가 빠져서 로그인이 전원 500 이 났다.
    expect(MIGRATION).toContain("ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).toMatch(/CREATE POLICY interview_coverage_select_own/);
    expect(MIGRATION).toMatch(/CREATE POLICY interview_coverage_insert_own/);
    expect(MIGRATION).toMatch(/CREATE POLICY interview_coverage_update_own/);
    expect(MIGRATION).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE public.interview_coverage TO authenticated");
    expect(MIGRATION).toContain("REVOKE ALL ON TABLE public.interview_coverage FROM anon");
    // ⚠ 기본 권한이 새 테이블에 authenticated 로 ALL 을 준다. 세 개를 "주는" 것으로는
    // 나머지를 못 빼앗는다 -- 적용 직후 실측에서 DELETE·TRUNCATE 가 들어 있었다.
    expect(MIGRATION).toContain(
      "REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.interview_coverage FROM authenticated",
    );
  });

  it("정책이 전부 자기 행으로 묶여 있다", () => {
    const policies = MIGRATION.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThanOrEqual(3);
    for (const p of policies) expect(p).toContain("auth.uid()");
  });

  it("계정 삭제가 따라간다", () => {
    expect(MIGRATION).toContain("ON DELETE CASCADE");
  });

  it("답변 원문 컬럼이 없다 (칸 수만 센다)", () => {
    const table = /CREATE TABLE[\s\S]*?\);/.exec(MIGRATION)?.[0] ?? "";
    expect(table.length).toBeGreaterThan(0);
    for (const forbidden of ["body", "text NOT NULL DEFAULT", "answer_text", "transcript"]) {
      expect(table).not.toContain(forbidden);
    }
  });
});

describe("저장·읽기가 막지 않는다 (fail-soft)", () => {
  it("읽기 실패는 빈 행렬이다", () => {
    expect(STORE).toContain("catch {\n    return cov;\n  }");
  });

  it("더할 때 저장된 값 위에 얹는다 (덮어쓰지 않는다)", () => {
    // 여러 기기·여러 세션이 각자 판 것을 서로 지우면 안 된다.
    expect(STORE).toContain("answers: stored[p][l] + add");
    expect(STORE).toContain('onConflict: "user_id,period,layer"');
  });

  it("화면이 **이번에 판 만큼만** 더한다", () => {
    expect(SCREEN).toContain("coverage[p][l] - baseCoverage.current[p][l]");
    expect(SCREEN).toContain("addCoverage(userId, delta)");
  });

  it("지난 세션 커버리지를 이어받는다", () => {
    expect(SCREEN).toContain("loadCoverage(userId).then((stored)");
    expect(SCREEN).toContain("baseCoverage.current = stored");
  });

  it("빌드가 커버리지 등급을 넘긴다", () => {
    expect(BUILD).toContain("loadNarrativeStarLevel(userId)");
    expect(BUILD).toContain("deriveStarLevels(persona, esmCount, standingRatified, narrativeLevel)");
  });
});
