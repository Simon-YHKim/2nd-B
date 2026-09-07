// `findSurvivingSourceIds` is the question a short delete count cannot answer.
//
// deleteSourcesByIds removes what it can and returns the count. Fewer rows than
// asked can mean "already gone" (fine, withdraw) or "still there" (never drop
// the pointer). The two withdrawal screens now ask this before removing the log
// entry, and only when the count came up short.

const state: { rows: { id: string }[]; error: unknown; lastQuery: Record<string, unknown> } = {
  rows: [],
  error: null,
  lastQuery: {},
};

jest.mock("../../supabase/client", () => {
  const from = jest.fn((table: string) => {
    state.lastQuery = { table };
    const chain: Record<string, unknown> = {
      select: (columns: string) => { state.lastQuery.columns = columns; return chain; },
      eq: (column: string, value: unknown) => { state.lastQuery[`eq:${column}`] = value; return chain; },
      in: (column: string, values: unknown) => { state.lastQuery[`in:${column}`] = values; return chain; },
      then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
        resolve({ data: state.error ? null : state.rows, error: state.error }),
    };
    return chain;
  });
  return { getSupabaseClient: () => ({ from }) };
});

import { findSurvivingSourceIds } from "../delete-bulk";

beforeEach(() => {
  state.rows = [];
  state.error = null;
  state.lastQuery = {};
});

test("남아 있는 id 만 돌려준다", async () => {
  state.rows = [{ id: "s4" }, { id: "s5" }];
  await expect(findSurvivingSourceIds("u1", ["s1", "s2", "s3", "s4", "s5"]))
    .resolves.toEqual(["s4", "s5"]);
});

test("아무것도 안 남았으면 빈 배열이다 - 이미 지워진 경우", async () => {
  state.rows = [];
  await expect(findSurvivingSourceIds("u1", ["s1", "s2"])).resolves.toEqual([]);
});

test("빈 목록에는 질의하지 않는다", async () => {
  await expect(findSurvivingSourceIds("u1", [])).resolves.toEqual([]);
  expect(state.lastQuery).toEqual({});
});

test("소유자 범위로 묶고 이 id 들만 본다", async () => {
  // 소유자 범위가 빠지면 남의 행을 보고 "남아 있다" 고 말한다.
  state.rows = [];
  await findSurvivingSourceIds("u1", ["s1", "s2"]);
  expect(state.lastQuery).toMatchObject({
    table: "sources",
    "eq:user_id": "u1",
    "in:id": ["s1", "s2"],
  });
});

test("오류는 삼키지 않고 던진다 - 모른다를 '없다'로 바꾸지 않는다", async () => {
  // 여기서 [] 를 돌려주면 호출부가 "남은 것 없음" 으로 읽고 포인터를 버린다.
  state.error = { message: "rls" };
  await expect(findSurvivingSourceIds("u1", ["s1"])).rejects.toBeDefined();
});
