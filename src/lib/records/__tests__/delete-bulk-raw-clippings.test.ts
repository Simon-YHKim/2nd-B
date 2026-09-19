// 담아 둔 자료(sources)를 지우는 길이 raw-clippings 원문도 함께 지우는가 (R28, 2026-09-20).
//
// 왜. 설정의 '정리하지 않은 캡처 삭제'(deleteUningestedSources) · '전체 삭제'(deleteAllUserData),
// 가져오기 철회(deleteSourcesByIds), 옛 한 건 삭제(deleteSource)는 sources 행만 지우고 Storage 원문을
// 남겼다. 앱 목록은 행 기준이라 안 보이지만, 데이터 내보내기(export-account)는 raw-clippings/<uid>/
// 폴더를 나열해 그대로 내보낸다 - 사용자가 지웠다고 믿은 것이 남는 개인정보 결함이었다.
//
// 가짜 클라이언트는 상태를 든다: sources · wiki_pages 행과 버킷의 객체. 서버가 하는 일 중 이 계약에
// 걸리는 것만 흉내 낸다 - 조건 필터, wiki_pages_source_kind_pair CHECK(페이지가 가리키는 자료를 지우면
// 문장 전체가 실패, 0022), 한 단계만 보여 주는 list(하위 폴더는 id 가 null 인 항목), 실제로 지운 객체만
// 돌려주는 remove. 실패와 RLS 거부는 주입한다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

type Row = { id: string; [key: string]: unknown };

interface FakeState {
  tables: Record<string, Row[]>;
  objects: Set<string>;
  log: string[];
  removeCalls: string[][];
  listCalls: { bucket: string; prefix: string; options: { limit?: number; offset?: number } | undefined }[];
  buckets: Set<string>;
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
  const state = {
    tables: {} as Record<string, FakeRow[]>,
    objects: new Set<string>(),
    log: [] as string[],
    removeCalls: [] as string[][],
    listCalls: [] as { bucket: string; prefix: string; options: { limit?: number; offset?: number } | undefined }[],
    buckets: new Set<string>(),
    faults: {
      removeErrors: 0,
      listErrors: 0,
      sourceDeleteErrors: 0,
      refuseRowIds: new Set<string>(),
      refuseObjects: new Set<string>(),
      endless: false,
    },
  };

  function reset(): void {
    state.tables = {};
    state.objects.clear();
    state.log.length = 0;
    state.removeCalls.length = 0;
    state.listCalls.length = 0;
    state.buckets.clear();
    state.faults.removeErrors = 0;
    state.faults.listErrors = 0;
    state.faults.sourceDeleteErrors = 0;
    state.faults.refuseRowIds.clear();
    state.faults.refuseObjects.clear();
    state.faults.endless = false;
  }

  function from(table: string) {
    const filters: ((row: FakeRow) => boolean)[] = [];
    let mode: "select" | "delete" = "select";
    let exact = false;
    let columns = "*";
    let order: { column: string; ascending: boolean } | null = null;
    let limit: number | null = null;

    function run() {
      const rows = state.tables[table] ?? [];
      const matched = rows.filter((row) => filters.every((keep) => keep(row)));
      if (mode === "select") {
        state.log.push(`select:${table}`);
        const sorted = [...matched];
        if (order) {
          const { column, ascending } = order;
          sorted.sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
        }
        const page = limit === null ? sorted : sorted.slice(0, limit);
        const picked = columns === "*"
          ? page.map((row) => ({ ...row }))
          : page.map((row) => {
            const out: Record<string, unknown> = {};
            for (const column of columns.split(",").map((c) => c.trim())) out[column] = row[column];
            return out;
          });
        return { data: picked, error: null };
      }
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
      state.tables[table] = rows.filter((row) => !hit.includes(row));
      return { data: null, error: null, count: exact ? hit.length : null };
    }

    const builder = {
      select(cols?: string) {
        if (typeof cols === "string") columns = cols;
        return builder;
      },
      delete(options?: { count?: string }) {
        mode = "delete";
        exact = options?.count === "exact";
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        const set = new Set(values);
        filters.push((row) => set.has(row[column]));
        return builder;
      },
      gt(column: string, value: unknown) {
        filters.push((row) => String(row[column]) > String(value));
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
      then<T1, T2>(resolve: (value: unknown) => T1, reject?: (reason: unknown) => T2) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };
    return builder;
  }

  function bucketApi(bucket: string) {
    state.buckets.add(bucket);
    return {
      async list(prefix: string, options?: { limit?: number; offset?: number }) {
        state.listCalls.push({ bucket, prefix, options });
        state.log.push(`list:${prefix}`);
        if (state.faults.listErrors > 0) {
          state.faults.listErrors -= 1;
          return { data: null, error: { message: "list failed" } };
        }
        if (state.faults.endless) state.objects.add(`${prefix}/endless-${state.listCalls.length}.md`);
        const folder = `${prefix}/`;
        const entries = new Map<string, boolean>();
        for (const key of state.objects) {
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
        state.removeCalls.push([...paths]);
        state.log.push(`remove:${paths.length}`);
        if (state.faults.removeErrors > 0) {
          state.faults.removeErrors -= 1;
          return { data: null, error: { message: "remove failed" } };
        }
        const removed: { name: string }[] = [];
        for (const path of paths) {
          if (state.objects.has(path) && !state.faults.refuseObjects.has(path)) {
            state.objects.delete(path);
            removed.push({ name: path });
          }
        }
        return { data: removed, error: null };
      },
    };
  }

  const client = { from, storage: { from: bucketApi } };
  return { getSupabaseClient: () => client, __fake: state, __reset: reset };
});

import {
  deleteAllUserData,
  deleteSourcesByIds,
  deleteUningestedSources,
  findSurvivingSourceIds,
} from "../delete-bulk";
import { deleteSource } from "../../wiki/queries";

const clientMock = require("../../supabase/client") as { __fake: FakeState; __reset: () => void };
const fake = clientMock.__fake;

const ROOT = join(__dirname, "../../../..");

function source(id: string, overrides: Partial<Row> = {}): Row {
  return { id, user_id: "u1", storage_path: `u1/${id}.md`, ingested: false, ...overrides };
}

function seed(input: { sources?: Row[]; pages?: Row[]; objects?: string[] }): void {
  fake.tables.sources = [...(input.sources ?? [])];
  fake.tables.wiki_pages = [...(input.pages ?? [])];
  for (const table of ["records", "chat_usage", "self_contexts", "clipper_templates"]) {
    fake.tables[table] = [];
  }
  for (const path of input.objects ?? []) fake.objects.add(path);
}

function sourceIds(): string[] {
  return (fake.tables.sources ?? []).map((row) => row.id).sort();
}

function objects(): string[] {
  return [...fake.objects].sort();
}

function removed(): string[] {
  return fake.removeCalls.flat().sort();
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
      pages: [{ id: "p1", user_id: "u1", kind: "source", source_id: "a" }],
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

  test("본인 폴더 밖이거나 . · .. 조각이 든 경로는 Storage 에 보내지 않는다 - 행은 지운다", async () => {
    seed({
      sources: [
        source("a", { storage_path: "u2/a.md" }),
        source("b", { storage_path: "u1/../u2/b.md" }),
        source("c", { storage_path: "u10/c.md" }),
        source("d", { storage_path: "" }),
        source("e", { storage_path: null }),
        source("f"),
      ],
      objects: ["u2/a.md", "u2/b.md", "u10/c.md", "u1/f.md"],
    });

    await expect(deleteUningestedSources("u1")).resolves.toEqual({ deleted: 6, kept: 0 });
    expect(sourceIds()).toEqual([]);
    expect(removed()).toEqual(["u1/f.md"]);
    expect(objects()).toEqual(["u10/c.md", "u2/a.md", "u2/b.md"]);
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
      pages: [{ id: "p1", user_id: "u1", kind: "source", source_id: "a" }],
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
      pages: [{ id: "p1", user_id: "u1", kind: "source", source_id: "a" }],
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
