// 담아 둔 자료(sources) 한 건을 끝까지 지운다 (Q-260914-01 B 확장, 2026-09-14).
//
// 대화 자동 저장은 wiki_pages 가 아니라 sources 에 쓴다. 그 한 건을 되돌리려면 세 곳을 지워야 하고,
// 순서가 계약이다 - r3as F-02 로 원문을 맨 앞으로 옮겼다:
//   1. raw-clippings 의 원문. 못 지우면 여기서 멈추고 행을 건드리지 않는다. 행이 남아야 storage_path 를
//      다시 읽고 다시 시도할 수 있다. 이미 없는 객체는 지운 것으로 친다.
//   2. 이 자료로 만든 위키 페이지(kind='source'). wiki_pages.source_id 는 ON DELETE SET NULL 인데
//      CHECK((kind = 'source') = (source_id IS NOT NULL)) 가 있어서, 페이지가 남아 있으면 source 삭제가
//      제약 위반으로 막힌다(db/migrations/0022_wiki_rag.sql 의 wiki_pages_source_kind_pair).
//   3. source 행.
// 결과는 deleted · not_deleted · partly_deleted 셋이고, 화면은 deleted 일 때만 뒤로 간다.
//
// ⚠ 옛 계약(페이지 -> 행 -> 원문, 원문은 best-effort)은 원문 삭제가 실패해도 성공을 돌려줬고, 그때는
//   storage_path 를 가진 행이 이미 없어서 다시 시도할 길이 없었다. 여기 있던 "본문 삭제가 실패해도
//   성공으로 끝낸다" 단언은 그 결함을 고정하고 있었으므로 뒤집었다.
//
// 목은 순서를 받아 적기만 하지 않는다. 위 CHECK 를 **실제로 강제**하고 Storage 객체도 **상태로** 든다.
// 그래야 "원문 먼저"가 통과한 것이 순서를 지켜서인지, 목이 무엇이든 받아줘서인지 구분된다(대조군).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

type MockRow = Record<string, unknown>;

const mockDb = {
  sources: [] as MockRow[],
  wiki_pages: [] as MockRow[],
  objects: new Set<string>(),
  writes: [] as string[],
  storageFails: false,
  lookupFails: false,
  denySourceDelete: false,
  /** 다음 N 번의 sources DELETE 를 오류로 돌려준다(연결 끊김 같은 것). */
  sourceDeleteErrors: 0,
};

function mockQuery(table: "sources" | "wiki_pages") {
  let op: "select" | "delete" | "update" = "select";
  let patch: MockRow = {};
  const filters: ((row: MockRow) => boolean)[] = [];
  const run = (): { data: MockRow[] | null; error: { message: string; code?: string } | null; count?: number | null } => {
    const rows = mockDb[table];
    const hit = rows.filter((row) => filters.every((keep) => keep(row)));
    if (op === "select") {
      if (table === "sources" && mockDb.lookupFails) return { data: null, error: { message: "lookup failed" } };
      return { data: hit.map((row) => ({ ...row })), error: null };
    }
    if (op === "update") {
      mockDb.writes.push(`update ${table}`);
      hit.forEach((row) => Object.assign(row, patch));
      return { data: null, error: null };
    }
    if (table === "sources") {
      if (mockDb.sourceDeleteErrors > 0) {
        mockDb.sourceDeleteErrors -= 1;
        mockDb.writes.push("delete sources (error)");
        return { data: null, error: { message: "network down" }, count: null };
      }
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
        // 이미 없는 경로는 오류가 아니라 지운 목록에서 빠지는 것으로 둔다. Supabase 문서는 remove 가
        // "지운 파일" 의 목록을 돌려준다고 적는다. ⚠ 실 Storage 로는 확인하지 않았다.
        const removed = paths.filter((path) => mockDb.objects.delete(path));
        return { data: removed.map((name) => ({ name })), error: null };
      },
    }),
  },
};

jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => mockClient }));
jest.mock("../../persona/load-domain-levels", () => ({ invalidateDomainLevels: jest.fn() }));

import { deleteCapturedSource } from "../delete-captured-source";

const { invalidateDomainLevels } = jest.requireMock("../../persona/load-domain-levels") as {
  invalidateDomainLevels: jest.Mock;
};

const OWNER = "user-a";
const PATH = `${OWNER}/chat-abc123.md`;
const SOURCE: MockRow = { id: "src-1", user_id: OWNER, storage_path: PATH, ingested: false };
const PAGE: MockRow = { id: "page-1", user_id: OWNER, kind: "source", source_id: "src-1" };

beforeEach(() => {
  mockDb.sources = [];
  mockDb.wiki_pages = [];
  mockDb.objects = new Set([PATH]);
  mockDb.writes = [];
  mockDb.storageFails = false;
  mockDb.lookupFails = false;
  mockDb.denySourceDelete = false;
  mockDb.sourceDeleteErrors = 0;
  invalidateDomainLevels.mockClear();
});

/** console.warn 을 조용히 받아 적으며 돌린다. */
async function quietly<T>(run: () => Promise<T>): Promise<{ result: T; logged: string }> {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const result = await run();
    return { result, logged: warn.mock.calls.flat().map((part) => String(part)).join(" ") };
  } finally {
    warn.mockRestore();
  }
}

describe("지우는 순서 - 원문, 승격 페이지, source 행", () => {
  test("승격된 페이지가 없으면 원문, 그다음 source 행", async () => {
    mockDb.sources = [{ ...SOURCE }];
    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("deleted");
    expect(mockDb.writes).toEqual(["storage remove", "delete sources"]);
    expect(mockDb.sources).toEqual([]);
    expect([...mockDb.objects]).toEqual([]);
  });

  test("승격된 페이지가 있으면 원문, 페이지, source 행 순서다", async () => {
    mockDb.sources = [{ ...SOURCE, ingested: true }];
    mockDb.wiki_pages = [{ ...PAGE }, { id: "page-other", user_id: OWNER, kind: "concept", source_id: null }];
    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("deleted");
    // 가운데 update 는 deleteWikiPage 의 기존 계약(원본을 미수집으로 되돌림)이다.
    expect(mockDb.writes).toEqual(["storage remove", "delete wiki_pages", "update sources", "delete sources"]);
    expect(mockDb.wiki_pages.map((page) => page.id)).toEqual(["page-other"]);
    expect(mockDb.sources).toEqual([]);
  });

  test("대조군: 페이지를 남긴 채 source 를 지우면 CHECK 제약이 막는다", async () => {
    // 이 목이 제약을 실제로 강제한다는 증거다. 이게 없으면 위 순서 검사는 목이
    // 관대해서 통과한 것일 수 있다.
    mockDb.sources = [{ ...SOURCE }];
    mockDb.wiki_pages = [{ ...PAGE }];
    const result = (await mockClient.from("sources").delete().eq("user_id", OWNER).eq("id", "src-1")) as {
      error: { code?: string } | null;
    };
    expect(result.error?.code).toBe("23514");
    expect(mockDb.sources).toHaveLength(1);
  });

  test("원문 경로가 없는 자료는 페이지와 행만 지운다", async () => {
    mockDb.sources = [{ ...SOURCE, storage_path: null }];
    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("deleted");
    expect(mockDb.writes).toEqual(["delete sources"]);
  });

  test("다 지운 뒤 별 밝기 캐시를 버린다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    await deleteCapturedSource(OWNER, "src-1");
    expect(invalidateDomainLevels).toHaveBeenCalledWith(OWNER);
  });
});

describe("원문을 못 지우면 아무 행도 건드리지 않는다 (r3as F-02)", () => {
  test("not_deleted 를 돌려주고 행 · 페이지 · storage_path 가 그대로 남는다 - 다시 시도할 손잡이", async () => {
    mockDb.sources = [{ ...SOURCE, ingested: true }];
    mockDb.wiki_pages = [{ ...PAGE }];
    mockDb.storageFails = true;
    const { result } = await quietly(() => deleteCapturedSource(OWNER, "src-1"));
    expect(result).toBe("not_deleted");
    expect(mockDb.writes).toEqual(["storage remove"]);
    expect(mockDb.sources).toEqual([{ ...SOURCE, ingested: true }]);
    expect(mockDb.wiki_pages).toHaveLength(1);
    expect(invalidateDomainLevels).not.toHaveBeenCalled();
  });

  test("다시 시도해서 원문이 지워지면 이어서 끝까지 지운다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    mockDb.storageFails = true;
    expect((await quietly(() => deleteCapturedSource(OWNER, "src-1"))).result).toBe("not_deleted");
    mockDb.storageFails = false;
    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("deleted");
    expect(mockDb.sources).toEqual([]);
    expect([...mockDb.objects]).toEqual([]);
  });

  test("로그에는 실패 사실만 남는다 - 경로, id, 오류 본문을 쓰지 않는다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    mockDb.storageFails = true;
    const { logged } = await quietly(() => deleteCapturedSource(OWNER, "src-1"));
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain(OWNER);
    expect(logged).not.toContain("src-1");
    expect(logged).not.toContain("chat-abc123");
    expect(logged).not.toContain("remove failed");
  });
});

describe("원문을 지운 뒤 행 단계에서 실패하면", () => {
  // r3as2 R3AS2-03: 원문을 이미 지웠다는 사실은 따로 돌려준다(raw_removed). 화면이 "자료가 아직 남아 있다" 고
  // 말하지 않게 하려는 것이다 - 원문은 되돌릴 수 없게 사라졌다.
  test("raw_removed 를 돌려주고, 다시 시도하면 이미 없는 원문을 지나 끝까지 지운다", async () => {
    mockDb.sources = [{ ...SOURCE, ingested: true }];
    mockDb.wiki_pages = [{ ...PAGE }];
    mockDb.sourceDeleteErrors = 1;
    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("raw_removed");
    expect([...mockDb.objects]).toEqual([]); // 원문은 지웠다
    expect(mockDb.wiki_pages).toEqual([]); // 승격 페이지도 지웠다
    expect(mockDb.sources).toHaveLength(1); // 행이 남았다
    expect(mockDb.sources[0].storage_path).toBe(PATH); // 다시 시도할 손잡이

    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("deleted");
    expect(mockDb.sources).toEqual([]);
  });

  test("행이 0행으로 안 지워지고 남아 있으면(RLS 거부) 성공이라 하지 않는다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    mockDb.denySourceDelete = true;
    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("raw_removed");
    expect(mockDb.sources).toHaveLength(1);
    expect(invalidateDomainLevels).not.toHaveBeenCalled();
  });

  test("원문이 없던 자료가 행에서 실패하면 지운 것이 없으니 not_deleted 다", async () => {
    mockDb.sources = [{ ...SOURCE, storage_path: null }];
    mockDb.sourceDeleteErrors = 1;
    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("not_deleted");
    expect(mockDb.sources).toHaveLength(1);
  });

  test("원문이 없던 자료에서 승격 페이지만 지우고 행에서 멈추면 partly_deleted 다 - 원문을 지웠다고 하지 않는다", async () => {
    mockDb.sources = [{ ...SOURCE, storage_path: null, ingested: true }];
    mockDb.wiki_pages = [{ ...PAGE }];
    mockDb.sourceDeleteErrors = 1;
    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("partly_deleted");
    expect(mockDb.wiki_pages).toEqual([]);
    expect(mockDb.sources).toHaveLength(1);
    expect(mockDb.writes).not.toContain("storage remove");
  });
});

describe("본인 행만", () => {
  test("남의 id 는 아무것도 지우지 않는다 - 이미 없는 id 와 같은 답이다", async () => {
    mockDb.sources = [{ ...SOURCE, user_id: "user-b", storage_path: "user-b/chat-abc123.md" }];
    mockDb.objects = new Set(["user-b/chat-abc123.md"]);
    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("not_deleted");
    await expect(deleteCapturedSource(OWNER, "src-missing")).resolves.toBe("not_deleted");
    expect(mockDb.writes).toEqual([]);
    expect(mockDb.sources).toHaveLength(1);
  });

  test("원문 경로가 본인 폴더 밖이면 지운 척하지 않고 멈춘다", async () => {
    mockDb.sources = [{ ...SOURCE, storage_path: "user-b/elsewhere.md" }];
    const { result } = await quietly(() => deleteCapturedSource(OWNER, "src-1"));
    expect(result).toBe("not_deleted");
    expect(mockDb.writes).toEqual([]);
    expect(mockDb.sources).toHaveLength(1);
  });

  test("조회가 실패하면 아무것도 지우지 않는다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    mockDb.lookupFails = true;
    await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("not_deleted");
    expect(mockDb.writes).toEqual([]);
  });
});

// ── 배송 기록 상세 화면 ───────────────────────────────────────────────────────────
//
// 화면을 렌더하지 않고(이 저장소에서 컴포넌트 렌더 테스트는 막혀 있다) handleDeleteSource 의
// useCallback 본문만 AST 로 떼어 바인딩 위에서 돌린다. 삭제 함수는 진짜고 DB 와 Storage 만 목이다.

const DETAIL_FILE = join(process.cwd(), "src/screens/deepspace/dds-record-detail-screen.tsx");

function detailDeleteHandler(bindings: Record<string, unknown>): () => Promise<void> {
  const ast = ts.createSourceFile(DETAIL_FILE, readFileSync(DETAIL_FILE, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { text?: string } = {};
  const visit = (node: ts.Node): void => {
    if (found.text !== undefined) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "handleDeleteSource" &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.arguments.length > 0
    ) {
      found.text = node.initializer.arguments[0].getText(ast);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (found.text === undefined) throw new Error("handleDeleteSource 의 useCallback 본문을 찾지 못했다");
  const js = ts.transpileModule(`const handleDeleteSource = ${found.text};\nreturn handleDeleteSource;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as () => Promise<void>;
}

function detailScreen() {
  const said: string[] = [];
  const expressions: string[] = [];
  const router = { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn() };
  const identity = `${OWNER}:src-src-1`;
  const run = detailDeleteHandler({
    locksRef: { current: { edit: null, tags: null, delete: null, promote: null } },
    primary: { status: "ready", identity, piece: { origin: "source" } },
    identity,
    userId: OWNER,
    recordId: "src-src-1",
    SOURCE_ID_PREFIX: "src-",
    deleteCapturedSource,
    isCurrent: () => true,
    setDeleting: () => undefined,
    setActionError: () => undefined,
    reactExpression: (name: string) => expressions.push(name),
    router,
    t: (key: string) => key,
    // 인자 없이 부르면 화면의 기본 문구(actionFailed)다.
    announceActionError: (message?: string) => said.push(message ?? "deepspace:recordDetail.actionFailed"),
  });
  return { run, said, expressions, router };
}

describe("기록 상세 화면은 다 지웠을 때만 뒤로 간다", () => {
  test("원문을 못 지우면 확인 창에 머물러 삭제하지 못했다고 말한다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    mockDb.storageFails = true;
    const screen = detailScreen();
    await quietly(() => screen.run());
    expect(screen.router.back).not.toHaveBeenCalled();
    expect(screen.router.replace).not.toHaveBeenCalled();
    expect(screen.expressions).toEqual([]);
    expect(screen.said).toEqual(["deepspace:recordDetail.deleteSourceFailed"]);
    expect(mockDb.sources).toHaveLength(1);
  });

  test("원문을 지운 뒤 멈췄으면 원문이 삭제됐다는 문구로 말하고 머문다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    mockDb.sourceDeleteErrors = 1;
    const screen = detailScreen();
    await screen.run();
    expect(screen.router.back).not.toHaveBeenCalled();
    expect(screen.said).toEqual(["deepspace:recordDetail.deleteSourceRawRemoved"]);
  });

  test("원문이 없던 자료가 일부만 지워졌으면 일부만 삭제됐다는 문구로 말하고 머문다", async () => {
    mockDb.sources = [{ ...SOURCE, storage_path: null }];
    mockDb.wiki_pages = [{ ...PAGE }];
    mockDb.sourceDeleteErrors = 1;
    const screen = detailScreen();
    await screen.run();
    expect(screen.router.back).not.toHaveBeenCalled();
    expect(screen.said).toEqual(["deepspace:recordDetail.deleteSourcePartial"]);
  });

  test("다 지웠으면 뒤로 간다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    const screen = detailScreen();
    await screen.run();
    expect(screen.said).toEqual([]);
    expect(screen.router.back).toHaveBeenCalledTimes(1);
  });

  test("화면이 쓰는 접두사가 이 테스트의 값과 같다", () => {
    const getPiece = readFileSync(join(process.cwd(), "src/lib/records/get-piece.ts"), "utf8");
    expect(getPiece).toContain('export const SOURCE_ID_PREFIX = "src-";');
  });
});

describe("다른 계정의 페이지가 이 자료를 참조하면 (r3as M1, 기존 스키마)", () => {
  // wiki_pages.source_id FK 에 소유자가 없어서(db/migrations/0022_wiki_rag.sql) 다른 계정의 위키
  // 페이지가 내 source 를 참조할 수 있다. 그 페이지는 RLS 때문에 내 조회에 안 보이고, source 삭제는
  // CHECK 23514 로 막힌다. 스키마 보강(복합 FK)은 마이그레이션이라 이 PR 밖이다. 여기서 지키는 것은
  // 사용자 쪽 닫힘이다: 크래시 없이, 남의 페이지가 있다는 것을 드러내지 않는 같은 문구로, 로그 없이.
  // 남의 행을 클라이언트에서 지우는 식으로 풀지 않는다 - 그 페이지는 끝까지 그대로여야 한다.
  const FOREIGN_PAGE: MockRow = { id: "page-b", user_id: "user-b", kind: "source", source_id: "src-1" };

  test("23514 로 막히면 raw_removed 로 닫고, 행과 남의 페이지를 건드리지 않고, 아무것도 로그하지 않는다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    mockDb.wiki_pages = [{ ...FOREIGN_PAGE }];
    const consoles = (["warn", "error", "log", "info"] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined),
    );
    try {
      await expect(deleteCapturedSource(OWNER, "src-1")).resolves.toBe("raw_removed");
      for (const spy of consoles) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of consoles) spy.mockRestore();
    }
    expect(mockDb.writes).toContain("delete sources (blocked)");
    expect(mockDb.sources).toEqual([{ ...SOURCE }]);
    expect(mockDb.wiki_pages).toEqual([{ ...FOREIGN_PAGE }]);
  });

  test("화면 문구는 연결이 끊겨 행을 못 지운 경우와 같다 - 남의 페이지가 있다는 것을 가려 주지 않는다", async () => {
    mockDb.sources = [{ ...SOURCE }];
    mockDb.wiki_pages = [{ ...FOREIGN_PAGE }];
    const blocked = detailScreen();
    await blocked.run();

    mockDb.sources = [{ ...SOURCE }];
    mockDb.wiki_pages = [];
    mockDb.objects = new Set([PATH]);
    mockDb.sourceDeleteErrors = 1;
    const offline = detailScreen();
    await offline.run();

    expect(blocked.said).toEqual(["deepspace:recordDetail.deleteSourceRawRemoved"]);
    expect(blocked.said).toEqual(offline.said);
    expect(blocked.router.back).not.toHaveBeenCalled();
  });

  test("영구히 막히는 이 경로의 문구는 원문이 삭제됐다고 말하고, 다시 시도하면 끝난다고 약속하지 않는다 (r3as2 R3AS2-03)", async () => {
    // 옛 문구는 "자료가 아직 남아 있고 다시 시도하면 마저 삭제한다" 였다. 실제로는 원문이 이미 되돌릴 수 없게
    // 사라졌고, 서버 스키마가 고쳐질 때까지 같은 재시도는 매번 23514 로 막힌다.
    mockDb.sources = [{ ...SOURCE }];
    mockDb.wiki_pages = [{ ...FOREIGN_PAGE }];
    const first = detailScreen();
    await first.run();
    const retry = detailScreen();
    await retry.run();
    expect(retry.said).toEqual(first.said); // 다시 시도해도 같은 자리다
    expect(mockDb.sources).toHaveLength(1);

    const key = first.said[0].replace("deepspace:recordDetail.", "");
    for (const loc of LOCALES) {
      const text = detail(loc)[key];
      expect({ loc, rawDeleted: RAW_DELETED[loc].test(text) }).toEqual({ loc, rawDeleted: true });
      expect({ loc, mayNotFinish: MAY_NOT_FINISH[loc].test(text) }).toEqual({ loc, mayNotFinish: true });
      expect({ loc, promise: OLD_PROMISE[loc].test(text) }).toEqual({ loc, promise: false });
    }
  });
});

// ── 문구 ─────────────────────────────────────────────────────────────────────────

const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
type Locale = (typeof LOCALES)[number];
const detail = (loc: string): Record<string, string> =>
  (
    JSON.parse(readFileSync(join(process.cwd(), "locales", loc, "deepspace.json"), "utf8")) as {
      recordDetail: Record<string, string>;
    }
  ).recordDetail;
/** 원문이 삭제됐다는 사실 (r3as2 R3AS2-03). */
const RAW_DELETED: Record<Locale, RegExp> = {
  en: /saved text was deleted/i,
  ko: /원문은 삭제됐어요/,
  es: /texto guardado se eliminó/i,
  pt: /texto salvo foi excluído/i,
  id: /teks tersimpan sudah dihapus/i,
};
/** 다시 시도해도 끝나지 않을 수 있다는 사실. */
const MAY_NOT_FINISH: Record<Locale, RegExp> = {
  en: /trying again may not finish/i,
  ko: /다시 시도해도 끝나지 않을 수 있어요/,
  es: /puede que no termine aunque lo intentes de nuevo/i,
  pt: /pode não terminar mesmo se você tentar de novo/i,
  id: /mencoba lagi pun mungkin tidak menyelesaikannya/i,
};
/** 옛 문구가 하던 약속: 자료가 아직 남아 있다 · 다시 시도하면 마저 지운다. */
const OLD_PROMISE: Record<Locale, RegExp> = {
  en: /still here|try again to finish/i,
  ko: /아직 남아 있어요|마저 삭제해요/,
  es: /sigue aquí|para terminar/i,
  pt: /ainda está aqui|para concluir/i,
  id: /masih ada|untuk menyelesaikan/i,
};

describe("확인 문구", () => {
  // deleteSourceFailed · deleteSourcePartial 은 r3as F-02, deleteSourceRawRemoved 는 r3as2 R3AS2-03 의 결과 문구다.
  const KEYS = [
    "a11yDeleteSource",
    "deleteSourceConfirmTitle",
    "deleteSourceConfirmBody",
    "deleteSourceFailed",
    "deleteSourcePartial",
    "deleteSourceRawRemoved",
  ] as const;
  const IRREVERSIBLE: Record<(typeof LOCALES)[number], RegExp> = {
    en: /cannot be undone/i,
    ko: /되돌릴 수 없/,
    es: /no se puede deshacer/i,
    pt: /não pode ser desfeito/i,
    id: /tidak bisa dibatalkan/i,
  };

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
    for (const loc of LOCALES) {
      expect({ loc, body: detail(loc).deleteSourceConfirmBody }).toEqual({
        loc,
        body: expect.stringMatching(IRREVERSIBLE[loc]),
      });
    }
  });

  test("지우지 못했다는 문구는 되돌릴 수 없는 삭제를 말하지 않는다", () => {
    for (const loc of LOCALES) {
      expect({ loc, failed: IRREVERSIBLE[loc].test(detail(loc).deleteSourceFailed) }).toEqual({ loc, failed: false });
    }
  });

  test("베타 로케일은 영어 사본이 아니고, 한국어는 해요체다", () => {
    for (const loc of ["es", "pt", "id"] as const) {
      for (const key of KEYS) expect({ loc, key, same: detail(loc)[key] === detail("en")[key] }).toEqual({ loc, key, same: false });
    }
    for (const key of ["deleteSourceConfirmBody", "deleteSourceFailed", "deleteSourcePartial", "deleteSourceRawRemoved"] as const) {
      expect(detail("ko")[key]).toMatch(/요\./);
      expect(detail("ko")[key]).not.toMatch(/니다\./);
    }
  });

  test("일부만 지워진 두 문구는 다시 시도하면 끝난다고 약속하지 않고, 원인을 말하지 않는다 (r3as2 R3AS2-03)", () => {
    const CAUSE: Record<Locale, RegExp> = {
      en: /account|constraint|reference|another/i,
      ko: /계정|제약|참조|다른 사람/,
      es: /cuenta|restricción|referencia/i,
      pt: /conta|restrição|referência/i,
      id: /akun|batasan|referensi/i,
    };
    for (const loc of LOCALES) {
      for (const key of ["deleteSourcePartial", "deleteSourceRawRemoved"] as const) {
        const text = detail(loc)[key];
        expect({ loc, key, mayNotFinish: MAY_NOT_FINISH[loc].test(text) }).toEqual({ loc, key, mayNotFinish: true });
        expect({ loc, key, promise: OLD_PROMISE[loc].test(text), cause: CAUSE[loc].test(text) }).toEqual({
          loc,
          key,
          promise: false,
          cause: false,
        });
      }
      // 원문을 지웠다는 말은 원문을 실제로 지운 경우의 문구에만 있다.
      expect({ loc, partialSaysRaw: RAW_DELETED[loc].test(detail(loc).deleteSourcePartial) }).toEqual({ loc, partialSaysRaw: false });
    }
  });
});
