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
// 판정은 순수 함수가, 서버 사실은 countExactDuplicateHandBacks 하나가 가져온다. 화면
// 배선과 잠금은 src/screens/deepspace/__tests__/import-withdrawal-pointer.test.ts 가 본다.

type Row = { id: string };
const mockIngestLog: { user_id: string; stage: string; survivor_id: string | null }[] = [];
const mockQueries: Record<string, unknown>[] = [];
const mockFailure: { error: Error | null } = { error: null };

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = { table };
      const builder = {
        select: (columns: string) => {
          filters.select = columns;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        limit: async (n: number) => {
          filters.limit = n;
          mockQueries.push({ ...filters });
          if (mockFailure.error) return { data: null, error: mockFailure.error };
          const rows: Row[] = mockIngestLog
            .filter((r) => r.user_id === filters.user_id && r.stage === filters.stage && r.survivor_id === filters.survivor_id)
            .map((_, i) => ({ id: `drop-${i}` }));
          return { data: rows.slice(0, n), error: null };
        },
      };
      return builder;
    },
  }),
}));

import {
  countExactDuplicateHandBacks,
  createdSourceIds,
  handBackQuestions,
  importWithdrawalJudge,
  planWithdrawal,
} from "../history-ownership";

const NOW = Date.parse("2026-09-20T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

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
const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));

beforeEach(() => {
  mockIngestLog.length = 0;
  mockQueries.length = 0;
  mockFailure.error = null;
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
    const plan = planWithdrawal(creator, [creator, legacy("old", ["r"])], counts({}), NOW);
    expect(plan).toEqual({ delete: ["r", "s"], keep: [], promote: [] });
  });

  test("파일 가져오기 항목은 표지가 없어도 owned 로 센다 - 정확 중복을 적은 적이 없다(#898)", () => {
    const file = fileImport("f", ["x", "y"]);
    expect(planWithdrawal(file, [file, legacy("dup", ["x"])], counts({}), NOW).delete).toEqual(["x", "y"]);
    expect(handBackQuestions(file, [file], NOW)).toEqual([]);
  });

  test("두 owned 항목이 같은 행을 주장하면(있을 수 없는 경우) 마지막 항목이 지운다", () => {
    const a = owned("a", ["r"]);
    const b = owned("b", ["r"]);
    expect(planWithdrawal(a, [a, b], counts({}), NOW)).toEqual({ delete: [], keep: ["r"], promote: [] });
    expect(planWithdrawal(b, [b], counts({}), NOW)).toEqual({ delete: ["r"], keep: [], promote: [] });
  });
});

describe("planWithdrawal - 옛 허브 항목은 서버의 정확 중복 기록으로 판정한다 (LA-1841-1)", () => {
  test("한 번도 중복으로 건네진 적 없는 행은 그 항목이 만든 것이다 - 지운다", () => {
    const e = legacy("e", ["r"]);
    expect(planWithdrawal(e, [e], counts({ r: 0 }), NOW)).toEqual({ delete: ["r"], keep: [], promote: [] });
  });

  test("게이트 재현 - 첫 항목이 50건 상한에 밀리고 E2=[R] 만 남아도 R 을 지우지 않는다", () => {
    // E1 은 상한에 밀려 로그에 없다. 로컬 로그에는 "다른 포인터 없음" 이지만, 서버에는
    // R 을 정확 중복으로 건넨 기록(E2 의 비준)이 하나 있다.
    const e2 = legacy("e2", ["r"]);
    const newer = Array.from({ length: 49 }, (_, i) => owned(`n${i}`, [`n${i}`]));
    const plan = planWithdrawal(e2, [...newer, e2], counts({ r: 1 }), NOW);
    expect(plan).toEqual({ delete: [], keep: ["r"], promote: [] });
  });

  test("게이트 재현 - 첫 항목이 다른 기기에 있거나 항목 없는 /capture 행이어도 같다", () => {
    const e2 = legacy("e2", ["r"]);
    expect(planWithdrawal(e2, [e2], counts({ r: 1 }), NOW).delete).toEqual([]);
    expect(planWithdrawal(e2, [e2], counts({ r: 2 }), NOW).delete).toEqual([]);
  });

  test("두 보유 항목이 다 보이고 기록이 하나면, 철회하는 쪽은 남기고 남은 쪽을 주인으로 올린다", () => {
    // 기록 하나 = 만든 쪽 하나 + 중복 하나. 둘 다 이 로그에 있으니 만든 쪽도 여기 있다.
    // 어느 쪽이 먼저 철회돼도 남은 쪽이 주인이 되어 두 번째 철회가 R 을 지운다.
    const e1 = legacy("e1", ["r"], "2026-09-18T00:00:00.000Z");
    const e2 = legacy("e2", ["r"]);
    expect(planWithdrawal(e2, [e2, e1], counts({ r: 1 }), NOW)).toEqual({
      delete: [],
      keep: ["r"],
      promote: [{ entryId: "e1", sourceId: "r" }],
    });
    expect(planWithdrawal(e1, [e2, e1], counts({ r: 1 }), NOW).promote).toEqual([{ entryId: "e2", sourceId: "r" }]);
  });

  test("기록이 둘 이상이면 보이는 보유 항목이 둘이어도 주인을 올리지 않는다", () => {
    // 건넨 횟수보다 보이는 항목이 적다 - 만든 쪽이 보이지 않을 수 있다.
    const e1 = legacy("e1", ["r"]);
    const e2 = legacy("e2", ["r"]);
    expect(planWithdrawal(e2, [e2, e1], counts({ r: 2 }), NOW)).toEqual({ delete: [], keep: ["r"], promote: [] });
  });

  test("다른 행도 든 항목은 주인으로 올리지 않는다 - 그 행들까지 주인이 되면 안 된다", () => {
    const e1 = legacy("e1", ["r", "x"]);
    const e2 = legacy("e2", ["r"]);
    expect(planWithdrawal(e2, [e2, e1], counts({ r: 1 }), NOW).promote).toEqual([]);
  });

  test("owned 항목이 같은 행을 들고 있으면 옛 항목은 남기고 서버에 묻지도 않는다", () => {
    const creator = owned("p", ["r"]);
    const old = legacy("old", ["r", "s"]);
    expect(handBackQuestions(old, [old, creator], NOW)).toEqual(["s"]);
    expect(planWithdrawal(old, [old, creator], counts({ s: 0 }), NOW)).toEqual({ delete: ["s"], keep: ["r"], promote: [] });
  });

  test("기록이 없는데 다른 옛 항목도 같은 행을 들면(모순) 남기고, 마지막 항목이 지운다", () => {
    const a = legacy("a", ["r"]);
    const b = legacy("b", ["r"]);
    expect(planWithdrawal(a, [a, b], counts({ r: 0 }), NOW)).toEqual({ delete: [], keep: ["r"], promote: [] });
    expect(planWithdrawal(b, [b], counts({ r: 0 }), NOW).delete).toEqual(["r"]);
  });

  test("서버가 답하지 않은 행은 남긴다", () => {
    const e = legacy("e", ["r", "s"]);
    expect(planWithdrawal(e, [e], counts({ s: 0 }), NOW)).toEqual({ delete: ["s"], keep: ["r"], promote: [] });
  });

  test("정확 중복 기록의 보관 기한(0056, 365일)에 걸릴 만큼 오래된 항목은 묻지도 지우지도 않는다", () => {
    const old = legacy("old", ["r"], new Date(NOW - 336 * DAY).toISOString());
    expect(handBackQuestions(old, [old], NOW)).toEqual([]);
    expect(planWithdrawal(old, [old], counts({ r: 0 }), NOW).delete).toEqual([]);
    const fresh = legacy("fresh", ["r"], new Date(NOW - 334 * DAY).toISOString());
    expect(handBackQuestions(fresh, [fresh], NOW)).toEqual(["r"]);
  });

  test("주인으로 올릴 항목도 기한 안이어야 한다", () => {
    const e1 = legacy("e1", ["r"], new Date(NOW - 400 * DAY).toISOString());
    const e2 = legacy("e2", ["r"]);
    expect(planWithdrawal(e2, [e2, e1], counts({ r: 1 }), NOW).promote).toEqual([]);
  });

  test("atIso 를 읽을 수 없는 항목은 증명할 수 없다 - 남긴다", () => {
    const odd = legacy("odd", ["r"], "yesterday");
    expect(handBackQuestions(odd, [odd], NOW)).toEqual([]);
    expect(planWithdrawal(odd, [odd], counts({ r: 0 }), NOW).keep).toEqual(["r"]);
  });
});

describe("planWithdrawal - 공통 규칙", () => {
  test("id 가 같은 항목은 '다른 항목' 이 아니다 - 철회가 id 로 함께 뺀다", () => {
    const target = owned("same", ["r"]);
    expect(planWithdrawal(target, [target, owned("same", ["r"])], counts({}), NOW).delete).toEqual(["r"]);
  });

  test("한 항목 안에 겹친 id 는 한 번만 센다", () => {
    // 지운 수를 요청한 수와 비교하므로, 겹친 id 가 있으면 멀쩡한 철회가 되읽기로 간다.
    expect(planWithdrawal(owned("e", ["r", "r", "s"]), [], counts({}), NOW).delete).toEqual(["r", "s"]);
    expect(handBackQuestions(legacy("e", ["r", "r"]), [], NOW)).toEqual(["r"]);
  });

  test("입력을 바꾸지 않는다", () => {
    const target = legacy("e2", ["r", "s"]);
    const other = legacy("e1", ["r"]);
    const before = JSON.stringify([target, other]);
    planWithdrawal(target, [target, other], counts({ r: 1, s: 0 }), NOW);
    handBackQuestions(target, [target, other], NOW);
    expect(JSON.stringify([target, other])).toBe(before);
  });
});

describe("countExactDuplicateHandBacks - 서버 사실은 ingest_log 하나다", () => {
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
});

describe("importWithdrawalJudge - 화면이 넘기는 판정", () => {
  test("owned 항목은 서버에 묻지 않고, 옛 항목은 정할 수 없는 행만 묻는다", async () => {
    const surviving = jest.fn(async (_userId: string, ids: string[]) => ids.slice(0, 1));
    const judge = importWithdrawalJudge("user-a", surviving);
    const now = new Date().toISOString();
    const creator = { ...owned("p", ["r"]), atIso: now };
    expect(await judge.plan(creator, [creator])).toEqual({ delete: ["r"], keep: [], promote: [] });
    expect(mockQueries).toEqual([]);

    mockIngestLog.push({ user_id: "user-a", stage: "exact_duplicate", survivor_id: "x" });
    const old = { ...legacy("old", ["r", "x", "y"]), atIso: now };
    expect(await judge.plan(old, [old, creator])).toEqual({ delete: ["y"], keep: ["r", "x"], promote: [] });
    expect(mockQueries.map((q) => q.survivor_id)).toEqual(["x", "y"]);

    expect(await judge.surviving(["x", "r"])).toEqual(["x"]);
    expect(surviving).toHaveBeenCalledWith("user-a", ["x", "r"]);
  });
});
