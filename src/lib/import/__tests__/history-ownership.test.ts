// 가져오기 이력의 한 항목은 "이 가져오기가 만든 행" 을 가리키고, 철회는 그 행을 지운다.
// 그래서 항목이 가리키는 행 가운데 철회가 지워도 되는 것은 그 항목의 것뿐이다.
//
// r29 §3-6 (2026-09-20) 이 이 약속이 깨진 순서를 찾았다. 허브에서 같은 파일 · 같은
// 선택을 두 번 비준하면 두 번째 capture 는 정확 중복으로 첫 번째가 만든 행 R 을 돌려준다
// (새 행도 원문도 쓰지 않는다). 허브가 그 R 을 두 번째 항목에도 적었고, 두 번째 항목을
// 철회하면 첫 가져오기의 R 이 지워졌다.
//
// 1차 고침은 "로그에 R 을 가리키는 다른 항목이 없으면 내 것" 으로 판정했다. 게이트
// LA-1841-1 이 그 판정을 깼다 - 로그는 기기 로컬이고 최신 50건만 남으므로, 첫 항목이
// 상한에 밀렸거나 다른 기기에 있거나 애초에 항목이 없는 /capture 행이면 옛 중복 항목
// E2=[R] 의 철회가 여전히 R 을 지웠다. 이제 소유는 증명한다: 새 항목은 owned 표지, 옛
// 허브 항목은 서버의 정확 중복 기록(ingest_log)으로.
//
// 2차 재게이트(L2A-1841-3 · L2Z-1841-3)가 그 증명의 기한을 짚었다: 기록은 1년 뒤 정리되는데
// (0056 · 0067), 기한을 기기 시계로 쟀다. 이제 행의 captured_at 과 세션 토큰의 만료 시각 -
// 둘 다 서버 시계 - 으로 잰다. 판정은 까닭(shared · handedBack · unconfirmed)도 함께 내고
// (L2Z-1841-4), 철회는 차례를 받은 세션에 묶인다(L2A-1841-2 · L2Z-1841-1).
//
// 판정은 순수 함수가, 서버 사실은 countExactDuplicateHandBacks · sourceCapturedAt 이 가져온다.
// 화면 배선과 잠금은 src/screens/deepspace/__tests__/import-withdrawal-pointer.test.ts 가 본다.

type Row = { id: string };
const mockIngestLog: { user_id: string; stage: string; survivor_id: string | null }[] = [];
const mockSources: { user_id: string; id: string; captured_at: unknown }[] = [];
const mockQueries: Record<string, unknown>[] = [];
const mockFailure: { error: Error | null } = { error: null };
const mockAuth = {
  session: null as { user: { id: string }; access_token: string } | null,
  runtime: null as unknown,
};

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockAuth.session }, error: null }),
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = { table };
      const answer = async () => {
        mockQueries.push({ ...filters });
        if (mockFailure.error) return { data: null, error: mockFailure.error };
        if (table === "sources") {
          const ids = (filters.id as string[]) ?? [];
          return {
            data: mockSources
              .filter((r) => r.user_id === filters.user_id && ids.includes(r.id))
              .map((r) => ({ id: r.id, captured_at: r.captured_at })),
            error: null,
          };
        }
        const rows: Row[] = mockIngestLog
          .filter((r) => r.user_id === filters.user_id && r.stage === filters.stage && r.survivor_id === filters.survivor_id)
          .map((_, i) => ({ id: `drop-${i}` }));
        return { data: rows.slice(0, Number(filters.limit)), error: null };
      };
      const builder = {
        select: (columns: string) => {
          filters.select = columns;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        in: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        limit: (n: number) => {
          filters.limit = n;
          return builder;
        },
        abortSignal: (signal: AbortSignal) => {
          filters.signal = signal;
          return builder;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => answer().then(resolve, reject),
      };
      return builder;
    },
  }),
}));
jest.mock("../../auth/session-mutation", () => ({
  ...jest.requireActual("../../auth/session-mutation"),
  getAuthStorageRuntime: () => mockAuth.runtime,
}));

import { AuthSessionOwnerChangedError, createAuthStorageRuntime } from "../../auth/session-mutation";
import {
  countExactDuplicateHandBacks,
  createdSourceIds,
  handBackQuestions,
  importWithdrawalJudge,
  keptNotice,
  planWithdrawal,
  sourceCapturedAt,
  type RowAnswer,
} from "../history-ownership";

const NOW = Date.parse("2026-09-20T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
/** 서버 시계의 상한 - 세션 토큰의 만료 시각. */
const CEILING = NOW + 60 * 60 * 1000;

type Entry = {
  id: string;
  sourceKey: string;
  name: string;
  atIso: string;
  summary: string;
  sourceIds: string[];
  owned?: true;
};

/** 2026-09-20 이전에 허브가 적은 항목(owned 없음). */
const legacy = (id: string, sourceIds: string[], atIso = "2026-09-19T00:00:00.000Z"): Entry => ({
  id,
  sourceKey: "notion",
  name: "Notion · Obsidian",
  atIso,
  summary: "",
  sourceIds,
});
const owned = (id: string, sourceIds: string[]): Entry => ({ ...legacy(id, sourceIds), owned: true });
const fileImport = (id: string, sourceIds: string[]): Entry => ({ ...legacy(id, sourceIds), sourceKey: "file" });
/** 서버의 답: 행마다 정확 중복 기록 수. 행은 CEILING 열흘 전(서버 시계)에 담겼다. */
const answers = (handBacks: Record<string, number>, capturedAtMs: number | null = CEILING - 10 * DAY) =>
  new Map<string, RowAnswer>(Object.entries(handBacks).map(([id, handedBack]) => [id, { handedBack, capturedAtMs }]));
const keep = (sourceId: string, why: "shared" | "handedBack" | "unconfirmed") => ({ sourceId, why });

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}.signature`;
}
function sessionOf(userId: string, claims: Record<string, unknown> = {}) {
  return {
    user: { id: userId },
    access_token: jwt({ sub: userId, session_id: `session-${userId}`, exp: CEILING / 1000, ...claims }),
  };
}

beforeEach(() => {
  mockIngestLog.length = 0;
  mockSources.length = 0;
  mockQueries.length = 0;
  mockFailure.error = null;
  mockAuth.session = sessionOf("user-a");
  mockAuth.runtime = createAuthStorageRuntime({ url: "https://proj.supabase.co", storage: undefined, web: false });
});

describe("createdSourceIds - 비준이 이력에 적는 행", () => {
  test("새로 만든 행은 적는다", () => {
    expect(createdSourceIds({ source: { id: "r" }, deduped: null })).toEqual(["r"]);
  });

  test("근접 중복도 새 행이다 (dedup_of 로 이어질 뿐) - 적는다", () => {
    expect(createdSourceIds({ source: { id: "n" }, deduped: "near_duplicate" })).toEqual(["n"]);
  });

  test("정확 중복은 앞선 담기가 만든 기존 행이다 - 적지 않는다", () => {
    expect(createdSourceIds({ source: { id: "r" }, deduped: "exact_duplicate" })).toEqual([]);
  });
});

describe("planWithdrawal - 새 항목(owned)과 파일 가져오기 항목은 자기 행을 모두 지운다", () => {
  test("owned 항목은 옛 중복 항목이 같은 행을 가리켜도 지운다 - 만든 것은 이 항목이다", () => {
    // 옛 탭(고치기 전 코드)이 같은 본문을 다시 비준해 E_old=[R] 을 적은 경우. E_old 는
    // 아무것도 만들지 않았으므로 R 을 붙잡을 자격이 없다.
    const creator = owned("p", ["r", "s"]);
    const plan = planWithdrawal(creator, [creator, legacy("old", ["r"])], answers({}), CEILING);
    expect(plan).toEqual({ delete: ["r", "s"], keep: [], promote: [] });
  });

  test("파일 가져오기 항목은 표지가 없어도 owned 로 센다 - 정확 중복을 적은 적이 없다(#898)", () => {
    const file = fileImport("f", ["x", "y"]);
    expect(planWithdrawal(file, [file, legacy("dup", ["x"])], answers({}), CEILING).delete).toEqual(["x", "y"]);
    expect(handBackQuestions(file, [file])).toEqual([]);
  });

  test("두 owned 항목이 같은 행을 주장하면(있을 수 없는 경우) 마지막 항목이 지운다", () => {
    const a = owned("a", ["r"]);
    const b = owned("b", ["r"]);
    expect(planWithdrawal(a, [a, b], answers({}), CEILING)).toEqual({ delete: [], keep: [keep("r", "shared")], promote: [] });
    expect(planWithdrawal(b, [b], answers({}), CEILING)).toEqual({ delete: ["r"], keep: [], promote: [] });
  });

  test("owned 항목의 판정은 서버 시계를 몰라도 된다", () => {
    const creator = owned("p", ["r"]);
    expect(planWithdrawal(creator, [creator], answers({}), null).delete).toEqual(["r"]);
  });
});

describe("planWithdrawal - 옛 허브 항목은 서버의 정확 중복 기록으로 판정한다 (LA-1841-1)", () => {
  test("한 번도 중복으로 건네진 적 없는 행은 그 항목이 만든 것이다 - 지운다", () => {
    const e = legacy("e", ["r"]);
    expect(planWithdrawal(e, [e], answers({ r: 0 }), CEILING)).toEqual({ delete: ["r"], keep: [], promote: [] });
  });

  test("게이트 재현 - 첫 항목이 50건 상한에 밀리고 E2=[R] 만 남아도 R 을 지우지 않는다", () => {
    // E1 은 상한에 밀려 로그에 없다. 로컬 로그에는 "다른 포인터 없음" 이지만, 서버에는
    // R 을 정확 중복으로 건넨 기록(E2 의 비준)이 하나 있다.
    const e2 = legacy("e2", ["r"]);
    const newer = Array.from({ length: 49 }, (_, i) => owned(`n${i}`, [`n${i}`]));
    const plan = planWithdrawal(e2, [...newer, e2], answers({ r: 1 }), CEILING);
    expect(plan).toEqual({ delete: [], keep: [keep("r", "handedBack")], promote: [] });
  });

  test("게이트 재현 - 첫 항목이 다른 기기에 있거나 항목 없는 /capture 행이어도 같다", () => {
    const e2 = legacy("e2", ["r"]);
    expect(planWithdrawal(e2, [e2], answers({ r: 1 }), CEILING).delete).toEqual([]);
    expect(planWithdrawal(e2, [e2], answers({ r: 2 }), CEILING).delete).toEqual([]);
  });

  test("두 보유 항목이 다 보이고 기록이 하나면, 철회하는 쪽은 남기고 남은 쪽을 주인으로 올린다", () => {
    // 기록 하나 = 만든 쪽 하나 + 중복 하나. 둘 다 이 로그에 있으니 만든 쪽도 여기 있다.
    // 어느 쪽이 먼저 철회돼도 남은 쪽이 주인이 되어 두 번째 철회가 R 을 지운다.
    const e1 = legacy("e1", ["r"], "2026-09-18T00:00:00.000Z");
    const e2 = legacy("e2", ["r"]);
    expect(planWithdrawal(e2, [e2, e1], answers({ r: 1 }), CEILING)).toEqual({
      delete: [],
      keep: [keep("r", "shared")],
      promote: [{ entryId: "e1", sourceId: "r" }],
    });
    expect(planWithdrawal(e1, [e2, e1], answers({ r: 1 }), CEILING).promote).toEqual([{ entryId: "e2", sourceId: "r" }]);
  });

  test("기록이 둘 이상이면 보이는 보유 항목이 둘이어도 주인을 올리지 않는다", () => {
    // 건넨 횟수보다 보이는 항목이 적다 - 만든 쪽이 보이지 않을 수 있다.
    const e1 = legacy("e1", ["r"]);
    const e2 = legacy("e2", ["r"]);
    expect(planWithdrawal(e2, [e2, e1], answers({ r: 2 }), CEILING)).toEqual({
      delete: [],
      keep: [keep("r", "shared")],
      promote: [],
    });
  });

  test("다른 행도 든 항목은 주인으로 올리지 않는다 - 그 행들까지 주인이 되면 안 된다", () => {
    const e1 = legacy("e1", ["r", "x"]);
    const e2 = legacy("e2", ["r"]);
    expect(planWithdrawal(e2, [e2, e1], answers({ r: 1 }), CEILING).promote).toEqual([]);
  });

  test("owned 항목이 같은 행을 들고 있으면 옛 항목은 남기고 서버에 묻지도 않는다", () => {
    const creator = owned("p", ["r"]);
    const old = legacy("old", ["r", "s"]);
    expect(handBackQuestions(old, [old, creator])).toEqual(["s"]);
    expect(planWithdrawal(old, [old, creator], answers({ s: 0 }), CEILING)).toEqual({
      delete: ["s"],
      keep: [keep("r", "shared")],
      promote: [],
    });
  });

  test("기록이 없는데 다른 옛 항목도 같은 행을 들면(모순) 남기고, 마지막 항목이 지운다", () => {
    const a = legacy("a", ["r"]);
    const b = legacy("b", ["r"]);
    expect(planWithdrawal(a, [a, b], answers({ r: 0 }), CEILING)).toEqual({ delete: [], keep: [keep("r", "shared")], promote: [] });
    expect(planWithdrawal(b, [b], answers({ r: 0 }), CEILING).delete).toEqual(["r"]);
  });

  test("서버가 답하지 않은 행은 남긴다 - 까닭은 확인 불가", () => {
    const e = legacy("e", ["r", "s"]);
    expect(planWithdrawal(e, [e], answers({ s: 0 }), CEILING)).toEqual({
      delete: ["s"],
      keep: [keep("r", "unconfirmed")],
      promote: [],
    });
  });
});

describe("planWithdrawal - 보존 기한은 서버 시계로 잰다 (L2A-1841-3 · L2Z-1841-3)", () => {
  test("게이트 재현 - 서버 시계로 365일 보존에 걸릴 만큼 오래된 행은 기록 0 건이어도 지우지 않는다", () => {
    // 항목의 atIso 는 어제다(적을 때 기기 시계가 앞서 있었다). 그 시계는 판정에 쓰지 않는다.
    const e = legacy("e", ["r"]);
    expect(planWithdrawal(e, [e], answers({ r: 0 }, CEILING - 336 * DAY), CEILING)).toEqual({
      delete: [],
      keep: [keep("r", "unconfirmed")],
      promote: [],
    });
    expect(planWithdrawal(e, [e], answers({ r: 0 }, CEILING - 334 * DAY), CEILING).delete).toEqual(["r"]);
  });

  test("서버 시계의 상한을 모르면(토큰 만료 시각을 못 읽음) 증명할 수 없다 - 남긴다", () => {
    const e = legacy("e", ["r"]);
    expect(planWithdrawal(e, [e], answers({ r: 0 }), null).keep).toEqual([keep("r", "unconfirmed")]);
  });

  test("행의 captured_at 을 모르면(행이 없다) 증명할 수 없다 - 남긴다", () => {
    const e = legacy("e", ["r"]);
    expect(planWithdrawal(e, [e], answers({ r: 0 }, null), CEILING).keep).toEqual([keep("r", "unconfirmed")]);
  });

  test("captured_at 이 서버 시계의 상한보다 뒤면 믿지 않는다", () => {
    const e = legacy("e", ["r"]);
    expect(planWithdrawal(e, [e], answers({ r: 0 }, CEILING + DAY), CEILING).delete).toEqual([]);
  });

  test("기한 밖의 행은 기록이 하나여도 주인을 올리지 않는다 - 더 오래된 기록이 정리됐을 수 있다", () => {
    const e1 = legacy("e1", ["r"]);
    const e2 = legacy("e2", ["r"]);
    const plan = planWithdrawal(e2, [e2, e1], answers({ r: 1 }, CEILING - 400 * DAY), CEILING);
    expect(plan.promote).toEqual([]);
    expect(plan.keep).toEqual([keep("r", "shared")]);
  });

  test("기한 밖이어도 남은 기록 하나는 '들여온 적이 두 번 이상' 의 증거다 - 까닭은 handedBack", () => {
    const e = legacy("e", ["r"]);
    expect(planWithdrawal(e, [e], answers({ r: 1 }, CEILING - 400 * DAY), CEILING).keep).toEqual([keep("r", "handedBack")]);
  });

  test("항목의 atIso(기기 시계)는 판정을 바꾸지 않는다", () => {
    for (const atIso of ["yesterday", "2020-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z"]) {
      const e = legacy("e", ["r"], atIso);
      expect(planWithdrawal(e, [e], answers({ r: 0 }), CEILING).delete).toEqual(["r"]);
    }
  });
});

describe("planWithdrawal - 공통 규칙", () => {
  test("id 가 같은 항목은 '다른 항목' 이 아니다 - 철회가 id 로 함께 뺀다", () => {
    const target = owned("same", ["r"]);
    expect(planWithdrawal(target, [target, owned("same", ["r"])], answers({}), CEILING).delete).toEqual(["r"]);
  });

  test("한 항목 안에 겹친 id 는 한 번만 센다", () => {
    // 지운 수를 요청한 수와 비교하므로, 겹친 id 가 있으면 멀쩡한 철회가 되읽기로 간다.
    expect(planWithdrawal(owned("e", ["r", "r", "s"]), [], answers({}), CEILING).delete).toEqual(["r", "s"]);
    expect(handBackQuestions(legacy("e", ["r", "r"]), [])).toEqual(["r"]);
  });

  test("입력을 바꾸지 않는다", () => {
    const target = legacy("e2", ["r", "s"]);
    const other = legacy("e1", ["r"]);
    const before = JSON.stringify([target, other]);
    planWithdrawal(target, [target, other], answers({ r: 1, s: 0 }), CEILING);
    handBackQuestions(target, [target, other]);
    expect(JSON.stringify([target, other])).toBe(before);
  });
});

describe("countExactDuplicateHandBacks - 정확 중복 기록은 ingest_log 가 센다", () => {
  test("행마다 본인 · 정확 중복 · 그 행으로 좁혀 두 건까지만 센다", async () => {
    mockIngestLog.push(
      { user_id: "user-a", stage: "exact_duplicate", survivor_id: "r" },
      { user_id: "user-a", stage: "exact_duplicate", survivor_id: "r" },
      { user_id: "user-a", stage: "exact_duplicate", survivor_id: "r" },
      { user_id: "user-a", stage: "exact_duplicate", survivor_id: "s" },
      { user_id: "user-a", stage: "near_duplicate", survivor_id: "t" },
      { user_id: "user-b", stage: "exact_duplicate", survivor_id: "t" },
    );
    const result = await countExactDuplicateHandBacks("user-a", ["r", "s", "t", "r"]);
    expect([...result]).toEqual([["r", 2], ["s", 1], ["t", 0]]);
    expect(mockQueries).toHaveLength(3);
    for (const query of mockQueries) {
      expect(query).toMatchObject({ table: "ingest_log", select: "id", user_id: "user-a", stage: "exact_duplicate", limit: 2 });
    }
    expect(mockQueries.map((q) => q.survivor_id)).toEqual(["r", "s", "t"]);
  });

  test("질의가 실패하면 던진다 - 빈 기록으로 읽으면 중복 행을 '만든 행' 으로 지운다", async () => {
    mockFailure.error = new Error("permission denied for table ingest_log");
    await expect(countExactDuplicateHandBacks("user-a", ["r"])).rejects.toThrow("permission denied");
  });

  test("철회의 기한 신호가 질의마다 실린다 (L2A-1841-4)", async () => {
    const signal = new AbortController().signal;
    await countExactDuplicateHandBacks("user-a", ["r", "s"], signal);
    expect(mockQueries.map((q) => q.signal)).toEqual([signal, signal]);
  });
});

describe("sourceCapturedAt - 행이 담긴 시각은 서버 시계다", () => {
  test("본인의 그 행들만 한 번에 묻고, 읽을 수 없는 시각과 없는 행은 빼고 돌려준다", async () => {
    mockSources.push(
      { user_id: "user-a", id: "r", captured_at: "2026-09-10T00:00:00+00:00" },
      { user_id: "user-a", id: "odd", captured_at: "not a time" },
      { user_id: "user-b", id: "s", captured_at: "2026-09-10T00:00:00+00:00" },
    );
    const signal = new AbortController().signal;
    const result = await sourceCapturedAt("user-a", ["r", "odd", "s", "gone", "r"], signal);
    expect([...result]).toEqual([["r", Date.parse("2026-09-10T00:00:00Z")]]);
    expect(mockQueries).toEqual([
      { table: "sources", select: "id, captured_at", user_id: "user-a", id: ["r", "odd", "s", "gone"], signal },
    ]);
  });

  test("질의가 실패하면 던진다", async () => {
    mockFailure.error = new Error("network");
    await expect(sourceCapturedAt("user-a", ["r"])).rejects.toThrow("network");
  });

  test("물을 행이 없으면 묻지 않는다", async () => {
    expect([...(await sourceCapturedAt("user-a", []))]).toEqual([]);
    expect(mockQueries).toEqual([]);
  });
});

describe("importWithdrawalJudge - 화면이 넘기는 판정", () => {
  test("owned 항목은 서버에 묻지 않고, 옛 항목은 정할 수 없는 행만 묻는다", async () => {
    const surviving = jest.fn(async (_userId: string, ids: string[]) => ids.slice(0, 1));
    const judge = importWithdrawalJudge("user-a", surviving);
    const session = await judge.pin();
    const signal = new AbortController().signal;
    const creator = owned("p", ["r"]);
    expect(await judge.plan(creator, [creator], session, signal)).toEqual({ delete: ["r"], keep: [], promote: [] });
    expect(mockQueries).toEqual([]);

    mockIngestLog.push({ user_id: "user-a", stage: "exact_duplicate", survivor_id: "x" });
    for (const id of ["r", "x", "y"]) mockSources.push({ user_id: "user-a", id, captured_at: "2026-09-10T00:00:00Z" });
    const old = legacy("old", ["r", "x", "y"]);
    expect(await judge.plan(old, [old, creator], session, signal)).toEqual({
      delete: ["y"],
      keep: [keep("r", "shared"), keep("x", "handedBack")],
      promote: [],
    });
    expect(mockQueries.filter((q) => q.table === "ingest_log").map((q) => q.survivor_id)).toEqual(["x", "y"]);
    expect(mockQueries.filter((q) => q.table === "sources").map((q) => q.id)).toEqual([["x", "y"]]);

    expect(await judge.surviving(["x", "r"])).toEqual(["x"]);
    expect(surviving).toHaveBeenCalledWith("user-a", ["x", "r"]);
  });

  test("세션 고정: 살아 있는 세션이 이 계정의 것이 아니면 판정도 시작하지 않는다 (L2A-1841-2)", async () => {
    mockAuth.session = sessionOf("user-b");
    await expect(importWithdrawalJudge("user-a", jest.fn()).pin()).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    mockAuth.session = null;
    await expect(importWithdrawalJudge("user-a", jest.fn()).pin()).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
  });

  test("세션 확인: 고정한 뒤 계정이 바뀌거나 다시 로그인하면 던지고, 토큰 갱신(같은 세션)은 통과한다", async () => {
    const session = await importWithdrawalJudge("user-a", jest.fn()).pin();
    await expect(session.check()).resolves.toBeUndefined();
    mockAuth.session = sessionOf("user-a", { exp: CEILING / 1000 + 3600 });
    await expect(session.check()).resolves.toBeUndefined();
    mockAuth.session = sessionOf("user-b");
    await expect(session.check()).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    mockAuth.session = sessionOf("user-a", { session_id: "session-user-a-2" });
    await expect(session.check()).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
  });

  test("서버 시계의 상한은 고정한 토큰의 exp 다 - 읽을 수 없으면 null", async () => {
    expect((await importWithdrawalJudge("user-a", jest.fn()).pin()).serverTimeCeilingMs).toBe(CEILING);
    mockAuth.session = sessionOf("user-a", { exp: undefined });
    expect((await importWithdrawalJudge("user-a", jest.fn()).pin()).serverTimeCeilingMs).toBeNull();
    mockAuth.session = { user: { id: "user-a" }, access_token: "not-a-jwt" };
    expect((await importWithdrawalJudge("user-a", jest.fn()).pin()).serverTimeCeilingMs).toBeNull();
  });

  test("기기 시계가 1년 틀려도 판정은 같다 - 기한은 서버의 두 시각으로만 잰다", async () => {
    mockSources.push({ user_id: "user-a", id: "r", captured_at: new Date(CEILING - 10 * DAY).toISOString() });
    const judge = importWithdrawalJudge("user-a", jest.fn());
    const session = await judge.pin();
    const signal = new AbortController().signal;
    const e = legacy("e", ["r"]);
    const now = jest.spyOn(Date, "now");
    try {
      for (const deviceNow of [NOW - 400 * DAY, NOW, NOW + 400 * DAY]) {
        now.mockReturnValue(deviceNow);
        expect((await judge.plan(e, [e], session, signal)).delete).toEqual(["r"]);
      }
    } finally {
      now.mockRestore();
    }
  });
});

describe("keptNotice - 남긴 행 알림의 줄 (L2Z-1841-4)", () => {
  test("남긴 것이 없으면 줄도 없다", () => {
    expect(keptNotice(null)).toEqual([]);
    expect(keptNotice({ shared: 0, unconfirmed: 0, uncertain: true })).toEqual([]);
  });

  test("까닭별로 한 줄씩, 되짚지 못했으면 그 사실을 한 줄 더", () => {
    expect(keptNotice({ shared: 2, unconfirmed: 0, uncertain: false })).toEqual([
      { key: "ds.import.revokeKeptShared", count: 2 },
    ]);
    expect(keptNotice({ shared: 1, unconfirmed: 3, uncertain: true })).toEqual([
      { key: "ds.import.revokeKeptShared", count: 1 },
      { key: "ds.import.revokeKeptUnconfirmed", count: 3 },
      { key: "ds.import.revokeKeptUncertain" },
    ]);
  });
});
