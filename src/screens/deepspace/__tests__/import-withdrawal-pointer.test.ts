// 가져오기 철회를 두 화면의 실제 핸들러로 돌린다 - 저장소 · 잠금 · 판정 · 세션은 진짜 모듈이다.
//
// 화면을 렌더하지 않고 실제 핸들러 선언을 AST 로 떼어 inert 컨텍스트에서 돌린다. 그
// 컨텍스트에 넣는 이력 모듈(history.ts)과 판정 모듈(history-ownership.ts)은 진짜다:
// 저장소(웹 AsyncStorage · 네이티브 암호화 저장소)와 서버(sources 행 · ingest_log · 인증
// 세션)만 대역이다. 인증 변경 잠금(M)도 진짜 런타임(session-mutation.ts)이다. 탭 둘은 같은
// 저장소와 같은 Web Lock 관리자를 나눠 쓰는 모듈 인스턴스 둘이다.
//
// 이 파일이 지키는 것 (vibe r260919):
//   - r29 §3-6  같은 선택을 두 번 비준하면 두 번째 항목이 첫 가져오기의 행을 가리켰다.
//   - LA-1841-1 옛 중복 항목 E2=[R] 의 철회가, 첫 항목이 로그에 보이지 않으면(50건 상한 ·
//               다른 기기 · /capture 행) R 을 지웠다. 로컬 로그의 "다른 포인터 없음" 은
//               소유 증명이 아니다.
//   - LA-1841-2 · LZ-1841-1  공유 판정 → 삭제 → 항목 제거가 한 임계 구역이 아니라 두 탭의
//               동시 철회가 행은 남기고 두 포인터를 다 없앴다.
//   - LZ-1841-2 웹의 로그 읽기 실패가 빈 로그가 되어 판정과 로그 재작성의 근거가 됐다.
//   - LZ-1841-3 남긴 행이 있는 철회도 "원본 제거" 처럼 끝났다.
//   - 2차 재게이트 (E:/Coding Infra/reports/vibe-r260919/regate-1841-{artifact,bizlogic}-r2):
//     L2A-1841-1  Web Locks 가 없는 브라우저의 두 탭 철회가 다시 행만 남기고 포인터를 다 없앴다.
//     L2A-1841-2 · L2Z-1841-1  기다리는 동안 · 삭제하는 사이 계정이 바뀌면 RLS 의 빈 답을 "이미
//                지워졌다" 로 읽고 이전 계정의 포인터를 없앴다.
//     L2Z-1841-2  항목 제거와 주인 올리기가 따로 저장돼, 두 번째 저장 실패가 승격을 영영 잃었다.
//     L2A-1841-3 · L2Z-1841-3  보존 기한을 기기 시계로 쟀다.
//     L2A-1841-4  서버 호출에 기한이 없어 답 없는 요청 하나가 계정의 다음 철회를 모두 막았다.
//     L2Z-1841-4  남김 안내가 까닭과 무관하게 "다른 곳에서도 들여온" 이라고 단정했다.

// ── 대역: 저장소 · 서버 · 인증 (import 보다 먼저 - jest.mock 팩토리가 이 이름들을 쓴다) ────
const mockStore = new Map<string, string>();
const mockStorage = {
  /** 로그 키 읽기 순번(1부터) 가운데 실패시킬 것. */
  failLogReads: new Set<number>(),
  logReads: 0,
  /** 로그 키 쓰기 순번(1부터) 가운데 실패시킬 것. */
  failLogWrites: new Set<number>(),
  logWrites: 0,
  getItem: async (key: string) => {
    if (key === "import.history:user-a") {
      mockStorage.logReads += 1;
      if (mockStorage.failLogReads.has(mockStorage.logReads)) throw new Error("storage read failed");
    }
    return mockStore.get(key) ?? null;
  },
  setItem: async (key: string, value: string) => {
    if (key === "import.history:user-a") {
      mockStorage.logWrites += 1;
      if (mockStorage.failLogWrites.has(mockStorage.logWrites)) throw new Error("storage write failed");
    }
    mockStore.set(key, value);
  },
  removeItem: async (key: string) => {
    mockStore.delete(key);
  },
};
const mockServer = {
  /** ingest_log: 행마다 정확 중복으로 건넨 기록 수 (capture.ts 가 건네기 전에 적는다). */
  drops: new Map<string, number>(),
  /** ingest_log 질의 수. */
  queries: 0,
  /** sources 행: id → 본문. world() 가 채운다. */
  rows: new Map<string, string>(),
  /** sources.captured_at (서버 시계, 0022 default now()). */
  born: new Map<string, string>(),
  /** ingest_log 질의가 답하지 않는다 - 끊어야(abort) 끝난다. */
  stallIngestLog: false,
  /** 끊긴 질의 수. */
  aborted: 0,
  /** 서버 질의가 나갈 때마다 부른다(표 이름). */
  onQuery: null as ((table: string) => void) | null,
};
/** 살아 있는 인증 세션. 계정 전환은 이것을 바꾼다. RLS 는 이 세션의 사용자만 보여 준다. */
const mockAuth = {
  session: null as { user: { id: string }; access_token: string } | null,
  runtime: null as unknown,
};
/** 서버 삭제 단계에 거는 장벽. 고치기 전 코드도 지나는 자리라 두 코드를 같은 순서로 멈춘다. */
const barrier = {
  deletes: 0,
  gate: null as Promise<void> | null,
  onDelete: null as (() => void) | null,
};

jest.mock("@react-native-async-storage/async-storage", () => ({ __esModule: true, default: mockStorage }));
jest.mock("@/lib/storage/encrypted-native-storage", () => ({ getEncryptedNativeStorage: () => mockStorage }));
jest.mock("@/lib/auth/session-mutation", () => ({
  ...jest.requireActual("@/lib/auth/session-mutation"),
  getAuthStorageRuntime: () => mockAuth.runtime,
}));
jest.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockAuth.session }, error: null }),
    },
    // PostgREST 질의 대역: 걸린 거름만 기억했다가 await 될 때 답한다. RLS(user_id = auth.uid())
    // 는 살아 있는 세션의 사용자로 판다 - 다른 계정의 세션에서는 아무것도 안 보인다.
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let signal: AbortSignal | undefined;
      const answer = async () => {
        if (table === "ingest_log") mockServer.queries += 1;
        mockServer.onQuery?.(table);
        if (table === "ingest_log" && mockServer.stallIngestLog) {
          await new Promise<never>((_, reject) => {
            signal?.addEventListener("abort", () => {
              mockServer.aborted += 1;
              reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
            });
          });
        }
        const visible = mockAuth.session?.user.id === filters.user_id;
        if (table === "ingest_log") {
          const count = visible && filters.stage === "exact_duplicate"
            ? mockServer.drops.get(String(filters.survivor_id)) ?? 0
            : 0;
          const limit = typeof filters.limit === "number" ? filters.limit : count;
          return { data: Array.from({ length: Math.min(count, limit) }, (_, i) => ({ id: `drop-${i}` })), error: null };
        }
        if (table === "sources") {
          const ids = Array.isArray(filters.id) ? (filters.id as string[]) : [];
          const data = visible
            ? ids.filter((id) => mockServer.rows.has(id)).map((id) => ({ id, captured_at: mockServer.born.get(id) ?? null }))
            : [];
          return { data, error: null };
        }
        return { data: [], error: null };
      };
      const builder = {
        select: () => builder,
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
        abortSignal: (value: AbortSignal) => {
          signal = value;
          return builder;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => answer().then(resolve, reject),
      };
      return builder;
    },
  }),
}));

import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";
import ts from "typescript";

import { createAuthStorageRuntime } from "@/lib/auth/session-mutation";
import { buildProposals, proposalsToMarkdown, type ImportOutcome } from "@/lib/import/proposals";
import enDeepspace from "../../../../locales/en/deepspace.json";
import koDeepspace from "../../../../locales/ko/deepspace.json";

const SCREENS = {
  deepspace: {
    file: "src/screens/deepspace/dds-import-inbox-screens.tsx",
    fn: "revokeImport",
    kind: "function",
  },
  hub: {
    file: "src/screens/deepspace/import/ImportHubScreen.tsx",
    fn: "removeHistory",
    kind: "arrow",
  },
  hubRatify: {
    file: "src/screens/deepspace/import/ImportHubScreen.tsx",
    fn: "ratify",
    kind: "arrow",
  },
  hubRender: {
    file: "src/screens/deepspace/import/ImportHubScreen.tsx",
    fn: "renderHub",
    kind: "function",
  },
  hubHistory: {
    file: "src/screens/deepspace/import/ImportHubScreen.tsx",
    fn: "renderHistory",
    kind: "function",
  },
  filePick: {
    file: "src/screens/deepspace/dds-import-inbox-screens.tsx",
    fn: "handlePickFiles",
    kind: "function",
  },
} as const;

function extract(which: keyof typeof SCREENS, context: Record<string, unknown>) {
  const spec = SCREENS[which];
  const source = fs.readFileSync(path.join(process.cwd(), spec.file), "utf8");
  const ast = ts.createSourceFile(spec.file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let text = "";
  const visit = (node: ts.Node): void => {
    if (spec.kind === "function" && ts.isFunctionDeclaration(node) && node.name?.text === spec.fn) {
      text = `${node.getText(ast)}\nconst run = ${spec.fn};`;
    }
    if (spec.kind === "arrow" && ts.isVariableDeclaration(node)
      && node.name.getText(ast) === spec.fn && node.initializer) {
      text = `const run = (${node.initializer.getText(ast)});`;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!text) throw new Error(`${spec.fn} 선언을 찾지 못했다`);
  // TSX 로 읽어야 renderHub 같은 JSX 본문도 뗄 수 있다. JSX 는 React.createElement
  // 호출이 되고, 그 React 는 context 가 준다.
  const js = ts.transpileModule(text, {
    fileName: "handler.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as
    (arg: unknown) => Promise<void>;
}

// ── 판 ──────────────────────────────────────────────────────────────────────────
const OWNER = "user-a";
const LOG_KEY = `import.history:${OWNER}`;
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

/** 2026-09-20 이전에 허브가 적은 항목: owned 표지가 없다. */
const legacy = (id: string, sourceIds: string[]): Entry => ({
  id,
  sourceKey: "notion",
  name: "Notion · Obsidian",
  atIso: "2026-09-19T00:00:00.000Z",
  summary: "",
  sourceIds,
});
/** 이 고침 뒤에 적힌 항목: 가져오기가 만든 행만 들고 owned 표지를 단다. */
const owned = (id: string, sourceIds: string[]): Entry => ({ ...legacy(id, sourceIds), owned: true });

/** 서명은 보지 않는 JWT. 서버가 발급한 토큰처럼 session_id 와 exp 를 싣는다. */
function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}.signature`;
}
/** 한 사용자의 세션. exp 는 NOW 뒤 한 시간(서버가 막 발급한 토큰). */
function sessionOf(userId: string, claims: Record<string, unknown> = {}) {
  return {
    user: { id: userId },
    access_token: jwt({ sub: userId, session_id: `session-${userId}`, exp: Math.floor(NOW / 1000) + 3600, ...claims }),
  };
}

type HistoryModule = typeof import("@/lib/import/history");
type OwnershipModule = typeof import("@/lib/import/history-ownership");
interface Tab {
  history: HistoryModule;
  ownership: OwnershipModule;
}

/** 탭 하나 = 모듈 인스턴스 하나. 줄(같은 런타임 큐)은 탭마다 따로, 저장소와 Web Lock 은 함께. */
function openTab(): Tab {
  let tab!: Tab;
  jest.isolateModules(() => {
    tab = {
      history: require("@/lib/import/history") as HistoryModule,
      ownership: require("@/lib/import/history-ownership") as OwnershipModule,
    };
  });
  return tab;
}

/** navigator.locks 대역: 같은 이름의 요청을 콜백 promise 가 끝날 때까지 줄 세운다.
 *  request(name, callback) 과 request(name, options, callback) 둘 다 받는다. */
class SerialLockManager {
  private readonly tails = new Map<string, Promise<void>>();

  request<T>(name: string, ...args: unknown[]): Promise<T> {
    const callback = (typeof args[0] === "function" ? args[0] : args[1]) as
      (lock: { name: string; mode: string }) => Promise<T> | T;
    const previous = this.tails.get(name) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(() => callback({ name, mode: "exclusive" }));
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(name, tail);
    void tail.finally(() => {
      if (this.tails.get(name) === tail) this.tails.delete(name);
    });
    return result;
  }
}

const fenceStore = new Map<string, string>();
const webLocalStorage = {
  getItem: (key: string) => fenceStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    fenceStore.set(key, value);
  },
  removeItem: (key: string) => {
    fenceStore.delete(key);
  },
};

type Runtime = "web" | "web-without-locks" | "native";

function setRuntime(runtime: Runtime): void {
  if (runtime === "native") {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product: "ReactNative" } });
    return;
  }
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: webLocalStorage });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: runtime === "web" ? { locks: new SerialLockManager() } : {},
  });
}

let navigatorDescriptor: PropertyDescriptor | undefined;
let localStorageDescriptor: PropertyDescriptor | undefined;
beforeAll(() => {
  navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
});
afterAll(() => {
  if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  else delete (globalThis as { navigator?: unknown }).navigator;
  if (localStorageDescriptor) Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

beforeEach(() => {
  // 비준 테스트의 항목 id 는 Date.now() 다. 판정은 기기 시계를 쓰지 않는다 - 그것도 여기서 본다.
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const NOTES = "# 첫 노트\n본문 하나\n\n# 둘째 노트\n본문 둘";

/** 가계부 반영을 싣는 제안 하나. 허브는 제안의 ledgerEntry 를 보고 거래를 적는다. */
function financeOutcome(): ImportOutcome {
  return {
    proposals: [
      {
        id: "fin-0",
        label: "2026-09-01 카페 4,500원",
        sub: "지출 → 재정 원장",
        sensitive: true,
        ledgerEntry: { occurredOn: "2026-09-01", kind: "expense", amountKrw: 4500, label: "카페" },
      },
    ],
    summary: { appointments: 0, places: 0, events: 0, health: 0, notes: 0, watches: 0, transactions: 1, raw: 0 },
  };
}

interface WorldOptions {
  /** 서버의 sources 행. */
  rows?: string[];
  /** 행의 captured_at(서버 시계). 없으면 NOW 열흘 전. */
  born?: Record<string, string>;
  /** 이 기기의 이력 로그(최신이 앞). */
  log?: Entry[];
  /** ingest_log: 행마다 정확 중복으로 건넨 기록 수. */
  drops?: Record<string, number>;
  runtime?: Runtime;
  tabs?: number;
  outcome?: ImportOutcome;
  /** 살아 있는 세션. 없으면 OWNER 의 세션. */
  session?: { user: { id: string }; access_token: string } | null;
  /** 삭제가 돌려주는 개수를 덮어쓴다(일부만 지워진 경우). */
  deleted?: number;
  /** 되읽기가 돌려주는 남은 행을 덮어쓴다. */
  surviving?: string[];
  deleteThrows?: boolean;
  survivingThrows?: boolean;
  /** 이 행을 지우는 요청은 답하지 않는다. */
  deleteHangsFor?: string[];
  /** 서버 도우미가 #1839 의 runBoundToOwnerSession 처럼 인증 변경 잠금(M) 안에서 돈다. */
  boundHelpers?: boolean;
}

type AuthRuntime = { runMutation<T>(fn: () => Promise<T> | T): Promise<T> };

function world(options: WorldOptions = {}) {
  mockStore.clear();
  fenceStore.clear();
  mockStorage.failLogReads.clear();
  mockStorage.logReads = 0;
  mockStorage.failLogWrites.clear();
  mockStorage.logWrites = 0;
  mockServer.drops = new Map(Object.entries(options.drops ?? {}));
  mockServer.queries = 0;
  mockServer.stallIngestLog = false;
  mockServer.aborted = 0;
  mockServer.onQuery = null;
  barrier.deletes = 0;
  barrier.gate = null;
  barrier.onDelete = null;
  const runtime = options.runtime ?? "web";
  setRuntime(runtime);
  if (options.log) mockStore.set(LOG_KEY, JSON.stringify(options.log));
  mockAuth.session = options.session === undefined ? sessionOf(OWNER) : options.session;
  // 진짜 인증 런타임: 웹이면 navigator.locks, 아니면 프로세스 잠금. 탭들이 함께 쓴다.
  mockAuth.runtime = createAuthStorageRuntime({
    url: "https://proj.supabase.co",
    storage: undefined,
    web: runtime !== "native",
  });
  const authRuntime = mockAuth.runtime as AuthRuntime;

  const rows = new Map<string, string>((options.rows ?? []).map((id) => [id, `body of ${id}`]));
  mockServer.rows = rows;
  mockServer.born = new Map(
    (options.rows ?? []).map((id) => [id, options.born?.[id] ?? new Date(NOW - 10 * DAY).toISOString()]),
  );
  const outcome = options.outcome ?? buildProposals("markdown", NOTES);
  const tabs = Array.from({ length: options.tabs ?? 1 }, () => openTab());
  const state = {
    errors: [] as unknown[],
    kept: [] as unknown[],
    deleteAsked: [] as string[],
    surviveQueries: 0,
    alreadyImported: [] as unknown[],
  };
  let created = 0;
  const note = (value: unknown) => {
    if (value !== null && value !== false) state.errors.push(value);
  };
  /** RLS: 살아 있는 세션의 사용자 행만 보인다. */
  const visible = (userId: string) => mockAuth.session?.user.id === userId;
  const bound = <T>(fn: () => Promise<T>): Promise<T> => (options.boundHelpers ? authRuntime.runMutation(fn) : fn());
  const server = {
    deleteSourcesByIds: (userId: string, ids: string[]) => bound(async () => {
      expect(userId).toBe(OWNER);
      barrier.deletes += 1;
      barrier.onDelete?.();
      if (barrier.gate) await barrier.gate;
      if (ids.length === 0) return 0;
      if (ids.some((id) => options.deleteHangsFor?.includes(id))) return new Promise<number>(() => undefined);
      if (options.deleteThrows) throw new Error("network");
      // 다른 계정의 세션: RLS 가 이 행들을 가려 0 행이 지워진다 - 오류가 아니다.
      if (!visible(userId)) return 0;
      state.deleteAsked.push(...ids);
      let removed = 0;
      for (const id of ids) if (rows.delete(id)) removed += 1;
      return options.deleted ?? removed;
    }),
    findSurvivingSourceIds: (userId: string, ids: string[]) => bound(async () => {
      expect(userId).toBe(OWNER);
      state.surviveQueries += 1;
      if (options.survivingThrows) throw new Error("network");
      if (!visible(userId)) return [];
      return options.surviving ?? ids.filter((id) => rows.has(id));
    }),
  };
  // 핸들러는 탭의 실제 두 모듈이 내보내는 것을 그대로 본다. 대역은 서버 둘과 화면 상태뿐이다.
  const withdrawal = (tab: Tab, screenHistory: Entry[]): Record<string, unknown> => ({
    ...tab.history,
    ...tab.ownership,
    userId: OWNER,
    ko: true,
    history: screenHistory,
    t: (key: string) => key,
    i18n: { t: (key: string) => key },
    setRevokeErr: note,
    setHistErr: note,
    setRevokeKept: (value: unknown) => state.kept.push(value),
    setHistKept: (value: unknown) => state.kept.push(value),
    setHistory: () => undefined,
    reactExpression: () => undefined,
    ...server,
  });

  /** 저장소에 적힌 로그 그대로(탭과 무관). */
  const log = (): Entry[] => JSON.parse(mockStore.get(LOG_KEY) ?? "[]") as Entry[];

  /** 화면 목록의 항목 하나에서 철회를 누른다. 화면 목록은 따로 주지 않으면 지금 로그다. */
  const revoke = async (
    which: "deepspace" | "hub",
    id: string,
    { tab = 0, screenHistory }: { tab?: number; screenHistory?: Entry[] } = {},
  ) => {
    const list = screenHistory ?? log();
    const target = list.find((e) => e.id === id);
    if (!target) throw new Error(`화면 목록에 ${id} 가 없다`);
    await extract(which, withdrawal(tabs[tab], list))(which === "hub" ? id : target);
  };

  // capture.ts 의 정확 중복 계약: 본문이 같으면 ingest_log 에 기록을 적고, 새 행도 원문도
  // 쓰지 않고 기존 행을 돌려준다.
  const captureFromMarkdown = async ({ rawMd }: { rawMd: string }) => {
    for (const [id, body] of rows) {
      if (body === rawMd) {
        mockServer.drops.set(id, (mockServer.drops.get(id) ?? 0) + 1);
        return { source: { id, title: "import" }, deduped: "exact_duplicate" };
      }
    }
    created += 1;
    const id = `row-${created}`;
    rows.set(id, rawMd);
    mockServer.born.set(id, new Date(NOW).toISOString());
    return { source: { id, title: "import" }, deduped: null };
  };

  /** 허브에서 같은 파일 · 같은 선택으로 '고른 N건 기록에 반영' 을 누른다. */
  const ratify = async (tab = 0) => {
    const tile = { key: "notion", nameKo: "Notion · Obsidian", nameEn: "Notion · Obsidian", tier: "normal", minorLocked: false };
    await extract("hubRatify", {
      active: tile,
      outcome,
      selected: new Set(outcome.proposals.map((p) => p.id)),
      outcomeKind: null,
      MINOR_LOCKED_KINDS: new Set(),
      userId: OWNER,
      isMinor: false,
      busy: false,
      ko: true,
      progression: { tier: "free" },
      name: (s: typeof tile) => s.nameKo,
      t: (key: string) => key,
      proposalsToMarkdown,
      captureFromMarkdown,
      captureEvent: () => undefined,
      proposalDecided: () => ({}),
      ratifyLedgerEntries: async (_userId: string, chosen: unknown[]) => ({ inserted: chosen.length, failed: 0 }),
      addImportHistory: tabs[tab].history.addImportHistory,
      recordImportConsent: () => undefined,
      enqueueAutoReasoningSource: () => undefined,
      upsertKakaoRelationPeople: async () => undefined,
      reactExpression: () => undefined,
      setImportErr: note,
      setBusy: () => undefined,
      setLedgerWarn: () => undefined,
      setActive: () => undefined,
      setOutcome: () => undefined,
      setOutcomeKind: () => undefined,
      setStep: () => undefined,
      setAlreadyImported: (value: unknown) => state.alreadyImported.push(value),
      createdSourceIds: tabs[tab].ownership.createdSourceIds,
    })(undefined);
  };

  /** /import 에서 파일을 골라 가져온다. 파일 내용은 이미 노트로 나뉜 것으로 준다. */
  const pickFiles = async (notes: string[], tab = 0) => {
    await extract("filePick", {
      userId: OWNER,
      picking: false,
      importing: false,
      setPicking: () => undefined,
      setImporting: () => undefined,
      setResult: () => undefined,
      setHistory: () => undefined,
      t: (key: string) => key,
      pickImportFiles: async () => [{ name: "notes.md", text: notes.join(" --- ") }],
      splitImportNotes: () => notes,
      captureFromMarkdown,
      addImportHistory: tabs[tab].history.addImportHistory,
      getImportHistory: tabs[tab].history.getImportHistory,
    })(undefined);
  };

  return { rows, state, log, revoke, ratify, pickFiles, tabs };
}

/** 철회 뒤 화면이 받은 '남긴 행' 값. 고치기 전에는 수, 지금은 까닭별 묶음이다. 수로 줄여 비교한다. */
const keptTotal = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const kept = value as { shared?: number; unconfirmed?: number };
    return (kept.shared ?? 0) + (kept.unconfirmed ?? 0);
  }
  return 0;
};
const lastKept = (state: { kept: unknown[] }) => keptTotal(state.kept[state.kept.length - 1]);
/** 까닭별 묶음 그대로. */
const lastKeptValue = (state: { kept: unknown[] }) => state.kept[state.kept.length - 1];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
/** 몇 차례 차례를 넘겨도 끝나지 않으면 false - 교착 · 무한 대기를 몇 밀리초 안에 잡는다. */
async function settles(work: Promise<unknown>, turns = 50): Promise<boolean> {
  let done = false;
  void work.then(() => {
    done = true;
  }, () => {
    done = true;
  });
  for (let i = 0; i < turns && !done; i += 1) await flush();
  return done;
}

// ── 삭제가 짧을 때 (기존 불변식) ─────────────────────────────────────────────────
//
// 철회가 "일부만 지워졌다" 를 실패로 세지 않아서, 남은 행을 가리키는 유일한 포인터를
// 버렸다. 두 화면이 같은 불변식을 각자 적어 두고 있다:
//
//   dds-import-inbox-screens.tsx
//     "On delete failure keep the entry and surface an error so the withdrawal
//      can be retried - never drop the only pointer to rows that still exist."
//
//   ImportHubScreen.tsx
//     "The history entry is the only pointer to those rows, so if the delete
//      fails we must KEEP it and surface an error - dropping it would strand the
//      imported rows as unrevokable while telling the user they were withdrawn
//      (the exact false-assurance this screen exists to prevent)."
//
// `deleteSourcesByIds` 는 요청한 것보다 적게 지워도 던지지 않는다 - 지운 개수를
// 돌려줄 뿐이다. 짧은 개수만으로 "남아 있다" 를 단정할 수는 없으므로(이미 지워진 id
// 였을 수도 있다) 개수가 짧을 때만 남았는지 되읽는다. 정상 경로에는 질의가 늘지 않는다.

const ENTRY = owned("entry-1", ["s1", "s2", "s3", "s4", "s5"]);
const FIVE = ["s1", "s2", "s3", "s4", "s5"];

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회", (which) => {
  test("전부 지워지면 기록 항목도 지운다", async () => {
    const w = world({ rows: FIVE, log: [ENTRY] });
    await w.revoke(which, ENTRY.id);
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
  });

  test("일부만 지워졌는데 남은 것이 있으면 기록 항목을 지우지 않는다", async () => {
    // 다섯 중 셋만 지워졌고 되읽어 보니 둘이 남아 있다. 여기서 항목을 지우면
    // 그 둘을 가리키는 것이 사라진다 - 화면이 막으려고 존재하는 상태다.
    const w = world({ rows: FIVE, log: [ENTRY], deleted: 3, surviving: ["s4", "s5"] });
    await w.revoke(which, ENTRY.id);
    expect(w.log().map((e) => e.id)).toEqual([ENTRY.id]);
    expect(w.state.errors.length).toBeGreaterThan(0);
  });

  test("개수가 짧아도 남은 것이 없으면 지운다 - 이미 지워진 id 를 실패로 세지 않는다", async () => {
    const w = world({ rows: FIVE, log: [ENTRY], deleted: 3, surviving: [] });
    await w.revoke(which, ENTRY.id);
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
  });

  test("정상 경로에는 되읽기도 서버 판정 질의도 늘지 않는다", async () => {
    const w = world({ rows: FIVE, log: [ENTRY] });
    await w.revoke(which, ENTRY.id);
    expect(w.state.surviveQueries).toBe(0);
    expect(mockServer.queries).toBe(0);
    expect(lastKept(w.state)).toBe(0);
  });

  test("던져진 실패는 지금까지처럼 항목을 남기고 알린다", async () => {
    const w = world({ rows: FIVE, log: [ENTRY], deleteThrows: true });
    await w.revoke(which, ENTRY.id);
    expect(w.log().map((e) => e.id)).toEqual([ENTRY.id]);
    expect(w.state.errors.length).toBeGreaterThan(0);
  });
});

test("두 화면이 같은 불변식을 각자 적어 두고 있다", () => {
  // 이 검사가 지키는 것이 그 불변식이다. 문구가 사라지면 다음 사람이 이 회차의
  // 이유를 잃는다.
  const deepspace = fs.readFileSync(path.join(process.cwd(), SCREENS.deepspace.file), "utf8");
  const hub = fs.readFileSync(path.join(process.cwd(), SCREENS.hub.file), "utf8");
  expect(deepspace).toContain("never drop the only pointer to rows that still exist");
  expect(hub).toContain("the only pointer to those rows");
});

// ── 누구의 행인가 (LA-1841-1) ─────────────────────────────────────────────────────
//
// 재현 근거: E:/Coding Infra/reports/vibe-r260919/regate-1841-artifact/findings.md.
// 옛 허브 항목 E2=[R] 은 정확 중복이라 R 을 만들지 않았다. 만든 E1 이 로그에서 보이지
// 않으면(50건 상한 · 다른 기기 · 항목 없는 /capture 행) "다른 포인터 없음" 이 되고, 1차
// 고침은 그것을 "내 것" 으로 읽었다. 서버는 R 을 정확 중복으로 건넨 기록(ingest_log)을
// 갖고 있다 - 그것이 판정의 근거다.

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회 - 옛 허브 항목 (LA-1841-1)", (which) => {
  test("게이트 재현: 첫 항목이 50건 상한에 밀려나고 E2=[R] 만 남아도 R 을 지우지 않는다", async () => {
    const w = world({ rows: ["r"], drops: { r: 1 } });
    const { addImportHistory } = w.tabs[0].history;
    await addImportHistory(OWNER, legacy("e1", ["r"]));
    await addImportHistory(OWNER, legacy("e2", ["r"]));
    for (let i = 0; i < 49; i += 1) await addImportHistory(OWNER, owned(`n${i}`, [`n${i}`]));
    const before = w.log();
    expect(before).toHaveLength(50);
    expect(before.some((e) => e.id === "e1")).toBe(false);
    expect(before[before.length - 1].id).toBe("e2");

    await w.revoke(which, "e2");
    expect(w.rows.has("r")).toBe(true);
    expect(w.state.deleteAsked).not.toContain("r");
    expect(w.log().some((e) => e.id === "e2")).toBe(false);
    expect(w.state.errors).toEqual([]);
    // 남긴 것을 알린다(LZ-1841-3).
    expect(lastKept(w.state)).toBe(1);
  });

  test("게이트 재현: 첫 가져오기가 다른 기기에 있으면(이 기기 로그엔 E2 뿐) R 을 지우지 않는다", async () => {
    // 먼저 /capture 로 담은 같은 본문을 허브로 다시 비준한 경우도 모양이 같다: R 에는
    // 가리키는 항목이 애초에 없고, 정확 중복 기록 하나만 있다.
    const w = world({ rows: ["r"], log: [legacy("e2", ["r"])], drops: { r: 1 } });
    await w.revoke(which, "e2");
    expect(w.rows.has("r")).toBe(true);
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
    expect(lastKept(w.state)).toBe(1);
  });

  test("한 번도 중복으로 건네지지 않은 행은 옛 항목도 지운다 - 정당한 옛 철회", async () => {
    const w = world({ rows: ["a", "b", "z"], log: [legacy("e2", ["a", "b"]), legacy("e1", ["z"])] });
    await w.revoke(which, "e2");
    expect([...w.rows.keys()]).toEqual(["z"]);
    expect(w.log().map((e) => e.id)).toEqual(["e1"]);
    expect(w.state.errors).toEqual([]);
    expect(lastKept(w.state)).toBe(0);
  });

  test("E1 · E2 가 다 보이면 어느 쪽을 먼저 철회해도 두 번째 철회가 R 을 지운다", async () => {
    // 기록 하나 = 만든 쪽 하나 + 중복 하나, 둘 다 이 로그에 있다. 먼저 철회한 쪽은 R 을
    // 남기고 남은 쪽을 주인으로 올린다.
    for (const [first, second] of [["e2", "e1"], ["e1", "e2"]]) {
      const w = world({ rows: ["r"], log: [legacy("e2", ["r"]), legacy("e1", ["r"])], drops: { r: 1 } });
      await w.revoke(which, first);
      expect(w.rows.has("r")).toBe(true);
      expect(w.log()).toEqual([{ ...legacy(second, ["r"]), owned: true }]);
      expect(lastKept(w.state)).toBe(1);
      await w.revoke(which, second);
      expect(w.rows.has("r")).toBe(false);
      expect(w.log()).toEqual([]);
      expect(w.state.errors).toEqual([]);
      expect(lastKept(w.state)).toBe(0);
    }
  });

  test("남길 행은 남기고, 이미 없어진 자기 행은 실패로 세지 않는다", async () => {
    // 개수가 짧을 때의 되읽기는 지우려던 행만 묻는다. 남기기로 한 R 까지 물으면 R 이
    // '남아 있다' 로 나와서 멀쩡한 철회가 실패로 끝난다. S 는 판정 뒤 · 지우기 직전에
    // 다른 곳에서 지워졌다(판정할 때 없던 행은 날짜를 못 읽어 애초에 지우러 가지 않는다).
    const w = world({ rows: ["r", "s"], log: [legacy("e2", ["r", "s"]), legacy("e1", ["r"])], drops: { r: 1 } });
    barrier.onDelete = () => {
      w.rows.delete("s");
    };
    await w.revoke(which, "e2");
    expect(w.rows.has("r")).toBe(true);
    expect(w.state.deleteAsked).toEqual(["s"]);
    expect(w.log().map((e) => e.id)).toEqual(["e1"]);
    expect(w.state.errors).toEqual([]);
    expect(lastKept(w.state)).toBe(1);
  });

  test("새 항목(owned)의 철회는 옛 중복 항목이 같은 행을 가리켜도 지운다", async () => {
    // 옛 탭(고치기 전 코드)이 같은 본문을 다시 비준해 E_old=[R] 을 적은 경우. 만든 것은
    // 새 항목이다. E_old 는 그 뒤 철회해도 지울 것이 없다.
    const w = world({ rows: ["r"], log: [legacy("old", ["r"]), owned("p", ["r"])], drops: { r: 1 } });
    await w.revoke(which, "p");
    expect(w.rows.has("r")).toBe(false);
    expect(w.log().map((e) => e.id)).toEqual(["old"]);
    await w.revoke(which, "old");
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
    // 남긴 R 은 이미 없다 - 없는 것을 '남겼다' 고 하지 않는다.
    expect(lastKept(w.state)).toBe(0);
  });
});

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회 - 판정의 근거는 방금 읽은 로그다", (which) => {
  test("화면 목록의 낡은 사본이 아니라 로그의 항목으로 판정한다", async () => {
    // 다른 탭의 철회가 e1 을 주인으로 올렸는데 이 화면의 목록에는 옛 사본이 있다.
    const w = world({ rows: ["r"], log: [owned("e1", ["r"])], drops: { r: 1 } });
    await w.revoke(which, "e1", { screenHistory: [legacy("e1", ["r"])] });
    expect(w.rows.has("r")).toBe(false);
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
  });

  test("저장된 owned 가 true 가 아니면 증명이 아니다 - 옛 항목으로 판정한다", async () => {
    // 손으로 고친 저장소나 다른 형식의 값이 "내 것" 으로 읽히면 안 된다.
    const tampered = { ...legacy("e2", ["r"]), owned: "true" } as unknown as Entry;
    const w = world({ rows: ["r"], log: [tampered], drops: { r: 1 } });
    await w.revoke(which, "e2");
    expect(w.rows.has("r")).toBe(true);
    expect(w.log()).toEqual([]);
    expect(lastKept(w.state)).toBe(1);
  });

  test("로그에서 이미 빠진 항목은 화면 사본으로 지우지 않는다", async () => {
    const w = world({ rows: ["r"], log: [] });
    await w.revoke(which, "gone", { screenHistory: [owned("gone", ["r"])] });
    expect(w.state.deleteAsked).toEqual([]);
    expect(w.rows.has("r")).toBe(true);
    expect(w.state.errors).toEqual([]);
  });
});

// ── 동시 철회 (LA-1841-2 · LZ-1841-1) ────────────────────────────────────────────
//
// 게이트 재현: 두 탭이 E2 · E1 을 동시에 철회하면, 둘 다 상대를 보고 R 을 남긴 뒤 각자
// 항목을 빼서 행 R 만 남고 포인터가 사라졌다. 철회는 이제 계정마다 하나씩 - 로그 읽기에서
// 항목 제거까지 한 임계 구역이다. 두 번째 철회는 첫 철회가 끝난 로그를 읽는다.

describe("두 철회가 겹칠 때 (LZ-1841-1)", () => {
  /**
   * 첫 철회(탭 0 · 허브 · e2)를 서버 삭제 단계에서 붙잡고 두 번째(마지막 탭 · /import ·
   * e1)를 누른 뒤, 두 번째가 삭제 단계까지 왔는지 센다. 삭제 단계는 로그를 읽고 판정한
   * 다음이라, 두 번째가 거기 왔다면 첫 철회가 항목을 빼기 전의 로그로 판정한 것이다.
   */
  async function overlap(runtime: Runtime, tabs: number) {
    const w = world({ runtime, tabs, rows: ["r"], log: [legacy("e2", ["r"]), legacy("e1", ["r"])], drops: { r: 1 } });
    let release!: () => void;
    barrier.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached!: () => void;
    const firstDeleting = new Promise<void>((resolve) => {
      reached = resolve;
    });
    barrier.onDelete = () => reached();
    const a = w.revoke("hub", "e2", { tab: 0 });
    let deletesWhileHeld = 0;
    let b: Promise<void> = Promise.resolve();
    try {
      await firstDeleting;
      b = w.revoke("deepspace", "e1", { tab: tabs - 1 });
      for (let i = 0; i < 20; i += 1) await flush();
      deletesWhileHeld = barrier.deletes;
    } finally {
      barrier.gate = null;
      release();
      await Promise.allSettled([a, b]);
    }
    return { w, deletesWhileHeld };
  }

  test("웹 두 탭: 두 번째 철회는 첫 철회가 끝난 로그로 판정하고, 둘이 끝나면 R 도 포인터도 없다", async () => {
    const { w, deletesWhileHeld } = await overlap("web", 2);
    // 첫 철회가 삭제 단계에서 멈춰 있는 동안 두 번째는 로그를 읽지도 못했다.
    expect(deletesWhileHeld).toBe(1);
    expect(w.rows.has("r")).toBe(false);
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
  });

  test("네이티브 한 런타임: 같은 줄에 서서 같은 결과", async () => {
    const { w, deletesWhileHeld } = await overlap("native", 1);
    expect(deletesWhileHeld).toBe(1);
    expect(w.rows.has("r")).toBe(false);
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
  });

  test("철회한 항목이 (줄 없는 탭의 낡은 쓰기로) 되살아나면 남은 쪽을 주인으로 올리지 않는다", async () => {
    // 주인 올리기의 전제는 "철회한 항목이 로그를 떠났다" 다. 떠난 직후 다른 탭이 낡은
    // 로그를 통째로 다시 쓰면 e2 가 돌아온다. 그때 e1 이 주인으로 남아 있으면 e1 의 철회가
    // 아직 목록에 있는 e2 의 R 을 지운다. 주인 올리기는 e2 를 빼는 바로 그 쓰기에 실려서,
    // 낡은 쓰기가 둘을 함께 되돌린다.
    const w = world({ rows: ["r"], log: [legacy("e2", ["r"]), legacy("e1", ["r"])], drops: { r: 1 } });
    const stale = mockStore.get(LOG_KEY)!;
    const setItem = mockStorage.setItem;
    let staleWrites = 0;
    mockStorage.setItem = async (key: string, value: string) => {
      await setItem(key, value);
      // 다른 탭의 낡은 쓰기 한 번: e2 를 뺀 바로 그 쓰기 뒤에만.
      if (key === LOG_KEY && staleWrites === 0) {
        staleWrites += 1;
        mockStore.set(LOG_KEY, stale);
      }
    };
    try {
      await w.revoke("hub", "e2");
    } finally {
      mockStorage.setItem = setItem;
    }
    expect(w.rows.has("r")).toBe(true);
    expect(w.log()).toEqual([legacy("e2", ["r"]), legacy("e1", ["r"])]);
  });
});

// ── 로그를 못 읽으면 (LZ-1841-2) ─────────────────────────────────────────────────
//
// 표시용 읽기(getImportHistory)는 웹에서 읽기 실패와 손상을 빈 목록으로 돌린다. 철회는
// 그 목록으로 판정하고 로그를 다시 쓰므로, 철회의 읽기는 두 플랫폼 모두 실패를 실패로
// 돌려받고 서버 삭제와 항목 제거를 모두 멈춘다.

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회 - 로그를 못 읽으면 (LZ-1841-2)", (which) => {
  test.each(["web", "native"] as const)("%s: 읽기가 실패하면 아무것도 지우지 않고 항목을 남긴 채 알린다", async (runtime) => {
    const w = world({ runtime, rows: ["a"], log: [owned("p", ["a"]), legacy("e1", ["z"])] });
    const before = mockStore.get(LOG_KEY);
    mockStorage.failLogReads.add(1);
    await w.revoke(which, "p", { screenHistory: [owned("p", ["a"]), legacy("e1", ["z"])] });
    expect(w.state.deleteAsked).toEqual([]);
    expect(w.rows.has("a")).toBe(true);
    expect(mockStore.get(LOG_KEY)).toBe(before);
    expect(w.state.errors.length).toBeGreaterThan(0);
  });

  test("웹: 손상된 로그는 지우지도 덮어쓰지도 않는다", async () => {
    const w = world({ rows: ["a"] });
    mockStore.set(LOG_KEY, "{not-json");
    await w.revoke(which, "p", { screenHistory: [owned("p", ["a"])] });
    expect(w.state.deleteAsked).toEqual([]);
    expect(w.rows.has("a")).toBe(true);
    expect(mockStore.get(LOG_KEY)).toBe("{not-json");
    expect(w.state.errors.length).toBeGreaterThan(0);
  });

  test("삭제 뒤 항목 제거의 읽기가 실패하면 항목을 남기고 알린다 - 다시 누르면 끝난다", async () => {
    const w = world({ rows: ["a"], log: [owned("p", ["a"]), legacy("e1", ["z"])] });
    // 1: 철회의 판정 읽기, 2: 항목 제거의 읽기. 웹에서도 2 가 빈 로그가 되어 e1 까지
    // 지운 로그로 덮어쓰면 안 된다.
    mockStorage.failLogReads.add(2);
    await w.revoke(which, "p");
    expect(w.rows.has("a")).toBe(false);
    expect(w.log().map((e) => e.id)).toEqual(["p", "e1"]);
    expect(w.state.errors.length).toBe(1);
    await w.revoke(which, "p");
    expect(w.log().map((e) => e.id)).toEqual(["e1"]);
    expect(w.state.errors.length).toBe(1);
  });
});

// ── Web Locks 가 없는 브라우저 (L2A-1841-1) ────────────────────────────────────────
//
// 게이트 재현(2차): Web Locks 가 없으면 탭 사이 줄이 없다. 1차 고침의 탭마다 큐는 다른 탭을
// 못 보므로 두 탭의 E2 · E1 철회가 다시 서로를 보고 R 을 남긴 뒤 각자 항목을 빼서, 행 R 만
// 남고 포인터는 사라졌다. 줄을 세울 수 없으면 철회하지 않는다: 행도 항목도 그대로 두고 알린다.

describe("Web Locks 가 없는 브라우저 (L2A-1841-1)", () => {
  test("게이트 재현: 두 탭의 철회가 겹쳐도 R 과 두 포인터가 다 남고, 둘 다 철회하지 않았다고 알린다", async () => {
    const w = world({
      runtime: "web-without-locks",
      tabs: 2,
      rows: ["r"],
      log: [legacy("e2", ["r"]), legacy("e1", ["r"])],
      drops: { r: 1 },
    });
    await Promise.all([w.revoke("hub", "e2", { tab: 0 }), w.revoke("deepspace", "e1", { tab: 1 })]);
    expect(w.rows.has("r")).toBe(true);
    expect(w.log()).toEqual([legacy("e2", ["r"]), legacy("e1", ["r"])]);
    expect(barrier.deletes).toBe(0);
    expect([...w.state.errors].sort()).toEqual(["deepspace:ds.import.revokeUnserialized", "ds.import.revokeUnserialized"]);
  });

  test.each(["deepspace", "hub"] as const)("%s: 자기 행만 든 새 항목도 서버에 아무것도 보내지 않고 그대로 둔다", async (which) => {
    const w = world({ runtime: "web-without-locks", rows: ["a"], log: [owned("p", ["a"])] });
    await w.revoke(which, "p");
    expect(w.rows.has("a")).toBe(true);
    expect(w.log().map((e) => e.id)).toEqual(["p"]);
    expect(barrier.deletes).toBe(0);
    expect(w.state.errors).toHaveLength(1);
    expect(String(w.state.errors[0])).toContain("revokeUnserialized");
  });
});

// ── 계정이 바뀌면 (L2A-1841-2 · L2Z-1841-1) ──────────────────────────────────────
//
// 게이트 재현(2차): 철회가 인증 세션에 묶이지 않았다. 다른 계정의 세션에서 RLS 는 이전
// 계정의 행을 가리므로 삭제는 0 행, 되읽기는 빈 목록이다 - 오류가 아니라 정상 응답이다.
// 화면은 그것을 "이미 없는 행" 으로 읽고 이전 계정의 포인터를 지웠다. 행은 서버에 남았다.
// 이제 철회는 차례를 받자마자 세션을 고정하고, 서버에 다녀올 때마다 그 세션인지 본다.

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회 - 계정이 바뀌면 (L2A-1841-2 · L2Z-1841-1)", (which) => {
  test("게이트 재현: 삭제하는 사이 계정이 바뀌면 빈 답을 '지워졌다' 로 읽지 않는다 - 항목을 남기고 알린다", async () => {
    const w = world({ rows: ["a"], log: [owned("p", ["a"])] });
    barrier.onDelete = () => {
      mockAuth.session = sessionOf("user-b");
    };
    await w.revoke(which, "p");
    expect(w.rows.has("a")).toBe(true);
    expect(w.log().map((e) => e.id)).toEqual(["p"]);
    expect(w.state.errors).toHaveLength(1);
    // 다시 A 로 로그인했다(새 세션). 다시 누르면 끝난다.
    barrier.onDelete = null;
    mockAuth.session = sessionOf(OWNER, { session_id: "session-user-a-2" });
    await w.revoke(which, "p");
    expect(w.rows.has("a")).toBe(false);
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toHaveLength(1);
  });

  test("판정 질의 사이 계정이 바뀌면 그 판정으로 지우지 않는다", async () => {
    // B 의 세션에서 ingest_log 는 기록 0 건으로 답한다. 그대로 믿으면 E2 가 A 의 첫 가져오기
    // 행 R 을 '자기 것' 으로 판정한다.
    const w = world({ rows: ["r"], log: [legacy("e2", ["r"])], drops: { r: 1 } });
    mockServer.onQuery = (table) => {
      if (table === "ingest_log") mockAuth.session = sessionOf("user-b");
    };
    await w.revoke(which, "e2");
    expect(w.state.deleteAsked).toEqual([]);
    expect(w.rows.has("r")).toBe(true);
    expect(w.log().map((e) => e.id)).toEqual(["e2"]);
    expect(w.state.errors).toHaveLength(1);
  });

  test.each(["web", "native"] as const)(
    "게이트 재현 %s: 앞 철회를 기다리는 동안 계정이 바뀌면, 기다리던 철회는 서버에 아무것도 보내지 않는다",
    async (runtime) => {
      const w = world({ runtime, rows: ["a", "b"], log: [owned("p", ["a"]), owned("q", ["b"])] });
      let release!: () => void;
      barrier.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reached!: () => void;
      const firstDeleting = new Promise<void>((resolve) => {
        reached = resolve;
      });
      barrier.onDelete = () => reached();
      const first = w.revoke(which, "p");
      await firstDeleting;
      const second = w.revoke(which, "q");
      for (let i = 0; i < 20; i += 1) await flush();
      expect(barrier.deletes).toBe(1);
      // 두 번째가 차례를 기다리는 동안 다른 탭에서 B 로 로그인했다.
      mockAuth.session = sessionOf("user-b");
      barrier.gate = null;
      release();
      await Promise.allSettled([first, second]);
      // 두 번째는 차례를 받자마자 B 를 보고 멈췄다 - 삭제 단계에 오지 않았다.
      expect(barrier.deletes).toBe(1);
      expect(w.rows.has("a")).toBe(true);
      expect(w.rows.has("b")).toBe(true);
      expect(w.log().map((e) => e.id)).toEqual(["p", "q"]);
      expect(w.state.errors).toHaveLength(2);
    },
  );

  test("로그인 세션이 없으면 아무것도 지우지 않는다", async () => {
    const w = world({ rows: ["a"], log: [owned("p", ["a"])], session: null });
    await w.revoke(which, "p");
    expect(barrier.deletes).toBe(0);
    expect(w.log().map((e) => e.id)).toEqual(["p"]);
    expect(w.state.errors).toHaveLength(1);
  });
});

describe("#1839 과 함께 - 서버 도우미가 스스로 인증 변경 잠금(M)을 잡아도", () => {
  // #1839 는 deleteSourcesByIds · findSurvivingSourceIds 를 M 안에서 돌게 바꾼다
  // (runBoundToOwnerSession). M 은 겹쳐 잡을 수 없다 - 철회가 M 을 쥔 채 그 도우미를 부르면
  // 둘이 서로를 기다린다. 철회는 확인할 때만 M 을 잠깐 잡는다.
  test.each(["web", "native"] as const)("%s: 1+1 철회가 교착 없이 끝나고 R 이 지워진다", async (runtime) => {
    const w = world({ runtime, rows: ["r"], log: [legacy("e2", ["r"]), legacy("e1", ["r"])], drops: { r: 1 }, boundHelpers: true });
    expect(await settles(w.revoke("hub", "e2"))).toBe(true);
    expect(w.log()).toEqual([{ ...legacy("e1", ["r"]), owned: true }]);
    expect(await settles(w.revoke("deepspace", "e1"))).toBe(true);
    expect(w.rows.has("r")).toBe(false);
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
  });
});

// ── 항목 제거와 주인 올리기는 한 번에 (L2Z-1841-2) ──────────────────────────────────
//
// 게이트 재현(2차): E2 철회는 항목 제거를 저장한 뒤 E1 승격을 따로 저장했고, 두 번째 저장의
// 실패를 삼켰다. E1 은 옛 항목으로 남아 자기 철회에서 R 을 남기고 사라졌다 - 저장 한 번의
// 장애가 정상 1+1 철회를 영영 끝낼 수 없게 했다. 이제 둘은 한 번의 읽기-수정-쓰기다.

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회 - 저장이 실패하면 (L2Z-1841-2)", (which) => {
  test.each([1, 2])("게이트 재현: 로그 쓰기 %i 번째가 실패해도 승격을 잃지 않는다 - 결국 R 이 지워진다", async (failAt) => {
    const w = world({ rows: ["r"], log: [legacy("e2", ["r"]), legacy("e1", ["r"])], drops: { r: 1 } });
    mockStorage.failLogWrites.add(failAt);
    await w.revoke(which, "e2");
    mockStorage.failLogWrites.clear();
    // 실패한 철회는 e2 를 그대로 둔다 - 다시 누른다.
    if (w.log().some((e) => e.id === "e2")) await w.revoke(which, "e2");
    expect(w.log()).toEqual([{ ...legacy("e1", ["r"]), owned: true }]);
    await w.revoke(which, "e1");
    expect(w.rows.has("r")).toBe(false);
    expect(w.log()).toEqual([]);
  });

  test("쓰기가 실패하면 로그는 그대로고, 철회는 실패로 알린다", async () => {
    const w = world({ rows: ["r"], log: [legacy("e2", ["r"]), legacy("e1", ["r"])], drops: { r: 1 } });
    mockStorage.failLogWrites.add(1);
    await w.revoke(which, "e2");
    expect(w.log()).toEqual([legacy("e2", ["r"]), legacy("e1", ["r"])]);
    expect(w.state.errors).toHaveLength(1);
    expect(w.rows.has("r")).toBe(true);
  });
});

// ── 기한 (L2A-1841-4) ──────────────────────────────────────────────────────────
//
// 게이트 재현(2차): 철회의 차례는 서버 호출 내내 잡혀 있는데 호출에 기한이 없었다. 답하지
// 않는 요청 하나가 차례를 놓지 않아 같은 계정의 다음 철회가 모두 기다렸다. 이제 철회 하나에
// 기한 하나(30초): 넘기면 실패로 끝내고 항목은 남긴다. 판정 질의는 끊고(abort), 끊을 수 없는
// 삭제는 늦게 도착해도 괜찮다 - 그 행들은 그 항목의 것이고, 항목은 남아 다시 누르면 끝난다.

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회 - 답하지 않는 서버 (L2A-1841-4)", (which) => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["Date", "setImmediate", "nextTick", "queueMicrotask"] });
  });

  test("게이트 재현: 삭제가 답하지 않으면 기한 뒤 실패로 끝나고, 다음 철회가 차례를 받는다", async () => {
    const w = world({ rows: ["a", "b"], log: [owned("p", ["a"]), owned("q", ["b"])], deleteHangsFor: ["a"] });
    const first = w.revoke(which, "p");
    for (let i = 0; i < 20; i += 1) await flush();
    jest.advanceTimersByTime(30_000);
    expect(await settles(first)).toBe(true);
    expect(w.log().map((e) => e.id)).toEqual(["p", "q"]);
    expect(w.state.errors).toHaveLength(1);
    expect(await settles(w.revoke(which, "q"))).toBe(true);
    expect(w.rows.has("b")).toBe(false);
    expect(w.log().map((e) => e.id)).toEqual(["p"]);
    expect(w.state.errors).toHaveLength(1);
  });

  test("판정 질의가 답하지 않으면 기한에 끊고(abort) 아무것도 지우지 않는다", async () => {
    const w = world({ rows: ["r"], log: [legacy("e2", ["r"])] });
    mockServer.stallIngestLog = true;
    const first = w.revoke(which, "e2");
    for (let i = 0; i < 20; i += 1) await flush();
    jest.advanceTimersByTime(30_000);
    expect(await settles(first)).toBe(true);
    expect(mockServer.aborted).toBeGreaterThan(0);
    expect(w.state.deleteAsked).toEqual([]);
    expect(w.rows.has("r")).toBe(true);
    expect(w.log().map((e) => e.id)).toEqual(["e2"]);
    expect(w.state.errors).toHaveLength(1);
  });

  test("기한 안에 끝나면 아무것도 끊지 않는다", async () => {
    const w = world({ rows: ["a"], log: [owned("p", ["a"])] });
    await w.revoke(which, "p");
    jest.advanceTimersByTime(60_000);
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
  });
});

// ── 보존 기한은 서버 시계로 (L2A-1841-3 · L2Z-1841-3) ──────────────────────────────
//
// 게이트 재현(2차): 정확 중복 기록은 1년 뒤 정리된다(0056 정의 · 0067 이 매일 밤 실행). 옛
// 판정은 그 기한을 항목의 atIso(적을 때의 기기 시계)와 지금의 기기 시계로 쟀다. 적을 때 시계가
// 앞서 있었거나 지금 뒤로 가 있으면, 기록이 이미 정리된 행을 '기록 0 건 = 건네진 적 없음 =
// 내 것' 으로 읽고 지웠다. 이제 행의 captured_at 과 토큰의 만료 시각 - 둘 다 서버 시계 - 만 쓴다.

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회 - 보존 기한 (L2A-1841-3 · L2Z-1841-3)", (which) => {
  test("게이트 재현: 서버 시계로 기한을 넘긴 행은, 기기 시계가 최근이라고 해도 기록 0 건을 증명으로 쓰지 않는다", async () => {
    // E2 는 R 을 정확 중복으로 건네받은 옛 항목이다. 그 기록은 보존 기한이 지나 정리됐다.
    // 항목의 atIso 는 어제다 - 적을 때 기기 시계가 크게 앞서 있었다.
    const w = world({
      rows: ["r"],
      log: [legacy("e2", ["r"])],
      drops: { r: 0 },
      born: { r: new Date(NOW - 400 * DAY).toISOString() },
    });
    await w.revoke(which, "e2");
    expect(w.rows.has("r")).toBe(true);
    expect(w.state.deleteAsked).toEqual([]);
    expect(w.state.errors).toEqual([]);
    expect(lastKeptValue(w.state)).toEqual({ shared: 0, unconfirmed: 1, uncertain: false });
  });

  test("토큰의 만료 시각을 읽지 못하면 기한을 모른다 - 기록 0 건이어도 남긴다", async () => {
    const w = world({
      rows: ["r"],
      log: [legacy("e2", ["r"])],
      drops: { r: 0 },
      session: sessionOf(OWNER, { exp: undefined }),
    });
    await w.revoke(which, "e2");
    expect(w.rows.has("r")).toBe(true);
    expect(lastKeptValue(w.state)).toEqual({ shared: 0, unconfirmed: 1, uncertain: false });
  });

  test("기기 시계가 크게 틀려도(1년 뒤) 서버 기준으로 기한 안이면 정당한 옛 철회는 지운다", async () => {
    jest.spyOn(Date, "now").mockReturnValue(NOW + 400 * DAY);
    const w = world({ rows: ["r"], log: [legacy("e2", ["r"])], drops: { r: 0 } });
    await w.revoke(which, "e2");
    expect(w.rows.has("r")).toBe(false);
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
  });
});

// ── 남긴 까닭 (L2Z-1841-4) ───────────────────────────────────────────────────────
//
// 게이트 지적(2차): 남김 안내가 "다른 곳에서도 들여온 원본" 이라고 단정했는데, 그중에는 소유를
// 확인하지 못해 남긴 행도 있었다. 안내는 결과(이번 철회에서 지우지 않은 원본)를 말하고 까닭을
// 나눈다. 남은 것을 되짚지 못하면 그 수가 확인되지 않았다는 것도 말한다.

describe.each(["deepspace", "hub"] as const)("%s 화면의 철회 - 남긴 까닭 (L2Z-1841-4)", (which) => {
  test("다른 가져오기도 들여온 행과, 이 가져오기만의 것인지 확인하지 못한 행을 나눠 센다", async () => {
    const w = world({
      rows: ["r", "old"],
      log: [legacy("e2", ["r", "old"])],
      drops: { r: 1, old: 0 },
      born: { old: new Date(NOW - 400 * DAY).toISOString() },
    });
    await w.revoke(which, "e2");
    expect(w.rows.has("r")).toBe(true);
    expect(w.rows.has("old")).toBe(true);
    expect(lastKeptValue(w.state)).toEqual({ shared: 1, unconfirmed: 1, uncertain: false });
  });

  test("남은 행을 되짚지 못하면 수가 확인되지 않았다고 표시한다", async () => {
    const w = world({ rows: ["r"], log: [legacy("e2", ["r"])], drops: { r: 1 }, survivingThrows: true });
    await w.revoke(which, "e2");
    expect(w.log()).toEqual([]);
    expect(w.state.errors).toEqual([]);
    expect(lastKeptValue(w.state)).toEqual({ shared: 1, unconfirmed: 0, uncertain: true });
  });
});

// ── 비준 (r29 §3-6) ──────────────────────────────────────────────────────────────

describe("가져오기 허브 - 같은 파일 · 같은 선택을 두 번 비준하면", () => {
  beforeEach(() => {
    // 항목 id 는 Date.now() 다. 두 비준이 같은 밀리초에 끝나면 id 가 겹쳐 철회가 둘을
    // 함께 빼므로 시계를 한 칸씩 민다.
    let clock = Date.UTC(2026, 8, 20);
    jest.spyOn(Date, "now").mockImplementation(() => ++clock);
  });

  test("두 번째 비준의 항목을 철회해도 첫 가져오기의 행은 남는다 (r29 재현 순서)", async () => {
    const w = world();
    await w.ratify();
    const [first] = w.log();
    const [row] = first.sourceIds;
    await w.ratify();
    // 두 번째 비준이 남긴 항목이 있으면 그것을 철회한다. 고치기 전에는 E2=[R] 이 생겼다.
    for (const later of w.log().filter((e) => e.id !== first.id)) await w.revoke("hub", later.id);
    expect(w.rows.has(row)).toBe(true);
    expect(w.log().find((e) => e.id === first.id)?.sourceIds).toEqual([row]);
    expect(w.state.errors).toEqual([]);
  });

  test("두 번째 비준은 행 id 를 적지 않고, 새로 담은 것이 없다고 알린다", async () => {
    const w = world();
    await w.ratify();
    await w.ratify();
    expect(w.log()).toHaveLength(1);
    // 알림 값은 고른 건수다. 허브는 고른 것을 노트 하나로 묶어 담으므로, 1 이라고 하면
    // 고른 것 가운데 하나만 겹친 것처럼 읽힌다.
    expect(w.state.alreadyImported).toEqual([0, 2]);
  });

  test("비준이 적는 항목은 owned 표지를 단다 - 철회가 서버에 묻지 않고 지운다", async () => {
    const w = world();
    await w.ratify();
    const [first] = w.log();
    expect(first.owned).toBe(true);
    await w.revoke("hub", first.id);
    expect(w.rows.has(first.sourceIds[0])).toBe(false);
    expect(mockServer.queries).toBe(0);
  });

  test("정확 중복이어도 거래를 새로 적었으면 이력 줄은 남기되 그 행 id 는 적지 않는다", async () => {
    // 가계부 반영이 통째로 실패하면 화면은 '같은 파일을 다시 가져오면 반영돼요' 라고
    // 안내한다. 그 재가져오기는 노트가 정확 중복이어도 거래를 새로 적는다. 줄이 없으면
    // 안내를 따른 결과가 어디에도 안 보인다.
    const w = world({ outcome: financeOutcome() });
    await w.ratify();
    const [first] = w.log();
    await w.ratify();
    const [second] = w.log();
    expect(w.log()).toHaveLength(2);
    expect(second.sourceIds).toEqual([]);
    expect(second.summary).toContain("txns 1");
    expect(w.state.alreadyImported).toEqual([0, 0]);
    await w.revoke("hub", second.id);
    expect(w.rows.has(first.sourceIds[0])).toBe(true);
    expect(w.state.errors).toEqual([]);
  });
});

describe("/import 파일 가져오기", () => {
  beforeEach(() => {
    let clock = Date.UTC(2026, 8, 20);
    jest.spyOn(Date, "now").mockImplementation(() => ++clock);
  });

  test("만든 행만 적고 owned 표지를 단다 - 정확 중복 노트는 적지 않는다", async () => {
    // 파일 가져오기는 원래 정확 중복을 적지 않았다(#898). 표지까지 달아 두면 이 항목의
    // 철회는 sourceKey 규칙에 기대지 않고도 자기 행을 지운다.
    const w = world();
    await w.pickFiles(["# a\nbody a", "# b\nbody b", "# a\nbody a"]);
    const [entry] = w.log();
    expect(w.log()).toHaveLength(1);
    expect(entry).toMatchObject({ sourceKey: "file", sourceIds: ["row-1", "row-2"], owned: true });
    expect(mockServer.drops.get("row-1")).toBe(1);
    await w.revoke("deepspace", entry.id);
    expect(w.rows.size).toBe(0);
    expect(mockServer.queries).toBe(0);
  });
});

// ── 화면에 그려지는 문구 (렌더 테스트는 막혀 있다 - RN 0.85) ─────────────────────────
//
// 실제 render 선언을 떼어, JSX 를 평범한 객체로 만드는 React 대역 위에서 돌린다. 문구는
// 앱과 같은 옵션으로 띄운 i18next 가 실제 로케일 번들에서 찾는다. 기대값도 같은
// 인스턴스로 만든다 - 문구 원문을 여기 박으면 문구를 고칠 때마다 이 테스트가 깨진다.

type JsxNode = { children: unknown[] };
const React = {
  Fragment: "Fragment",
  createElement: (type: unknown, props: unknown, ...children: unknown[]): JsxNode & { type: unknown; props: unknown } => ({
    type,
    props,
    children,
  }),
};
const texts = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) texts(v, out);
  else if (value && typeof value === "object" && "children" in value) texts((value as JsxNode).children, out);
  return out;
};

async function appI18n() {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: "ko",
    fallbackLng: "en",
    resources: { ko: { deepspace: koDeepspace }, en: { deepspace: enDeepspace } },
    ns: ["deepspace"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    compatibilityJSON: "v3",
  });
  return i18n;
}

test("비준 알림은 허브 첫 화면에 파일 가져오기의 결과 줄 문구로 그려지고, 0 이면 그리지 않는다", async () => {
  // ko 로는 "0개를 정리함에 담았어요 · 중복 2개".
  const i18n = await appI18n();
  const hub = (alreadyImported: number) =>
    texts(
      (extract("hubRender", {
        React,
        i18n,
        alreadyImported,
        ledgerWarn: null,
        SOURCES: [],
        TIER_COLOR: {},
        styles: {},
        t: (key: string) => key,
        View: "View",
        Text: "Text",
        OpsState: "OpsState",
      }) as unknown as () => unknown)(),
    );

  const line = (n: number) =>
    `${i18n.t("deepspace:ds.import.resultAdded", { count: 0 })} · ` +
    i18n.t("deepspace:ds.import.resultDuplicate", { count: n });
  // 키가 번들에 없으면 줄이 키 이름 그대로 그려진다.
  for (const key of ["deepspace:ds.import.resultAdded", "deepspace:ds.import.resultDuplicate"]) {
    expect(i18n.exists(key)).toBe(true);
  }

  expect(hub(2)).toContain(line(2));
  await i18n.changeLanguage("en");
  expect(hub(12)).toContain(line(12));
  const added = i18n.t("deepspace:ds.import.resultAdded", { count: 0 });
  expect(hub(0).filter((text) => text.includes(added))).toEqual([]);
});

test("남긴 행 알림은 허브 이력 화면에 까닭별로 그려지고, 남긴 것이 없으면 그리지 않는다 (LZ-1841-3 · L2Z-1841-4)", async () => {
  // 목록이 비어도 그린다 - 남긴 철회가 마지막 항목이었을 수 있다.
  const i18n = await appI18n();
  const tab = openTab();
  const historyView = (histKept: unknown) =>
    texts(
      (extract("hubHistory", {
        ...tab.ownership,
        React,
        i18n,
        histKept,
        histErr: null,
        history: [],
        styles: {},
        t: (key: string) => key,
        View: "View",
        Text: "Text",
        OpsState: "OpsState",
        Pressable: "Pressable",
        removeHistory: () => undefined,
        setStep: () => undefined,
      }) as unknown as () => unknown)(),
    ).join("\n");
  const line = (key: string, count?: number) => i18n.t(`deepspace:ds.import.${key}`, { count });

  // 키가 번들에 없으면 줄이 키 이름 그대로 그려진다.
  for (const key of ["revokeKeptShared", "revokeKeptUnconfirmed", "revokeKeptUncertain", "revokeUnserialized"]) {
    expect(i18n.exists(`deepspace:ds.import.${key}`)).toBe(true);
  }
  const both = historyView({ shared: 1, unconfirmed: 2, uncertain: false });
  expect(both).toContain(line("revokeKeptShared", 1));
  expect(both).toContain(line("revokeKeptUnconfirmed", 2));
  expect(both).not.toContain(line("revokeKeptUncertain"));

  await i18n.changeLanguage("en");
  expect(line("revokeKeptShared", 3)).not.toBe(line("revokeKeptShared", 1));
  const unchecked = historyView({ shared: 0, unconfirmed: 3, uncertain: true });
  expect(unchecked).toContain(line("revokeKeptUnconfirmed", 3));
  expect(unchecked).toContain(line("revokeKeptUncertain"));
  expect(unchecked).not.toContain(line("revokeKeptShared", 3));

  // 남긴 것이 없으면 알림 카드가 없다 - '확인하지 못했다' 만 떠 있는 일도 없다.
  const nothing = historyView(null);
  expect(historyView({ shared: 0, unconfirmed: 0, uncertain: true })).toBe(nothing);
  for (const key of ["revokeKeptShared", "revokeKeptUnconfirmed"]) expect(nothing).not.toContain(line(key, 0));
  expect(nothing).not.toContain(line("revokeKeptUncertain"));
});
