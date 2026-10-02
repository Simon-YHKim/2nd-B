// 담아 둔 자료(sources)를 지우는 길이 raw-clippings 원문도 함께 지우는가 (R28, 2026-09-20).
//
// 왜. 설정의 '정리하지 않은 캡처 삭제'(deleteUningestedSources) · '전체 삭제'(deleteAllUserData),
// 가져오기 철회(deleteSourcesByIds), 옛 한 건 삭제(deleteSource)는 sources 행만 지우고 Storage 원문을
// 남겼다. 앱 목록은 행 기준이라 안 보이지만, 데이터 내보내기(export-account)는 raw-clippings/<uid>/
// 폴더를 나열해 그대로 내보낸다 - 사용자가 지웠다고 믿은 것이 남는 개인정보 결함이었다.
//
// R30 - #1839 1차 게이트(두 레인 BLOCK) 대응. 재현은 게이트 문서의 순서 그대로다.
//   JZ-1839-1  정상 담기가 만드는 256자 이름(240자 제목 + 해시)을 선택 삭제는 원문만 빼고 행을 지웠고(거짓 성공),
//              전체 삭제는 그 이름에서 매번 던져 기록 단계까지 막혔다.
//   JA-1839-3 · JZ-1839-2  파괴 작업이 시작한 세션에 묶이지 않아, 다른 세션의 RLS 빈 결과를 '다 지웠다'로 읽었다.
//   JA-1839-2  선택 삭제의 위키 참조 확인과 원문 삭제 사이에 위키 생성이 끼면 남겨야 할 원문만 사라졌다.
//   JA-1839-1  전체 삭제가 빈 폴더를 확인한 뒤 받은편지함의 승격이 예전 본문을 다시 올렸다.
//
// 가짜 클라이언트는 상태를 든다: sources · wiki_pages · 기록 행과 버킷의 객체. 서버가 하는 일 중 이 계약에 걸리는
// 것만 흉내 낸다 - 조건 필터(frontmatter->키->>키 경로 포함), 요청이 적용되는 그 순간의 세션으로 거르는 RLS(남의
// 행과 객체는 보이지도 지워지지도 않는다), wiki_pages 의 FK 와 source_kind_pair CHECK(0022), 한 단계만 보여 주는
// list(하위 폴더는 id 가 null 인 항목), 실제로 지운 객체만 돌려주는 remove, 업로드 · 내려받기. 실패와 RLS 거부는
// 주입한다. before 고리는 요청을 적용하기 직전에 불린다 - 거기서 멈추면 그 요청은 '가는 중'이고, 세션을 바꾸면 그
// 요청은 바뀐 세션으로 도착한다. 끼어들기 재현은 전부 이 고리로 순서를 못박는다(시간이 아니라 순서).

import { readFileSync } from "node:fs";
import { join } from "node:path";

type Row = { id: string; [key: string]: unknown };
type FakeOp = { kind: string; target: string; payload?: unknown };
type FakeSession = { userId: string; sessionId: string; version: number };

interface FakeState {
  tables: Record<string, Row[]>;
  objects: Map<string, string>;
  log: string[];
  removeCalls: string[][];
  listCalls: { bucket: string; prefix: string; options: { limit?: number; offset?: number } | undefined }[];
  buckets: Set<string>;
  session: FakeSession | null;
  before: ((op: FakeOp) => void | Promise<void>) | null;
  faults: {
    removeErrors: number;
    listErrors: number;
    sourceDeleteErrors: number;
    refuseRowIds: Set<string>;
    refuseObjects: Set<string>;
    endless: boolean;
  };
}

jest.mock("../../supabase/client", () => {
  type FakeRow = { id: string; [key: string]: unknown };
  type Op = { kind: string; target: string; payload?: unknown };
  type Session = { userId: string; sessionId: string; version: number };
  type Filter = (row: FakeRow) => boolean;
  const state = {
    tables: {} as Record<string, FakeRow[]>,
    objects: new Map<string, string>(),
    log: [] as string[],
    removeCalls: [] as string[][],
    listCalls: [] as { bucket: string; prefix: string; options: { limit?: number; offset?: number } | undefined }[],
    buckets: new Set<string>(),
    session: { userId: "u1", sessionId: "session-u1", version: 1 } as Session | null,
    before: null as ((op: Op) => void | Promise<void>) | null,
    faults: {
      removeErrors: 0,
      listErrors: 0,
      sourceDeleteErrors: 0,
      refuseRowIds: new Set<string>(),
      refuseObjects: new Set<string>(),
      endless: false,
    },
    nextId: 0,
  };

  function reset(): void {
    state.tables = {};
    state.objects.clear();
    state.log.length = 0;
    state.removeCalls.length = 0;
    state.listCalls.length = 0;
    state.buckets.clear();
    state.session = { userId: "u1", sessionId: "session-u1", version: 1 };
    state.before = null;
    state.faults.removeErrors = 0;
    state.faults.listErrors = 0;
    state.faults.sourceDeleteErrors = 0;
    state.faults.refuseRowIds.clear();
    state.faults.refuseObjects.clear();
    state.faults.endless = false;
    state.nextId = 0;
  }

  async function gate(op: Op): Promise<void> {
    const before = state.before;
    if (before) await before(op);
  }

  /** Who the request runs as: the session at the moment it lands, like auth.uid() under RLS. */
  function actor(): string | null {
    return state.session?.userId ?? null;
  }

  function ownerOf(row: FakeRow): unknown {
    return row.user_id ?? row.owner_id;
  }

  function folderOwner(path: string): string {
    return path.split("/")[0] ?? "";
  }

  function clone<T>(value: T): T {
    return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
  }

  // PostgREST column paths: frontmatter->_erasing->>token. -> keeps JSON, ->> gives text, a missing key is NULL.
  function resolve(row: FakeRow, column: string): unknown {
    const parts = column.split(/(->>|->)/);
    let value: unknown = row[parts[0]];
    let text = false;
    for (let i = 1; i < parts.length; i += 2) {
      value = value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)[parts[i + 1]]
        : undefined;
      text = parts[i] === "->>";
    }
    if (value === undefined || value === null) return undefined;
    if (text) return typeof value === "object" ? JSON.stringify(value) : String(value);
    return value;
  }

  function same(value: unknown, expected: unknown): boolean {
    if (value === undefined) return false;
    if (typeof value === "object") return JSON.stringify(value) === JSON.stringify(expected);
    return value === expected || (typeof value === "string" && value === String(expected));
  }

  function from(table: string) {
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    let values: unknown = null;
    let exact = false;
    let columns = "*";
    let returning = false;
    let order: { column: string; ascending: boolean } | null = null;
    let limit: number | null = null;
    let single: "one" | "maybe" | null = null;

    function project(row: FakeRow): Record<string, unknown> {
      if (columns === "*") return clone(row);
      const out: Record<string, unknown> = {};
      for (const column of columns.split(",").map((c) => c.trim())) {
        if (column.includes("(")) continue;
        out[column] = clone(row[column]);
      }
      return out;
    }

    function finish(rows: FakeRow[], count: number | null) {
      const data = rows.map(project);
      if (single === "one") {
        return data.length === 1
          ? { data: data[0], error: null, count }
          : { data: null, error: { code: "PGRST116", message: "not a single row" }, count };
      }
      if (single === "maybe") return { data: data[0] ?? null, error: null, count };
      return { data, error: null, count };
    }

    async function run() {
      await gate({ kind: mode, target: table, payload: values });
      const who = actor();
      const all = state.tables[table] ?? (state.tables[table] = []);
      const matched = all.filter((row) => ownerOf(row) === who && filters.every((keep) => keep(row)));

      if (mode === "select") {
        state.log.push(`select:${table}`);
        const sorted = [...matched];
        if (order) {
          const { column, ascending } = order;
          sorted.sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
        }
        return finish(limit === null ? sorted : sorted.slice(0, limit), null);
      }

      if (mode === "update") {
        state.log.push(`update:${table}`);
        for (const row of matched) Object.assign(row, clone(values as Record<string, unknown>));
        const count = exact ? matched.length : null;
        return returning ? finish(matched, count) : { data: null, error: null, count };
      }

      if (mode === "delete") {
        state.log.push(`delete:${table}`);
        if (table === "sources" && state.faults.sourceDeleteErrors > 0) {
          state.faults.sourceDeleteErrors -= 1;
          return { data: null, error: { message: "sources delete failed" }, count: null };
        }
        const hit = matched.filter((row) => !(table === "sources" && state.faults.refuseRowIds.has(row.id)));
        if (table === "sources") {
          const ids = new Set(hit.map((row) => row.id));
          const pinned = (state.tables.wiki_pages ?? []).some(
            (page) => page.kind === "source" && ids.has(page.source_id as string),
          );
          if (pinned) {
            return { data: null, error: { code: "23514", message: "wiki_pages_source_kind_pair" }, count: null };
          }
        }
        state.tables[table] = all.filter((row) => !hit.includes(row));
        return { data: null, error: null, count: exact ? hit.length : null };
      }

      state.log.push(`${mode}:${table}`);
      const written: FakeRow[] = [];
      for (const input of (Array.isArray(values) ? values : [values]) as Record<string, unknown>[]) {
        if (ownerOf(input as FakeRow) !== who) return { data: null, error: { code: "42501", message: "row-level security" } };
        if (table === "wiki_pages") {
          const sourceId = input.source_id ?? null;
          if (sourceId !== null && !(state.tables.sources ?? []).some((row) => row.id === sourceId)) {
            return { data: null, error: { code: "23503", message: "wiki_pages_source_id_fkey" } };
          }
          if ((input.kind === "source") !== (sourceId !== null)) {
            return { data: null, error: { code: "23514", message: "wiki_pages_source_kind_pair" } };
          }
        }
        const existing = mode === "upsert"
          ? all.find((row) => row.user_id === input.user_id && row.slug === input.slug)
          : undefined;
        if (existing) {
          Object.assign(existing, clone(input));
          written.push(existing);
        } else {
          state.nextId += 1;
          const row = { id: `${table}-${state.nextId}`, ...clone(input) } as FakeRow;
          all.push(row);
          written.push(row);
        }
      }
      return returning ? finish(written, null) : { data: null, error: null };
    }

    const builder = {
      select(cols?: string) {
        if (mode !== "select") returning = true;
        if (typeof cols === "string") columns = cols;
        return builder;
      },
      insert(input: unknown) {
        mode = "insert";
        values = input;
        return builder;
      },
      upsert(input: unknown) {
        mode = "upsert";
        values = input;
        return builder;
      },
      update(input: unknown, options?: { count?: string }) {
        mode = "update";
        values = input;
        exact = options?.count === "exact";
        return builder;
      },
      delete(options?: { count?: string }) {
        mode = "delete";
        exact = options?.count === "exact";
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => same(resolve(row, column), value));
        return builder;
      },
      in(column: string, list: unknown[]) {
        const set = new Set(list);
        filters.push((row) => set.has(resolve(row, column)));
        return builder;
      },
      gt(column: string, value: unknown) {
        filters.push((row) => {
          const current = resolve(row, column);
          return current !== undefined && String(current) > String(value);
        });
        return builder;
      },
      is(column: string, value: null) {
        filters.push((row) => (value === null ? resolve(row, column) === undefined : resolve(row, column) === value));
        return builder;
      },
      contains(column: string, subset: Record<string, unknown>) {
        filters.push((row) => {
          const current = row[column];
          if (current === null || typeof current !== "object") return false;
          return Object.entries(subset).every(
            ([key, expected]) => JSON.stringify((current as Record<string, unknown>)[key]) === JSON.stringify(expected),
          );
        });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        order = { column, ascending: options?.ascending !== false };
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      single() {
        single = "one";
        return builder;
      },
      maybeSingle() {
        single = "maybe";
        return builder;
      },
      then<T1, T2>(resolveFn: (value: unknown) => T1, rejectFn?: (reason: unknown) => T2) {
        return run().then(resolveFn, rejectFn);
      },
    };
    return builder;
  }

  function bucketApi(bucket: string) {
    state.buckets.add(bucket);
    return {
      async list(prefix: string, options?: { limit?: number; offset?: number }) {
        await gate({ kind: "list", target: bucket, payload: prefix });
        state.listCalls.push({ bucket, prefix, options });
        state.log.push(`list:${prefix}`);
        if (state.faults.listErrors > 0) {
          state.faults.listErrors -= 1;
          return { data: null, error: { message: "list failed" } };
        }
        if (state.faults.endless) state.objects.set(`${prefix}/endless-${state.listCalls.length}.md`, "x");
        // RLS: a folder you do not own lists as empty, not as an error.
        if (folderOwner(prefix) !== actor()) return { data: [], error: null };
        const folder = `${prefix}/`;
        const entries = new Map<string, boolean>();
        for (const key of state.objects.keys()) {
          if (!key.startsWith(folder)) continue;
          const rest = key.slice(folder.length);
          const slash = rest.indexOf("/");
          if (slash === -1) entries.set(rest, true);
          else if (!entries.has(rest.slice(0, slash))) entries.set(rest.slice(0, slash), false);
        }
        const offset = options?.offset ?? 0;
        const size = options?.limit ?? 100;
        const page = [...entries.keys()].sort().slice(offset, offset + size).map((name) =>
          entries.get(name)
            ? { name, id: `object-${name}`, metadata: { size: 1 } }
            : { name, id: null, metadata: null },
        );
        return { data: page, error: null };
      },
      async remove(paths: string[]) {
        await gate({ kind: "remove", target: bucket, payload: paths });
        state.removeCalls.push([...paths]);
        state.log.push(`remove:${paths.length}`);
        if (state.faults.removeErrors > 0) {
          state.faults.removeErrors -= 1;
          return { data: null, error: { message: "remove failed" } };
        }
        const removed: { name: string }[] = [];
        for (const path of paths) {
          if (folderOwner(path) !== actor()) continue;
          if (state.objects.has(path) && !state.faults.refuseObjects.has(path)) {
            state.objects.delete(path);
            removed.push({ name: path });
          }
        }
        return { data: removed, error: null };
      },
      async upload(path: string, content: string, options?: { upsert?: boolean }) {
        await gate({ kind: "upload", target: bucket, payload: path });
        state.log.push(`upload:${path}`);
        if (folderOwner(path) !== actor()) return { data: null, error: { message: "row-level security", statusCode: "403" } };
        if (state.objects.has(path) && options?.upsert !== true) {
          return { data: null, error: { message: "The resource already exists", statusCode: "409" } };
        }
        state.objects.set(path, String(content));
        return { data: { path }, error: null };
      },
      async download(path: string) {
        await gate({ kind: "download", target: bucket, payload: path });
        state.log.push(`download:${path}`);
        const content = folderOwner(path) === actor() ? state.objects.get(path) : undefined;
        if (content === undefined) return { data: null, error: { message: "Object not found" } };
        return { data: { text: async () => content }, error: null };
      },
    };
  }

  function accessToken(session: Session): string {
    const payload = Buffer.from(JSON.stringify({ sub: session.userId, session_id: session.sessionId })).toString("base64url");
    return `header.${payload}.v${session.version}`;
  }

  const auth = {
    async getSession() {
      const session = state.session;
      return {
        data: { session: session ? { access_token: accessToken(session), user: { id: session.userId } } : null },
        error: null,
      };
    },
    async signOut() {
      return { error: null };
    },
  };

  const client = { from, storage: { from: bucketApi }, auth };
  return { getSupabaseClient: () => client, __fake: state, __reset: reset };
});

// Phase 1/2 run for real against the fake; only their far edges are stubbed. materialize and embeddings reach
// tables and a paid call this contract is not about, and callLlm is the one LLM boundary (C1).
jest.mock("../../wiki/materialize", () => ({
  materializeGraphFromPhase1: async () => ({ entityPagesCreated: 0, conceptPagesCreated: 0, pagesReused: 0, linksAdded: 0 }),
}));
jest.mock("../../wiki/embeddings", () => ({ embedAndStorePage: async () => undefined }));
jest.mock("../../llm/boundary", () => ({
  callLlm: async () => ({ text: "not json", safety: { zone: "green" }, audit: { modelUsed: "mock" } }),
}));

import {
  deleteAllUserData,
  deleteSourcesByIds,
  deleteUningestedSources,
  findSurvivingSourceIds,
} from "../delete-bulk";
import { deleteSource } from "../../wiki/queries";
import { generateSourcePage } from "../../wiki/phase2";
import { runPhase1 } from "../../wiki/phase1";
import { promotePendingUploads } from "../../wiki/promote-pending";
import { AuthSessionOwnerChangedError } from "../../auth/session-mutation";

const clientMock = require("../../supabase/client") as { __fake: FakeState; __reset: () => void };
const fake = clientMock.__fake;

const ROOT = join(__dirname, "../../../..");

function source(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    user_id: "u1",
    kind: "article",
    title: `piece ${id}`,
    tags: [],
    storage_path: `u1/${id}.md`,
    frontmatter: {},
    ingested: false,
    ...overrides,
  };
}

function page(sourceId: string): Row {
  return { id: `p-${sourceId}`, user_id: "u1", kind: "source", slug: `page-${sourceId}`, source_id: sourceId };
}

function seed(input: { sources?: Row[]; pages?: Row[]; objects?: string[]; records?: Row[] }): void {
  fake.tables.sources = [...(input.sources ?? [])];
  fake.tables.wiki_pages = [...(input.pages ?? [])];
  fake.tables.records = [...(input.records ?? [])];
  for (const table of ["chat_usage", "self_contexts", "clipper_templates", "wiki_links"]) {
    fake.tables[table] = [];
  }
  for (const path of input.objects ?? []) fake.objects.set(path, `body of ${path}`);
}

function sourceIds(): string[] {
  return (fake.tables.sources ?? []).map((row) => row.id).sort();
}

function recordIds(): string[] {
  return (fake.tables.records ?? []).map((row) => row.id).sort();
}

function objects(): string[] {
  return [...fake.objects.keys()].sort();
}

function removed(): string[] {
  return fake.removeCalls.flat().sort();
}

function hasPage(sourceId: string): boolean {
  return (fake.tables.wiki_pages ?? []).some((row) => row.source_id === sourceId);
}

function signIn(userId: string | null, sessionId = `session-${userId}`): void {
  fake.session = userId === null ? null : { userId, sessionId, version: 1 };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => undefined as void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Settle to the value or the error, so an interleaved step can be inspected instead of aborting the test. */
function settle<T>(work: Promise<T>): Promise<T | Error> {
  return work.then((value) => value, (error: unknown) => (error instanceof Error ? error : new Error(String(error))));
}

/** Storage-side writes and row-side writes, the requests that change something. */
function writes(): string[] {
  return fake.log.filter((line) => /^(delete|update|insert|upsert|remove|upload):/.test(line));
}

beforeEach(() => clientMock.__reset());

describe("정리하지 않은 캡처 삭제는 그 캡처의 원문도 지운다", () => {
  test("지운 행의 원문만 지운다 - 정리된 자료 · 남의 폴더 · 가리키는 행 없는 원문은 건드리지 않는다", async () => {
    seed({
      sources: [
        source("a"),
        source("b"),
        source("c", { ingested: true }),
        source("x", { user_id: "u2", storage_path: "u2/x.md" }),
      ],
      objects: ["u1/a.md", "u1/b.md", "u1/c.md", "u1/orphan.md", "u2/x.md"],
    });

    const result = await deleteUningestedSources("u1");

    expect(result).toEqual({ deleted: 2, kept: 0 });
    expect(sourceIds()).toEqual(["c", "x"]);
    expect(objects()).toEqual(["u1/c.md", "u1/orphan.md", "u2/x.md"]);
    expect([...fake.buckets]).toEqual(["raw-clippings"]);
    expect(fake.removeCalls).toEqual([["u1/a.md", "u1/b.md"]]);
  });

  test("원문을 먼저 지운다 - 원문 삭제가 실패하면 행을 하나도 지우지 않고 던지고, 다시 하면 끝난다", async () => {
    seed({ sources: [source("a"), source("b")], objects: ["u1/a.md", "u1/b.md"] });
    fake.faults.removeErrors = 1;

    await expect(deleteUningestedSources("u1")).rejects.toBeTruthy();
    expect(sourceIds()).toEqual(["a", "b"]);
    expect(objects()).toEqual(["u1/a.md", "u1/b.md"]);
    expect(fake.log).not.toContain("delete:sources");

    await expect(deleteUningestedSources("u1")).resolves.toEqual({ deleted: 2, kept: 0 });
    expect(sourceIds()).toEqual([]);
    expect(objects()).toEqual([]);
  });

  test("원문을 지운 뒤 행에서 실패해도 행이 남아 다시 하면 이어서 끝난다", async () => {
    seed({ sources: [source("a"), source("b")], objects: ["u1/a.md", "u1/b.md"] });
    fake.faults.sourceDeleteErrors = 1;

    await expect(deleteUningestedSources("u1")).rejects.toBeTruthy();
    expect(sourceIds()).toEqual(["a", "b"]);
    expect(objects()).toEqual([]);

    await expect(deleteUningestedSources("u1")).resolves.toEqual({ deleted: 2, kept: 0 });
    expect(sourceIds()).toEqual([]);
  });

  test("위키 페이지가 가리키는 행은 원문 · 행 모두 남기고 나머지만 지운 뒤 남긴 개수를 돌려준다", async () => {
    seed({
      sources: [source("a"), source("b")],
      pages: [page("a")],
      objects: ["u1/a.md", "u1/b.md"],
    });

    await expect(deleteUningestedSources("u1")).resolves.toEqual({ deleted: 1, kept: 1 });
    expect(sourceIds()).toEqual(["a"]);
    expect(objects()).toEqual(["u1/a.md"]);
    expect(removed()).toEqual(["u1/b.md"]);
  });

  test("다른 행이 아직 같은 원문을 가리키면 행은 지우되 원문은 남긴다", async () => {
    seed({
      sources: [
        source("a", { storage_path: "u1/shared.md" }),
        source("c", { storage_path: "u1/shared.md", ingested: true }),
      ],
      objects: ["u1/shared.md"],
    });

    await expect(deleteUningestedSources("u1")).resolves.toEqual({ deleted: 1, kept: 0 });
    expect(sourceIds()).toEqual(["c"]);
    expect(objects()).toEqual(["u1/shared.md"]);
    expect(removed()).toEqual([]);
  });

  test("같은 원문을 가리키는 행이 모두 지워지면 원문도 지운다", async () => {
    seed({
      sources: [source("a", { storage_path: "u1/shared.md" }), source("b", { storage_path: "u1/shared.md" })],
      objects: ["u1/shared.md"],
    });

    await expect(deleteUningestedSources("u1")).resolves.toEqual({ deleted: 2, kept: 0 });
    expect(objects()).toEqual([]);
  });

  test("많으면 나눠 지운다 - 한 번의 remove 에 50개를 넘기지 않고 끝까지 간다", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => source(`s${String(i).padStart(3, "0")}`));
    seed({ sources: rows, objects: rows.map((row) => row.storage_path as string) });

    await expect(deleteUningestedSources("u1")).resolves.toEqual({ deleted: 120, kept: 0 });
    expect(sourceIds()).toEqual([]);
    expect(objects()).toEqual([]);
    expect(fake.removeCalls).toHaveLength(3);
    for (const call of fake.removeCalls) expect(call.length).toBeLessThanOrEqual(50);
  });

  test("지웠어야 할 행이 그대로 있으면(RLS 거부 등) 성공으로 끝내지 않는다", async () => {
    seed({ sources: [source("a"), source("b")], objects: ["u1/a.md", "u1/b.md"] });
    fake.faults.refuseRowIds.add("b");

    await expect(deleteUningestedSources("u1")).rejects.toBeTruthy();
    expect(sourceIds()).toEqual(["b"]);
  });
});

describe("가져오기 철회(deleteSourcesByIds)도 원문을 지운다", () => {
  test("지운 행의 원문을 지우고 지운 개수를 돌려준다 - 없는 id 는 조용히 빠진다", async () => {
    seed({
      sources: [source("a"), source("b"), source("c", { ingested: true })],
      objects: ["u1/a.md", "u1/b.md", "u1/c.md"],
    });

    await expect(deleteSourcesByIds("u1", ["a", "c", "missing"])).resolves.toBe(2);
    expect(sourceIds()).toEqual(["b"]);
    expect(objects()).toEqual(["u1/b.md"]);
  });

  test("위키 페이지가 가리키는 행은 남고, 호출부의 남은 행 확인이 그 행을 찾는다", async () => {
    seed({
      sources: [source("a"), source("b")],
      pages: [page("a")],
      objects: ["u1/a.md", "u1/b.md"],
    });

    await expect(deleteSourcesByIds("u1", ["a", "b"])).resolves.toBe(1);
    await expect(findSurvivingSourceIds("u1", ["a", "b"])).resolves.toEqual(["a"]);
    expect(objects()).toEqual(["u1/a.md"]);
  });

  test("원문 삭제가 실패하면 행을 지우지 않고 던진다", async () => {
    seed({ sources: [source("a")], objects: ["u1/a.md"] });
    fake.faults.removeErrors = 1;

    await expect(deleteSourcesByIds("u1", ["a"])).rejects.toBeTruthy();
    expect(sourceIds()).toEqual(["a"]);
    expect(objects()).toEqual(["u1/a.md"]);
  });
});

describe("전체 삭제는 원문 폴더를 끝까지 비운다", () => {
  test("행을 지운 뒤 본인 폴더를 비운다 - 가리키는 행 없는 옛 원문까지, 남의 폴더는 그대로", async () => {
    seed({
      sources: [source("a"), source("b", { ingested: true }), source("x", { user_id: "u2", storage_path: "u2/x.md" })],
      objects: ["u1/a.md", "u1/b.md", "u1/orphan-before-fix.md", "u2/x.md"],
    });

    const result = await deleteAllUserData("u1");

    expect(result.sources).toBe(2);
    expect(objects()).toEqual(["u2/x.md"]);
    expect(removed().every((path) => path.startsWith("u1/"))).toBe(true);
    expect(fake.listCalls.every((call) => call.bucket === "raw-clippings" && call.prefix === "u1")).toBe(true);
    expect(fake.log.indexOf("delete:sources")).toBeGreaterThanOrEqual(0);
    expect(fake.log.indexOf("delete:sources")).toBeLessThan(fake.log.indexOf("list:u1"));
  });

  test("여러 쪽이면 지울 때마다 첫 쪽부터 다시 읽으며 모두 지운다", async () => {
    seed({ objects: Array.from({ length: 250 }, (_, i) => `u1/r${String(i).padStart(3, "0")}.md`) });

    await deleteAllUserData("u1");

    expect(objects()).toEqual([]);
    expect(fake.removeCalls.length).toBeGreaterThanOrEqual(3);
    for (const call of fake.removeCalls) expect(call.length).toBeLessThanOrEqual(100);
    expect(fake.listCalls.every((call) => (call.options?.offset ?? 0) === 0)).toBe(true);
  });

  test("1,000개를 넘는 폴더(1,051개)도 쪽마다 100개 이하로 지우며 끝까지 비운다", async () => {
    seed({ objects: Array.from({ length: 1051 }, (_, i) => `u1/k${String(i).padStart(4, "0")}.md`) });

    await expect(deleteAllUserData("u1")).resolves.toBeTruthy();

    expect(objects()).toEqual([]);
    expect(fake.removeCalls).toHaveLength(11);
    for (const call of fake.removeCalls) expect(call.length).toBeLessThanOrEqual(100);
    expect(fake.listCalls.every((call) => (call.options?.offset ?? 0) === 0)).toBe(true);
  });

  test("원문 삭제가 실패하면 전체 삭제도 실패로 끝나고(거짓 완료 없음), 다시 하면 남은 원문을 마저 지운다", async () => {
    seed({ sources: [source("a")], objects: ["u1/a.md", "u1/orphan.md"] });
    fake.faults.removeErrors = 1;

    await expect(deleteAllUserData("u1")).rejects.toBeTruthy();
    expect(objects()).toEqual(["u1/a.md", "u1/orphan.md"]);
    // 실패한 remove 에서 곧바로 멈춘다 - 같은 쪽을 한 번 더 읽고서야 알아채지 않는다.
    expect(fake.listCalls).toHaveLength(1);

    await expect(deleteAllUserData("u1")).resolves.toBeTruthy();
    expect(objects()).toEqual([]);
  });

  test("목록을 못 읽으면 실패로 끝난다", async () => {
    seed({ objects: ["u1/a.md"] });
    fake.faults.listErrors = 1;

    await expect(deleteAllUserData("u1")).rejects.toBeTruthy();
    expect(objects()).toEqual(["u1/a.md"]);
  });

  test("지워지지 않는 객체가 있으면 되풀이하지 않고 실패로 끝난다", async () => {
    seed({ objects: ["u1/a.md", "u1/stuck.md"] });
    fake.faults.refuseObjects.add("u1/stuck.md");

    await expect(deleteAllUserData("u1")).rejects.toBeTruthy();
    expect(objects()).toEqual(["u1/stuck.md"]);
    expect(fake.removeCalls.length).toBeLessThanOrEqual(2);
  });

  test("하위 폴더가 남아 있으면 비웠다고 말하지 않는다", async () => {
    seed({ objects: ["u1/a.md", "u1/nested/deep.md"] });

    await expect(deleteAllUserData("u1")).rejects.toBeTruthy();
    expect(objects()).toEqual(["u1/nested/deep.md"]);
  });

  test("목록이 끝없이 새 객체를 보여도 정해진 횟수 뒤에 멈추고 실패로 끝난다", async () => {
    seed({});
    fake.faults.endless = true;

    await expect(deleteAllUserData("u1")).rejects.toBeTruthy();
    expect(fake.listCalls.length).toBeLessThanOrEqual(201);
  });
});

describe("옛 한 건 삭제(deleteSource)도 원문을 지운다", () => {
  test("원문을 먼저 지우고 행을 지운다", async () => {
    seed({ sources: [source("a"), source("b")], objects: ["u1/a.md", "u1/b.md"] });

    await deleteSource("u1", "a");

    expect(sourceIds()).toEqual(["b"]);
    expect(objects()).toEqual(["u1/b.md"]);
    expect(fake.log.indexOf("remove:1")).toBeLessThan(fake.log.lastIndexOf("delete:sources"));
  });

  test("원문 삭제가 실패하면 행을 남기고 던진다", async () => {
    seed({ sources: [source("a")], objects: ["u1/a.md"] });
    fake.faults.removeErrors = 1;

    await expect(deleteSource("u1", "a")).rejects.toBeTruthy();
    expect(sourceIds()).toEqual(["a"]);
    expect(objects()).toEqual(["u1/a.md"]);
  });

  test("위키 페이지가 가리키는 자료는 지우지 않고 던진다 - 원문도 남는다", async () => {
    seed({
      sources: [source("a")],
      pages: [page("a")],
      objects: ["u1/a.md"],
    });

    await expect(deleteSource("u1", "a")).rejects.toBeTruthy();
    expect(sourceIds()).toEqual(["a"]);
    expect(objects()).toEqual(["u1/a.md"]);
  });

  test("없는 자료는 조용히 끝난다 - Storage 를 부르지 않는다", async () => {
    seed({ sources: [source("b")], objects: ["u1/b.md"] });

    await expect(deleteSource("u1", "a")).resolves.toBeUndefined();
    expect(fake.removeCalls).toEqual([]);
    expect(sourceIds()).toEqual(["b"]);
  });
});

describe("JZ-1839-1 원문 이름 검사는 저장 계약(한 단계 이름 · 전체 키 UTF-8 1,024바이트)을 따른다", () => {
  // capture.ts 는 `${storageSafeSlug(제목 슬러그)}-${내용 해시 12자}.md` 를 쓰고 슬러그를 자르지 않는다.
  // 제목 T 자면 이름은 T + 16 자다: 240자 제목 = 256자 이름.
  const nameOf = (titleLength: number, letter: string) => `${letter.repeat(titleLength)}-0123456789ab.md`;
  const at255 = `u1/${nameOf(239, "a")}`;
  const at256 = `u1/${nameOf(240, "b")}`;

  test("정상 담기가 만드는 256자 이름도 선택 삭제가 원문까지 지운다 - 255자 대조군과 함께", async () => {
    expect(at255.length - "u1/".length).toBe(255);
    expect(at256.length - "u1/".length).toBe(256);
    seed({ sources: [source("a", { storage_path: at255 }), source("b", { storage_path: at256 })], objects: [at255, at256] });

    await expect(deleteUningestedSources("u1")).resolves.toEqual({ deleted: 2, kept: 0 });

    expect(sourceIds()).toEqual([]);
    expect(objects()).toEqual([]);
    expect(removed()).toEqual([at255, at256].sort());
  });

  test("정상 긴 키: 전체 키가 UTF-8 1,024바이트 이하면 여러 바이트 문자가 섞여도 지운다", async () => {
    const ascii1024 = `u1/${"c".repeat(1018)}.md`;
    const multibyte = `u1/${String.fromCharCode(0xac00).repeat(300)}.md`;
    expect(Buffer.byteLength(ascii1024, "utf8")).toBe(1024);
    expect(Buffer.byteLength(multibyte, "utf8")).toBe(906);
    seed({ sources: [source("a", { storage_path: ascii1024 }), source("b", { storage_path: multibyte })], objects: [ascii1024, multibyte] });

    await expect(deleteSourcesByIds("u1", ["a", "b"])).resolves.toBe(2);

    expect(objects()).toEqual([]);
  });

  test("본인 폴더인데 저장 계약 밖인 경로의 행은 지우지 않고 포인터를 남긴 채 실패로 끝난다 - 나머지는 지운다", async () => {
    const tooLong = `u1/${"d".repeat(1019)}.md`;
    expect(Buffer.byteLength(tooLong, "utf8")).toBe(1025);
    const backslash = `u1/a${String.fromCharCode(0x5c)}b.md`;
    const control = `u1/a${String.fromCharCode(1)}b.md`;
    seed({
      sources: [
        source("long", { storage_path: tooLong }),
        source("dotdot", { storage_path: "u1/../u2/b.md" }),
        source("dot", { storage_path: "u1/." }),
        source("nested", { storage_path: "u1/nested/x.md" }),
        source("slash", { storage_path: backslash }),
        source("ctrl", { storage_path: control }),
        source("ok"),
      ],
      objects: [tooLong, "u2/b.md", "u1/nested/x.md", backslash, control, "u1/ok.md"],
    });

    await expect(deleteUningestedSources("u1")).rejects.toMatchObject({ name: "SourceErasureIncompleteError" });

    expect(sourceIds()).toEqual(["ctrl", "dot", "dotdot", "long", "nested", "slash"]);
    expect(removed()).toEqual(["u1/ok.md"]);
    expect(objects()).toEqual([tooLong, "u1/nested/x.md", backslash, control, "u2/b.md"].sort());
  });

  test("남의 폴더 · 비슷한 접두 · 빈 경로의 행은 Storage 에 보내지 않고 행만 지운다(타인 경로 제외 유지)", async () => {
    seed({
      sources: [
        source("a", { storage_path: "u2/a.md" }),
        source("c", { storage_path: "u10/c.md" }),
        source("d", { storage_path: "" }),
        source("f"),
      ],
      objects: ["u2/a.md", "u10/c.md", "u1/f.md"],
    });

    await expect(deleteUningestedSources("u1")).resolves.toEqual({ deleted: 4, kept: 0 });
    expect(sourceIds()).toEqual([]);
    expect(removed()).toEqual(["u1/f.md"]);
    expect(objects()).toEqual(["u10/c.md", "u2/a.md"]);
  });

  test("전체 삭제는 256자 이름도 지우고 기록 단계까지 간다", async () => {
    seed({ sources: [source("b", { storage_path: at256 })], objects: [at256, "u1/x.md"], records: [{ id: "r1", user_id: "u1" }] });

    await expect(deleteAllUserData("u1")).resolves.toMatchObject({ sources: 1, records: 1 });

    expect(objects()).toEqual([]);
    expect(recordIds()).toEqual([]);
  });

  test("전체 삭제에서 지울 수 없는 이름이 있어도 나머지 원문과 기록은 지우고, 끝은 불완료로 보고한다", async () => {
    const control = `u1/bad${String.fromCharCode(1)}name.md`;
    seed({
      sources: [source("a")],
      objects: ["u1/a.md", control, "u1/z.md"],
      records: [{ id: "r1", user_id: "u1" }],
    });

    await expect(deleteAllUserData("u1")).rejects.toBeTruthy();

    expect(objects()).toEqual([control]);
    expect(sourceIds()).toEqual([]);
    expect(recordIds()).toEqual([]);
    expect(removed()).not.toContain(control);
  });
});

describe("JA-1839-3 · JZ-1839-2 파괴 작업은 시작한 세션(사용자 + 세션)에 묶인다", () => {
  test("화면이 넘긴 계정과 지금 세션이 다르면 전체 · 선택 · 한 건 · 철회 모두 한 줄도 쓰지 않고 멈춘다", async () => {
    seed({ sources: [source("a")], objects: ["u1/a.md"], records: [{ id: "r1", user_id: "u1" }] });
    signIn("u2");

    await expect(deleteAllUserData("u1")).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    await expect(deleteUningestedSources("u1")).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    await expect(deleteSource("u1", "a")).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    await expect(deleteSourcesByIds("u1", ["a"])).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    await expect(findSurvivingSourceIds("u1", ["a"])).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);

    expect(writes()).toEqual([]);
    expect(sourceIds()).toEqual(["a"]);
    expect(objects()).toEqual(["u1/a.md"]);
    expect(recordIds()).toEqual(["r1"]);
  });

  test("로그아웃된 채로 시작해도 멈춘다", async () => {
    seed({ sources: [source("a")], objects: ["u1/a.md"] });
    signIn(null);

    await expect(deleteAllUserData("u1")).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    expect(writes()).toEqual([]);
  });

  test("요청 도중 세션이 바뀌어 목록이 다른 토큰으로 나가면(빈 폴더로 보인다) 완료가 아니다 - 뒤 단계도 멈춘다", async () => {
    seed({ sources: [source("a")], objects: ["u1/a.md", "u1/b.md"], records: [{ id: "r1", user_id: "u1" }] });
    fake.before = (op) => {
      if (op.kind === "list") {
        fake.before = null;
        signIn("u2");
      }
    };

    await expect(deleteAllUserData("u1")).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);

    expect(objects()).toEqual(["u1/a.md", "u1/b.md"]);
    expect(recordIds()).toEqual(["r1"]);
  });

  test("요청 도중 세션이 바뀌어 행 삭제가 다른 토큰으로 나가면(0행) 선택 삭제는 성공으로 끝나지 않고 행이 남는다", async () => {
    seed({ sources: [source("a")], objects: ["u1/a.md"] });
    fake.before = (op) => {
      if (op.kind === "delete" && op.target === "sources") {
        fake.before = null;
        signIn("u2");
      }
    };

    await expect(deleteUningestedSources("u1")).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    expect(sourceIds()).toEqual(["a"]);
  });

  test("같은 계정의 다른 세션으로 바뀌어도 멈춘다 - 사용자만이 아니라 세션까지 본다", async () => {
    seed({ sources: [source("a")], objects: ["u1/a.md"], records: [{ id: "r1", user_id: "u1" }] });
    fake.before = (op) => {
      if (op.kind === "list") {
        fake.before = null;
        signIn("u1", "session-u1-elsewhere");
      }
    };

    await expect(deleteAllUserData("u1")).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
    expect(recordIds()).toEqual(["r1"]);
  });

  test("가져오기 철회: 남은 행 확인이 다른 세션으로 나가면 빈 답을 '다 지웠다'로 읽지 않는다 - 포인터를 지우지 않게", async () => {
    seed({ sources: [source("a"), source("b")], pages: [page("a")], objects: ["u1/a.md", "u1/b.md"] });

    await expect(deleteSourcesByIds("u1", ["a", "b"])).resolves.toBe(1);
    fake.before = (op) => {
      if (op.kind === "select" && op.target === "sources") {
        fake.before = null;
        signIn("u2");
      }
    };

    await expect(findSurvivingSourceIds("u1", ["a", "b"])).rejects.toBeInstanceOf(AuthSessionOwnerChangedError);
  });

  test("같은 세션의 토큰 갱신(세션 id 그대로)은 바뀐 것이 아니다 - 끝까지 지운다", async () => {
    seed({ sources: [source("a")], objects: ["u1/a.md"], records: [{ id: "r1", user_id: "u1" }] });
    fake.before = (op) => {
      if (fake.session && (op.kind === "list" || op.kind === "delete")) {
        fake.session = { ...fake.session, version: fake.session.version + 1 };
      }
    };

    await expect(deleteAllUserData("u1")).resolves.toMatchObject({ sources: 1, records: 1 });
    expect(objects()).toEqual([]);
  });
});

describe("JA-1839-2 위키 참조 확인과 원문 삭제 사이에 위키 생성이 끼지 못한다", () => {
  const erasers: [string, () => Promise<unknown>][] = [
    ["정리하지 않은 캡처 삭제", () => deleteUningestedSources("u1")],
    ["가져오기 철회", () => deleteSourcesByIds("u1", ["a"])],
    ["한 건 삭제", () => deleteSource("u1", "a")],
  ];

  test.each(erasers)("%s: 원문을 지우는 중에 끼어든 위키 생성은 거부된다 - 원문 없는 페이지가 생기지 않는다", async (_label, erase) => {
    seed({ sources: [source("a")], objects: ["u1/a.md"] });
    const removing = deferred();
    const letGo = deferred();
    fake.before = async (op) => {
      if (op.kind === "remove") {
        fake.before = null;
        removing.resolve();
        await letGo.promise;
      }
    };

    const erasing = settle(erase());
    await removing.promise;
    const generated = await settle(generateSourcePage("u1", "a"));
    letGo.resolve();
    const outcome = await erasing;

    // 불변식: 페이지가 가리키는 자료의 원문이 사라진 상태는 어떤 순서로도 생기지 않는다.
    expect(hasPage("a") && !fake.objects.has("u1/a.md")).toBe(false);
    expect(generated).toBeInstanceOf(Error);
    expect(outcome).not.toBeInstanceOf(Error);
    expect(hasPage("a")).toBe(false);
    expect(sourceIds()).toEqual([]);
    expect(objects()).toEqual([]);
  });

  test("위키 생성이 먼저 선점했으면 삭제는 그 행을 원문과 함께 남기고 kept 로 센다", async () => {
    seed({ sources: [source("a"), source("b")], objects: ["u1/a.md", "u1/b.md"] });
    const reading = deferred();
    const letGo = deferred();
    fake.before = async (op) => {
      if (op.kind === "download") {
        fake.before = null;
        reading.resolve();
        await letGo.promise;
      }
    };

    const generating = settle(generateSourcePage("u1", "a"));
    await reading.promise;
    await expect(deleteUningestedSources("u1")).resolves.toEqual({ deleted: 1, kept: 1 });
    expect(sourceIds()).toEqual(["a"]);
    expect(objects()).toEqual(["u1/a.md"]);

    letGo.resolve();
    expect(await generating).not.toBeInstanceOf(Error);
    expect(hasPage("a")).toBe(true);
    expect(objects()).toEqual(["u1/a.md"]);
  });

  test("phase1 의 읽기→쓰기 틈에 걸린 삭제 선점을 phase1 쓰기가 지우지 못한다 - 그 뒤의 위키 생성도 거부된다", async () => {
    seed({ sources: [source("a")], objects: ["u1/a.md"] });
    const phase1Write = { reached: deferred(), letGo: deferred(), held: false };
    const removal = { reached: deferred(), letGo: deferred(), held: false };
    fake.before = async (op) => {
      const frontmatter = (op.payload as { frontmatter?: Record<string, unknown> } | null)?.frontmatter;
      if (!phase1Write.held && op.kind === "update" && op.target === "sources" && frontmatter?.__phase1__ !== undefined) {
        phase1Write.held = true;
        phase1Write.reached.resolve();
        await phase1Write.letGo.promise;
      } else if (!removal.held && op.kind === "remove") {
        removal.held = true;
        removal.reached.resolve();
        await removal.letGo.promise;
      }
    };

    // phase1 이 스냅숏을 읽고 쓰기를 보낸 채 멈춘다. 그 사이 삭제가 선점하고 원문을 지우러 간다.
    const analysis = settle(runPhase1({ userId: "u1", sourceId: "a", locale: "en" }));
    await phase1Write.reached.promise;
    const erasing = settle(deleteUningestedSources("u1"));
    await removal.reached.promise;
    // 멈춰 있던 phase1 쓰기가 선점 뒤에 도착한다. 그다음 위키 생성이 시도된다.
    phase1Write.letGo.resolve();
    const analysed = await analysis;
    const generated = await settle(generateSourcePage("u1", "a"));
    removal.letGo.resolve();
    const outcome = await erasing;

    expect(hasPage("a") && !fake.objects.has("u1/a.md")).toBe(false);
    expect(generated).toBeInstanceOf(Error);
    expect(analysed).toBeInstanceOf(Error);
    expect(outcome).toEqual({ deleted: 1, kept: 0 });
    expect(sourceIds()).toEqual([]);
    expect(objects()).toEqual([]);
  });

  test("멈춘 선점은 만료된다 - 10분 지난 위키 생성 표식은 삭제를, 10분 지난 삭제 표식은 위키 생성을 막지 않는다", async () => {
    const stale = new Date(Date.now() - 11 * 60_000).toISOString();
    seed({
      sources: [
        source("a", { frontmatter: { _generating: { token: "crashed", at: stale } } }),
        source("b", { frontmatter: { _erasing: { token: "crashed", at: stale } } }),
      ],
      objects: ["u1/a.md", "u1/b.md"],
    });

    await expect(deleteSourcesByIds("u1", ["a"])).resolves.toBe(1);
    await expect(generateSourcePage("u1", "b")).resolves.toBeTruthy();

    expect(hasPage("b")).toBe(true);
    expect(objects()).toEqual(["u1/b.md"]);
  });
});

describe("JA-1839-1 삭제 뒤 늦은 승격이 예전 본문을 되살리지 못한다", () => {
  const pending = (id: string, overrides: Partial<Row> = {}) =>
    source(id, { frontmatter: { _storage_pending: true, _body_fallback: `old body ${id}`, keep: "me" }, ...overrides });

  test("승격이 대기 목록을 읽은 뒤 전체 삭제가 끝나면, 승격은 사라진 행의 본문을 올리지 않는다", async () => {
    seed({ sources: [pending("p")] });
    const paused = deferred();
    const resume = deferred();
    let stage = 0;
    fake.before = async (op) => {
      if (stage === 0 && op.kind === "select" && op.target === "sources") {
        stage = 1;
        return;
      }
      if (stage === 1) {
        stage = 2;
        paused.resolve();
        await resume.promise;
      }
    };

    const promoting = promotePendingUploads("u1");
    await paused.promise;
    await expect(deleteAllUserData("u1")).resolves.toMatchObject({ sources: 1 });
    expect(objects()).toEqual([]);
    resume.resolve();

    await expect(promoting).resolves.toEqual({ pending: 1, promoted: 0 });
    expect(objects()).toEqual([]);
    expect(fake.log.some((line) => line.startsWith("upload:"))).toBe(false);
  });

  test("업로드가 전체 삭제 뒤에 도착해 행 갱신이 0행이면, 방금 올린 객체를 지우고 실패로 센다", async () => {
    seed({ sources: [pending("p")] });
    const paused = deferred();
    const resume = deferred();
    fake.before = async (op) => {
      if (op.kind === "upload") {
        fake.before = null;
        paused.resolve();
        await resume.promise;
      }
    };

    const promoting = promotePendingUploads("u1");
    await paused.promise;
    await expect(deleteAllUserData("u1")).resolves.toMatchObject({ sources: 1 });
    resume.resolve();

    await expect(promoting).resolves.toEqual({ pending: 1, promoted: 0 });
    expect(objects()).toEqual([]);
  });

  test("선택 삭제가 행을 지운 뒤 늦게 도착한 업로드도 되돌린다", async () => {
    seed({ sources: [pending("p")] });
    const paused = deferred();
    const resume = deferred();
    fake.before = async (op) => {
      if (op.kind === "upload") {
        fake.before = null;
        paused.resolve();
        await resume.promise;
      }
    };

    const promoting = promotePendingUploads("u1");
    await paused.promise;
    await expect(deleteSource("u1", "p")).resolves.toBeUndefined();
    resume.resolve();

    await expect(promoting).resolves.toEqual({ pending: 1, promoted: 0 });
    expect(sourceIds()).toEqual([]);
    expect(objects()).toEqual([]);
  });

  test("되돌릴 때도 같은 원문을 아직 쓰는 다른 행이 있으면 그 원문을 남긴다", async () => {
    seed({
      sources: [pending("p", { storage_path: "u1/shared.md" }), source("q", { storage_path: "u1/shared.md", ingested: true })],
      objects: ["u1/shared.md"],
    });
    const paused = deferred();
    const resume = deferred();
    fake.before = async (op) => {
      if (op.kind === "upload") {
        fake.before = null;
        paused.resolve();
        await resume.promise;
      }
    };

    const promoting = promotePendingUploads("u1");
    await paused.promise;
    await expect(deleteSource("u1", "p")).resolves.toBeUndefined();
    resume.resolve();

    await expect(promoting).resolves.toEqual({ pending: 1, promoted: 0 });
    expect(sourceIds()).toEqual(["q"]);
    expect(objects()).toEqual(["u1/shared.md"]);
  });

  test("삭제 선점이 걸린 행에는 올리지 않는다", async () => {
    const now = new Date().toISOString();
    seed({ sources: [pending("p", { frontmatter: { _storage_pending: true, _body_fallback: "b", _erasing: { token: "t", at: now } } })] });

    await expect(promotePendingUploads("u1")).resolves.toEqual({ pending: 1, promoted: 0 });
    expect(fake.log.some((line) => line.startsWith("upload:"))).toBe(false);
    expect(objects()).toEqual([]);
  });

  test("끼어드는 것이 없으면 승격은 그대로 - 본문을 올리고 대기 표식만 지운다", async () => {
    seed({ sources: [pending("p")] });

    await expect(promotePendingUploads("u1")).resolves.toEqual({ pending: 1, promoted: 1 });
    expect(objects()).toEqual(["u1/p.md"]);
    expect(fake.tables.sources[0].frontmatter).toEqual({ keep: "me" });
  });
});

describe("설정 화면은 남긴 캡처를 완료 알림으로 뭉개지 않는다", () => {
  // 렌더 테스트는 RN 0.85 에서 막혀 있다. 화면 쪽은 소스 모양으로만 지킨다 - 남긴 것이 있을 때 완료 토스트가 아니라
  // 안내(피드백 모달, 다시 시도 없음)로 가고, 없을 때만 완료 토스트로 간다.
  test("남긴 것이 있으면 지운 개수와 남긴 까닭을 함께 알린다", () => {
    const settings = readFileSync(join(ROOT, "src/app/settings.tsx"), "utf8");
    const start = settings.indexOf("async function runDeleteUningestedSources");
    const body = settings.slice(start, settings.indexOf("async function", start + 10));
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("const { deleted: n, kept } = await deleteUningestedSources(userId);");
    expect(body).toMatch(
      /if \(kept > 0\)\s*setActionError\(\{\s*title: t\("deletedNCaptures", \{ n \}\),\s*body: t\("capturesKeptWithWiki", \{ k: kept \}\)\s*\}\);/,
    );
    expect(body).toMatch(/else\s+showSuccess\(t\("deletedNCaptures", \{ n \}\)\);/);
  });

  test("다섯 로케일이 남긴 개수 자리를 함께 가진다", () => {
    for (const locale of ["en", "ko", "es", "id", "pt"]) {
      const copy = JSON.parse(readFileSync(join(ROOT, `locales/${locale}/settings.json`), "utf8")) as Record<
        string,
        unknown
      >;
      expect(typeof copy.capturesKeptWithWiki).toBe("string");
      expect(copy.capturesKeptWithWiki as string).toContain("{{k}}");
    }
  });
});
