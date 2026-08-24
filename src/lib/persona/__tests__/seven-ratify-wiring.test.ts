// 비준 리프트가 **실제로 배선돼 있는가.**
//
// 이 검사가 존재하는 이유는 정확히 한 번 일어난 사고다: #1377 작업 중 변이
// 검증의 복구 명령(git checkout <file>)이 변이만이 아니라 **그 파일에 새로
// 넣은 리프트 배선까지** 되돌렸다. loadSevenRatified 의 단위 테스트는 함수
// 자체만 봤으므로 전부 초록이었고, 배선이 사라진 채 머지됐다.
//
// 교훈: 단위가 초록이어도 배선은 따로 지켜야 한다. 여기가 그 자리다.
const calls: string[] = [];

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      const node: Record<string, unknown> = {
        select: () => node,
        eq: (col: string, v: unknown) => {
          if (col === "evidence_origin") calls.push(String(v));
          return node;
        },
        order: () =>
          Promise.resolve({
            data: [{ star_id: "seven:school", level: 5, evidence_origin: "ratify" }],
            error: null,
          }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        contains: () => node,
        then: (...a: unknown[]) =>
          Promise.resolve({ data: [], error: null }).then(
            ...(a as Parameters<Promise<{ data: never[]; error: null }>["then"]>),
          ),
      };
      return node;
    },
  }),
}));

import { loadSevenLevels } from "../load-seven-levels";

describe("loadSevenLevels 가 비준을 실제로 읽는다", () => {
  it("ratify 질의가 나간다 (배선이 있다)", async () => {
    await loadSevenLevels("u1");
    expect(calls).toContain("ratify");
  });

  it("⚠ 비준된 별이 L5 로 끌려 올라간다 -- 커버리지로는 절대 못 가는 등급", async () => {
    const { starLevels } = await loadSevenLevels("u1");
    expect(starLevels.school).toBe(5);
  });

  it("비준 없는 별은 그대로 어둡다", async () => {
    const { starLevels } = await loadSevenLevels("u1");
    expect(starLevels.work).toBe(1);
  });
});
