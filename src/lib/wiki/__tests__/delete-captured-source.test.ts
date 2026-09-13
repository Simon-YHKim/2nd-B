// 담아 둔 자료(sources) 한 건을 끝까지 지운다 (Q-260914-01 B 확장, 2026-09-14).
//
// 대화 자동 저장은 wiki_pages 가 아니라 sources 에 쓴다. 그 한 건을 되돌리려면 세 곳을
// 지워야 하고, 순서가 계약이다:
//   1. 이 자료로 만든 위키 페이지(kind='source'). wiki_pages.source_id 는
//      ON DELETE SET NULL 인데 CHECK((kind = 'source') = (source_id IS NOT NULL)) 가
//      있어서, 페이지가 남아 있으면 source 삭제가 제약 위반으로 막힌다
//      (db/migrations/0022_wiki_rag.sql 의 wiki_pages_source_kind_pair).
//   2. source 행.
//   3. raw-clippings 의 본문. best-effort. 행은 이미 지워졌고 그게 사용자의 뜻이다.
//
// 목은 순서를 받아 적기만 하지 않는다. 위 CHECK 를 **실제로 강제**한다. 그래야 "페이지
// 먼저"가 통과한 것이 순서를 지켜서인지, 목이 무엇이든 받아줘서인지 구분된다(대조군).
import { readFileSync } from "node:fs";
import { join } from "node:path";

type MockRow = Record<string, unknown>;

const mockDb = {
  sources: [] as MockRow[],
  wiki_pages: [] as MockRow[],
  writes: [] as string[],
  storageFails: false,
  denySourceDelete: false,
  removedPaths: [] as string[],
};

function mockQuery(table: "sources" | "wiki_pages") {
  let op: "select" | "delete" | "update" = "select";
  let patch: MockRow = {};
  const filters: ((row: MockRow) => boolean)[] = [];
  const run = (): { data: MockRow[] | null; error: { message: string; code?: string } | null; count?: number | null } => {
    const rows = mockDb[table];
    const hit = rows.filter((row) => filters.every((keep) => keep(row)));
    if (op === "select") return { data: hit.map((row) => ({ ...row })), error: null };
    if (op === "update") {
      mockDb.writes.push(`update ${table}`);
      hit.forEach((row) => Object.assign(row, patch));
      return { data: null, error: null };
    }
    if (table === "sources") {
      if (mockDb.denySourceDelete) {
        // RLS 거부는 오류가 아니라 0행으로 온다.
        mockDb.writes.push("delete sources (0 rows)");
        return { data: null, error: null, count: 0 };
      }
      const referenced = hit.some((source) =>
        mockDb.wiki_pages.some((page) => page.kind === "source" && page.source_id === source.id),
      );
      if (referenced) {
        mockDb.writes.push("delete sources (blocked)");
        return {
          data: null,
          error: { message: 'violates check constraint "wiki_pages_source_kind_pair"', code: "23514" },
          count: null,
        };
      }
    }
    mockDb.writes.push(`delete ${table}`);
    mockDb[table] = rows.filter((row) => !hit.includes(row));
    return { data: null, error: null, count: hit.length };
  };
  const builder = {
    select: () => builder,
    delete: () => {
      op = "delete";
      return builder;
    },
    update: (next: MockRow) => {
      op = "update";
      patch = next;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return builder;
    },
    maybeSingle: async () => {
      const result = run();
      return { data: result.data?.[0] ?? null, error: result.error };
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve().then(run).then(resolve, reject),
  };
  return builder;
}

const mockClient = {
  from: (table: "sources" | "wiki_pages") => mockQuery(table),
  storage: {
    from: () => ({
      remove: async (paths: string[]) => {
        mockDb.writes.push("storage remove");
        if (mockDb.storageFails) return { data: null, error: { message: `remove failed: ${paths.join(",")}` } };
        mockDb.removedPaths.push(...paths);
        return { data: [], error: null };
      },
    }),
  },
};

jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => mockClient }));
jest.mock("../../persona/load-domain-levels", () => ({ invalidateDomainLevels: jest.fn() }));

import { CapturedSourceNotFoundError, deleteCapturedSource } from "../delete-captured-source";

const { invalidateDomainLevels } = jest.requireMock("../../persona/load-domain-levels") as {
  invalidateDomainLevels: jest.Mock;
};

const OWNER = "user-a";
const SOURCE: MockRow = { id: "src-1", user_id: OWNER, storage_path: `${OWNER}/chat-abc123.md`, ingested: false };

beforeEach(() => {
  mockDb.sources = [];
  mockDb.wiki_pages = [];
  mockDb.writes = [];
  mockDb.storageFails = false;
  mockDb.denySourceDelete = false;
  mockDb.removedPaths = [];
  invalidateDomainLevels.mockClear();
});

describe("지우는 순서", () => {
  test("승격된 페이지가 없으면 source 행, 그다음 본문", async () => {
    mockDb.sources = [{ ...SOURCE }];
    await deleteCapturedSource(OWNER, "src-1");
    expect(mockDb.writes).toEqual(["delete sources", "storage remove"]);
    expect(mockDb.sources).toEqual([]);
    expect(mockDb.removedPaths).toEqual([SOURCE.storage_path]);
  });

  test("승격된 페이지가 있으면 페이지, source 행, 본문 순서다", async () => {
    mockDb.sources = [{ ...SOURCE, ingested: true }];
    mockDb.wiki_pages = [
      { id: "page-1", user_id: OWNER, kind: "source", source_id: "src-1" },
      { id: "page-other", user_id: OWNER, kind: "concept", source_id: null },
    ];
    await deleteCapturedSource(OWNER, "src-1");
    // 가운데 update 는 deleteWikiPage 의 기존 계약(원본을 미수집으로 되돌림)이다.
    expect(mockDb.writes).toEqual(["delete wiki_pages", "update sources", "delete sources", "storage remove"]);
    expect(mockDb.wiki_pages.map((page) => page.id)).toEqual(["page-other"]);
    expect(mockDb.sources).toEqual([]);
  });

  test("대조군: 페이지를 남긴 채 source 를 지우면 CHECK 제약이 막는다", async () => {
    // 이 목이 제약을 실제로 강제한다는 증거다. 이게 없으면 위 순서 검사는 목이
    // 관대해서 통과한 것일 수 있다.
    mockDb.sources = [{ ...SOURCE }];
    mockDb.wiki_pages = [{ id: "page-1", user_id: OWNER, kind: "source", source_id: "src-1" }];
    const result = (await mockClient.from("sources").delete().eq("user_id", OWNER).eq("id", "src-1")) as {
      error: { code?: string } | null;
    };
    expect(result.error?.code).toBe("23514");
    expect(mockDb.sources).toHaveLength(1);
  });

  test("지운 뒤 별 밝기 캐시를 버린다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    await deleteCapturedSource(OWNER, "src-1");
    expect(invalidateDomainLevels).toHaveBeenCalledWith(OWNER);
  });
});

describe("본문 삭제가 실패해도", () => {
  test("행 삭제를 되돌리지 않고 성공으로 끝낸다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    mockDb.storageFails = true;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBeUndefined();
      expect(mockDb.sources).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  test("로그에는 실패 사실만 남는다 - 경로, id, 오류 본문을 쓰지 않는다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    mockDb.storageFails = true;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await deleteCapturedSource(OWNER, "src-1");
      const logged = warn.mock.calls.flat().map((part) => String(part)).join(" ");
      expect(logged.length).toBeGreaterThan(0);
      expect(logged).not.toContain(OWNER);
      expect(logged).not.toContain("src-1");
      expect(logged).not.toContain("chat-abc123");
      expect(logged).not.toContain("remove failed");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("본인 행만", () => {
  test("남의 id 는 아무것도 지우지 않고 거부한다", async () => {
    mockDb.sources = [{ ...SOURCE, user_id: "user-b", storage_path: "user-b/chat-abc123.md" }];
    await expect(deleteCapturedSource(OWNER, "src-1")).rejects.toBeInstanceOf(CapturedSourceNotFoundError);
    expect(mockDb.writes).toEqual([]);
    expect(mockDb.sources).toHaveLength(1);
  });

  test("본문 경로가 본인 폴더 밖이면 Storage 는 건드리지 않는다", async () => {
    mockDb.sources = [{ ...SOURCE, storage_path: "user-b/elsewhere.md" }];
    await deleteCapturedSource(OWNER, "src-1");
    expect(mockDb.writes).toEqual(["delete sources"]);
    expect(mockDb.removedPaths).toEqual([]);
  });

  test("행이 안 지워졌는데 남아 있으면 실패로 올리고 본문도 지우지 않는다", async () => {
    // RLS 가 조용히 0행을 돌려준 경우. "지웠다"고 말하면 안 된다.
    mockDb.sources = [{ ...SOURCE }];
    mockDb.denySourceDelete = true;
    await expect(deleteCapturedSource(OWNER, "src-1")).rejects.toThrow();
    expect(mockDb.writes).not.toContain("storage remove");
    expect(mockDb.sources).toHaveLength(1);
  });
});

describe("확인 문구", () => {
  const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
  const KEYS = ["a11yDeleteSource", "deleteSourceConfirmTitle", "deleteSourceConfirmBody"] as const;
  const detail = (loc: string): Record<string, string> =>
    (
      JSON.parse(readFileSync(join(process.cwd(), "locales", loc, "deepspace.json"), "utf8")) as {
        recordDetail: Record<string, string>;
      }
    ).recordDetail;

  test("다섯 언어에 있고 em dash 가 없다", () => {
    for (const loc of LOCALES) {
      for (const key of KEYS) {
        expect({ loc, key, ok: typeof detail(loc)[key] === "string" && !detail(loc)[key].includes("—") }).toEqual({
          loc,
          key,
          ok: true,
        });
      }
    }
  });

  test("되돌릴 수 없다는 사실을 다섯 언어 모두 말한다", () => {
    const IRREVERSIBLE: Record<(typeof LOCALES)[number], RegExp> = {
      en: /cannot be undone/i,
      ko: /되돌릴 수 없/,
      es: /no se puede deshacer/i,
      pt: /não pode ser desfeito/i,
      id: /tidak bisa dibatalkan/i,
    };
    for (const loc of LOCALES) {
      expect({ loc, body: detail(loc).deleteSourceConfirmBody }).toEqual({
        loc,
        body: expect.stringMatching(IRREVERSIBLE[loc]),
      });
    }
  });

  test("베타 로케일은 영어 사본이 아니고, 한국어는 해요체다", () => {
    for (const loc of ["es", "pt", "id"] as const) {
      for (const key of KEYS) expect({ loc, key, same: detail(loc)[key] === detail("en")[key] }).toEqual({ loc, key, same: false });
    }
    expect(detail("ko").deleteSourceConfirmBody).toMatch(/요\./);
    expect(detail("ko").deleteSourceConfirmBody).not.toMatch(/니다\./);
  });
});
