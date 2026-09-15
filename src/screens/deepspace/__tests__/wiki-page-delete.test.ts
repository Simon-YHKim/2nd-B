// 배송 위키 화면에서 페이지 한 장을 지운다 (Q-260914-01, 2026-09-14).
//
// 한 장 삭제는 레거시 반쪽(src/app/wiki.tsx 의 WikiLegacy)에만 있었고, 배송 화면
// DeepSpaceWikiScreen 에는 삭제 어포던스가 0건이었다(2026-09-08 실측,
// autosave-undo-path.test.ts). 여기서는 되살린 쪽이 약속한 모양을 지키는지 본다:
//   · 누르면 바로 지우지 않고 확인을 한 번 거친다 - 되돌릴 수 없어서다
//   · 지우는 호출은 확인 핸들러 한 곳뿐이다
//   · 지운 뒤 목록을 서버에서 다시 읽는다
//   · 실패하면 말한다
//
// ⚠ 라우트 파일(src/app/wiki.tsx)이 아니라 배송 화면 파일을 읽는다. 라우트 파일에는
//   비슷한 문자열이 레거시 반쪽에 있어서, 그걸 읽으면 이 검사는 영원히 초록이다
//   (guard-pins-not-in-dead-renderers).
//
// ⚠ 2026-09-16 (PR 1814 재설계 C6). 위 핀들은 소스를 읽기만 해서 동작을 보지 못한다. 그래서
//   두 가지는 실제로 돌린다 - 확인 핸들러 본문을 AST 로 떼어, 실제 deleteWikiPage 와 상태 있는
//   Supabase 목 위에서 실행한다:
//   · 지운 행이 0 이면(이미 없거나 이 계정 것이 아니다) "삭제됨" 을 띄우지 않고 목록만 다시 읽는다.
//     RLS 거부도 오류가 아니라 0행으로 온다 - "오류 없음" 은 "지웠다" 가 아니다.
//   · 확인 대기에 적힌 계정(ownerId)이 지금 계정과 다르면 지우지 않고, 계정이 바뀌면 대기를 비운다.
//     계정 전환은 루트가 화면을 새로 만들어 이미 막는다. 이것은 화면 안의 두 번째 울타리다.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

type MockPage = { id: string; user_id: string; source_id: string | null };

interface MockBuilder {
  select(columns?: string): MockBuilder;
  delete(options?: { count?: string }): MockBuilder;
  eq(column: string, value: unknown): MockBuilder;
  maybeSingle(): Promise<{ data: unknown; error: null }>;
  then(resolve: (result: unknown) => unknown, reject?: (reason: unknown) => unknown): Promise<unknown>;
}

const mockDb = {
  wiki_pages: [] as MockPage[],
  /** 서버에 닿은 wiki_pages DELETE 요청 수. */
  deletes: 0,
};

function mockWikiPages(): MockBuilder {
  let op: "select" | "delete" = "select";
  let exactCount = false;
  const filters: ((row: MockPage) => boolean)[] = [];
  const run = (): { data: unknown[] | null; error: null; count: number | null } => {
    const hit = mockDb.wiki_pages.filter((row) => filters.every((keep) => keep(row)));
    if (op === "select") return { data: hit.map((row) => ({ source_id: row.source_id })), error: null, count: null };
    mockDb.deletes += 1;
    mockDb.wiki_pages = mockDb.wiki_pages.filter((row) => !hit.includes(row));
    // PostgREST 는 count 를 요청했을 때만 센다. 안 했으면 null 이다.
    return { data: null, error: null, count: exactCount ? hit.length : null };
  };
  const builder: MockBuilder = {
    select: () => builder,
    delete: (options) => {
      op = "delete";
      exactCount = options?.count === "exact";
      return builder;
    },
    eq: (column, value) => {
      filters.push((row) => row[column as keyof MockPage] === value);
      return builder;
    },
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
  };
  return builder;
}

const mockClient = {
  from: (table: string): MockBuilder => {
    // 원본 자료가 없는 페이지만 쓴다. 다른 표에 닿으면 시나리오가 틀린 것이다.
    if (table !== "wiki_pages") throw new Error(`unexpected table ${table}`);
    return mockWikiPages();
  },
};

jest.mock("../../../lib/supabase/client", () => ({ getSupabaseClient: () => mockClient }));

import { deleteWikiPage } from "../../../lib/wiki/queries";

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");

const FILE = read("src/screens/deepspace/dds-wiki-records-screens.tsx");
const SCREEN = FILE.slice(Math.max(0, FILE.indexOf("export function DeepSpaceWikiScreen()")));

/** 화면 안 useCallback 하나의 본문. `const name = useCallback(` 부터 의존성 배열 직전까지. */
function callbackBody(name: string): string {
  const at = SCREEN.indexOf(`const ${name} = useCallback(`);
  if (at < 0) return "";
  const end = SCREEN.indexOf("\n  }, [", at);
  return end < 0 ? "" : SCREEN.slice(at, end);
}

const confirm = callbackBody("confirmDeletePage");

describe("배송 위키 화면의 한 장 삭제", () => {
  test("화면 조각과 확인 핸들러를 실제로 잘랐다 - 0건 통과를 막는다", () => {
    expect(FILE.indexOf("export function DeepSpaceWikiScreen()")).toBeGreaterThan(0);
    expect(confirm.length).toBeGreaterThan(100);
  });

  test("지우는 호출은 확인 핸들러 안 한 곳뿐이다", () => {
    expect((SCREEN.match(/deleteWikiPage\(/g) ?? []).length).toBe(1);
    expect(confirm).toContain("await deleteWikiPage(userId, page.id)");
  });

  test("누르면 대기 상태만 세우고, 확인 창이 그 상태로 열린다", () => {
    expect(SCREEN).toContain("setPendingDelete({ id: p.id, title: p.title, ownerId: userId })");
    expect(SCREEN).toContain("visible={pendingDelete !== null}");
    expect(SCREEN).toContain("onPress={() => void confirmDeletePage()}");
    expect(SCREEN).toContain('tw("deleteConfirmBody")');
  });

  test("두 번 눌러도 한 번만 지운다", () => {
    expect(confirm).toContain("deleteInFlightRef.current");
  });

  test("지운 뒤 목록을 서버에서 다시 읽는다", () => {
    const deleted = confirm.indexOf("await deleteWikiPage(");
    expect(deleted).toBeGreaterThan(0);
    expect(confirm.indexOf("reload()")).toBeGreaterThan(deleted);
    // 다시 읽는 방아쇠가 실제로 불러오기 effect 의 의존성에 걸려 있다.
    expect(FILE).toContain("}, [userId, reloadKey]);");
  });

  test("실패를 말한다", () => {
    expect(confirm).toContain('setDeleteNotice("failed")');
    expect(SCREEN).toContain('t("wiki.deleteFailed")');
  });

  test("버튼이 스크린리더에 어느 페이지인지 말한다", () => {
    expect(SCREEN).toContain('accessibilityLabel={tw("deletePageFor", { title: p.title })}');
  });
});

const AST = ts.createSourceFile("dds-wiki-records-screens.tsx", FILE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findNode<T>(node: ts.Node, pick: (candidate: ts.Node) => T | undefined): T | undefined {
  return pick(node) ?? ts.forEachChild(node, (child) => findNode(child, pick));
}

/** DeepSpaceWikiScreen 선언 안에서만 찾는다. 같은 파일의 다른 화면이 대신 걸리지 않게. */
function inWikiScreen<T>(pick: (candidate: ts.Node) => T | undefined, what: string): T {
  const screen = findNode(AST, (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "DeepSpaceWikiScreen" ? node : undefined,
  );
  const hit = screen ? findNode(screen, pick) : undefined;
  if (hit === undefined) throw new Error(`DeepSpaceWikiScreen 안에서 ${what} 를 찾지 못했다`);
  return hit;
}

/** 실제 confirmDeletePage 의 본문(useCallback 첫 인자). 재구현이 아니다. */
const confirmSource = (): string =>
  inWikiScreen(
    (node) =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "confirmDeletePage" &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer)
        ? node.initializer.arguments[0]
        : undefined,
    "confirmDeletePage",
  ).getText(AST);

/** ownerId 로 확인 대기를 비우는 useEffect 의 본문. */
const ownerEffectSource = (): string =>
  inWikiScreen(
    (node) =>
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useEffect" &&
      node.arguments.length > 0 &&
      node.arguments[0].getText(AST).includes("ownerId")
        ? node.arguments[0]
        : undefined,
    "ownerId 로 확인 대기를 비우는 useEffect",
  ).getText(AST);

function compile<T>(expression: string, bindings: Record<string, unknown>): T {
  const js = ts.transpileModule(`const run = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}\nreturn run;`)(...Object.values(bindings)) as T;
}

type Pending = { id: string; title: string; ownerId: string };

/** 실제 확인 핸들러를 inert 호스트에 건다. 지우기는 실제 deleteWikiPage 가 목 DB 에 한다. */
function confirmHarness(pending: Pending | null, userId: string | null) {
  const seen = {
    notices: [] as unknown[],
    pending: [] as unknown[],
    announced: [] as string[],
    reloads: 0,
    deleteCalls: [] as [string, string][],
  };
  const bindings = {
    pendingDelete: pending,
    userId,
    deleteInFlightRef: { current: false },
    deleteUserRef: { current: userId },
    setDeletingPageId: () => undefined,
    setDeleteNotice: (value: unknown) => seen.notices.push(value),
    setPendingDelete: (value: unknown) => seen.pending.push(value),
    setExpandedId: () => undefined,
    deleteWikiPage: (owner: string, pageId: string) => {
      seen.deleteCalls.push([owner, pageId]);
      return deleteWikiPage(owner, pageId);
    },
    AccessibilityInfo: { announceForAccessibility: (message: string) => seen.announced.push(message) },
    t: (key: string) => key,
    tw: (key: string) => key,
    reload: () => {
      seen.reloads += 1;
    },
  };
  return { run: compile<() => Promise<void>>(confirmSource(), bindings), seen };
}

describe("확인 핸들러를 실제로 돌린다 - 지운 행 수와 계정 (PR 1814 재설계 C6)", () => {
  const PAGE: Pending = { id: "page-1", title: "산책 기록", ownerId: "owner-a" };

  beforeEach(() => {
    mockDb.wiki_pages = [];
    mockDb.deletes = 0;
  });

  test("대조군: 한 장을 실제로 지우면 '삭제됨' 을 띄우고 목록을 다시 읽는다", async () => {
    mockDb.wiki_pages = [{ id: "page-1", user_id: "owner-a", source_id: null }];
    const screen = confirmHarness(PAGE, "owner-a");
    await screen.run();

    expect(mockDb.wiki_pages).toEqual([]);
    expect(screen.seen.notices).toEqual([null, "deleted"]);
    expect(screen.seen.announced).toEqual(["pageDeleted"]);
    expect(screen.seen.reloads).toBe(1);
    expect(screen.seen.pending).toEqual([null]);
  });

  test("0행: 목록을 읽은 뒤 이미 없어진 페이지면 '삭제됨' 을 띄우지 않고 목록만 서버에서 다시 읽는다", async () => {
    // 다른 기기에서 먼저 지웠다. 이 화면의 목록에는 아직 남아 있다.
    const screen = confirmHarness(PAGE, "owner-a");
    await screen.run();

    expect(mockDb.deletes).toBe(1);
    // 새 문구는 없다: "삭제됨" 도 "실패" 도 띄우지 않는다.
    expect(screen.seen.notices).toEqual([null]);
    expect(screen.seen.announced).toEqual([]);
    expect(screen.seen.reloads).toBe(1);
    expect(screen.seen.pending).toEqual([null]);
  });

  test("확인 대기에 적힌 계정이 지금 계정과 다르면 삭제를 부르지 않는다", async () => {
    mockDb.wiki_pages = [{ id: "page-1", user_id: "owner-a", source_id: null }];
    const screen = confirmHarness(PAGE, "owner-b");
    await screen.run();

    expect(screen.seen.deleteCalls).toEqual([]);
    expect(mockDb.deletes).toBe(0);
    expect(mockDb.wiki_pages).toHaveLength(1);
    expect(screen.seen.notices).toEqual([]);
    expect(screen.seen.reloads).toBe(0);
  });

  test("계정이 바뀌면 옛 계정의 확인 대기를 비우고, 같은 계정의 대기는 그대로 둔다", () => {
    const afterEffect = (prev: Pending | null, userId: string | null): unknown => {
      let state: unknown = prev;
      const effect = compile<() => void>(ownerEffectSource(), {
        userId,
        setPendingDelete: (next: unknown) => {
          state = typeof next === "function" ? (next as (current: unknown) => unknown)(state) : next;
        },
      });
      effect();
      return state;
    };
    expect(afterEffect(PAGE, "owner-b")).toBeNull();
    expect(afterEffect(PAGE, null)).toBeNull();
    expect(afterEffect(PAGE, "owner-a")).toBe(PAGE);
    expect(afterEffect(null, "owner-b")).toBeNull();
  });
});

describe("확인 문구", () => {
  const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
  const wiki = (loc: string): Record<string, string> =>
    JSON.parse(read(`locales/${loc}/wiki.json`)) as Record<string, string>;
  const ds = (loc: string): Record<string, string> =>
    (JSON.parse(read(`locales/${loc}/deepspace.json`)) as { wiki: Record<string, string> }).wiki;

  test("되돌릴 수 없다는 사실을 다섯 언어 모두 말한다", () => {
    const IRREVERSIBLE: Record<(typeof LOCALES)[number], RegExp> = {
      en: /can't undo/i,
      ko: /되돌릴 수 없/,
      es: /no se puede deshacer/i,
      pt: /não pode ser desfeito/i,
      id: /tidak dapat dibatalkan/i,
    };
    for (const loc of LOCALES) expect({ loc, body: wiki(loc).deleteConfirmBody }).toEqual({
      loc,
      body: expect.stringMatching(IRREVERSIBLE[loc]),
    });
  });

  test("화면이 부르는 키가 다섯 언어에 있다", () => {
    const WIKI_KEYS = [
      "deletePage",
      "deletePageFor",
      "deleteConfirmLabel",
      "deleteConfirmTitle",
      "deleteConfirmBody",
      "cancel",
      "cancelHint",
      "delete",
      "deleteHint",
      "pageDeleted",
    ];
    for (const loc of LOCALES) {
      for (const key of WIKI_KEYS) {
        expect({ loc, key, ok: typeof wiki(loc)[key] === "string" }).toEqual({ loc, key, ok: true });
      }
      expect({ loc, ok: typeof ds(loc).deleteFailed === "string" }).toEqual({ loc, ok: true });
    }
  });

  test("새 오류 문구는 em dash 가 없고, 베타 로케일은 영어 사본이 아니며, 한국어는 해요체다", () => {
    for (const loc of LOCALES) expect(ds(loc).deleteFailed).not.toContain("—");
    for (const loc of ["es", "pt", "id"] as const) expect(ds(loc).deleteFailed).not.toBe(ds("en").deleteFailed);
    expect(ds("ko").deleteFailed).toMatch(/요\./);
  });
});
