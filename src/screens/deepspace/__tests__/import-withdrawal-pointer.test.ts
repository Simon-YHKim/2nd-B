// 가져오기 철회를 두 화면의 실제 핸들러로 돌린다 - 저장소 · 잠금 · 판정은 진짜 모듈이다.
//
// 화면을 렌더하지 않고 실제 핸들러 선언을 AST 로 떼어 inert 컨텍스트에서 돌린다. 그
// 컨텍스트에 넣는 이력 모듈(history.ts)과 판정 모듈(history-ownership.ts)은 진짜다:
// 저장소(웹 AsyncStorage · 네이티브 암호화 저장소)와 서버(sources 행 · ingest_log)만
// 대역이다. 탭 둘은 같은 저장소와 같은 Web Lock 관리자를 나눠 쓰는 모듈 인스턴스 둘이다.
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

// ── 대역: 저장소와 서버 (import 보다 먼저 - jest.mock 팩토리가 이 이름들을 쓴다) ──────
const mockStore = new Map<string, string>();
const mockStorage = {
  /** 로그 키 읽기 순번(1부터) 가운데 실패시킬 것. */
  failLogReads: new Set<number>(),
  logReads: 0,
  getItem: async (key: string) => {
    if (key === "import.history:user-a") {
      mockStorage.logReads += 1;
      if (mockStorage.failLogReads.has(mockStorage.logReads)) throw new Error("storage read failed");
    }
    return mockStore.get(key) ?? null;
  },
  setItem: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
  removeItem: async (key: string) => {
    mockStore.delete(key);
  },
};
const mockServer = {
  /** ingest_log: 행마다 정확 중복으로 건넨 기록 수 (capture.ts 가 건네기 전에 적는다). */
  drops: new Map<string, number>(),
  queries: 0,
};
/** 서버 삭제 단계에 거는 장벽. 고치기 전 코드도 지나는 자리라 두 코드를 같은 순서로 멈춘다. */
const barrier = {
  deletes: 0,
  gate: null as Promise<void> | null,
  onDelete: null as (() => void) | null,
};

jest.mock("@react-native-async-storage/async-storage", () => ({ __esModule: true, default: mockStorage }));
jest.mock("@/lib/storage/encrypted-native-storage", () => ({ getEncryptedNativeStorage: () => mockStorage }));
jest.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        limit: async (n: number) => {
          mockServer.queries += 1;
          const count = filters.user_id === "user-a" && filters.stage === "exact_duplicate"
            ? mockServer.drops.get(String(filters.survivor_id)) ?? 0
            : 0;
          return { data: Array.from({ length: Math.min(count, n) }, (_, i) => ({ id: `drop-${i}` })), error: null };
        },
      };
      return builder;
    },
  }),
}));

import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";
import ts from "typescript";

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

class SerialLockManager {
  private readonly tails = new Map<string, Promise<void>>();

  request<T>(name: string, callback: () => Promise<T> | T): Promise<T> {
    const previous = this.tails.get(name) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(callback);
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
  // 판정은 항목 시각을 '지금' 과 비교한다(정확 중복 기록의 보관 기한). 지금을 고정한다.
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => jest.restoreAllMocks());

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
  /** 이 기기의 이력 로그(최신이 앞). */
  log?: Entry[];
  /** ingest_log: 행마다 정확 중복으로 건넨 기록 수. */
  drops?: Record<string, number>;
  runtime?: Runtime;
  tabs?: number;
  outcome?: ImportOutcome;
  /** 삭제가 돌려주는 개수를 덮어쓴다(일부만 지워진 경우). */
  deleted?: number;
  /** 되읽기가 돌려주는 남은 행을 덮어쓴다. */
  surviving?: string[];
  deleteThrows?: boolean;
}

function world(options: WorldOptions = {}) {
  mockStore.clear();
  fenceStore.clear();
  mockStorage.failLogReads.clear();
  mockStorage.logReads = 0;
  mockServer.drops = new Map(Object.entries(options.drops ?? {}));
  mockServer.queries = 0;
  barrier.deletes = 0;
  barrier.gate = null;
  barrier.onDelete = null;
  setRuntime(options.runtime ?? "web");
  if (options.log) mockStore.set(LOG_KEY, JSON.stringify(options.log));

  const rows = new Map<string, string>((options.rows ?? []).map((id) => [id, `body of ${id}`]));
  const outcome = options.outcome ?? buildProposals("markdown", NOTES);
  const tabs = Array.from({ length: options.tabs ?? 1 }, () => openTab());
  const state = {
    errors: [] as unknown[],
    kept: [] as number[],
    deleteAsked: [] as string[],
    surviveQueries: 0,
    alreadyImported: [] as unknown[],
  };
  let created = 0;
  const note = (value: unknown) => {
    if (value !== null && value !== false) state.errors.push(value);
  };
  const server = {
    deleteSourcesByIds: async (userId: string, ids: string[]) => {
      expect(userId).toBe(OWNER);
      barrier.deletes += 1;
      barrier.onDelete?.();
      if (barrier.gate) await barrier.gate;
      if (ids.length === 0) return 0;
      if (options.deleteThrows) throw new Error("network");
      state.deleteAsked.push(...ids);
      let removed = 0;
      for (const id of ids) if (rows.delete(id)) removed += 1;
      return options.deleted ?? removed;
    },
    findSurvivingSourceIds: async (userId: string, ids: string[]) => {
      expect(userId).toBe(OWNER);
      state.surviveQueries += 1;
      return options.surviving ?? ids.filter((id) => rows.has(id));
    },
  };
  // 핸들러는 탭의 실제 두 모듈이 내보내는 것을 그대로 본다. 대역은 서버 둘과 화면 상태뿐이다.
  const withdrawal = (tab: Tab, screenHistory: Entry[]): Record<string, unknown> => ({
    ...tab.history,
    ...tab.ownership,
    userId: OWNER,
    ko: true,
    history: screenHistory,
    t: (key: string) => key,
    setRevokeErr: note,
    setHistErr: note,
    setRevokeKept: (n: number) => state.kept.push(n),
    setHistKept: (n: number) => state.kept.push(n),
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

const lastKept = (state: { kept: number[] }) => state.kept[state.kept.length - 1];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

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
    // '남아 있다' 로 나와서 멀쩡한 철회가 실패로 끝난다.
    const w = world({ rows: ["r"], log: [legacy("e2", ["r", "s"]), legacy("e1", ["r"])], drops: { r: 1 } });
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
    // 로그를 통째로 다시 쓰면 e2 가 돌아온다. 그때 e1 을 주인으로 올리면 e1 의 철회가
    // 아직 목록에 있는 e2 의 R 을 지운다.
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

  test("Web Locks 가 없는 브라우저의 두 탭은 줄 세울 수 없다 - 그때도 지운 척하지 않고 남긴 것을 알린다", async () => {
    // 남는 한계: 두 탭이 서로를 보고 둘 다 R 을 남긴다. 로그 쓰기도 탭 사이에 줄이 없어
    // 결과 로그는 두 쓰기가 겹친 모양에 따라 달라진다(빈 로그 또는 되살아난 한 항목) -
    // 그래서 로그 모양은 여기서 박지 않는다. 박는 것은 거짓 확신이 없다는 것: R 은
    // 지워지지 않았고, 두 철회 모두 남겼다고 말했다.
    const { w, deletesWhileHeld } = await overlap("web-without-locks", 2);
    expect(deletesWhileHeld).toBe(2);
    expect(w.rows.has("r")).toBe(true);
    expect(w.state.errors).toEqual([]);
    expect(w.state.kept.filter((n) => n > 0)).toEqual([1, 1]);
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

test("남긴 행 알림은 허브 이력 화면에 그려지고, 0 이면 그리지 않는다 (LZ-1841-3)", async () => {
  // 목록이 비어도 그린다 - 남긴 철회가 마지막 항목이었을 수 있다.
  const i18n = await appI18n();
  const historyView = (histKept: number) =>
    texts(
      (extract("hubHistory", {
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
    );

  expect(i18n.exists("deepspace:ds.import.revokeKept")).toBe(true);
  expect(historyView(1)).toContain(i18n.t("deepspace:ds.import.revokeKept", { count: 1 }));
  await i18n.changeLanguage("en");
  expect(historyView(3)).toContain(i18n.t("deepspace:ds.import.revokeKept", { count: 3 }));
  expect(i18n.t("deepspace:ds.import.revokeKept", { count: 3 })).not.toBe(
    i18n.t("deepspace:ds.import.revokeKept", { count: 1 }),
  );
  const kept = i18n.t("deepspace:ds.import.revokeKept", { count: 0 });
  expect(historyView(0).filter((text) => text === kept)).toEqual([]);
});
