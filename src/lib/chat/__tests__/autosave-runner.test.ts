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
  /** 서버에서는 바로 실행되고 응답만 붙잡히는 요청(holdAnswer). 그 사이 다른 요청이 서버 상태를 바꿀 수 있다. */
  answers: new Map<Label, MockHold[]>(),
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
  const answer = mockServer.answers.get(label)?.shift();
  gate?.reached();
  // 서버 쪽 실행. 붙잡혀 있으면 풀릴 때 실행된다. 클라이언트가 끊겨도 이 실행은 일어난다.
  const executed = (gate ? gate.released : Promise.resolve()).then((): MockResult => {
    if (failed) return { data: null, error: { message: "internal error", code: "XX000", status: 500, statusCode: "500" } };
    const result = execute(session);
    return lose ? mockNetworkError(label) : result;
  });
  // 응답만 늦는 요청: 서버는 이미 실행했고 클라이언트는 풀릴 때 받는다.
  const server = answer
    ? executed.then((result) => {
        answer.reached();
        return answer.released.then(() => result);
      })
    : executed;
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
    // 승격이 보류 행을 찾는 조회(listStoragePendingSources)가 쓴다.
    contains: (column: string, value: Row) => {
      filters.push((row) => Object.entries(value).every(([key, expected]) => (row[column] as Row | undefined)?.[key] === expected));
      return builder;
    },
    order: () => builder,
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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { captureFromMarkdown, type CaptureJournal } from "../../wiki/capture";
import { deleteCapturedSource } from "../../wiki/delete-captured-source";
import * as capturedSourceModule from "../../wiki/delete-captured-source";
import { promotePendingUploads } from "../../wiki/promote-pending";
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
  runManualKeep,
  startAutosaveJob,
  subscribeAutosaveJobs,
  type AutosaveJobHandle,
  type AutosavePhase,
  type AutosaveTerminalPhase,
} from "../autosave-runner";
import * as runnerModule from "../autosave-runner";
import { __resetAutosaveUndoQueueForTests, autosaveUndoStorageKey, rememberAutosaveUndo } from "../autosave-undo-queue";
import * as undoQueueModule from "../autosave-undo-queue";
import { CHAT_KEEP_TAG, composeExchangeBody, exchangeMarkdown, type KeepableTurn } from "../keep-exchange";

/** 계정 줄의 일 하나가 줄을 쥘 수 있는 시간(실행기의 이름 있는 상수). 없으면 undefined - 그 경우 상한 테스트가 먼저 빨갛다. */
const LANE_TIMEOUT_MS = (runnerModule as { OWNER_LANE_TASK_TIMEOUT_MS?: number }).OWNER_LANE_TASK_TIMEOUT_MS;

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
  // 행 표식(지우는 중 · 지운 행 · 되살리는 중)도 테스트마다 비운다 - 목의 행 id(server-row-N)는 테스트마다 다시 쓰인다.
  (capturedSourceModule as { __resetCapturedSourceRowsForTests?: () => void }).__resetCapturedSourceRowsForTests?.();
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
  mockServer.answers = new Map();
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

/** 다음 요청 하나는 서버에서 바로 실행되고 응답만 붙잡힌다. reached 는 서버가 실행을 마치면 풀린다. */
function holdAnswer(label: Label): { reached: Promise<void>; release: () => void } {
  let reached = (): void => undefined;
  let open = (): void => undefined;
  const reachedPromise = new Promise<void>((done) => {
    reached = () => done();
  });
  const released = new Promise<void>((done) => {
    open = () => done();
  });
  const queue = mockServer.answers.get(label) ?? [];
  queue.push({ reached: () => reached(), released });
  mockServer.answers.set(label, queue);
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

describe("지우기와 손 담기는 계정마다 한 줄에 선다 (게이트 r260919 DA-1814-1 · DZ-1814-3)", () => {
  // 턴별 잠금은 답변 객체로 잡고 되돌리기는 sourceId 로 움직여서, 둘은 서로를 보지 못했다. 비우기가 행을 확인한 뒤 지우기
  // 전에 사용자가 같은 짝을 손으로 담으면(정확 중복) 손 담기가 기록에서 그 행을 빼고 담김을 띄운 뒤, 이미 행을 쥔 비우기가
  // 그 행과 원문을 지웠다. 이 묶음은 순서마다 "손 담기가 담겼다고 돌려준 대화는 남는다" 를 본다.
  const handKeep = (): ReturnType<typeof runManualKeep> =>
    runManualKeep(OWNER, () =>
      captureFromMarkdown({
        userId: OWNER,
        rawMd: exchangeMarkdown("question 1", composeExchangeBody({ prompt: "question 1", reply: "answer 1", speaker: "SecondB" }, "en")),
        kindOverride: "self_knowledge",
        userTags: [CHAT_KEEP_TAG],
      }),
    );

  /** 이벤트 루프를 여러 바퀴 돌린다 - 줄에서 기다리는 쪽이 정말 기다리는지 볼 만큼. */
  const spin = async (): Promise<void> => {
    for (let turn = 0; turn < 20; turn += 1) await new Promise<void>((done) => setImmediate(done));
  };

  /** 철회된 작업의 되돌리기가 원문 삭제에서 한 번 실패해 대기 기록에 남은 자리(undo_pending). 행과 원문은 서버에 있다. */
  async function pendingUndo(): Promise<Job> {
    const { job, release } = await atWait("J4");
    await savePrivacyPref(OWNER, "chat_autosave", false);
    mockServer.serverError.set("remove", 1);
    release();
    expect(await job.handle.settled).toBe("undo_pending");
    expect({ row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId), queue: queued() }).toEqual({
      row: true,
      raw: true,
      queue: [{ ownerId: OWNER, sourceId: job.handle.sourceId }],
    });
    return job;
  }

  test("비우기가 행을 확인한 뒤 손으로 담으면: 손 담기는 줄을 서고, 비우기가 다 지운 뒤 새 행으로 담는다", async () => {
    const job = await pendingUndo();
    const probe = hold("rowCheck");
    const draining = drainAutosaveUndoQueue(OWNER);
    await probe.reached;
    const candidatesBefore = count("candidates");
    const keeping = handKeep();
    await spin();
    expect(count("candidates")).toBe(candidatesBefore); // 줄에서 기다린다 - capture 가 아직 나가지 않았다
    probe.release();
    await draining;
    const kept = await keeping;
    expect({
      deduped: kept.deduped,
      oldRow: hasRow(job.handle.sourceId),
      oldRaw: hasRaw(job.handle.sourceId),
      rows: mockServer.sources.map((row) => row.id),
      newRaw: mockServer.objects.has(kept.storage_path),
      queue: queued(),
    }).toEqual({ deduped: null, oldRow: false, oldRaw: false, rows: [kept.source.id], newRaw: true, queue: [] });
  });

  test("손 담기가 먼저 줄에 서 있으면: 비우기는 그 뒤에 와서 손으로 남긴 행을 지우지 않는다", async () => {
    const job = await pendingUndo();
    const candidates = hold("candidates");
    const keeping = handKeep();
    await candidates.reached;
    const before = { rowCheck: count("rowCheck"), remove: count("remove"), rowDelete: count("rowDelete") };
    const draining = drainAutosaveUndoQueue(OWNER);
    await spin();
    expect({ rowCheck: count("rowCheck"), remove: count("remove"), rowDelete: count("rowDelete") }).toEqual(before);
    candidates.release();
    const kept = await keeping;
    await draining;
    expect({
      deduped: kept.deduped,
      id: kept.source.id,
      row: hasRow(job.handle.sourceId),
      raw: hasRaw(job.handle.sourceId),
      queue: queued(),
      deletes: count("remove") - before.remove + count("rowDelete") - before.rowDelete,
    }).toEqual({ deduped: "exact_duplicate", id: job.handle.sourceId, row: true, raw: true, queue: [], deletes: 0 });
  });

  test("손 담기가 먼저 돌려받은 행은, 그 뒤 줄에 선 작업의 되돌리기도 지우지 않는다 (손 담기가 이긴다)", async () => {
    // 같은 짝을 다른 답변 객체로 손 담기한다(새 대화 뒤 같은 질문에 같은 답). 자동 작업은 INSERT 를 보낸 채 철회됐다.
    const generation = await consentOn();
    const insert = hold("insert");
    const job = start(1, generation);
    await insert.reached;
    const finishSave = await turnOffInApp("intent");
    const candidates = hold("candidates");
    const keeping = handKeep();
    await candidates.reached; // 손 담기가 줄을 쥐었다
    insert.release(); // 작업의 행이 커밋되고, 작업은 기록을 적은 뒤 되돌리기 줄에서 기다린다
    await spin();
    expect({ done: job.done, queue: queued() }).toEqual({ done: false, queue: [{ ownerId: OWNER, sourceId: job.handle.sourceId }] });
    candidates.release(); // 손 담기의 후보 조회가 커밋된 작업의 행을 본다 -> 정확 중복
    const kept = await keeping;
    const phase = await job.handle.settled;
    await finishSave();
    expect({
      deduped: kept.deduped,
      id: kept.source.id,
      phase,
      row: hasRow(job.handle.sourceId),
      raw: hasRaw(job.handle.sourceId),
      queue: queued(),
    }).toEqual({ deduped: "exact_duplicate", id: job.handle.sourceId, phase: "cancelled", row: true, raw: true, queue: [] });
  });

  test("줄을 기다리는 사이 계정이 바뀌면 손 담기는 capture 를 보내지 않고 실패로 끝난다 (설계 2-10: 계정 전환으로만 끊긴다)", async () => {
    // 줄이 만든 새 대기 창이다. 누른 순간과 capture 사이에 계정이 바뀌면, 늦게 도는 capture 가 다른 계정의 세션으로
    // 나간다(RLS 가 쓰기를 막지만 요청 자체를 보내지 않는다).
    const job = await pendingUndo();
    const probe = hold("rowCheck");
    const draining = drainAutosaveUndoQueue(OWNER);
    await probe.reached;
    const before = { candidates: count("candidates"), upload: count("upload"), insert: count("insert") };
    const keeping = handKeep();
    const kept = keeping.then(
      () => "kept",
      (error: Error) => error.message,
    );
    switchAccount(OTHER);
    probe.release();
    await draining;
    expect(await kept).toBe("autosave-owner-not-current");
    expect({ candidates: count("candidates"), upload: count("upload"), insert: count("insert") }).toEqual(before);
    expect({ row: hasRow(job.handle.sourceId), queue: queued() }).toEqual({
      row: true,
      queue: [{ ownerId: OWNER, sourceId: job.handle.sourceId }],
    });
  });

  test("대기 기록에서 빼지 못하면 담겼다고 돌려주지 않는다(던진다) - 그래도 이 런타임의 비우기는 그 행을 지우지 않는다", async () => {
    const job = await pendingUndo();
    const store = globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void; removeItem: (k: string) => void };
    const { setItem, removeItem } = store;
    const refuse = (): never => {
      throw new Error("QuotaExceededError");
    };
    store.setItem = refuse;
    store.removeItem = refuse;
    try {
      await expect(handKeep()).rejects.toThrow("autosave-undo-not-forgotten");
    } finally {
      store.setItem = setItem;
      store.removeItem = removeItem;
    }
    expect(queued()).toEqual([{ ownerId: OWNER, sourceId: job.handle.sourceId }]); // 기록은 그대로 남았다
    await drainAutosaveUndoQueue(OWNER);
    expect({ row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId), queue: queued() }).toEqual({
      row: true,
      raw: true,
      queue: [],
    });
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

describe("복구 조회 중 끼어드는 일 (게이트 r260919 DZ-1814-1)", () => {
  // INSERT 응답을 잃어 sourceId 로 행을 찾는(복구 조회) 동안은 아직 쓰는 중이다. 그 사이 온 철회는 보낸 쓰기를 되돌려야
  // 한다 - 조회가 돌아온 뒤 취소를 다시 보지 않고 "커밋됐으니 담김" 으로 끝내면 철회를 잃고 대기 기록도 남지 않는다.
  async function atRecoveryProbe(): Promise<{ job: Job; release: () => void }> {
    mockServer.loseResponse.set("insert", 1);
    const generation = await consentOn();
    const probe = hold("rowCheck");
    const job = start(1, generation);
    await probe.reached;
    expect(hasRow(job.handle.sourceId)).toBe(true); // 서버에는 커밋됐다
    return { job, release: probe.release };
  }

  const interruptions: { name: string; run: () => Promise<() => Promise<void>> }[] = [
    { name: "같은 앱 끄기 (의도: 저장 왕복 중)", run: () => turnOffInApp("intent") },
    { name: "같은 앱 끄기 (확정: 저장 끝)", run: () => turnOffInApp("commit") },
    {
      name: "끄고 다시 켬",
      run: async () => {
        await turnOffAndOnInApp();
        return async () => undefined;
      },
    },
  ];
  test.each(interruptions)("복구 조회 중 $name -> R: 커밋된 행과 원문을 지운다", async ({ run }) => {
    const { job, release } = await atRecoveryProbe();
    const finishSave = await run();
    release();
    const phase = await job.handle.settled;
    await finishSave();
    await expectOutcome("R", job, phase);
  });

  test("복구 조회가 실패한 채 철회되면 되돌리기가 다시 찾아 지운다 -> R", async () => {
    mockServer.serverError.set("rowCheck", 1); // 붙잡힌 복구 조회가 서버 오류로 돌아온다
    const { job, release } = await atRecoveryProbe();
    const finishSave = await turnOffInApp("intent");
    release();
    const phase = await job.handle.settled;
    await finishSave();
    expect(count("rowCheck")).toBe(2);
    await expectOutcome("R", job, phase);
  });

  test("복구 조회 중 계정 전환 -> K: 전환은 철회가 아니다 (보낸 계정의 동의된 저장)", async () => {
    const { job, release } = await atRecoveryProbe();
    switchAccount(OTHER);
    release();
    await expectOutcome("K", job, await job.handle.settled);
    await returnAndDrain();
    expect({ row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId) }).toEqual({ row: true, raw: true });
  });
});

describe("기기 기록을 못 남길 때 (게이트 r260919 DA-1814-2 · DZ-1814-2)", () => {
  // 되돌리기는 지우기 전에 {ownerId, sourceId} 를 기기에 적는다. 그 쓰기가 실패하면(웹 quota · 네이티브 거부) 조용한
  // undo_pending 은 거짓이다 - 다시 지울 단서가 기기에 없다. 지우기는 계속하고, 못 지우면 기록을 한 번 더 적어 보고,
  // 그래도 못 적으면 이 런타임이 쥐고 사용자에게 보이는 상태(undo_unrecorded)로 끝낸다.
  const storage = (): { setItem: (key: string, value: string) => void; removeItem: (key: string) => void } =>
    globalThis.localStorage as unknown as { setItem: (key: string, value: string) => void; removeItem: (key: string) => void };
  const restorers: (() => void)[] = [];
  afterEach(() => {
    for (const restore of restorers.splice(0).reverse()) restore();
  });

  /** 기기 기록 쓰기를 times 번 실패시킨다(웹 quota 모양). 돌려받은 함수로 되살린다(테스트가 끝나면 저절로 되살린다). */
  function breakDeviceWrites(times = Number.POSITIVE_INFINITY): () => void {
    const store = storage();
    const { setItem, removeItem } = store;
    let left = times;
    const fail = (): void => {
      left -= 1;
      throw new Error("QuotaExceededError");
    };
    store.setItem = (key, value) => (left > 0 ? fail() : setItem(key, value));
    store.removeItem = (key) => (left > 0 ? fail() : removeItem(key));
    const restore = (): void => {
      store.setItem = setItem;
      store.removeItem = removeItem;
    };
    restorers.push(restore);
    return restore;
  }

  /** J4 에서 철회해 되돌리기가 원문 삭제에서 실패하는 자리까지 간다. */
  async function withdrawAndFailDelete(writes: number): Promise<{ job: Job; phase: AutosaveTerminalPhase; restore: () => void }> {
    const { job, release } = await atWait("J4");
    await savePrivacyPref(OWNER, "chat_autosave", false);
    const restore = breakDeviceWrites(writes);
    mockServer.serverError.set("remove", 1);
    release();
    return { job, phase: await job.handle.settled, restore };
  }

  test("기록을 못 남겨도 지우기는 한다: 다 지웠으면 cancelled", async () => {
    const { job, release } = await atWait("J4");
    await savePrivacyPref(OWNER, "chat_autosave", false);
    const restore = breakDeviceWrites();
    release();
    const phase = await job.handle.settled;
    restore();
    await expectOutcome("R", job, phase);
  });

  test("지우기가 실패해도 기록을 다시 적었으면 undo_pending: 기기에 남는다", async () => {
    const { job, phase, restore } = await withdrawAndFailDelete(1);
    restore();
    await expectOutcome("Q", job, phase);
  });

  test("기록도 지우기도 실패하면 undo_unrecorded 로 끝나고, 저장소와 연결이 돌아오면 같은 런타임의 비우기가 마저 지운다", async () => {
    const { job, phase, restore } = await withdrawAndFailDelete(Number.POSITIVE_INFINITY);
    const id = job.handle.sourceId;
    expect({ phase, row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({
      phase: "undo_unrecorded",
      row: true,
      raw: true,
      queue: [],
    });
    restore();
    await drainAutosaveUndoQueue(OWNER);
    expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
    // 다 지운 것을 그 답변에 알린다 - 화면은 "아직 삭제하지 못했다" 는 안내를 거둔다.
    expect(job.phases[job.phases.length - 1]).toBe("cancelled");
  });

  test("저장소만 돌아오면 비우기가 기록부터 남긴다: 앱을 다시 시작해도 그 계정의 비우기가 마저 지운다", async () => {
    const { job, phase, restore } = await withdrawAndFailDelete(Number.POSITIVE_INFINITY);
    const id = job.handle.sourceId;
    expect(phase).toBe("undo_unrecorded");
    restore();
    mockServer.serverError.set("remove", 1); // 연결은 아직이다
    await drainAutosaveUndoQueue(OWNER);
    expect({ row: hasRow(id), queue: queued() }).toEqual({ row: true, queue: [{ ownerId: OWNER, sourceId: id }] });
    __resetAutosaveRunnerForTests(); // 앱 재시작: 이 런타임이 쥐던 것은 사라지고 기기 기록만 남는다
    await drainAutosaveUndoQueue(OWNER);
    expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
  });

  test("기기에 못 남긴 되돌리기는 돌아올 때마다 다시 지워 본다 - 안내가 약속한 것이라 횟수 상한을 두지 않는다", async () => {
    const { job, phase } = await withdrawAndFailDelete(Number.POSITIVE_INFINITY);
    expect(phase).toBe("undo_unrecorded");
    mockServer.serverError.set("remove", 4);
    for (let attempt = 0; attempt < 4; attempt += 1) await drainAutosaveUndoQueue(OWNER);
    expect(hasRow(job.handle.sourceId)).toBe(true);
    await drainAutosaveUndoQueue(OWNER);
    expect({ row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId) }).toEqual({ row: false, raw: false });
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
    // 기록이 없는데 undo_pending 이라고 답하지 않는다(게이트 r260919 DA-1814-2) - 여기서는 적을 수 없는 이유가 계정 삭제다.
    // 이 런타임이 쥐고 있다가 그 계정이 다시 공개될 때만 비우기가 돈다. 계정 삭제가 끝나면 원문은 그쪽이 지운다.
    expect(await job.handle.settled).toBe("undo_unrecorded");
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

describe("재게이트 잔여 (게이트 r260919 재게이트 GA-1814-1~3 · GZ-1814-1~5)", () => {
  // 재게이트 두 레인이 남긴 재현 순서를 그대로 옮긴다. 기대값은 "담김이라고 말한 것은 남는다 · 철회한 것은 지워진다 ·
  // 기기에 남았다고 말한 것은 정말 남아 있다 · 멈춘 일 하나가 같은 계정의 다른 일을 영영 붙잡지 않는다" 다.
  const spin = async (): Promise<void> => {
    for (let turn = 0; turn < 20; turn += 1) await new Promise<void>((done) => setImmediate(done));
  };
  const exchange = (n: number): string =>
    exchangeMarkdown(`question ${n}`, composeExchangeBody({ prompt: `question ${n}`, reply: `answer ${n}`, speaker: "SecondB" }, "en"));
  const handKeep = (n: number): ReturnType<typeof runManualKeep> =>
    runManualKeep(OWNER, () =>
      captureFromMarkdown({ userId: OWNER, rawMd: exchange(n), kindOverride: "self_knowledge", userTags: [CHAT_KEEP_TAG] }),
    );
  const fakeTimers = (): void => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
  };
  afterEach(() => {
    jest.useRealTimers();
  });

  /** 철회된 작업(짝 1)의 되돌리기가 원문 삭제에서 한 번 실패해 대기 기록에 남은 자리(undo_pending). 행과 원문은 서버에 있다. */
  async function pendingUndo(): Promise<Job> {
    const { job, release } = await atWait("J4");
    await savePrivacyPref(OWNER, "chat_autosave", false);
    mockServer.serverError.set("remove", 1);
    release();
    expect(await job.handle.settled).toBe("undo_pending");
    expect({ row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId), queue: queued() }).toEqual({
      row: true,
      raw: true,
      queue: [{ ownerId: OWNER, sourceId: job.handle.sourceId }],
    });
    return job;
  }

  describe("GA-1814-1 · GZ-1814-3: 자동 저장이 대기 삭제 중인 행을 정확 중복으로 돌려받을 때", () => {
    test("비우기가 행을 확인하는 동안 같은 짝이 다시 자동 저장되면, 비우기가 다 지운 뒤 새 행으로 담긴다 - 담김 뒤에 지워지지 않는다", async () => {
      const old = await pendingUndo();
      await savePrivacyPref(OWNER, "chat_autosave", true); // 다시 켠다 - 새 세대
      const probe = hold("rowCheck");
      const draining = drainAutosaveUndoQueue(OWNER);
      await probe.reached;
      const repeat = start(1, autosaveConsentFor(OWNER).generation);
      await spin();
      probe.release();
      await draining;
      const phase = await repeat.handle.settled;
      expect({
        phase,
        oldRow: hasRow(old.handle.sourceId),
        oldRaw: hasRaw(old.handle.sourceId),
        row: hasRow(repeat.handle.sourceId),
        raw: hasRaw(repeat.handle.sourceId),
        queue: queued(),
      }).toEqual({ phase: "kept", oldRow: false, oldRaw: false, row: true, raw: true, queue: [] });
    });

    test("대기 기록에 남은 행과 같은 짝이 다시 자동 저장되면, 그 행을 먼저 지우고(옛 철회를 무르지 않는다) 새 행으로 담는다", async () => {
      const old = await pendingUndo();
      await savePrivacyPref(OWNER, "chat_autosave", true);
      const repeat = start(1, autosaveConsentFor(OWNER).generation);
      const phase = await repeat.handle.settled;
      expect({
        phase,
        oldRow: hasRow(old.handle.sourceId),
        oldRaw: hasRaw(old.handle.sourceId),
        row: hasRow(repeat.handle.sourceId),
        raw: hasRaw(repeat.handle.sourceId),
        queue: queued(),
      }).toEqual({ phase: "kept", oldRow: false, oldRaw: false, row: true, raw: true, queue: [] });
    });

    test("철회로 끊겼는데 아직 되돌리기 전인 작업의 행과 같은 짝이 자동 저장되어도, 그 행이 담김 뒤에 지워지지 않는다", async () => {
      mockServer.loseResponse.set("insert", 1);
      const generation = await consentOn();
      const probe = hold("rowCheck");
      const doomed = start(1, generation);
      await probe.reached; // INSERT 는 커밋됐고 응답만 잃어 복구 조회 중이다
      await savePrivacyPref(OWNER, "chat_autosave", false); // 철회 - 작업이 끊긴다. 되돌리기는 조회가 돌아온 뒤다
      await savePrivacyPref(OWNER, "chat_autosave", true);
      const repeat = start(1, autosaveConsentFor(OWNER).generation);
      const phase = await repeat.handle.settled;
      probe.release();
      const doomedPhase = await doomed.handle.settled;
      expect({
        phase,
        doomedPhase,
        doomedRow: hasRow(doomed.handle.sourceId),
        row: hasRow(repeat.handle.sourceId),
        raw: hasRaw(repeat.handle.sourceId),
        queue: queued(),
      }).toEqual({ phase: "kept", doomedPhase: "cancelled", doomedRow: false, row: true, raw: true, queue: [] });
    });
  });

  describe("GZ-1814-2: 부분 삭제 뒤 손 담기", () => {
    test("비우기가 원문만 지우고 행 삭제에서 멈춘 뒤 같은 짝을 손으로 담으면, 본문을 되살린 뒤에만 담김이다", async () => {
      const old = await pendingUndo();
      const body = mockServer.objects.get(rawPath(old.handle.sourceId));
      expect(typeof body).toBe("string");
      const probe = hold("rowCheck");
      const draining = drainAutosaveUndoQueue(OWNER);
      await probe.reached;
      const keeping = handKeep(1);
      mockServer.serverError.set("rowDelete", 1);
      probe.release();
      await draining;
      const kept = await keeping;
      expect({
        deduped: kept.deduped,
        id: kept.source.id,
        row: hasRow(old.handle.sourceId),
        body: mockServer.objects.get(rawPath(old.handle.sourceId)),
        queue: queued(),
      }).toEqual({ deduped: "exact_duplicate", id: old.handle.sourceId, row: true, body, queue: [] });
      await drainAutosaveUndoQueue(OWNER); // 다음 비우기도 손으로 남긴 행을 지우지 않는다
      expect({ row: hasRow(old.handle.sourceId), raw: hasRaw(old.handle.sourceId) }).toEqual({ row: true, raw: true });
    });

    test("본문을 되살리지 못하면 담김이 아니다(던진다) - 대기 기록은 남고 다음 비우기가 마저 지운다", async () => {
      const old = await pendingUndo();
      const probe = hold("rowCheck");
      const draining = drainAutosaveUndoQueue(OWNER);
      await probe.reached;
      const outcome = handKeep(1).then(
        () => "kept",
        (error: Error) => error.message,
      );
      mockServer.serverError.set("rowDelete", 1);
      mockServer.serverError.set("upload", 1); // 되살리는 업로드가 실패한다
      probe.release();
      await draining;
      expect(await outcome).toBe("autosave-body-not-restored");
      expect({ row: hasRow(old.handle.sourceId), raw: hasRaw(old.handle.sourceId), queue: queued() }).toEqual({
        row: true,
        raw: false,
        queue: [{ ownerId: OWNER, sourceId: old.handle.sourceId }],
      });
      await drainAutosaveUndoQueue(OWNER);
      expect({ row: hasRow(old.handle.sourceId), raw: hasRaw(old.handle.sourceId), queue: queued() }).toEqual({
        row: false,
        raw: false,
        queue: [],
      });
    });
  });

  describe("GZ-1814-1: 저장소 접근자가 거부될 때", () => {
    test("메모리에만 쓴 것을 기기 기록으로 치지 않는다 - undo_unrecorded 로 알리고, 저장소가 돌아오면 비우기가 기록부터 남기고 지운다", async () => {
      const { job, release } = await atWait("J4");
      await savePrivacyPref(OWNER, "chat_autosave", false);
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get() {
          throw new Error("SecurityError");
        },
      });
      mockServer.serverError.set("remove", 1);
      let phase: AutosaveTerminalPhase;
      try {
        release();
        phase = await job.handle.settled;
      } finally {
        if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
      }
      expect({ phase, queue: queued() }).toEqual({ phase: "undo_unrecorded", queue: [] });
      await drainAutosaveUndoQueue(OWNER);
      expect({
        row: hasRow(job.handle.sourceId),
        raw: hasRaw(job.handle.sourceId),
        queue: queued(),
        last: job.phases[job.phases.length - 1],
      }).toEqual({ row: false, raw: false, queue: [], last: "cancelled" });
    });
  });

  describe("GZ-1814-4: 줄에서 기다리는 손 담기와 계정 전환", () => {
    test("줄에서 기다리는 사이 A -> B -> A 로 돌아와도, 누른 순간의 계정 임대가 아니면 capture 를 보내지 않는다", async () => {
      await pendingUndo();
      const probe = hold("rowCheck");
      const draining = drainAutosaveUndoQueue(OWNER);
      await probe.reached;
      let captures = 0;
      const outcome = runManualKeep(OWNER, () => {
        captures += 1;
        return captureFromMarkdown({ userId: OWNER, rawMd: exchange(2) });
      }).then(
        () => "kept",
        (error: Error) => error.message,
      );
      switchAccount(OTHER);
      switchAccount(OWNER);
      probe.release();
      await draining;
      expect({ outcome: await outcome, captures }).toEqual({ outcome: "autosave-owner-not-current", captures: 0 });
    });
  });

  describe("GA-1814-3: 계정 줄의 시간 상한", () => {
    test("줄의 일 하나가 끝나지 않아도 시간 상한이 지나면 같은 계정의 손 담기가 진행한다 - 늦게 돌아온 일은 더 지우지 않는다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const old = await pendingUndo();
      fakeTimers();
      const probe = hold("rowCheck"); // 끝나지 않는 행 확인
      const draining = drainAutosaveUndoQueue(OWNER);
      await probe.reached;
      const before = count("candidates");
      const keeping = handKeep(2); // 다른 대화
      await spin();
      expect(count("candidates")).toBe(before); // 줄에서 기다린다
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      const kept = await keeping;
      await draining;
      expect({ deduped: kept.deduped, row: hasRow(String(kept.source.id)), queue: queued() }).toEqual({
        deduped: null,
        row: true,
        queue: [{ ownerId: OWNER, sourceId: old.handle.sourceId }],
      });
      const sent = { rowLookup: count("rowLookup"), remove: count("remove"), rowDelete: count("rowDelete") };
      probe.release(); // 늦게 돌아온 행 확인은 지우기를 이어 가지 않는다
      await spin();
      expect({ rowLookup: count("rowLookup"), remove: count("remove"), rowDelete: count("rowDelete") }).toEqual(sent);
      expect({ row: hasRow(old.handle.sourceId), raw: hasRaw(old.handle.sourceId) }).toEqual({ row: true, raw: true });
      jest.useRealTimers();
      await drainAutosaveUndoQueue(OWNER); // 기록이 남아 있어 다음 비우기가 마저 지운다
      expect({ row: hasRow(old.handle.sourceId), raw: hasRaw(old.handle.sourceId), queue: queued() }).toEqual({
        row: false,
        raw: false,
        queue: [],
      });
    });

    test("시간 상한을 넘긴 지우기가 아직 그 행을 지우는 중이면, 같은 짝을 손으로 담아도 담김이라 말하지 않는다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const old = await pendingUndo();
      fakeTimers();
      const probe = hold("rowCheck");
      const draining = drainAutosaveUndoQueue(OWNER);
      await probe.reached;
      const outcome = handKeep(1).then(
        () => "kept",
        (error: Error) => error.message,
      );
      await spin();
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      expect(await outcome).toBe("autosave-deletion-in-flight");
      await draining;
      probe.release();
      await spin();
      jest.useRealTimers();
      expect(queued()).toEqual([{ ownerId: OWNER, sourceId: old.handle.sourceId }]);
      await drainAutosaveUndoQueue(OWNER);
      expect({ row: hasRow(old.handle.sourceId), raw: hasRaw(old.handle.sourceId), queue: queued() }).toEqual({
        row: false,
        raw: false,
        queue: [],
      });
    });
  });

  describe("손 담기 표식의 내구성 (GA-1814-1 최소 패치: keep 표식을 내구성 있게 확정)", () => {
    test("손으로 남긴 행은, 그 뒤에 끊긴 작업의 되돌리기가 기기에 다시 적지 않는다 - 앱이 그 사이 꺼져도 다음 실행이 지우지 않는다", async () => {
      mockServer.loseResponse.set("insert", 1);
      const generation = await consentOn();
      const probe = hold("rowCheck");
      const job = start(1, generation);
      await probe.reached; // 행은 커밋됐고, 작업은 응답을 잃어 복구 조회 중이다(아직 끊기지 않았다)
      const kept = await handKeep(1); // 같은 짝 - 정확 중복으로 그 행을 돌려받는다(손 담기가 이긴다)
      expect({ deduped: kept.deduped, id: kept.source.id }).toEqual({ deduped: "exact_duplicate", id: job.handle.sourceId });
      const store = globalThis.localStorage as unknown as { setItem: (key: string, value: string) => void };
      const setItem = store.setItem;
      let writes = 0;
      store.setItem = (key, value) => {
        if (key === autosaveUndoStorageKey(OWNER)) writes += 1;
        setItem(key, value);
      };
      try {
        await savePrivacyPref(OWNER, "chat_autosave", false); // 이제 철회 - 작업이 끊긴다
        probe.release();
        const phase = await job.handle.settled;
        expect({ phase, writes, row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId), queue: queued() }).toEqual({
          phase: "cancelled",
          writes: 0,
          row: true,
          raw: true,
          queue: [],
        });
      } finally {
        store.setItem = setItem;
      }
    });
  });

  describe("GA-1814-2 · GZ-1814-5: 기기에 못 남긴 되돌리기의 범위 (안내 문구가 약속하는 것)", () => {
    test("같은 앱 실행 안에서는 다시 지워 보지만, 앱을 다시 시작하면 다시 지울 단서가 없다 - 안내가 '앱이 켜져 있는 동안' 이라고 말하는 이유", async () => {
      const { job, release } = await atWait("J3"); // 원문만 올라간 자리(행 없음)
      await savePrivacyPref(OWNER, "chat_autosave", false);
      const store = globalThis.localStorage as unknown as { setItem: (key: string, value: string) => void };
      const setItem = store.setItem;
      store.setItem = () => {
        throw new Error("QuotaExceededError");
      };
      mockServer.serverError.set("remove", 1);
      try {
        release();
        expect(await job.handle.settled).toBe("undo_unrecorded");
      } finally {
        store.setItem = setItem;
      }
      __resetAutosaveRunnerForTests(); // 앱 재시작: 이 런타임이 쥐던 것은 사라진다
      const before = mockServer.arrived.length;
      await drainAutosaveUndoQueue(OWNER);
      expect({
        requests: mockServer.arrived.length - before,
        raw: hasRaw(job.handle.sourceId),
        row: hasRow(job.handle.sourceId),
      }).toEqual({ requests: 0, raw: true, row: false });
    });
  });

  describe("3차 재게이트 G2Z-1814-1: 시간 상한을 넘긴 원문 되살리기 (늦게 도착한 쓰기가 지운 원문을 다시 만든다)", () => {
    // 게이트 재현 순서: 철회의 삭제가 한 번 실패해 대기 기록이 남은 행 -> 같은 짝을 손으로 담는다(정확 중복이라 원문을 되살리는
    // 업로드를 보낸다) -> 그 업로드가 돌아오지 않은 채 줄의 시간 상한이 지난다 -> 비우기가 그 행을 지우고 기록을 뺀다 -> 늦은
    // 업로드가 도착해 행도 기록도 없는 원문만 되살아났다. 기대: 업로드가 나가 있는 동안 그 행은 지운 것으로 끝나지 않고(기록이
    // 남는다), 업로드가 돌아오면 그 행을 줄에서 다시 봐서 철회를 마저 지우거나(손으로 남기지 않았으면) 둔다(남겼으면).
    const late = (promise: Promise<unknown>): Promise<string> =>
      promise.then(
        () => "kept",
        (error: Error) => error.message,
      );

    /** 대기 기록이 남은 행(짝 1)을 손으로 다시 담아, 원문을 되살리는 업로드가 나가 있는 채 줄의 시간 상한이 지난 자리. */
    async function restoreOutlivesLane(): Promise<{ old: Job; release: () => void }> {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const old = await pendingUndo();
      fakeTimers();
      const upload = hold("upload"); // 되살리는 업로드가 돌아오지 않는다
      const outcome = late(handKeep(1));
      await upload.reached;
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      expect(await outcome).toBe("autosave-lane-timeout"); // 화면은 담기 실패 안내다
      return { old, release: upload.release };
    }

    test("업로드가 나가 있는 동안에는 비우기가 몇 번 와도 그 행을 지운 것으로 끝내지 않고, 업로드가 돌아온 뒤 철회를 마저 지운다", async () => {
      const { old, release } = await restoreOutlivesLane();
      const record = { ownerId: OWNER, sourceId: old.handle.sourceId };
      for (let round = 0; round < 3; round += 1) await drainAutosaveUndoQueue(OWNER); // 화면 복귀 · 앱 복귀가 거듭 부른다
      expect({ row: hasRow(old.handle.sourceId), queue: queued() }).toEqual({ row: true, queue: [record] });
      release(); // 늦은 업로드가 도착한다
      await spin();
      jest.useRealTimers();
      expect({ row: hasRow(old.handle.sourceId), raw: hasRaw(old.handle.sourceId), queue: queued() }).toEqual({
        row: false,
        raw: false,
        queue: [],
      });
    });

    test("업로드가 나가 있는 행만 기다린다 - 같은 비우기에서 다른 대화의 대기 기록은 그대로 지운다", async () => {
      const { old, release } = await restoreOutlivesLane();
      const other = "7b1e2d3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
      mockServer.objects.set(rawPath(other), "left behind"); // 다른 대화: 행 없이 원문만 남은 대기 기록
      expect(await rememberAutosaveUndo({ ownerId: OWNER, sourceId: other })).toBe(true);
      await drainAutosaveUndoQueue(OWNER);
      expect({ oldRow: hasRow(old.handle.sourceId), otherRaw: hasRaw(other), queue: queued() }).toEqual({
        oldRow: true,
        otherRaw: false,
        queue: [{ ownerId: OWNER, sourceId: old.handle.sourceId }],
      });
      release();
      await spin();
      jest.useRealTimers();
      expect({ oldRow: hasRow(old.handle.sourceId), oldRaw: hasRaw(old.handle.sourceId), queue: queued() }).toEqual({
        oldRow: false,
        oldRaw: false,
        queue: [],
      });
    });

    test("업로드가 나가 있는 동안 같은 짝이 자동 저장되어도 그 행을 지우지 않는다(저장 실패) - 업로드가 돌아온 뒤 철회를 마저 지운다", async () => {
      const { old, release } = await restoreOutlivesLane();
      await savePrivacyPref(OWNER, "chat_autosave", true); // 다시 켠다 - 같은 짝이 다시 자동 저장된다
      const repeat = start(1, autosaveConsentFor(OWNER).generation);
      const phase = await repeat.handle.settled;
      expect({ phase, oldRow: hasRow(old.handle.sourceId), newRow: hasRow(repeat.handle.sourceId) }).toEqual({
        phase: "failed",
        oldRow: true,
        newRow: false,
      });
      release();
      await spin();
      jest.useRealTimers();
      expect({ oldRow: hasRow(old.handle.sourceId), oldRaw: hasRaw(old.handle.sourceId), queue: queued() }).toEqual({
        oldRow: false,
        oldRaw: false,
        queue: [],
      });
    });

    test("업로드가 나가 있는 사이 같은 짝을 다시 손으로 담아 남기면, 늦은 업로드가 돌아온 뒤에도 그 행을 지우지 않는다", async () => {
      const { old, release } = await restoreOutlivesLane();
      const again = await handKeep(1); // 두 번째 되살리기는 바로 돌아온다
      expect({ deduped: again.deduped, id: again.source.id }).toEqual({ deduped: "exact_duplicate", id: old.handle.sourceId });
      release();
      await spin();
      jest.useRealTimers();
      await drainAutosaveUndoQueue(OWNER);
      expect({ row: hasRow(old.handle.sourceId), raw: hasRaw(old.handle.sourceId), queue: queued() }).toEqual({
        row: true,
        raw: true,
        queue: [],
      });
    });
  });

  describe("3차 재게이트 G2A-1814-1: 손 담기의 시간 상한이 capture 를 어디까지 멈추는가", () => {
    // 화면(secondb.tsx keepExchange)은 실행기가 건네는 울타리(signal · journal)를 capture 에 그대로 넘긴다. 여기서도 그렇게 부른다.
    // 계약: 상한이 쓰기를 보내기 전에 오면 capture 는 멈추고 아무것도 쓰지 않는다. 쓰기를 보낸 뒤에 오면 끝까지 간다 - 원문을 올린
    // 채 INSERT 앞에서 멈추면 행 없이 원문만 남는다. 끝난 쓰기의 결과는 버리고(화면은 이미 "확인하지 못했다" 는 실패 안내다), 다시
    // 누르면 정확 중복으로 그 한 행이 담긴다.
    type Fence = { signal: AbortSignal; journal: CaptureJournal };
    const screenKeep = (n: number): ReturnType<typeof runManualKeep> =>
      runManualKeep(OWNER, (fence?: Fence) =>
        captureFromMarkdown({
          userId: OWNER,
          rawMd: exchange(n),
          kindOverride: "self_knowledge",
          userTags: [CHAT_KEEP_TAG],
          signal: fence?.signal,
          journal: fence?.journal,
        }),
      );
    const late = (promise: Promise<unknown>): Promise<string> =>
      promise.then(
        () => "kept",
        (error: Error) => error.message,
      );

    test("쓰기를 보내기 전(중복 후보 조회)에 상한이 지나면, 실패 안내 뒤에는 원문도 행도 보내지 않는다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      fakeTimers();
      const lookup = hold("candidates");
      const outcome = late(screenKeep(2));
      await lookup.reached;
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      expect(await outcome).toBe("autosave-lane-timeout");
      lookup.release();
      await spin();
      jest.useRealTimers();
      expect({
        upload: count("upload"),
        insert: count("insert"),
        rows: mockServer.sources.length,
        objects: mockServer.objects.size,
      }).toEqual({ upload: 0, insert: 0, rows: 0, objects: 0 });
    });

    test.each(["upload", "insert"] as const)(
      "쓰기(%s)를 보낸 뒤 상한이 지나면 그 쓰기는 끝까지 간다 - 원문만 남지 않고, 다시 누르면 그 한 행이 담긴다",
      async (sent) => {
        expect(typeof LANE_TIMEOUT_MS).toBe("number");
        fakeTimers();
        const write = hold(sent);
        const outcome = late(screenKeep(2));
        await write.reached;
        jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
        expect(await outcome).toBe("autosave-lane-timeout");
        write.release();
        await spin();
        jest.useRealTimers();
        // 원문과 그 원문을 가리키는 행이 함께 남았다(행 없는 원문 0).
        expect(mockServer.sources.map((row) => row.storage_path)).toEqual([...mockServer.objects.keys()]);
        expect(mockServer.sources).toHaveLength(1);
        const again = await screenKeep(2);
        expect({ deduped: again.deduped, rows: mockServer.sources.length, objects: mockServer.objects.size, queue: queued() }).toEqual({
          deduped: "exact_duplicate",
          rows: 1,
          objects: 1,
          queue: [],
        });
      },
    );
  });

  describe("4차 재게이트 G3Z-1814-1: 기록 상세의 한 건 삭제도 원문 되살리기와 같은 계정 줄을 지난다", () => {
    // 게이트 재현 순서(같은 계정 · 같은 런타임): 철회의 삭제가 한 번 실패해 대기 기록이 남은 행 -> 같은 대화를 손으로 담는다(정확
    // 중복이라 원문을 되살리는 업로드를 보낸다) -> 그 업로드가 나가 있는 동안 사용자가 기록 상세에서 그 자료를 지운다(deleted) ->
    // 늦게 도착한 업로드가 행도 대기 기록도 없는 원문만 되살렸다. 기록 상세의 삭제가 계정 줄과 되살리기 표식(restoringNow)을 거치지
    // 않았다. 기대: 되살리기가 나가 있는 행의 삭제는 확정하지 않고 업로드가 돌아온 뒤 다시 본다. 사용자의 삭제는 그 전의 손 담기를
    // 이기고(나중에 반드시 지워진다), 그 뒤에 다시 손으로 남기면 그 뜻이 이긴다.
    // 여기서 부르는 deleteCapturedSource 는 기록 상세 화면(handleDeleteSource)이 부르는 바로 그 함수다.
    const late = (promise: Promise<unknown>): Promise<string> =>
      promise.then(
        (value) => (typeof value === "string" ? value : "kept"),
        (error: Error) => error.message,
      );

    /** 대기 기록이 남은 행(짝 1)을 손으로 다시 담아, 원문을 되살리는 업로드가 나가 있는 채 줄의 시간 상한이 지난 자리. */
    async function restoreOutlivesLane(): Promise<{ id: string; release: () => void }> {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const old = await pendingUndo();
      fakeTimers();
      const upload = hold("upload"); // 되살리는 업로드가 돌아오지 않는다
      const outcome = late(handKeep(1));
      await upload.reached;
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      expect(await outcome).toBe("autosave-lane-timeout"); // 화면은 담기 실패 안내다
      return { id: old.handle.sourceId, release: upload.release };
    }

    test("되살리는 업로드가 나가 있는 동안 기록 상세에서 지우면, 그 손 담기가 끝난 뒤에 지워 원문도 행도 대기 기록도 남지 않는다", async () => {
      const old = await pendingUndo();
      const id = old.handle.sourceId;
      const upload = hold("upload"); // 손 담기가 원문을 되살리는 업로드
      const keeping = late(handKeep(1));
      await upload.reached;
      const deleting = late(deleteCapturedSource(OWNER, id));
      await spin();
      // 지우기는 계정 줄에서 손 담기를 기다린다 - 업로드가 돌아오기 전에는 아무것도 지우지 않는다.
      expect({ row: hasRow(id), raw: hasRaw(id) }).toEqual({ row: true, raw: true });
      upload.release();
      expect({ keep: await keeping, deleted: await deleting }).toEqual({ keep: "kept", deleted: "deleted" });
      await drainAutosaveUndoQueue(OWNER);
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
    });

    test("줄을 넘긴 되살리기가 아직 나가 있을 때 지우면 지운 것으로 끝내지 않고(삭제하지 못함), 업로드가 돌아온 뒤 마저 지운다 - 사이에 다시 담아 남긴 것보다 나중의 삭제가 이긴다", async () => {
      const { id, release } = await restoreOutlivesLane();
      const again = await handKeep(1); // 두 번째 되살리기는 바로 돌아와 그 행을 남겼다
      expect({ deduped: again.deduped, id: again.source.id, queue: queued() }).toEqual({ deduped: "exact_duplicate", id, queue: [] });
      const deleted = await late(deleteCapturedSource(OWNER, id));
      expect({ deleted, row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({
        deleted: "not_deleted",
        row: true,
        raw: true,
        queue: [{ ownerId: OWNER, sourceId: id }],
      });
      release(); // 첫 되살리기가 늦게 도착한다
      await spin();
      jest.useRealTimers();
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
    });

    test("지우기를 미룬 뒤 같은 대화를 다시 손으로 담아 남기면, 늦은 업로드가 돌아와도 지우지 않는다 - 나중의 뜻이 이긴다", async () => {
      const { id, release } = await restoreOutlivesLane();
      expect(await late(deleteCapturedSource(OWNER, id))).toBe("not_deleted");
      const again = await handKeep(1);
      expect({ deduped: again.deduped, id: again.source.id }).toEqual({ deduped: "exact_duplicate", id });
      release();
      await spin();
      jest.useRealTimers();
      await drainAutosaveUndoQueue(OWNER);
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: true, raw: true, queue: [] });
    });

    test("되살리기가 나가 있는 행만 미룬다 - 그동안 다른 자료 한 건은 그대로 지운다", async () => {
      const { id, release } = await restoreOutlivesLane();
      const other = await handKeep(2); // 손으로 담은 다른 대화
      const otherId = String(other.source.id);
      const otherPath = String(other.source.storage_path);
      expect(await late(deleteCapturedSource(OWNER, otherId))).toBe("deleted");
      expect({
        otherRow: mockServer.sources.some((row) => row.id === otherId),
        otherRaw: mockServer.objects.has(otherPath),
        row: hasRow(id),
      }).toEqual({ otherRow: false, otherRaw: false, row: true });
      release();
      await spin();
      jest.useRealTimers();
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
    });

    test("기록 상세의 지우기가 시간 상한을 넘겨 줄을 넘겨도, 그 행을 지우는 동안에는 같은 대화의 손 담기가 그 행으로 담김을 띄우지 않는다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const saved = start(1, await consentOn());
      expect(await saved.handle.settled).toBe("kept"); // 자동으로 담긴 대화
      const id = saved.handle.sourceId;
      fakeTimers();
      const rowDelete = hold("rowDelete"); // 기록 상세의 지우기가 행 삭제에서 돌아오지 않는다
      const deleting = late(deleteCapturedSource(OWNER, id));
      await rowDelete.reached;
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      const kept = await late(handKeep(1)); // 같은 대화를 손으로 담는다 - 행은 아직 있다
      rowDelete.release();
      const deleted = await deleting;
      await spin();
      jest.useRealTimers();
      // 5차 재게이트 G4Z-1814-1: 상한은 줄만 넘긴다 - 화면의 답은 실패가 아니라 보낸 삭제가 끝난 뒤의 그 답이다.
      expect({ deleted, kept, row: hasRow(id), raw: hasRaw(id) }).toEqual({
        deleted: "deleted",
        kept: "autosave-deletion-in-flight",
        row: false,
        raw: false,
      });
    });

    test("이번 실행에서 비우기가 세 번 실패해 더 시도하지 않던 행도, 사용자가 지우기로 하면 되살리기가 돌아온 뒤 지운다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const old = await pendingUndo();
      const id = old.handle.sourceId;
      mockServer.serverError.set("remove", 3);
      for (let round = 0; round < 3; round += 1) await drainAutosaveUndoQueue(OWNER); // 세 번 다 원문 삭제에서 실패
      expect({ row: hasRow(id), queue: queued() }).toEqual({ row: true, queue: [{ ownerId: OWNER, sourceId: id }] });
      fakeTimers();
      const upload = hold("upload");
      const keeping = late(handKeep(1));
      await upload.reached;
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      expect(await keeping).toBe("autosave-lane-timeout");
      expect(await late(deleteCapturedSource(OWNER, id))).toBe("not_deleted");
      upload.release();
      await spin();
      jest.useRealTimers();
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
    });

    test("지우기를 미룰 때 기기에 적지 못하면 이 런타임이 쥐고, 업로드가 돌아온 뒤 마저 지운다", async () => {
      const { id, release } = await restoreOutlivesLane();
      await handKeep(1); // 두 번째 되살리기로 남긴 행 - 대기 기록은 빠졌다
      const store = globalThis.localStorage as unknown as { setItem: (key: string, value: string) => void };
      const setItem = store.setItem;
      store.setItem = () => {
        throw new Error("QuotaExceededError");
      };
      let deleted: string;
      try {
        deleted = await late(deleteCapturedSource(OWNER, id));
      } finally {
        store.setItem = setItem;
      }
      expect({ deleted, queue: queued() }).toEqual({ deleted: "not_deleted", queue: [] }); // 기기에는 없다
      release();
      await spin();
      jest.useRealTimers();
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
    });

    test("아직 삭제하지 못했다고 알린 자동 저장을 기록 상세에서 지우면, 지운 뒤 그 안내를 거두고(cancelled) 대기 기록도 남기지 않는다", async () => {
      const { job, release } = await atWait("J4");
      await savePrivacyPref(OWNER, "chat_autosave", false);
      const store = globalThis.localStorage as unknown as { setItem: (key: string, value: string) => void };
      const setItem = store.setItem;
      store.setItem = () => {
        throw new Error("QuotaExceededError");
      };
      mockServer.serverError.set("remove", 1);
      try {
        release();
        expect(await job.handle.settled).toBe("undo_unrecorded"); // 화면은 "아직 삭제하지 못했어요" 다
      } finally {
        store.setItem = setItem;
      }
      const id = job.handle.sourceId;
      const deleted = await late(deleteCapturedSource(OWNER, id));
      expect({ deleted, last: job.phases[job.phases.length - 1], row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({
        deleted: "deleted",
        last: "cancelled",
        row: false,
        raw: false,
        queue: [],
      });
    });
  });

  describe("5차 재게이트 G4Z-1814-1 · G4Z-1814-2: 줄의 시간 상한은 줄만 넘기고, 잠금과 확정은 실제 삭제가 끝난 뒤에 푼다", () => {
    // 게이트 재현 순서(G4Z-1814-1, 같은 계정 · 같은 런타임 · 같은 상세 화면): 업로드가 실패해 본문이 행 안에 든 자료(_storage_pending) ->
    // 기록 상세에서 지운다(행 삭제가 돌아오지 않는다) -> 줄의 시간 상한이 지나 화면이 실패 안내를 띄우고 삭제 잠금을 풀었다 -> 확인 창을
    // 닫고 "위키 페이지 만들기" 를 누르면 승격(promotePendingUploads)이 그 행의 본문을 원문으로 다시 올렸다 -> 늦게 끝난 행 삭제 뒤에 행
    // 없는 원문만 남았다. 기대: 시간 상한은 줄만 넘기고, 화면의 잠금과 답은 실제 삭제가 끝난 뒤에 풀린다. 그동안 그 행의 승격은 막힌다 -
    // 어느 화면에서 누른 승격이든(승격은 계정의 보류 행을 모두 다시 올린다), 실행기의 배경 삭제(철회 되돌리기 · 비우기)가 지우는 중이든.
    // 거꾸로 승격이 그 행을 되살리는 중이면 삭제는 그 되살리기가 끝난 뒤에 지운다.
    // G4Z-1814-2: 손으로 담은 일반 자료도 지우는 중이면(또는 이 런타임이 방금 지웠으면) 같은 대화의 손 담기가 담김을 띄우지 않는다.
    const late = (promise: Promise<unknown>): Promise<string> =>
      promise.then(
        (value) => (typeof value === "string" ? value : "kept"),
        (error: Error) => error.message,
      );
    const rawOf = (saved: { source: { storage_path: string } }): string => saved.source.storage_path;
    const rowExists = (id: string): boolean => mockServer.sources.some((row) => row.id === id);

    const DETAIL_FILE = join(process.cwd(), "src/screens/deepspace/dds-record-detail-screen.tsx");

    interface DetailScreen {
      handleDeleteSource: () => Promise<void>;
      promoteToWiki: () => Promise<void>;
      closeDelete: () => void;
      state: () => { deleting: boolean; promoting: boolean; confirmingDelete: boolean; deleteLock: unknown };
      said: string[];
      back: jest.Mock;
    }

    /**
     * 기록 상세 화면을 렌더하지 않고(이 저장소에서 컴포넌트 렌더 테스트는 막혀 있다) 삭제 · 승격 · 확인 창 닫기의 useCallback 선언을
     * AST 로 떼어 한 스코프에서 돌린다. 화면 상태는 그 스코프의 let 이고, 삭제 · 승격 함수는 진짜다(목은 서버뿐).
     */
    function detailScreen(sourceId: string): DetailScreen {
      const ast = ts.createSourceFile(DETAIL_FILE, readFileSync(DETAIL_FILE, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const wanted = ["promoteToWiki", "handleDeleteSource", "closeDelete"];
      const found = new Map<string, string>();
      const visit = (node: ts.Node): void => {
        if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && wanted.includes(declaration.name.text)) {
              found.set(declaration.name.text, node.getText(ast));
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
      expect([...found.keys()].sort()).toEqual([...wanted].sort());
      const said: string[] = [];
      const back = jest.fn();
      const identity = `${OWNER}:src-${sourceId}`;
      const bindings: Record<string, unknown> = {
        userId: OWNER,
        recordId: `src-${sourceId}`,
        SOURCE_ID_PREFIX: "src-",
        identity,
        primary: { status: "ready", identity, piece: { origin: "source" } },
        isCurrent: (value: unknown) => value === identity,
        deleteCapturedSource,
        promotePendingUploads,
        // 위키 페이지 만들기는 LLM 을 부른다 - 여기서는 자료가 아직 있는지만 본다.
        generateSourcePage: async (_owner: string, id: string) => {
          if (!rowExists(id)) throw new Error("source missing");
        },
        announceActionError: (message?: string) => said.push(message ?? "deepspace:recordDetail.actionFailed"),
        reactExpression: () => undefined,
        router: { canGoBack: () => true, back, replace: jest.fn() },
        AccessibilityInfo: { announceForAccessibility: () => undefined },
        t: (key: string) => key,
      };
      const body = [
        "let deleting = false, promoting = false, promoted = false, confirmingDelete = true;",
        "const locksRef = { current: { edit: null, tags: null, delete: null, promote: null } };",
        "const setDeleting = (value) => { deleting = value; };",
        "const setPromoting = (value) => { promoting = value; };",
        "const setPromoted = (value) => { promoted = value; };",
        "const setConfirmingDelete = (value) => { confirmingDelete = value; };",
        "const setActionError = () => undefined;",
        "const useCallback = (callback) => callback;",
        ...wanted.map((name) => found.get(name) ?? ""),
        "return { handleDeleteSource, promoteToWiki, closeDelete,",
        "  state: () => ({ deleting, promoting, confirmingDelete, deleteLock: locksRef.current.delete }) };",
      ].join("\n");
      const js = ts.transpileModule(body, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText;
      const screen = new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as Omit<DetailScreen, "said" | "back">;
      return { ...screen, said, back };
    }

    /** 철회로 끊긴 자동 저장의 행. 업로드가 실패해 본문이 행 안에 들었다(_storage_pending) - 승격이 다시 올리는 행이다. */
    async function withdrawnBodyInRow(): Promise<{ job: Job; release: () => void }> {
      mockServer.serverError.set("upload", 1);
      const { job, release } = await atWait("J4");
      await savePrivacyPref(OWNER, "chat_autosave", false);
      return { job, release };
    }

    test("게이트 재현: 기록 상세의 삭제가 줄의 시간 상한을 넘겨도 실제 삭제가 끝나기 전에는 삭제 중 잠금이 남아 승격을 누를 수 없고, 끝난 뒤 그 답으로 뒤로 간다 - 줄은 상한에서 풀려 다른 일은 진행한다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      mockServer.serverError.set("upload", 1); // 업로드가 실패해 본문이 행 안에 든다(capture 의 정상 복구 계약)
      const saved = await handKeep(1);
      expect(saved.storagePending).toBe(true);
      const id = String(saved.source.id);
      const screen = detailScreen(id);
      const locked = { deleting: true, promoting: false, confirmingDelete: true, deleteLock: `${OWNER}:src-${id}` };
      fakeTimers();
      const rowDelete = hold("rowDelete"); // 원문 삭제는 지나갔고 행 삭제가 돌아오지 않는다
      const deleting = screen.handleDeleteSource();
      await rowDelete.reached;
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      await spin();
      expect(screen.state()).toEqual(locked);
      screen.closeDelete(); // 지우는 중에는 확인 창이 닫히지 않는다
      const uploads = count("upload");
      await screen.promoteToWiki(); // 잠금이 남아 있어 아무것도 하지 않는다
      // 다른 기록 화면의 승격도 이 행은 건너뛴다(승격은 계정의 보류 행을 모두 다시 올린다).
      expect(await promotePendingUploads(OWNER)).toEqual({ pending: 1, promoted: 0 });
      expect({ state: screen.state(), uploads: count("upload") - uploads }).toEqual({ state: locked, uploads: 0 });
      const other = await handKeep(2); // 줄은 상한에서 풀렸다 - 다른 자료의 일은 기다리지 않는다
      expect(other.deduped).toBeNull();
      rowDelete.release();
      await deleting;
      await spin();
      jest.useRealTimers();
      expect({
        state: screen.state(),
        said: screen.said,
        back: screen.back.mock.calls.length,
        row: rowExists(id),
        raw: mockServer.objects.has(rawOf(saved)),
        queue: queued(),
      }).toEqual({
        state: { deleting: false, promoting: false, confirmingDelete: true, deleteLock: null },
        said: [],
        back: 1,
        row: false,
        raw: false,
        queue: [],
      });
    });

    test("늦게 끝난 삭제도 줄에서 그 답으로 확정한다 - 다 지웠으면 비우기를 기다리지 않고 대기 기록을 뺀다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const old = await pendingUndo();
      const id = old.handle.sourceId;
      fakeTimers();
      const rowDelete = hold("rowDelete");
      const deleting = late(deleteCapturedSource(OWNER, id));
      await rowDelete.reached;
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      await spin();
      rowDelete.release();
      expect(await deleting).toBe("deleted");
      await spin();
      jest.useRealTimers();
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
    });

    test("늦게 끝난 삭제가 다 지웠으면 '아직 삭제하지 못했어요' 안내도 비우기를 기다리지 않고 거둔다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const { job, release } = await atWait("J4");
      await savePrivacyPref(OWNER, "chat_autosave", false);
      const store = globalThis.localStorage as unknown as { setItem: (key: string, value: string) => void };
      const setItem = store.setItem;
      store.setItem = () => {
        throw new Error("QuotaExceededError");
      };
      mockServer.serverError.set("remove", 1);
      try {
        release();
        expect(await job.handle.settled).toBe("undo_unrecorded");
      } finally {
        store.setItem = setItem;
      }
      const id = job.handle.sourceId;
      fakeTimers();
      const rowDelete = hold("rowDelete");
      const deleting = late(deleteCapturedSource(OWNER, id));
      await rowDelete.reached;
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      await spin();
      rowDelete.release();
      expect(await deleting).toBe("deleted");
      await spin();
      jest.useRealTimers();
      expect({ last: job.phases[job.phases.length - 1], row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({
        last: "cancelled",
        row: false,
        raw: false,
        queue: [],
      });
    });

    test("G4Z-1814-2 게이트 재현: 손으로 담은 일반 자료를 기록 상세에서 지우는 중이면(줄의 시간 상한을 넘겨도) 같은 대화를 다시 담아도 담김이라 말하지 않는다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      mockServer.loseResponse.set("insert", 1); // 첫 손 담기: INSERT 는 커밋됐는데 응답을 잃어 화면은 실패 안내다
      expect(await late(handKeep(1))).not.toBe("kept");
      expect(mockServer.sources).toHaveLength(1);
      const id = String(mockServer.sources[0].id);
      const path = String(mockServer.sources[0].storage_path);
      expect(mockServer.objects.has(path)).toBe(true);
      fakeTimers();
      const remove = hold("remove"); // 기록 상세의 삭제: 원문 삭제가 돌아오지 않는다
      const deleting = late(deleteCapturedSource(OWNER, id));
      await remove.reached;
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      expect(await late(handKeep(1))).toBe("autosave-deletion-in-flight"); // 같은 실패한 턴을 다시 담는다(정확 중복)
      remove.release();
      expect(await deleting).toBe("deleted");
      await spin();
      jest.useRealTimers();
      expect({ rows: mockServer.sources.length, objects: mockServer.objects.size }).toEqual({ rows: 0, objects: 0 });
      const again = await handKeep(1); // 삭제가 끝난 뒤에는 새로 담긴다
      expect({ deduped: again.deduped, rows: mockServer.sources.length, objects: mockServer.objects.size }).toEqual({
        deduped: null,
        rows: 1,
        objects: 1,
      });
    });

    test("정확 중복을 읽은 뒤 그 행의 삭제가 끝났으면, 이 런타임이 지운 행이라 손 담기가 담김이라 말하지 않는다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const saved = await handKeep(1);
      const id = String(saved.source.id);
      fakeTimers();
      const rowDelete = hold("rowDelete");
      const deleting = late(deleteCapturedSource(OWNER, id));
      await rowDelete.reached;
      jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
      const lookup = holdAnswer("getSource"); // 서버는 행 삭제 전에 그 행을 읽었고, 그 답은 삭제가 끝난 뒤에 온다
      const keeping = late(handKeep(1));
      await lookup.reached;
      rowDelete.release();
      expect(await deleting).toBe("deleted");
      lookup.release();
      expect(await keeping).toBe("autosave-deletion-in-flight");
      await spin();
      jest.useRealTimers();
      expect({ rows: mockServer.sources.length, objects: mockServer.objects.size }).toEqual({ rows: 0, objects: 0 });
    });

    test("승격 × 철회 되돌리기: 되돌리기가 그 행을 지우는 중이면 다른 기록 화면의 승격이 그 행의 본문을 다시 올리지 않는다 - 행 없는 원문이 남지 않는다", async () => {
      const { job, release } = await withdrawnBodyInRow();
      const rowDelete = hold("rowDelete");
      release(); // INSERT 가 커밋되고 되돌리기가 그 행을 지운다 - 행 삭제가 돌아오지 않는다
      await rowDelete.reached;
      const id = job.handle.sourceId;
      const uploads = count("upload");
      expect(await promotePendingUploads(OWNER)).toEqual({ pending: 1, promoted: 0 });
      expect(count("upload") - uploads).toBe(0);
      rowDelete.release();
      expect(await job.handle.settled).toBe("cancelled");
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
    });

    test("승격 × 철회 되돌리기(거꾸로): 승격이 그 행을 되살리는 중에 되돌리기가 줄에 오면, 되살리기가 끝난 뒤에 지운다", async () => {
      const { job, release } = await withdrawnBodyInRow();
      const lookup = hold("candidates"); // 다른 대화의 손 담기가 줄을 쥐고 있다 - 되돌리기는 그 뒤에 선다
      const blocker = late(handKeep(2));
      await lookup.reached;
      release(); // INSERT 가 커밋된다 - 되돌리기는 기록을 적고 줄을 기다린다
      await spin();
      const upload = hold("upload"); // 승격의 되살리기 업로드가 나가 있다
      const promoting = promotePendingUploads(OWNER);
      await upload.reached;
      const sent = { remove: count("remove"), rowDelete: count("rowDelete") };
      lookup.release(); // 줄이 되돌리기로 넘어간다
      expect(await blocker).toBe("kept");
      await spin();
      expect({ remove: count("remove"), rowDelete: count("rowDelete") }).toEqual(sent); // 지우기는 되살리기를 기다린다
      upload.release();
      expect(await promoting).toEqual({ pending: 1, promoted: 1 });
      expect(await job.handle.settled).toBe("cancelled");
      const id = job.handle.sourceId;
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
    });

    test("승격 × 비우기: 승격이 대기 기록의 행을 되살리는 중이면 비우기의 삭제는 되살리기가 끝난 뒤에 지운다", async () => {
      const { job, release } = await withdrawnBodyInRow();
      mockServer.serverError.set("rowDelete", 1); // 되돌리기의 행 삭제가 한 번 실패해 대기 기록에 남는다
      release();
      expect(await job.handle.settled).toBe("undo_pending");
      const id = job.handle.sourceId;
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({
        row: true,
        raw: false,
        queue: [{ ownerId: OWNER, sourceId: id }],
      });
      const upload = hold("upload");
      const promoting = promotePendingUploads(OWNER);
      await upload.reached;
      const sent = { remove: count("remove"), rowDelete: count("rowDelete") };
      const draining = drainAutosaveUndoQueue(OWNER); // 대화 화면 복귀 · 앱 복귀
      await spin();
      expect({ remove: count("remove"), rowDelete: count("rowDelete") }).toEqual(sent);
      upload.release();
      expect(await promoting).toEqual({ pending: 1, promoted: 1 });
      await draining;
      expect({ row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({ row: false, raw: false, queue: [] });
    });

    test("승격 × 기록 상세 삭제(거꾸로): 승격이 그 행을 되살리는 중에 지우면 되살리기가 끝난 뒤에 지운다 - 늦게 도착한 업로드가 원문을 되살리지 않는다", async () => {
      mockServer.serverError.set("upload", 1);
      const saved = await handKeep(1); // 본문이 행 안에 든 손 담기 자료
      const id = String(saved.source.id);
      const upload = hold("upload"); // 승격의 되살리기 업로드가 나가 있다
      const promoting = promotePendingUploads(OWNER);
      await upload.reached;
      const sent = { remove: count("remove"), rowDelete: count("rowDelete") };
      const deleting = late(deleteCapturedSource(OWNER, id));
      await spin();
      expect({ remove: count("remove"), rowDelete: count("rowDelete") }).toEqual(sent); // 지우기는 되살리기를 기다린다
      upload.release();
      expect(await promoting).toEqual({ pending: 1, promoted: 1 });
      expect(await deleting).toBe("deleted");
      expect({ row: rowExists(id), raw: mockServer.objects.has(rawOf(saved)), queue: queued() }).toEqual({
        row: false,
        raw: false,
        queue: [],
      });
    });

    test("조합 조사 M5: 기기 기록을 못 읽어 지울 차례인지 모른 채 되살린 업로드가 상한을 넘겨 돌아와도, 철회하지 않은 자동 저장 행을 지우지 않는다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const saved = start(1, await consentOn());
      expect(await saved.handle.settled).toBe("kept"); // 동의된 채 담긴 대화 - 철회한 적 없다
      const id = saved.handle.sourceId;
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get() {
          throw new Error("SecurityError"); // 저장소가 막힌 웹 런타임 - 기기 기록을 읽으면 모름(null)
        },
      });
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      let kept: string;
      try {
        fakeTimers();
        const upload = hold("upload"); // 같은 대화를 손으로 담는다 - 모름이라 원문을 되살리는 업로드를 보낸다
        const keeping = late(handKeep(1));
        await upload.reached;
        jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
        kept = await keeping;
        upload.release(); // 늦게 돌아온 업로드 - 줄에서 그 행을 다시 본다
        await spin();
      } finally {
        if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
        warn.mockRestore();
        jest.useRealTimers();
      }
      expect({ kept, row: hasRow(id), raw: hasRaw(id) }).toEqual({ kept: "autosave-lane-timeout", row: true, raw: true });
    });

    /** 대기 기록 모듈의 호출 하나를 붙잡는다(실행기는 모듈의 export 를 부를 때마다 읽는다). 풀면 진짜 함수로 넘긴다. */
    function holdQueueCall<K extends "forgetAutosaveUndo" | "isAutosaveUndoRecorded">(
      name: K,
      pick: (record: { sourceId: string }) => boolean,
    ): { reached: Promise<void>; release: () => void; restore: () => void } {
      const real = undoQueueModule[name] as (record: { ownerId: string; sourceId: string }) => Promise<unknown>;
      let reached = (): void => undefined;
      let open = (): void => undefined;
      const reachedPromise = new Promise<void>((done) => {
        reached = () => done();
      });
      const released = new Promise<void>((done) => {
        open = () => done();
      });
      let armed = true;
      const spy = jest.spyOn(undoQueueModule, name).mockImplementation((async (record: { ownerId: string; sourceId: string }) => {
        if (armed && pick(record)) {
          armed = false;
          reached();
          await released;
        }
        return real(record);
      }) as never);
      return { reached: reachedPromise, release: () => open(), restore: () => spy.mockRestore() };
    }

    test("조합 조사 M14: 되돌리기가 손으로 남긴 행의 기록을 빼는 사이 상한이 지나도 '아직 삭제하지 못했어요' 로 끝나지 않는다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const { job, release } = await atWait("J4");
      await savePrivacyPref(OWNER, "chat_autosave", false); // 철회 - INSERT 가 커밋되면 되돌린다
      const id = job.handle.sourceId;
      fakeTimers();
      const lookup = hold("candidates"); // 다른 대화의 손 담기가 줄을 쥐고 있다
      const blocker = late(handKeep(2));
      await lookup.reached;
      const keeping = late(handKeep(1)); // 같은 대화를 손으로 담는다 - 되돌리기보다 먼저 줄에 선다
      const store = globalThis.localStorage as unknown as { setItem: (key: string, value: string) => void };
      const setItem = store.setItem;
      store.setItem = (key, value) => {
        if (key === autosaveUndoStorageKey(OWNER)) throw new Error("QuotaExceededError"); // 기기에 적지 못한다
        setItem(key, value);
      };
      let forgets = 0;
      const forget = holdQueueCall("forgetAutosaveUndo", (record) => record.sourceId === id && ++forgets === 2);
      let phase: AutosaveTerminalPhase;
      try {
        release(); // INSERT 가 커밋된다 - 되돌리기는 기록을 적지 못한 채 줄에 선다
        await spin();
        lookup.release(); // 줄이 흐른다: 다른 손 담기 -> 같은 대화의 손 담기(표식을 세운다) -> 되돌리기
        expect(await blocker).toBe("kept");
        await keeping;
        await forget.reached; // 되돌리기가 표식을 보고 기록을 빼는 중이다
        jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
        phase = await job.handle.settled;
        forget.release();
        await spin();
      } finally {
        store.setItem = setItem;
        forget.restore();
        jest.useRealTimers();
      }
      await drainAutosaveUndoQueue(OWNER);
      expect({ phase, last: job.phases[job.phases.length - 1], row: hasRow(id), raw: hasRaw(id), queue: queued() }).toEqual({
        phase: "cancelled",
        last: "cancelled",
        row: true,
        raw: true,
        queue: [],
      });
    });

    test("조합 조사: 손 담기가 대기 기록을 읽는 사이 상한이 지나면, 늦게 돌아와 표식을 세우거나 기록을 빼지 않는다", async () => {
      expect(typeof LANE_TIMEOUT_MS).toBe("number");
      const saved = start(1, await consentOn());
      expect(await saved.handle.settled).toBe("kept"); // 자동으로 담긴 대화 - 지울 차례가 아니다
      const id = saved.handle.sourceId;
      const read = holdQueueCall("isAutosaveUndoRecorded", (record) => record.sourceId === id);
      let timedOut = false;
      let lateForgets = 0;
      const realForget = undoQueueModule.forgetAutosaveUndo;
      const forgetSpy = jest.spyOn(undoQueueModule, "forgetAutosaveUndo").mockImplementation(async (record) => {
        if (timedOut && record.sourceId === id) lateForgets += 1;
        return realForget(record);
      });
      let kept: string;
      try {
        fakeTimers();
        const keeping = late(handKeep(1)); // 같은 대화를 손으로 담는다 - 정확 중복이라 대기 기록을 읽는다
        await read.reached;
        jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
        timedOut = true;
        kept = await keeping; // 화면은 담기 실패 안내다
        read.release(); // 늦게 돌아온 읽기: 지울 차례가 아니다
        await spin();
      } finally {
        read.restore();
        forgetSpy.mockRestore();
        jest.useRealTimers();
      }
      // 표식이 서지 않았으면 같은 대화의 다음 자동 저장은 그 행이 아직 있는지 확인한 뒤에 담김이다.
      const checks = count("rowCheck");
      const again = start(1, autosaveConsentFor(OWNER).generation);
      expect(await again.handle.settled).toBe("kept");
      expect({ kept, lateForgets, rowChecks: count("rowCheck") - checks }).toEqual({
        kept: "autosave-lane-timeout",
        lateForgets: 0,
        rowChecks: 1,
      });
    });
  });
});

describe("재게이트 잔여 - 경계 두 곳 (작업의 되돌리기 시간 상한 · 대기 기록을 읽지 못할 때)", () => {
  const spin = async (): Promise<void> => {
    for (let turn = 0; turn < 20; turn += 1) await new Promise<void>((done) => setImmediate(done));
  };
  afterEach(() => {
    jest.useRealTimers();
  });

  test("GA-1814-3: 작업의 되돌리기가 줄에서 시간 상한을 넘기면 적어 둔 대로 undo_pending 으로 끝나고, 늦게 끝난 지우기는 기록을 빼지 않으며 다음 비우기가 마저 정리한다", async () => {
    expect(typeof LANE_TIMEOUT_MS).toBe("number");
    const { job, release } = await atWait("J4");
    await savePrivacyPref(OWNER, "chat_autosave", false);
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
    const remove = hold("remove"); // 되돌리기의 원문 삭제가 돌아오지 않는다
    release();
    await remove.reached;
    jest.advanceTimersByTime(LANE_TIMEOUT_MS ?? 0);
    const record = { ownerId: OWNER, sourceId: job.handle.sourceId };
    expect({ phase: await job.handle.settled, queue: queued() }).toEqual({ phase: "undo_pending", queue: [record] });
    remove.release();
    await spin();
    // 이미 보낸 삭제는 거둘 수 없다 - deleteCapturedSource 는 안에서 끝까지 간다. 늦게 끝난 일은 신호를 보고 멈춰 기록을 빼지
    // 않는다(작업은 이미 undo_pending 으로 답했다). 기록이 남아 다음 비우기가 확인하고 뺀다.
    expect({ row: hasRow(job.handle.sourceId), queue: queued() }).toEqual({ row: false, queue: [record] });
    jest.useRealTimers();
    await drainAutosaveUndoQueue(OWNER);
    expect({ row: hasRow(job.handle.sourceId), raw: hasRaw(job.handle.sourceId), queue: queued() }).toEqual({
      row: false,
      raw: false,
      queue: [],
    });
  });

  test("GZ-1814-1 · GZ-1814-3: 기기 대기 기록을 읽지 못하면, 정확 중복으로 돌려받은 행이 지울 차례인지 모르므로 담김으로 치지 않는다(저장 실패)", async () => {
    const { job: old, release } = await atWait("J4");
    await savePrivacyPref(OWNER, "chat_autosave", false);
    mockServer.serverError.set("remove", 1);
    release();
    expect(await old.handle.settled).toBe("undo_pending"); // 기기에 적혀 있다
    await savePrivacyPref(OWNER, "chat_autosave", true);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    let phase: AutosaveTerminalPhase;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const repeat = start(1, autosaveConsentFor(OWNER).generation);
      phase = await repeat.handle.settled;
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
      warn.mockRestore();
    }
    expect({ phase, oldRow: hasRow(old.handle.sourceId), queue: queued() }).toEqual({
      phase: "failed",
      oldRow: true,
      queue: [{ ownerId: OWNER, sourceId: old.handle.sourceId }],
    });
    await drainAutosaveUndoQueue(OWNER); // 저장소가 돌아오면 철회가 마저 지워진다
    expect({ oldRow: hasRow(old.handle.sourceId), oldRaw: hasRaw(old.handle.sourceId), queue: queued() }).toEqual({
      oldRow: false,
      oldRaw: false,
      queue: [],
    });
  });
});
