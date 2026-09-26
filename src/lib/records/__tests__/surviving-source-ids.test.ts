// `findSurvivingSourceIds` is the question a short delete count cannot answer.
//
// deleteSourcesByIds removes what it can and returns the count. Fewer rows than
// asked can mean "already gone" (fine, withdraw) or "still there" (never drop
// the pointer). The two withdrawal screens now ask this before removing the log
// entry, and only when the count came up short.
//
// R30 (JA-1839-3): 이 질문도 시작한 세션에 묶인다. 다른 세션으로 나가면 RLS 가 이 행들을 숨겨 빈 답이
// 돌아오고, 호출부는 그것을 '다 지워졌다'로 읽어 포인터를 버린다. 그래서 세션이 소유자가 아니면 묻지 않고,
// 답을 받은 뒤 세션이 바뀌었으면 답을 버리고 던진다. mock 에 auth(세션 id 가 든 토큰)를 더한 까닭이다.

const state: {
  rows: { id: string }[];
  error: unknown;
  lastQuery: Record<string, unknown>;
  session: { userId: string; sessionId: string } | null;
  onQuery: (() => void) | null;
} = {
  rows: [],
  error: null,
  lastQuery: {},
  session: { userId: "u1", sessionId: "session-u1" },
  onQuery: null,
};

jest.mock("../../supabase/client", () => {
  const from = jest.fn((table: string) => {
    state.lastQuery = { table };
    const chain: Record<string, unknown> = {
      select: (columns: string) => { state.lastQuery.columns = columns; return chain; },
      eq: (column: string, value: unknown) => { state.lastQuery[`eq:${column}`] = value; return chain; },
      in: (column: string, values: unknown) => { state.lastQuery[`in:${column}`] = values; return chain; },
      then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
        state.onQuery?.();
        return resolve({ data: state.error ? null : state.rows, error: state.error });
      },
    };
    return chain;
  });
  const token = (session: { userId: string; sessionId: string }) =>
    `header.${Buffer.from(JSON.stringify({ sub: session.userId, session_id: session.sessionId })).toString("base64url")}.sig`;
  const auth = {
    getSession: async () => ({
      data: { session: state.session ? { access_token: token(state.session), user: { id: state.session.userId } } : null },
      error: null,
    }),
    signOut: async () => ({ error: null }),
  };
  return { getSupabaseClient: () => ({ from, auth }) };
});

import { findSurvivingSourceIds } from "../delete-bulk";
import { AuthSessionOwnerChangedError } from "../../auth/session-mutation";

beforeEach(() => {
  state.rows = [];
  state.error = null;
  state.lastQuery = {};
  state.session = { userId: "u1", sessionId: "session-u1" };
  state.onQuery = null;
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

test("세션이 그 소유자가 아니면 묻지 않고 던진다 - 남의 세션의 빈 답은 '없다'가 아니다", async () => {
  state.session = { userId: "u2", sessionId: "session-u2" };
  await expect(findSurvivingSourceIds("u1", ["s1"])).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
  expect(state.lastQuery).toEqual({});

  state.session = null;
  await expect(findSurvivingSourceIds("u1", ["s1"])).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
  expect(state.lastQuery).toEqual({});
});

test("묻는 도중 세션이 바뀌면(같은 계정의 다른 세션이라도) 받은 답을 버리고 던진다", async () => {
  state.rows = [];
  state.onQuery = () => {
    state.session = { userId: "u1", sessionId: "session-u1-elsewhere" };
  };
  await expect(findSurvivingSourceIds("u1", ["s1", "s2"])).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
});
