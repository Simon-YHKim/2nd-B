// 비준(propose->ratify)만이 L5 로 가는 길이고, **옛 축의 비준은 새 별을 못 밝힌다.**
//
// 두 번째 절이 이 파일의 이유다. 원장의 `now` 는 두 뜻을 가질 수 있어서, 필터 한
// 줄이 빠지면 "지금의 나"(특성 상태)를 비준한 사람이 "지금"(현재의 나) 별이
// 저절로 최고 등급으로 켜진 하늘을 본다. 아무 오류 없이.
const rows: { star_id: string; level: number; evidence_origin: string }[] = [];
const filters: { column: string; value: unknown }[] = [];

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => {
      const node: Record<string, unknown> = {
        select: () => node,
        eq: (column: string, value: unknown) => {
          filters.push({ column, value });
          return node;
        },
        order: () => Promise.resolve({ data: rows, error: null }),
      };
      return node;
    },
  }),
}));

import { loadSevenRatified, tierKey } from "../seven-tier-history";

beforeEach(() => {
  rows.length = 0;
  filters.length = 0;
});

describe("서 있는 비준 등급", () => {
  it("비준 행이 없으면 아무것도 안 준다", async () => {
    expect(await loadSevenRatified("u1")).toEqual({});
  });

  it("새 별의 비준을 읽는다", async () => {
    rows.push({ star_id: tierKey("school"), level: 5, evidence_origin: "ratify" });
    expect(await loadSevenRatified("u1")).toEqual({ school: 5 });
  });

  it("⚠ 옛 축의 비준은 무시한다 -- 글자가 같아도 다른 별이다", async () => {
    rows.push({ star_id: "now", level: 5, evidence_origin: "ratify" });
    expect(await loadSevenRatified("u1")).toEqual({});
  });

  it("최신 비준이 앞선 것을 덮는다 (읽기가 최신 우선)", async () => {
    rows.push(
      { star_id: tierKey("work"), level: 3, evidence_origin: "ratify" },
      { star_id: tierKey("work"), level: 5, evidence_origin: "ratify" },
    );
    expect(await loadSevenRatified("u1")).toEqual({ work: 3 });
  });

  it("등급이 범위를 벗어나도 1~5 로 잘린다", async () => {
    rows.push(
      { star_id: tierKey("now"), level: 9, evidence_origin: "ratify" },
      { star_id: tierKey("infancy"), level: 0, evidence_origin: "ratify" },
    );
    expect(await loadSevenRatified("u1")).toEqual({ now: 5, infancy: 1 });
  });

  it("rebuild 행을 섞어 읽지 않는다 (질의가 ratify 로 좁힌다)", async () => {
    await loadSevenRatified("u1");
    expect(filters).toContainEqual({ column: "evidence_origin", value: "ratify" });
    expect(filters).toContainEqual({ column: "user_id", value: "u1" });
  });

  it("로그인 전에는 읽지 않는다", async () => {
    expect(await loadSevenRatified("")).toEqual({});
    expect(filters).toHaveLength(0);
  });
});
