// capture 가 자기 쓰기에 이름을 붙이고, 무엇을 보냈는지 적는다 (PR 1814 재설계 C3, 2026-09-16).
//
// 대화 자동 저장은 철회를 알았을 때 "이 작업이 쓴 것" 만 되돌려야 한다(설계 P4 · P5). 그러려면
// capture 가 세 가지를 호출자에게 내줘야 한다:
//   · 행 id 와 원문 키를 호출자가 정한다(sourceId · storageKey). content_hash 로 찾아 지우면 같은
//     대화를 손으로 담은 행이 지워진다 - 해시가 같기 때문이다.
//   · 무엇을 보냈고 무엇이 끝났는지 적는다(journal). AbortError 로 끝난 뒤에도 호출자가 읽는다.
//   · 이미 보낸 INSERT 는 끊지 않는다(insertIgnoresSignal). 끊으면 커밋됐는지 알 수 없다.
// 인자를 안 주는 호출자 넷(capture 화면 · 대화 손 담기 · 가져오기 두 곳)은 지금과 같아야 한다.
//
// 목은 받아 적기만 하지 않는다. 서버 상태(sources 행 · ingest_log · 원문 객체)를 들고, 요청을
// 붙잡았다가 풀 수 있다. 신호가 붙은 요청이 붙잡힌 채 끊기면 클라이언트 쪽만 AbortError 로 끝나고
// 서버 쪽은 풀릴 때 그대로 실행된다 - fetch 를 끊어도 이미 서버에 닿은 INSERT 는 커밋된다는 모델이다.
// 이미 끊긴 신호로 내려던 요청은 서버에 닿지 않는다(fetch 가 보내지 않는다).
// ⚠ 끊긴 fetch 를 supabase-js 가 reject 로 주는지 { error } 결과로 주는지는 모델하지 않았다. 둘 다
//   createSource 에서 throw 가 되므로 여기 단언은 갈리지 않는다. 운영 Supabase 에서 끊긴 INSERT 가
//   실제로 커밋되는지, 클라이언트가 정한 id 로 INSERT 가 허용되는지는 확인하지 않았다(미검증).

type Row = Record<string, unknown>;

interface MockResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** 목이 붙잡을 수 있는 요청 단위. */
type Label = "candidates" | "drop" | "getSource" | "upload" | "insert";

interface MockHold {
  onReached: () => void;
  released: Promise<void>;
}

interface MockBuilder {
  select(list?: string): MockBuilder;
  insert(row: Row): MockBuilder;
  eq(column: string, value: unknown): MockBuilder;
  overlaps(column: string, values: string[]): MockBuilder;
  limit(count: number): MockBuilder;
  abortSignal(signal: AbortSignal): MockBuilder;
  single(): Promise<MockResult>;
  maybeSingle(): Promise<MockResult>;
  then(resolve: (result: MockResult) => unknown, reject?: (reason: unknown) => unknown): Promise<unknown>;
}

const mockServer = {
  sources: [] as Row[],
  ingest_log: [] as Row[],
  objects: new Map<string, string>(),
  /** sources INSERT 가 보낸 몸통 그대로. id 를 클라이언트가 정했는지 본다. */
  insertBodies: [] as Row[],
  /** 서버에 닿은 요청 순서와, 그 요청에 신호가 붙어 있었는지. */
  arrived: [] as { label: Label; signal: boolean }[],
  holds: new Map<Label, MockHold>(),
  nextId: 1,
};

function mockAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function mockSend(label: Label, signal: AbortSignal | undefined, execute: () => MockResult): Promise<MockResult> {
  // fetch 는 이미 끊긴 신호로는 요청을 보내지 않는다.
  if (signal?.aborted) return Promise.reject(mockAbortError());
  mockServer.arrived.push({ label, signal: signal !== undefined });
  const hold = mockServer.holds.get(label);
  hold?.onReached();
  // 서버 쪽 실행. 붙잡혀 있으면 풀릴 때 실행된다. 클라이언트가 끊겨도 이 실행은 일어난다.
  const server = (hold ? hold.released : Promise.resolve()).then(execute);
  if (!signal) return server;
  return new Promise<MockResult>((resolve, reject) => {
    const onAbort = (): void => reject(mockAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    void server.then((result) => {
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    });
  });
}

function mockTable(table: "sources" | "ingest_log"): MockBuilder {
  let op: "select" | "insert" = "select";
  let columns = "*";
  let body: Row = {};
  let signal: AbortSignal | undefined;
  const filters: ((row: Row) => boolean)[] = [];

  const label = (): Label =>
    table === "ingest_log" ? "drop" : op === "insert" ? "insert" : columns === "*" ? "getSource" : "candidates";

  const execute = (): MockResult => {
    if (op === "select") {
      const hit = mockServer[table].filter((row) => filters.every((keep) => keep(row)));
      return { data: hit.map((row) => ({ ...row })), error: null };
    }
    if (table === "ingest_log") {
      mockServer.ingest_log.push({ ...body });
      return { data: null, error: null };
    }
    mockServer.insertBodies.push({ ...body });
    const id = typeof body.id === "string" ? body.id : `server-row-${mockServer.nextId++}`;
    // sources 의 기본키와 (user_id, content_hash) 고유 제약.
    const clash = mockServer.sources.some(
      (row) =>
        row.id === id ||
        (row.user_id === body.user_id && body.content_hash !== undefined && row.content_hash === body.content_hash),
    );
    if (clash) return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
    const row = { ...body, id };
    mockServer.sources.push(row);
    return { data: [{ ...row }], error: null };
  };

  const send = (): Promise<MockResult> => mockSend(label(), signal, execute);
  const first = (result: MockResult): MockResult =>
    result.error ? result : { data: (result.data as Row[])[0] ?? null, error: null };

  const builder: MockBuilder = {
    select: (list = "*") => {
      if (op === "select") columns = list;
      return builder;
    },
    insert: (row) => {
      op = "insert";
      body = row;
      return builder;
    },
    eq: (column, value) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    overlaps: (column, values) => {
      filters.push((row) => Array.isArray(row[column]) && (row[column] as string[]).some((v) => values.includes(v)));
      return builder;
    },
    limit: () => builder,
    abortSignal: (next) => {
      signal = next;
      return builder;
    },
    single: () => send().then(first),
    maybeSingle: () => send().then(first),
    then: (resolve, reject) => send().then(resolve, reject),
  };
  return builder;
}

const mockClient = {
  from: (table: "sources" | "ingest_log") => mockTable(table),
  storage: {
    from: () => ({
      // 원문 업로드. storage.ts 는 신호를 넘기지 않는다 - 끊을 수 없는 쓰기다.
      upload: (path: string, content: string, options?: { upsert?: boolean }) =>
        mockSend("upload", undefined, () => {
          if (mockServer.objects.has(path) && options?.upsert !== true) {
            return { data: null, error: { message: "The resource already exists" } };
          }
          mockServer.objects.set(path, content);
          return { data: { path }, error: null };
        }),
    }),
  },
};

jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => mockClient }));

import { captureFromMarkdown, type CaptureInput, type CaptureJournal } from "../capture";

const OWNER = "owner-a";
const RAW = "# 산책\n\n이번 주에 걸었던 길을 물었고, 세컨비가 답했다.";
const SOURCE_ID = "3f0c9a52-5d1e-4f7b-9c2a-8e1b6d4a7c10";
const KEY = `chat-${SOURCE_ID}`;
const KEY_PATH = `${OWNER}/${KEY}.md`;

/** 다음 요청(같은 이름 전부)을 붙잡는다. reached 는 첫 요청이 서버에 닿으면 풀린다. */
function hold(label: Label): { reached: Promise<void>; release: () => void } {
  let onReached = (): void => undefined;
  let open = (): void => undefined;
  const reached = new Promise<void>((done) => {
    onReached = () => done();
  });
  const released = new Promise<void>((done) => {
    open = () => done();
  });
  mockServer.holds.set(label, { onReached: () => onReached(), released });
  return {
    reached,
    release: () => {
      mockServer.holds.delete(label);
      open();
    },
  };
}

const labels = (): Label[] => mockServer.arrived.map((request) => request.label);

function blankJournal(): CaptureJournal {
  return { uploadSent: false, uploadDone: false, insertSent: false, insertDone: false };
}

/** 끝났는지를 기다리지 않고 본다. 끝나는 순간의 journal 도 떠 둔다. */
function watch(promise: Promise<unknown>, journal: CaptureJournal) {
  const seen = { settled: false, error: undefined as unknown, journalAtSettle: null as CaptureJournal | null };
  const done = promise.then(
    () => {
      seen.settled = true;
      seen.journalAtSettle = { ...journal };
    },
    (error: unknown) => {
      seen.settled = true;
      seen.error = error;
      seen.journalAtSettle = { ...journal };
    },
  );
  return { seen, done };
}

/** 마이크로태스크 몇 번으로 세지 않고 이벤트 루프 한 바퀴를 기다린다. */
const settle = (): Promise<void> => new Promise((done) => setImmediate(done));

/** 자동 저장 실행기가 넘길 모양: 이름표 둘 · 기록 · INSERT 는 끊지 않음. */
function autosaveInput(signal: AbortSignal, journal: CaptureJournal): CaptureInput {
  return {
    userId: OWNER,
    rawMd: RAW,
    kindOverride: "self_knowledge",
    userTags: ["chat:keep"],
    signal,
    sourceId: SOURCE_ID,
    storageKey: KEY,
    journal,
    insertIgnoresSignal: true,
  };
}

beforeEach(() => {
  mockServer.sources = [];
  mockServer.ingest_log = [];
  mockServer.objects.clear();
  mockServer.insertBodies = [];
  mockServer.arrived = [];
  mockServer.holds.clear();
  mockServer.nextId = 1;
});

describe("capture 가 쓰기에 이름을 붙이고 보낸 것을 적는다 (자동 저장 실행기 모양)", () => {
  test("끊기지 않으면 호출자가 정한 행 id 와 원문 키로 쓰고, 넷 다 끝났다고 적는다", async () => {
    const journal = blankJournal();
    const result = await captureFromMarkdown(autosaveInput(new AbortController().signal, journal));

    expect(result.source.id).toBe(SOURCE_ID);
    expect(result.storage_path).toBe(KEY_PATH);
    expect(mockServer.sources.map((row) => [row.id, row.storage_path])).toEqual([[SOURCE_ID, KEY_PATH]]);
    expect([...mockServer.objects.keys()]).toEqual([KEY_PATH]);
    expect(labels()).toEqual(["candidates", "candidates", "upload", "insert"]);
    expect(journal).toEqual({ uploadSent: true, uploadDone: true, insertSent: true, insertDone: true });
  });

  test("(a) 중복 후보 조회를 기다리는 중에 끊기면 원문 업로드도 INSERT 도 보내지 않는다", async () => {
    const controller = new AbortController();
    const journal = blankJournal();
    const gate = hold("candidates");
    const run = watch(captureFromMarkdown(autosaveInput(controller.signal, journal)), journal);
    await gate.reached;
    controller.abort();
    gate.release();
    await run.done;

    expect(run.seen.error).toMatchObject({ name: "AbortError" });
    expect(labels()).toEqual(["candidates", "candidates"]);
    expect(mockServer.objects.size).toBe(0);
    expect(mockServer.sources).toEqual([]);
    expect(journal).toEqual(blankJournal());
  });

  test("(b) 원문 업로드를 기다리는 중에 끊기면 업로드는 끝까지 가고, INSERT 는 보내지 않고, 업로드가 끝났다고 적는다", async () => {
    const controller = new AbortController();
    const journal = blankJournal();
    const gate = hold("upload");
    const run = watch(captureFromMarkdown(autosaveInput(controller.signal, journal)), journal);
    await gate.reached;
    controller.abort();
    await settle();
    // 업로드에는 신호가 없다. 끊겼다고 먼저 끝나지 않는다.
    expect(run.seen.settled).toBe(false);
    expect(journal).toEqual({ uploadSent: true, uploadDone: false, insertSent: false, insertDone: false });
    gate.release();
    await run.done;

    expect(run.seen.error).toMatchObject({ name: "AbortError" });
    expect([...mockServer.objects.keys()]).toEqual([KEY_PATH]);
    expect(labels()).not.toContain("insert");
    expect(mockServer.sources).toEqual([]);
    expect(run.seen.journalAtSettle).toEqual({ uploadSent: true, uploadDone: true, insertSent: false, insertDone: false });
  });

  test("(c) INSERT 를 기다리는 중에 끊겨도 INSERT 는 끊지 않는다 - 커밋을 받아 적은 다음에 AbortError 를 던진다", async () => {
    const controller = new AbortController();
    const journal = blankJournal();
    const gate = hold("insert");
    const run = watch(captureFromMarkdown(autosaveInput(controller.signal, journal)), journal);
    await gate.reached;
    controller.abort();
    await settle();
    // 끊긴 fetch 로 먼저 끝나면 행이 커밋됐는지 모르는 채로 호출자에게 돌아간다.
    expect(run.seen.settled).toBe(false);
    expect(mockServer.sources).toEqual([]);
    gate.release();
    await run.done;

    expect(run.seen.error).toMatchObject({ name: "AbortError" });
    expect(mockServer.sources.map((row) => row.id)).toEqual([SOURCE_ID]);
    expect(run.seen.journalAtSettle).toEqual({ uploadSent: true, uploadDone: true, insertSent: true, insertDone: true });
    expect(mockServer.arrived.find((request) => request.label === "insert")).toEqual({ label: "insert", signal: false });
  });

  test("(d) 정확 중복인데 원본이 사라진 갈래: 원본 조회를 기다리는 중에 끊기면 업로드를 보내지 않는다", async () => {
    // 같은 본문이 이미 한 번 담겨 있다(손 담기라고 보자). 새 인자 없는 호출이다.
    await captureFromMarkdown({ userId: OWNER, rawMd: RAW, kindOverride: "self_knowledge" });
    expect(mockServer.sources).toHaveLength(1);
    const objectsBefore = [...mockServer.objects.keys()];
    mockServer.arrived = [];

    const controller = new AbortController();
    const journal = blankJournal();
    const gate = hold("getSource");
    const run = watch(captureFromMarkdown(autosaveInput(controller.signal, journal)), journal);
    await gate.reached;
    // 원본 조회가 서버에서 돌기 전에 그 행이 다른 곳에서 지워졌고, 철회도 도착했다.
    mockServer.sources = [];
    controller.abort();
    gate.release();
    await run.done;

    expect(run.seen.error).toMatchObject({ name: "AbortError" });
    expect(labels()).toEqual(["candidates", "candidates", "drop", "getSource"]);
    expect([...mockServer.objects.keys()]).toEqual(objectsBefore);
    expect(mockServer.sources).toEqual([]);
    expect(journal).toEqual(blankJournal());
  });
});

describe("(e) 새 인자를 안 주는 호출자 넷은 지금과 같다", () => {
  const SHAPES: { name: string; signal: boolean; input: (signal: AbortSignal) => CaptureInput }[] = [
    {
      name: "capture 화면 (capture.tsx)",
      signal: true,
      input: (signal) => ({
        userId: OWNER,
        rawMd: RAW,
        fallbackUrl: null,
        kindOverride: null,
        userTags: ["walk"],
        track: "daily",
        extraFrontmatter: { summary: "walk" },
        simonRelevance: 0.6,
        signal,
      }),
    },
    {
      name: "대화 손 담기 (secondb.tsx)",
      signal: false,
      input: () => ({ userId: OWNER, rawMd: RAW, kindOverride: "self_knowledge", userTags: ["chat:keep"] }),
    },
    {
      name: "가져오기 받은함 (dds-import-inbox-screens.tsx)",
      signal: false,
      input: () => ({ userId: OWNER, rawMd: RAW, kindOverride: "self_knowledge" }),
    },
    {
      name: "가져오기 허브 (ImportHubScreen.tsx)",
      signal: false,
      input: () => ({ userId: OWNER, rawMd: RAW, kindOverride: "self_knowledge" }),
    },
  ];

  test.each(SHAPES)("$name: 행 id 는 서버가 정하고, 원문 키는 제목 슬러그 + 해시이고, 요청 순서가 같다", async ({ input, signal }) => {
    const result = await captureFromMarkdown(input(new AbortController().signal));

    expect(labels()).toEqual(["candidates", "candidates", "upload", "insert"]);
    expect(mockServer.arrived.find((request) => request.label === "insert")).toEqual({ label: "insert", signal });
    expect("id" in mockServer.insertBodies[0]).toBe(false);
    expect(result.source.id).toBe("server-row-1");
    expect(result.storage_path).toMatch(/^owner-a\/s-[0-9a-z]+-[0-9a-f]{12}\.md$/);
    expect([...mockServer.objects.keys()]).toEqual([result.storage_path]);
    expect(result).toMatchObject({ storagePending: false, deduped: null, hadFrontmatter: false });
  });

  test("capture 화면 모양: INSERT 는 지금처럼 신호에 걸려, 기다리는 중에 끊기면 커밋을 기다리지 않고 먼저 끝난다", async () => {
    const controller = new AbortController();
    const gate = hold("insert");
    const run = watch(captureFromMarkdown({ userId: OWNER, rawMd: RAW, signal: controller.signal }), blankJournal());
    await gate.reached;
    controller.abort();
    await settle();

    expect(run.seen.settled).toBe(true);
    expect(run.seen.error).toMatchObject({ name: "AbortError" });
    // 서버는 이미 닿은 요청을 풀리면 그대로 커밋한다. 자동 저장이 INSERT 를 끊지 않는 이유가 이것이다.
    expect(mockServer.sources).toEqual([]);
    gate.release();
    await settle();
    expect(mockServer.sources).toHaveLength(1);
  });
});
