// 시기 별 비준 제안의 재료가 **규율을 지키는가.**
//
// 지키는 규율 둘: ① 근거가 있는 것만 후보가 된다 (충분히 판 별 + 실제 인터뷰
// 원문) ② 인용은 record:<id> 만 (0060). 어느 쪽이 무너져도 "앱이 지어낸 값을
// 사용자에게 승인시키는" 바로 그 일이 된다.
const coverageByUser: Record<string, Record<string, Record<string, number>>> = {};
const recordRows: { id: string; prompt: string | null; body: string | null; created_at: string }[] = [];
const eqCalls: { column: string; value: unknown }[] = [];
const containsCalls: { column: string; value: unknown }[] = [];
// 0218 이 적용되지 않은 데이터베이스를 흉내 낸다: system_tags 를 부르면 42703.
let mockNoSystemTagsColumn = false;

jest.mock("../../interview/coverage-store", () => ({
  loadCoverage: async (userId: string) => {
    const base: Record<string, Record<string, number>> = {};
    for (const p of ["infancy", "school", "twenties", "later", "work", "now"]) {
      base[p] = { fact: 0, feeling: 0, meaning: 0, belief: 0, echo: 0 };
    }
    const stored = coverageByUser[userId];
    if (stored) for (const p of Object.keys(stored)) Object.assign(base[p], stored[p]);
    return base;
  },
}));

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => {
      let namesSystemTags = false;
      const node: Record<string, unknown> = {
        select: () => node,
        eq: (column: string, value: unknown) => {
          eqCalls.push({ column, value });
          return node;
        },
        contains: (column: string, value: unknown) => {
          containsCalls.push({ column, value });
          if (column === "system_tags") namesSystemTags = true;
          return node;
        },
        order: () => node,
        limit: () =>
          Promise.resolve(
            mockNoSystemTagsColumn && namesSystemTags
              ? { data: null, error: { code: "42703", message: "column records.system_tags does not exist" } }
              : { data: recordRows, error: null },
          ),
      };
      return node;
    },
  }),
}));

import {
  SEVEN_RATIFY_MIN_CELLS,
  buildSevenProposalContext,
  sevenRatifiableTargets,
} from "../seven-proposal-context";

beforeEach(() => {
  for (const k of Object.keys(coverageByUser)) delete coverageByUser[k];
  recordRows.length = 0;
  eqCalls.length = 0;
  containsCalls.length = 0;
  mockNoSystemTagsColumn = false;
});

describe("후보 게이트 — 충분히 판 별만", () => {
  it("아무것도 안 팠으면 후보가 없다", async () => {
    expect(await sevenRatifiableTargets("u1")).toEqual([]);
  });

  it("한 층만 판 별은 후보가 아니다 (사건 목록으로 사람을 요약하게 된다)", async () => {
    coverageByUser.u1 = { school: { fact: 3 } };
    expect(await sevenRatifiableTargets("u1")).toEqual([]);
    expect(SEVEN_RATIFY_MIN_CELLS).toBe(2);
  });

  it("두 층 이상 판 별이 후보가 된다", async () => {
    coverageByUser.u1 = { school: { fact: 2, feeling: 1 }, work: { fact: 1 } };
    const targets = await sevenRatifiableTargets("u1");
    expect(targets).toEqual([{ star: "school", period: "school", cells: 2 }]);
  });

  it("⚠ 프로필은 절대 후보가 아니다 — 인터뷰가 없는 별이다", async () => {
    coverageByUser.u1 = {};
    for (const p of ["infancy", "school", "twenties", "later", "work", "now"]) {
      coverageByUser.u1[p] = { fact: 1, feeling: 1, meaning: 1 };
    }
    const targets = await sevenRatifiableTargets("u1");
    expect(targets).toHaveLength(6);
    expect(targets.map((t) => t.star)).not.toContain("profile");
  });

  it("로그인 전에는 빈 목록", async () => {
    expect(await sevenRatifiableTargets("")).toEqual([]);
  });
});

describe("제안 재료", () => {
  beforeEach(() => {
    coverageByUser.u1 = { school: { fact: 2, feeling: 1 } };
    recordRows.push(
      { id: "r-1", prompt: "고3 때 어땠어요?", body: "재수를 고민했다", created_at: "2026-08-01" },
      { id: "r-2", prompt: null, body: "친구들과 밴드를 했다", created_at: "2026-08-02" },
    );
  });

  it("그 시기의 인터뷰 기록만 질의한다 (audit_period + 앱 표식 칸의 interview)", async () => {
    await buildSevenProposalContext("u1", "school", "ko");
    expect(eqCalls).toContainEqual({ column: "audit_period", value: "school" });
    expect(eqCalls).toContainEqual({ column: "kind", value: "audit_response" });
    // 0218: 인터뷰 표식은 앱 표식 칸에 있다. 사용자 태그 칸은 묻지 않는다 —
    // 사용자가 단 `interview` 태그는 인터뷰가 아니다.
    expect(containsCalls).toEqual([{ column: "system_tags", value: ["interview"] }]);
  });

  it("앱 표식 칸이 없는 데이터베이스(0218 이전)에서는 한 번 tags 로 다시 묻는다", async () => {
    mockNoSystemTagsColumn = true;
    const ctx = await buildSevenProposalContext("u1", "school", "ko");
    expect(containsCalls).toEqual([
      { column: "system_tags", value: ["interview"] },
      { column: "tags", value: ["interview"] },
    ]);
    expect(ctx).not.toBeNull();
  });

  it("인용이 전부 record:<id> 다 (0060 을 통과하는 유일한 꼴)", async () => {
    const ctx = await buildSevenProposalContext("u1", "school", "ko");
    expect(ctx).not.toBeNull();
    expect(ctx!.evidenceRefs).toEqual(["record:r-1", "record:r-2"]);
    expect(ctx!.evidence).toContain("재수를 고민했다");
  });

  it("현재 등급은 커버리지 사다리에서 온다 (2층 = L3)", async () => {
    const ctx = await buildSevenProposalContext("u1", "school", "ko");
    expect(ctx!.currentLevel).toBe(3);
  });

  it("⚠ 커버리지는 있는데 원문이 없으면 제안하지 않는다", async () => {
    recordRows.length = 0;
    expect(await buildSevenProposalContext("u1", "school", "ko")).toBeNull();
  });

  it("문턱 미달 별은 재료도 안 만든다", async () => {
    expect(await buildSevenProposalContext("u1", "work", "ko")).toBeNull();
  });

  it("프로필은 재료가 없다", async () => {
    expect(await buildSevenProposalContext("u1", "profile", "ko")).toBeNull();
  });
});
