// 자동 저장 한 번 = 취소할 수 있는 작업 한 건 (PR 1814 재설계 C4, 2026-09-17).
//
// 설계 §5-2 경쟁 순서 표를 그대로 테스트로 옮긴다. 행은 작업이 기다리는 자리, 열은 그때 끼어드는 일이다.
//   J1 동의 확인 읽기 · J2 중복 후보 조회 · J3 원문 업로드 중 · J4 행 INSERT 중 · J5 되돌리기 삭제 중 · 끝난 뒤
//   × 같은 앱 끄기(의도 · 확정) · 끄고 다시 켬 · 계정 전환 · 로그아웃 · 새 대화 · 화면 이탈 · 다른 기기 끄기
// 기대값 기호: 0 쓰기 0 · U 올린 원문만 지운다(행 0) · R 행과 원문을 지운다 · K 저장이 끝난다 · Q 그 계정이 돌아올
// 때로 미룬다(대기 기록). "새 대화" 는 취소 사유가 아니다(Simon 결정 D-1 ②) - 그 열은 전부 K 다.
// "다른 기기 끄기" 는 담기 직전 서버 확인이 꺼짐을 읽는 경우(0)만 본다. 그 뒤의 창은 서버 몫(S2)이다.
//
// 실제 실행기 · capture · deleteCapturedSource · account-epoch · pref-changes · privacy.ts · 동의 저장소를 돌리고
// supabase/client 만 목으로 바꿨다. 목은 서버 상태(prefs · sources · 원문 객체 · ingest_log)를 들고 요청을 붙잡았다
// 풀 수 있다.
//   · 요청은 **보낸 순간의 세션**으로 서버에서 실행된다(RLS). 계정이 바뀐 뒤 풀린 A 의 요청은 A 로 커밋되고,
//     B 세션으로 보낸 요청은 A 의 행과 폴더를 보지 못한다.
//   · 신호가 붙은 요청이 붙잡힌 채 끊기면 클라이언트만 먼저 끝나고 서버 쪽은 풀릴 때 실행된다. 끊긴 요청이 어떤
//     모양으로 오는지는 두 가지를 다 돌린다: AbortError reject · 이름 없는 오류 객체(supabase-js 모양, 미확인).
//   · 없는 경로의 원문 삭제도 두 모양을 돌린다: 빈 목록 · 404 오류(미확인).
// ⚠ 운영 Supabase 에서 클라이언트가 정한 id 로 INSERT 가 되는지, 끊긴 fetch 뒤 서버가 커밋하는지는 확인하지 않았다.

type Row = Record<string, unknown>;
type Label =
  | "prefsRead"
  | "prefsUpdate"
  | "ledger"
  | "candidates"
  | "drop"
  | "getSource"
  | "insert"
  | "rowLookup"
  | "rowCheck"
  | "rowDelete"
  | "sourceUpdate"
  | "pages"
  | "pageDelete"
  | "upload"
  | "remove";

interface MockResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

interface MockHold {
  reached: () => void;
  released: Promise<void>;
}

const mockServer = {
  prefs: new Map<string, Row>(),
  sources: [] as Row[],
  ingestLog: [] as Row[],
  wikiPages: [] as Row[],
  objects: new Map<string, string>(),
  ledger: [] as Row[],
  /** Supabase 클라이언트가 지금 로그인해 있는 계정(auth-js 세션). 요청은 보낸 순간의 값을 쥔다. */
  session: null as string | null,
  arrived: [] as { label: Label; session: string | null; signal: boolean }[],
  holds: new Map<Label, MockHold[]>(),
  abortShape: "reject" as "reject" | "errorResult",
  missingRemove: "empty" as "empty" | "notFound",
  /** 다음 N 번은 서버에 닿지 않고 연결 오류로 끝난다. */
  networkFail: new Map<Label, number>(),
  /** 다음 N 번은 서버에서 실행되는데 응답을 잃는다. */
  loseResponse: new Map<Label, number>(),
  /** 다음 N 번은 서버에 닿았다가 서버 오류로 끝난다(쓰기 없음). */
  serverError: new Map<Label, number>(),
};

function mockAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function mockClientAbort(): Promise<MockResult> {
  return mockServer.abortShape === "reject"
    ? Promise.reject(mockAbortError())
    : Promise.resolve({ data: null, error: { message: "AbortError: The operation was aborted.", code: "" } });
}

function mockTake(counter: Map<Label, number>, label: Label): boolean {
  const left = counter.get(label) ?? 0;
  if (left <= 0) return false;
  counter.set(label, left - 1);
  return true;
}

function mockNetworkError(label: Label): MockResult {
  return label === "upload" || label === "remove"
    ? { data: null, error: { name: "StorageUnknownError", message: "fetch failed" } }
    : { data: null, error: { message: "TypeError: fetch failed", code: "" } };
}

function mockSend(label: Label, signal: AbortSignal | undefined, execute: (session: string | null) => MockResult): Promise<MockResult> {
  // fetch 는 이미 끊긴 신호로는 요청을 보내지 않는다.
  if (signal?.aborted) return mockClientAbort();
  if (mockTake(mockServer.networkFail, label)) return Promise.resolve(mockNetworkError(label));
  const session = mockServer.session;
  mockServer.arrived.push({ label, session, signal: signal !== undefined });
  const lose = mockTake(mockServer.loseResponse, label);
  const failed = mockTake(mockServer.serverError, label);
  const gate = mockServer.holds.get(label)?.shift();
  gate?.reached();
  // 서버 쪽 실행. 붙잡혀 있으면 풀릴 때 실행된다. 클라이언트가 끊겨도 이 실행은 일어난다.
  const server = (gate ? gate.released : Promise.resolve()).then((): MockResult => {
    if (failed) return { data: null, error: { message: "internal error", code: "XX000", status: 500, statusCode: "500" } };
    const result = execute(session);
    return lose ? mockNetworkError(label) : result;
  });
  if (!signal) return server;
  return new Promise<MockResult>((resolve, reject) => {
    const onAbort = (): void => {
      void mockClientAbort().then(resolve, reject);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void server.then((result) => {
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    });
  });
}

function mockRlsDenied(): MockResult {
  return { data: null, error: { message: "new row violates row-level security policy", code: "42501" } };
}

function mockTable(table: string) {
  let op: "select" | "insert" | "update" | "delete" = "select";
  let columns = "*";
  let body: Row = {};
  let countRequested = false;
  let signal: AbortSignal | undefined;
  const filters: ((row: Row) => boolean)[] = [];

  const label = (): Label => {
    if (table === "users") return op === "update" ? "prefsUpdate" : "prefsRead";
    if (table === "consent_changes" || table === "consent_records") return "ledger";
    if (table === "ingest_log") return "drop";
    if (table === "wiki_pages") return op === "delete" ? "pageDelete" : "pages";
    if (op === "insert") return "insert";
    if (op === "update") return "sourceUpdate";
    if (op === "delete") return "rowDelete";
    if (columns === "*") return "getSource";
    if (columns.startsWith("id, content_hash")) return "candidates";
    if (columns.startsWith("id, storage_path")) return "rowLookup";
    return "rowCheck";
  };

  const matches = (row: Row): boolean => filters.every((keep) => keep(row));

  const execute = (session: string | null): MockResult => {
    if (table === "users") {
      if (op === "update") {
        for (const [id] of mockServer.prefs) {
          if (id === session && matches({ id })) mockServer.prefs.set(id, structuredClone(body.privacy_prefs as Row));
        }
        return { data: null, error: null };
      }
      const hit = [...mockServer.prefs].filter(([id]) => id === session && matches({ id }));
      return { data: hit.map(([, prefs]) => ({ privacy_prefs: structuredClone(prefs) })), error: null };
    }
    if (label() === "ledger") {
      mockServer.ledger.push({ table });
      return { data: null, error: null };
    }
    if (table === "ingest_log") {
      if (body.user_id !== session) return mockRlsDenied();
      mockServer.ingestLog.push({ ...body });
      return { data: null, error: null };
    }
    const rows = table === "wiki_pages" ? mockServer.wikiPages : mockServer.sources;
    const visible = rows.filter((row) => row.user_id === session && matches(row));
    if (op === "select") return { data: visible.map((row) => ({ ...row })), error: null };
    if (op === "update") {
      visible.forEach((row) => Object.assign(row, body));
      return { data: null, error: null };
    }
    if (op === "delete") {
      const kept = rows.filter((row) => !visible.includes(row));
      if (table === "wiki_pages") mockServer.wikiPages = kept;
      else mockServer.sources = kept;
      return { data: null, error: null, count: countRequested ? visible.length : null };
    }
    // sources INSERT: 소유자 RLS · 기본키 · (user_id, content_hash) 고유 제약.
    if (body.user_id !== session) return mockRlsDenied();
    const id = typeof body.id === "string" ? body.id : `server-row-${mockServer.sources.length + 1}`;
    const clash = mockServer.sources.some(
      (row) => row.id === id || (row.user_id === body.user_id && row.content_hash === body.content_hash),
    );
    if (clash) return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
    const row = { ...body, id };
    mockServer.sources.push(row);
    return { data: [{ ...row }], error: null };
  };

  const send = (): Promise<MockResult> => mockSend(label(), signal, execute);
  const first = (result: MockResult): MockResult =>
    result.error ? result : { data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: null };

  const builder = {
    select: (list = "*") => {
      if (op === "select") columns = list;
      return builder;
    },
    insert: (row: Row) => {
      op = "insert";
      body = row;
      return builder;
    },
    update: (patch: Row) => {
      op = "update";
      body = patch;
      return builder;
    },
    delete: (options?: { count?: string }) => {
      op = "delete";
      countRequested = options?.count === "exact";
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    overlaps: (column: string, values: string[]) => {
      filters.push((row) => Array.isArray(row[column]) && (row[column] as string[]).some((v) => values.includes(v)));
      return builder;
    },
    limit: () => builder,
    abortSignal: (next: AbortSignal) => {
      signal = next;
      return builder;
    },
    single: () => send().then(first),
    maybeSingle: () => send().then(first),
    then: (resolve: (result: MockResult) => unknown, reject?: (reason: unknown) => unknown) => send().then(resolve, reject),
  };
  return builder;
}

const mockClient = {
  from: (table: string) => mockTable(table),
  storage: {
    from: () => ({
      // 원문 업로드. storage.ts 는 신호를 넘기지 않는다 - 끊을 수 없는 쓰기다.
      upload: (path: string, content: string, options?: { upsert?: boolean }) =>
        mockSend("upload", undefined, (session) => {
          if (!path.startsWith(`${session}/`)) {
            return { data: null, error: { statusCode: "403", message: "new row violates row-level security policy" } };
          }
          if (mockServer.objects.has(path) && options?.upsert !== true) {
            return { data: null, error: { statusCode: "409", message: "The resource already exists" } };
          }
          mockServer.objects.set(path, content);
          return { data: { path }, error: null };
        }),
      // 다른 계정 폴더의 객체는 보이지 않는다(없는 것과 같다).
      remove: (paths: string[]) =>
        mockSend("remove", undefined, (session) => {
          const removed = paths.filter((path) => path.startsWith(`${session}/`) && mockServer.objects.delete(path));
          if (removed.length === 0 && mockServer.missingRemove === "notFound") {
            return { data: null, error: { name: "StorageApiError", message: "Object not found", status: 404, statusCode: "404" } };
          }
          return { data: removed.map((name) => ({ name })), error: null };
        }),
    }),
  },
};

jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => mockClient }));

import {
  __resetAccountLocalDeletionFencesForTests,
  installAccountLocalDeletionFence,
} from "../../account/local-deletion-fence";
import {
  __resetAccountEpochForTests,
  beginAccountOwnerTransition,
  noteResolvedOwner,
  subscribeAccountTransition,
} from "../../auth/account-epoch";
import { readPrivacyPrefs, savePrivacyPref } from "../../supabase/privacy";
import { captureFromMarkdown } from "../../wiki/capture";
import {
  __resetAutosaveConsentForTests,
  autosaveConsentFor,
  beginAutosaveConsentRead,
  finishAutosaveConsentRead,
  subscribeAutosaveConsent,
} from "../autosave-consent";
import {
  __resetAutosaveRunnerForTests,
  autosaveTurnPhase,
  drainAutosaveUndoQueue,
  holdTurnForManualKeep,
  startAutosaveJob,
  subscribeAutosaveJobs,
  type AutosaveJobHandle,
  type AutosavePhase,
  type AutosaveTerminalPhase,
} from "../autosave-runner";
import { __resetAutosaveUndoQueueForTests, autosaveUndoStorageKey } from "../autosave-undo-queue";
import { CHAT_KEEP_TAG, composeExchangeBody, exchangeMarkdown, type KeepableTurn } from "../keep-exchange";

const OWNER = "owner-a";
const OTHER = "owner-b";

const localValues = new Map<string, string>();
beforeAll(() => {
  // jest 환경은 node 라서 웹 경로를 메모리 localStorage 로 고정한다. 대기 기록의 실제 바이트를 읽기 위해서다.
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => localValues.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localValues.set(key, String(value));
    },
    removeItem: (key: string) => {
      localValues.delete(key);
    },
    clear: () => localValues.clear(),
  };
});
afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

beforeEach(() => {
  __resetAccountEpochForTests();
  __resetAutosaveConsentForTests();
  __resetAutosaveRunnerForTests();
  __resetAutosaveUndoQueueForTests();
  __resetAccountLocalDeletionFencesForTests();
  localValues.clear();
  noteResolvedOwner(OWNER);
  mockServer.prefs = new Map([
    [OWNER, { chat_autosave: true }],
    [OTHER, { chat_autosave: true }],
  ]);
  mockServer.sources = [];
  mockServer.ingestLog = [];
  mockServer.wikiPages = [];
  mockServer.objects = new Map();
  mockServer.ledger = [];
  mockServer.session = OWNER;
  mockServer.arrived = [];
  mockServer.holds = new Map();
  mockServer.abortShape = "reject";
  mockServer.missingRemove = "empty";
  mockServer.networkFail = new Map();
  mockServer.loseResponse = new Map();
  mockServer.serverError = new Map();
});

// ── 도구 ──────────────────────────────────────────────────────────────────────────────

/** 다음 요청 하나를 붙잡는다. reached 는 그 요청이 서버에 닿으면 풀린다. */
function hold(label: Label): { reached: Promise<void>; release: () => void } {
  let reached = (): void => undefined;
  let open = (): void => undefined;
  const reachedPromise = new Promise<void>((done) => {
    reached = () => done();
  });
  const released = new Promise<void>((done) => {
    open = () => done();
  });
  const queue = mockServer.holds.get(label) ?? [];
  queue.push({ reached: () => reached(), released });
  mockServer.holds.set(label, queue);
  return { reached: reachedPromise, release: () => open() };
}

const count = (label: Label): number => mockServer.arrived.filter((request) => request.label === label).length;
const rawPath = (sourceId: string): string => `${OWNER}/chat-${sourceId}.md`;
const hasRow = (sourceId: string): boolean => mockServer.sources.some((row) => row.id === sourceId);
const hasRaw = (sourceId: string): boolean => mockServer.objects.has(rawPath(sourceId));

function queued(owner = OWNER): unknown {
  const raw = localValues.get(autosaveUndoStorageKey(owner));
  return raw === undefined ? [] : JSON.parse(raw);
}

/** 대화 화면이 하는 첫 읽기: 저장소가 서버의 켜짐을 알게 한다. 그때의 세대를 돌려준다(질문에 적힐 값). */
async function consentOn(): Promise<number> {
  const read = beginAutosaveConsentRead(OWNER);
  expect(finishAutosaveConsentRead(read, await readPrivacyPrefs(OWNER))).toBe(true);
  const consent = autosaveConsentFor(OWNER);
  expect(consent.value).toBe(true);
  return consent.generation;
}

interface Job {
  reply: KeepableTurn;
  handle: AutosaveJobHandle;
  phases: AutosavePhase[];
  leaveScreen: () => void;
  /** 작업이 끝났는가(기다리지 않고 본다). */
  done: boolean;
}

/** 화면이 하는 일: 답변 하나를 실행기에 넘기고 그 작업의 상태 알림을 듣는다. */
function start(n: number, askedGeneration: number): Job {
  const reply: KeepableTurn = { role: "secondb", text: `answer ${n}` };
  const phases: AutosavePhase[] = [];
  const leaveScreen = subscribeAutosaveJobs((update) => {
    if (update.reply === reply) phases.push(update.phase);
  });
  const rawMd = exchangeMarkdown(
    `question ${n}`,
    composeExchangeBody({ prompt: `question ${n}`, reply: reply.text, speaker: "SecondB" }, "en"),
  );
  const handle = startAutosaveJob({ ownerId: OWNER, reply, askedGeneration, rawMd });
  if (handle === null) throw new Error("작업이 시작되지 않았다");
  const job: Job = { reply, handle, phases, leaveScreen, done: false };
  void handle.settled.then(() => {
    job.done = true;
  });
  return job;
}

/**
 * 붙잡은 요청을 풀기 전에 본다. 보낸 쓰기(업로드 · INSERT)는 끊지 않으므로 풀릴 때까지 작업이 끝나지 않는다.
 * 보내기 전의 대기(동의 확인 · 후보 조회)는 취소되면 풀기 전에 끝난다. 마이크로태스크 몇 번이 아니라 이벤트 루프를
 * 여러 바퀴 돌린다 - 되돌리기까지 다 갈 만큼.
 */
async function expectWaiting(job: Job, waiting: boolean): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await new Promise<void>((done) => setImmediate(done));
  expect({ settledBeforeRelease: job.done }).toEqual({ settledBeforeRelease: !waiting });
}

const sentWrite = (wait: Wait): boolean => wait === "J3" || wait === "J4";

/** 같은 앱에서 끈다. intent: UPDATE 를 붙잡아 저장이 왕복 중인 채로 둔다. 돌려받은 함수로 저장을 끝낸다. */
async function turnOffInApp(mode: "intent" | "commit"): Promise<() => Promise<void>> {
  if (mode === "commit") {
    await savePrivacyPref(OWNER, "chat_autosave", false);
    return async () => undefined;
  }
  const update = hold("prefsUpdate");
  const saving = savePrivacyPref(OWNER, "chat_autosave", false);
  expect(autosaveConsentFor(OWNER).value).toBe(false); // 누른 순간 저장소는 꺼짐이다
  return async () => {
    update.release();
    await saving;
  };
}

async function turnOffAndOnInApp(): Promise<void> {
  await savePrivacyPref(OWNER, "chat_autosave", false);
  await savePrivacyPref(OWNER, "chat_autosave", true);
  expect(autosaveConsentFor(OWNER).value).toBe(true);
}

/** 계정 전환이 시작되는 순간만 만든다(hold). auth-js 는 이미 새 세션을 들고 있다. */
function switchAccount(to: string | null): void {
  mockServer.session = to;
  beginAccountOwnerTransition(to);
}

/** A 가 다시 공개되고 앱이 앞에 온 때. 대기 기록을 비운다. */
async function returnAndDrain(): Promise<void> {
  mockServer.session = OWNER;
  beginAccountOwnerTransition(OWNER);
  await drainAutosaveUndoQueue(OWNER);
}

type Expected = "0" | "U" | "R" | "K" | "Q";

async function expectOutcome(expected: Expected, job: Job, phase: AutosaveTerminalPhase): Promise<void> {
  const id = job.handle.sourceId;
  // 자동 저장의 INSERT 는 끊기지 않는다 - 요청에 신호를 싣지 않는다.
  expect(mockServer.arrived.filter((request) => request.label === "insert" && request.signal)).toEqual([]);
  const seen = () => ({ phase, upload: count("upload"), insert: count("insert"), row: hasRow(id), raw: hasRaw(id), queue: queued() });
  if (expected === "0") {
    expect(seen()).toEqual({ phase: "cancelled", upload: 0, insert: 0, row: false, raw: false, queue: [] });
  } else if (expected === "U") {
    expect(seen()).toEqual({ phase: "cancelled", upload: 1, insert: 0, row: false, raw: false, queue: [] });
  } else if (expected === "R") {
    expect(seen()).toEqual({ phase: "cancelled", upload: 1, insert: 1, row: false, raw: false, queue: [] });
  } else if (expected === "K") {
    expect({ phase, row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ phase: "kept", row: true, raw: true, queue: [] });
  } else {
    expect({ phase, queue: queued() }).toEqual({ phase: "undo_pending", queue: [{ ownerId: OWNER, sourceId: id }] });
    await returnAndDrain();
    expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
  }
}

type Wait = "J1" | "J2" | "J3" | "J4";
const WAITS: Record<Wait, { name: string; label: Label }> = {
  J1: { name: "J1 동의 확인 읽기", label: "prefsRead" },
  J2: { name: "J2 중복 후보 조회", label: "candidates" },
  J3: { name: "J3 원문 업로드 중", label: "upload" },
  J4: { name: "J4 행 INSERT 중", label: "insert" },
};

/** 작업 하나를 대기 지점 wait 에 세운다. */
async function atWait(wait: Wait): Promise<{ job: Job; generation: number; release: () => void }> {
  const generation = await consentOn();
  const gate = hold(WAITS[wait].label);
  const job = start(1, generation);
  await gate.reached;
  return { job, generation, release: gate.release };
}

const rows = (table: Record<Wait, Expected>) =>
  (Object.keys(table) as Wait[]).map((wait) => ({ wait, name: WAITS[wait].name, expected: table[wait] }));

// ── 3B 재현 ────────────────────────────────────────────────────────────────────────────

describe("3B 재현 (r3as3 R3AS3-H1 · A01)", () => {
  test("후보 조회를 기다리는 중 같은 앱에서 끄고 풀면 원문 업로드도 INSERT 도 나가지 않는다", async () => {
    // 같은 순서를 배송 keepExchange 본문 위에서 돌리면 업로드 1 · INSERT 1 이었다(착수 전 빨강, 결과 보고서에 기록).
    const { job, release } = await atWait("J2");
    await savePrivacyPref(OWNER, "chat_autosave", false);
    expect(mockServer.prefs.get(OWNER)).toEqual({ chat_autosave: false });
    release();
    await expectOutcome("0", job, await job.handle.settled);
  });
});

// ── §5-2 경쟁 순서 표 ───────────────────────────────────────────────────────────────────

describe("같은 앱 끄기 (의도 · 확정)", () => {
  const table = rows({ J1: "0", J2: "0", J3: "U", J4: "R" });
  for (const mode of ["intent", "commit"] as const) {
    test.each(table)(`$name × 같은 앱 끄기 (${mode === "intent" ? "의도: 저장 왕복 중" : "확정: 저장 끝"}) -> $expected`, async ({ wait, expected }) => {
      const { job, release } = await atWait(wait);
      const finishSave = await turnOffInApp(mode);
      await expectWaiting(job, sentWrite(wait));
      release();
      const phase = await job.handle.settled;
      await finishSave();
      await expectOutcome(expected, job, phase);
    });
  }

  test.each(["reject", "errorResult"] as const)("J2 × 같은 앱 끄기: 끊긴 조회가 %s 모양으로 와도 취소로 가른다 -> 0", async (shape) => {
    mockServer.abortShape = shape;
    const { job, release } = await atWait("J2");
    const finishSave = await turnOffInApp("intent");
    const phase = await job.handle.settled; // 붙잡힌 조회를 풀기 전에 끝난다
    release();
    await finishSave();
    await expectOutcome("0", job, phase);
  });
});

describe("끄고 다시 켬", () => {
  test.each(rows({ J1: "0", J2: "0", J3: "U", J4: "R" }))("$name × 끄고 다시 켬 -> $expected", async ({ wait, expected }) => {
    const { job, release } = await atWait(wait);
    await turnOffAndOnInApp();
    await expectWaiting(job, sentWrite(wait));
    release();
    await expectOutcome(expected, job, await job.handle.settled);
  });
});

describe("계정 전환 · 로그아웃 (전환 hold 가 시작되는 순간만 만든다 - noteResolvedOwner 를 부르지 않는다)", () => {
  const table = rows({ J1: "0", J2: "0", J3: "Q", J4: "K" });
  for (const [what, to] of [
    ["계정 전환", OTHER],
    ["로그아웃", null],
  ] as const) {
    test.each(table)(`$name × ${what} -> $expected`, async ({ wait, expected }) => {
      const { job, release } = await atWait(wait);
      switchAccount(to);
      await expectWaiting(job, sentWrite(wait));
      release();
      const phase = await job.handle.settled;
      await expectOutcome(expected, job, phase);
      if (expected === "K") {
        await returnAndDrain(); // 돌아와서 비워도 A 가 동의해 남긴 저장은 그대로다
        expect({ row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId) }).toEqual({ row: true, raw: true });
      }
    });
  }

  test("J4 × 계정 전환: 전환 알림을 먼저 받은 구독자가 동의 저장소를 비워도 전환으로 가른다 -> K", async () => {
    // 화면이 전환을 듣고 그 자리에서 동의 세대를 읽는 모양이다(useSyncExternalStore). 이 구독자가 작업보다 먼저
    // 불려 저장소가 비워지면, 작업은 동의 알림을 전환 알림보다 먼저 받는다. 철회로 읽으면 A 가 동의해 남긴 행을
    // 대기 기록에 올려 A 가 돌아왔을 때 지운다.
    const stopScreen = subscribeAccountTransition(() => {
      autosaveConsentFor(OWNER);
    });
    const { job, release } = await atWait("J4");
    switchAccount(OTHER);
    await expectWaiting(job, true);
    release();
    await expectOutcome("K", job, await job.handle.settled);
    await returnAndDrain();
    expect({ row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId) }).toEqual({ row: true, raw: true });
    stopScreen();
  });

  test.each(["reject", "errorResult"] as const)("J2 × 계정 전환: 끊긴 조회가 %s 모양으로 와도 쓰기 0", async (shape) => {
    mockServer.abortShape = shape;
    const { job, release } = await atWait("J2");
    switchAccount(OTHER);
    const phase = await job.handle.settled;
    release();
    await expectOutcome("0", job, phase);
  });
});

describe("새 대화 (D-1 ②: 취소 사유가 아니다)", () => {
  test.each(rows({ J1: "K", J2: "K", J3: "K", J4: "K" }))("$name × 새 대화 -> $expected", async ({ wait, expected }) => {
    const { job, generation, release } = await atWait(wait);
    // 화면이 목록을 비우고(앞 답변을 더 그리지 않는다), 새 대화의 첫 답변이 자기 작업을 시작한다. 실행기에는 새 대화를
    // 알리는 길이 없다 - 앞 작업은 아무것도 듣지 못한 채 끝까지 간다.
    const next = start(2, generation);
    expect(await next.handle.settled).toBe("kept");
    await expectWaiting(job, true);
    release();
    await expectOutcome(expected, job, await job.handle.settled);
    expect(hasRow(next.handle.sourceId)).toBe(true);
  });
});

describe("화면 이탈 · 앱 백그라운드 (구독만 풀린다 - 실행기에는 AppState 가 없다)", () => {
  test.each(rows({ J1: "K", J2: "K", J3: "K", J4: "K" }))("$name × 화면 이탈 -> $expected", async ({ wait, expected }) => {
    const { job, release } = await atWait(wait);
    const seenBeforeLeaving = job.phases.length;
    job.leaveScreen();
    await expectWaiting(job, true);
    release();
    await expectOutcome(expected, job, await job.handle.settled);
    expect(job.phases.length).toBe(seenBeforeLeaving); // 내려간 화면은 결과를 받지 않는다
  });
});

describe("다른 기기 끄기 (서버 몫 S2 - 담기 직전 확인이 꺼짐을 읽는 경우만)", () => {
  test("J1 동의 확인 읽기 × 다른 기기 끄기: 확인이 꺼짐을 읽으면 -> 0, 저장소도 꺼짐을 안다", async () => {
    const { job, release } = await atWait("J1");
    mockServer.prefs.set(OWNER, { chat_autosave: false }); // 이 앱은 모른다
    expect(autosaveConsentFor(OWNER).value).toBe(true);
    await expectWaiting(job, true);
    release();
    await expectOutcome("0", job, await job.handle.settled);
    expect(autosaveConsentFor(OWNER).value).toBe(false);
  });
});

describe("J5 되돌리기 삭제 중", () => {
  /** J4 에서 철회(의도)해 되돌리기가 원문 삭제를 보낸 채 붙잡혀 있는 자리. */
  async function atUndo(): Promise<{ job: Job; releaseRemove: () => void; finishSave: () => Promise<void> }> {
    const { job, release } = await atWait("J4");
    const remove = hold("remove");
    const finishSave = await turnOffInApp("intent");
    release();
    await remove.reached;
    expect(job.phases[job.phases.length - 1]).toBe("undoing");
    return { job, releaseRemove: remove.release, finishSave };
  }

  test("J5 × 같은 앱 끄기 (확정) -> 끝까지 (R)", async () => {
    const { job, releaseRemove, finishSave } = await atUndo();
    await finishSave();
    await expectWaiting(job, true);
    releaseRemove();
    await expectOutcome("R", job, await job.handle.settled);
  });

  test("J5 × 끄고 다시 켬 -> 끝까지 (R)", async () => {
    const { job, releaseRemove, finishSave } = await atUndo();
    await finishSave();
    await savePrivacyPref(OWNER, "chat_autosave", true);
    await expectWaiting(job, true);
    releaseRemove();
    await expectOutcome("R", job, await job.handle.settled);
  });

  test("J5 × 화면 이탈 -> 끝까지 (R)", async () => {
    const { job, releaseRemove, finishSave } = await atUndo();
    job.leaveScreen();
    await expectWaiting(job, true);
    releaseRemove();
    const phase = await job.handle.settled;
    await finishSave();
    await expectOutcome("R", job, phase);
  });

  test("J5 × 계정 전환 -> Q: B 세션에서는 지운 것처럼 보여도 기록을 남기고, A 가 돌아오면 마저 지운다", async () => {
    const { job, releaseRemove, finishSave } = await atUndo();
    switchAccount(OTHER);
    await expectWaiting(job, true);
    releaseRemove();
    const phase = await job.handle.settled;
    await finishSave();
    expect(hasRow(job.handle.sourceId)).toBe(true); // B 세션의 행 삭제는 A 의 행을 보지 못했다
    await expectOutcome("Q", job, phase);
  });
});

describe("끝난 뒤 (kept) - 무엇이 와도 되돌리지 않는다", () => {
  const events: { name: string; run: (job: Job, generation: number) => Promise<void> }[] = [
    {
      name: "같은 앱 끄기",
      run: async () => {
        await turnOffInApp("commit");
      },
    },
    { name: "끄고 다시 켬", run: () => turnOffAndOnInApp() },
    {
      name: "계정 전환",
      run: async () => {
        switchAccount(OTHER);
        await returnAndDrain();
      },
    },
    {
      name: "새 대화",
      run: async (_job, generation) => {
        expect(await start(2, generation).handle.settled).toBe("kept");
      },
    },
    {
      name: "화면 이탈",
      run: async (job) => {
        job.leaveScreen();
      },
    },
  ];
  test.each(events)("끝난 뒤 × $name -> K", async ({ run }) => {
    const generation = await consentOn();
    const job = start(1, generation);
    const phase = await job.handle.settled;
    await run(job, generation);
    await drainAutosaveUndoQueue(OWNER);
    await expectOutcome("K", job, phase);
  });
});

// ── 되돌리기 규칙 (설계 §2-7) ───────────────────────────────────────────────────────────

describe("손 담기와 겹칠 때 - 23505 는 이 작업의 행이 아니다", () => {
  async function handKeepLandsFirst(): Promise<{ job: Job; release: () => void; handRowId: string; handPath: string }> {
    const { job, release } = await atWait("J4");
    // 같은 짝을 다른 기기에서 손으로 먼저 담았다. 자동 작업의 INSERT 는 아직 서버에서 돌기 전이다.
    const hand = await captureFromMarkdown({
      userId: OWNER,
      rawMd: exchangeMarkdown("question 1", composeExchangeBody({ prompt: "question 1", reply: "answer 1", speaker: "SecondB" }, "en")),
      kindOverride: "self_knowledge",
      userTags: [CHAT_KEEP_TAG],
    });
    return { job, release, handRowId: hand.source.id, handPath: hand.storage_path };
  }

  test("철회와 겹치면: 손으로 담은 행과 그 원문은 두고, 이 작업이 올린 원문만 지운다", async () => {
    const { job, release, handRowId, handPath } = await handKeepLandsFirst();
    const finishSave = await turnOffInApp("intent");
    release();
    const phase = await job.handle.settled;
    await finishSave();
    expect({
      phase,
      handRow: mockServer.sources.map((row) => row.id),
      handRaw: mockServer.objects.has(handPath),
      jobRaw: hasRaw(job.handle.sourceId),
      queue: queued(),
    }).toEqual({ phase: "cancelled", handRow: [handRowId], handRaw: true, jobRaw: false, queue: [] });
  });

  test("철회가 없으면: 저장 실패로 끝나고, 손으로 담은 행은 두고, 이 작업이 올린 원문만 지운다", async () => {
    const { job, release, handRowId, handPath } = await handKeepLandsFirst();
    release();
    const phase = await job.handle.settled;
    expect({
      phase,
      rows: mockServer.sources.map((row) => row.id),
      handRaw: mockServer.objects.has(handPath),
      jobRaw: hasRaw(job.handle.sourceId),
      queue: queued(),
    }).toEqual({ phase: "failed", rows: [handRowId], handRaw: true, jobRaw: false, queue: [] });
  });
});

describe("INSERT 결과를 모를 때 - sourceId 로 행을 찾는다", () => {
  test("철회 뒤 INSERT 응답을 잃었는데 서버는 커밋했다 -> 행을 찾아 행째 지운다 (R)", async () => {
    mockServer.loseResponse.set("insert", 1);
    const { job, release } = await atWait("J4");
    const finishSave = await turnOffInApp("intent");
    release();
    const phase = await job.handle.settled;
    await finishSave();
    expect(count("rowCheck")).toBeGreaterThanOrEqual(1);
    await expectOutcome("R", job, phase);
  });

  test("취소가 아닌데 INSERT 가 서버에 닿지 못했다 -> 행이 없다고 확인하고 올린 원문만 지운다 (failed)", async () => {
    mockServer.networkFail.set("insert", 1);
    const generation = await consentOn();
    const job = start(1, generation);
    const phase = await job.handle.settled;
    expect({ phase, row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId), queue: queued() }).toEqual({
      phase: "failed",
      row: false,
      raw: false,
      queue: [],
    });
  });

  test("취소가 아닌데 INSERT 응답만 잃었다 -> 행이 있으면 동의된 저장이다 (kept, 지우지 않는다)", async () => {
    mockServer.loseResponse.set("insert", 1);
    const generation = await consentOn();
    const job = start(1, generation);
    const phase = await job.handle.settled;
    expect({ phase, row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId), queue: queued() }).toEqual({
      phase: "kept",
      row: true,
      raw: true,
      queue: [],
    });
  });
});

describe("원문 삭제의 모양 (없는 경로가 빈 목록인지 404 인지 미확인)", () => {
  test.each(["empty", "notFound"] as const)(
    "업로드가 실패한 채 철회되면 없는 원문을 지우러 가고, %s 모양이어도 지운 것으로 끝난다",
    async (shape) => {
      mockServer.missingRemove = shape;
      mockServer.serverError.set("upload", 1);
      const { job, release } = await atWait("J3");
      const finishSave = await turnOffInApp("intent");
      release();
      const phase = await job.handle.settled;
      await finishSave();
      expect({ phase, removes: count("remove"), insert: count("insert"), raw: hasRaw(job.handle.sourceId), queue: queued() }).toEqual({
        phase: "cancelled",
        removes: 1,
        insert: 0,
        raw: false,
        queue: [],
      });
    },
  );

  test("원문 삭제가 정말 실패하면 대기 기록을 남기고, 다음에 비울 때 마저 지운다 (Q)", async () => {
    const { job, release } = await atWait("J3");
    const finishSave = await turnOffInApp("intent");
    mockServer.serverError.set("remove", 1);
    release();
    const phase = await job.handle.settled;
    await finishSave();
    expect({ phase, raw: hasRaw(job.handle.sourceId), queue: queued() }).toEqual({
      phase: "undo_pending",
      raw: true,
      queue: [{ ownerId: OWNER, sourceId: job.handle.sourceId }],
    });
    await drainAutosaveUndoQueue(OWNER);
    expect({ raw: hasRaw(job.handle.sourceId), queue: queued() }).toEqual({ raw: false, queue: [] });
  });

  test("비우기는 한 런타임에서 한 건에 세 번까지만 시도한다", async () => {
    const { job, release } = await atWait("J3");
    const finishSave = await turnOffInApp("intent");
    mockServer.serverError.set("remove", 4);
    release();
    expect(await job.handle.settled).toBe("undo_pending");
    await finishSave();
    const before = count("rowCheck");
    for (let attempt = 0; attempt < 4; attempt += 1) await drainAutosaveUndoQueue(OWNER);
    expect(count("rowCheck") - before).toBe(3);
    expect(queued()).toEqual([{ ownerId: OWNER, sourceId: job.handle.sourceId }]);
  });
});

describe("대기 기록 - {ownerId, sourceId} 만, 계정별 키, 계정 삭제와 한 줄", () => {
  test("남기는 것은 두 id 뿐이다: 제목 · 본문 · 원문 경로가 기기에 없다", async () => {
    const { job, release } = await atWait("J3");
    switchAccount(OTHER);
    release();
    expect(await job.handle.settled).toBe("undo_pending");
    const raw = localValues.get(autosaveUndoStorageKey(OWNER));
    expect(JSON.parse(raw ?? "null")).toEqual([{ ownerId: OWNER, sourceId: job.handle.sourceId }]);
    expect(raw).not.toMatch(/answer 1|question 1|chat-|\.md|raw-clippings/);
    expect([...localValues.keys()].filter((key) => key.startsWith("chat.autosaveUndo"))).toEqual([
      `chat.autosaveUndo.v1.${OWNER}`,
    ]);
  });

  test("삭제 표식이 선 계정에는 적지 않는다", async () => {
    const { job, release } = await atWait("J3");
    await installAccountLocalDeletionFence(OWNER);
    switchAccount(OTHER);
    release();
    expect(await job.handle.settled).toBe("undo_pending");
    expect(localValues.has(autosaveUndoStorageKey(OWNER))).toBe(false);
  });
});

describe("시작 조건과 턴별 잠금", () => {
  test("같은 답변은 자동 작업과 손 담기가 함께 잡지 못하고, 다른 답변은 막히지 않는다", async () => {
    const { job, generation, release } = await atWait("J1");
    expect(autosaveTurnPhase(job.reply)).toBe("checking");
    expect(holdTurnForManualKeep(job.reply)).toBeNull();
    expect(startAutosaveJob({ ownerId: OWNER, reply: job.reply, askedGeneration: generation, rawMd: "again" })).toBeNull();

    // 한 답변을 담는 동안 다음 답변의 자동 저장은 막히지 않는다.
    const next = start(2, generation);
    expect(await next.handle.settled).toBe("kept");

    // 손 담기가 잠금을 쥔 답변에는 자동 작업이 시작하지 않는다.
    const manual: KeepableTurn = { role: "secondb", text: "answer 3" };
    const releaseManual = holdTurnForManualKeep(manual);
    expect(releaseManual).not.toBeNull();
    expect(startAutosaveJob({ ownerId: OWNER, reply: manual, askedGeneration: generation, rawMd: "x" })).toBeNull();
    releaseManual?.();
    const afterManual = startAutosaveJob({ ownerId: OWNER, reply: manual, askedGeneration: generation, rawMd: "answer three" });
    expect(await afterManual?.settled).toBe("kept");

    release();
    expect(await job.handle.settled).toBe("kept");
    expect(autosaveTurnPhase(job.reply)).toBe("kept");
    expect(startAutosaveJob({ ownerId: OWNER, reply: job.reply, askedGeneration: generation, rawMd: "again" })).toBeNull();
  });

  test("질문에 적힌 세대가 지금 세대가 아니면 · 모름이면 · 계정이 전환 중이면 시작하지 않는다", async () => {
    const generation = await consentOn();
    const reply: KeepableTurn = { role: "secondb", text: "answer 1" };
    expect(startAutosaveJob({ ownerId: OWNER, reply, askedGeneration: generation - 1, rawMd: "x" })).toBeNull();
    expect(startAutosaveJob({ ownerId: OTHER, reply, askedGeneration: generation, rawMd: "x" })).toBeNull();
    beginAccountOwnerTransition(OTHER);
    expect(startAutosaveJob({ ownerId: OWNER, reply, askedGeneration: generation, rawMd: "x" })).toBeNull();
    expect(mockServer.arrived).toEqual([{ label: "prefsRead", session: OWNER, signal: false }]);
  });

  test("담기 직전 확인을 못 읽으면 쓰지 않고 조용히 끝나며, 같은 답변은 다시 자격을 얻는다", async () => {
    const generation = await consentOn();
    mockServer.serverError.set("prefsRead", 1);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = start(1, generation);
    expect(await first.handle.settled).toBe("cancelled");
    warn.mockRestore();
    expect({ upload: count("upload"), insert: count("insert"), phase: autosaveTurnPhase(first.reply) }).toEqual({
      upload: 0,
      insert: 0,
      phase: null,
    });
    const retry = startAutosaveJob({ ownerId: OWNER, reply: first.reply, askedGeneration: generation, rawMd: "answer one" });
    expect(await retry?.settled).toBe("kept");
  });
});

describe("동의 저장소 구독 (subscribeAutosaveConsent)", () => {
  test("값이나 세대가 바뀔 때만 부르고, 같은 값 재관측과 버린 읽기에는 조용하다", async () => {
    autosaveConsentFor(OWNER); // 재설정 뒤 첫 대조를 먼저 끝낸다
    const seen: (boolean | null)[] = [];
    const stop = subscribeAutosaveConsent(() => seen.push(autosaveConsentFor(OWNER).value));

    await consentOn(); // 모름 -> 켜짐
    const stale = beginAutosaveConsentRead(OWNER);
    const staleResult = await readPrivacyPrefs(OWNER);
    await consentOn(); // 켜짐 -> 켜짐 (나중에 나간 읽기가 먼저 반영된다)
    expect(finishAutosaveConsentRead(stale, staleResult)).toBe(false); // 먼저 나간 읽기는 버린다
    await savePrivacyPref(OWNER, "chat_autosave", false); // 의도에서 켜짐 -> 꺼짐, 확정은 같은 값
    expect(seen).toEqual([true, false]);

    beginAccountOwnerTransition(OTHER);
    autosaveConsentFor(OWNER); // 다음 대조에서 비운다
    expect(seen).toEqual([true, false, null]);

    stop();
    beginAccountOwnerTransition(OWNER);
    autosaveConsentFor(OWNER);
    expect(seen).toHaveLength(3);
  });

  test("한 구독자가 던져도 다른 구독자는 같은 변화를 받는다", async () => {
    autosaveConsentFor(OWNER);
    const stopBroken = subscribeAutosaveConsent(() => {
      throw new Error("broken listener");
    });
    let calls = 0;
    const stop = subscribeAutosaveConsent(() => {
      calls += 1;
    });
    await consentOn();
    expect(calls).toBe(1);
    stopBroken();
    stop();
  });
});
