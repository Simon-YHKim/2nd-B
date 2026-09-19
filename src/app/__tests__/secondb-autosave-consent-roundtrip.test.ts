// 대화 자동 저장 왕복 - Stack 에 남은 대화 화면이 설정에서 바꾼 동의를 따르고, 자동 저장을 실행기에 넘긴다
// (r3as H1 2026-09-14 · PR 1814 재설계 C5 2026-09-17).
//
// 게이트가 처음 잡은 결함(r3as H1): /secondb 는 /privacy 에 가 있는 동안에도 Stack 에 남는다. 그런데 동의를 처음
// 한 번만 읽고 그 값으로 계속 담았다. 설정에서 대화 저장을 끄고(원장에 revoke 까지 남기고) 돌아와도 새 답변이
// sources 에 저장됐고, 반대로 켜고 돌아와도 담기지 않았다.
//
// PR 1814 재설계 C5 부터 이 화면은 동의를 계정별 저장소(lib/chat/autosave-consent.ts)에서 읽고, 자동 저장을
// 실행기(lib/chat/autosave-runner.ts)에 넘긴다. 이 파일은 그 왕복과 배선을 **실제 코드로** 돌린다.
//   · 대화 화면: secondb.tsx 의 실제 선언을 AST 로 떼어, 의존성 배열이 바뀐 effect 만 다시 도는 작은 스케줄러 위에서
//     돌린다. 화면은 한 번 마운트된 채 남는다 - Stack 에 유지된 화면이다. 떼는 것: 동의를 읽는 useSyncExternalStore ·
//     설정 읽기 effect · 저장 소식 구독 effect · 작업 결과 구독 effect · 자동 저장 effect · 대기 기록 비우기 effect ·
//     초점 복귀에 거는 useFocusRefetch 부름 전부 ·
//     exchangeAt · keepExchange · startNewConversation · handleSend 가 질문 턴에 동의 세대를 적는 문장 · 담기 칩의
//     disabled 식과 문구 식 · 모듈의 subscribeChatAutosaveConsent · autosaveIsKeeping · keepCrisisHotline. effect 는
//     파일에 적힌 순서대로 돈다.
//   · 설정 화면: DeepSpaceDesignScreens.tsx 의 실제 toggleChatAutosave.
//   · 그 아래는 전부 실제 모듈이다: 동의 저장소 · 실행기 · 되돌리기 대기 기록 · capture · 되돌리기 삭제 · 계정 경계 ·
//     저장 함수(lib/supabase/privacy.ts) · 저장 소식(lib/privacy/pref-changes.ts). Supabase I/O 만 상태를 가진 목이고,
//     요청을 이름별로 붙잡았다 풀 수 있다.
// 예전 하네스는 keepExchange 자리를 즉시 성공으로 바꿔 capture 안의 창을 볼 수 없었다. 여기서 "담겼다" 는 목 서버에
// 그 답변의 행이 남아 있다는 뜻이다. 경쟁 순서 표 전체(대기 지점 × 끼어드는 일)는 실행기 테스트
// (lib/chat/__tests__/autosave-runner.test.ts)가 돌리고, 이 파일은 화면이 그 실행기를 제대로 부르는지를 본다.
// React Navigation 을 띄운 E2E 는 아니다 - 이 저장소에서 컴포넌트 렌더 테스트는 막혀 있다(RN 0.85).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

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
  /** consent_changes 에 쌓인 원장 줄. */
  ledger: [] as Row[],
  /** Supabase 클라이언트가 지금 로그인해 있는 계정. 요청은 보낸 순간의 값을 쥔다(RLS). */
  session: null as string | null,
  arrived: [] as { label: Label; session: string | null }[],
  holds: new Map<Label, MockHold[]>(),
  /** 다음 N 번은 서버에 닿았다가 서버 오류로 끝난다(쓰기 없음). */
  serverError: new Map<Label, number>(),
};

function mockAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function mockTakeServerError(label: Label): boolean {
  const left = mockServer.serverError.get(label) ?? 0;
  if (left <= 0) return false;
  mockServer.serverError.set(label, left - 1);
  return true;
}

/**
 * 요청 하나. 붙잡혀 있으면 풀릴 때 서버에서 실행된다. 읽기(atSend)는 요청한 순간의 값을 싣고 늦게 도착한다 - 늦게 온
 * 응답이 옛 값을 싣고 오는 경우가 이 파일의 주제다. 신호가 붙은 요청이 붙잡힌 채 끊기면 클라이언트만 먼저 끝나고,
 * 서버 쪽은 풀릴 때 실행된다.
 */
function mockSend(
  label: Label,
  signal: AbortSignal | undefined,
  execute: (session: string | null) => MockResult,
  atSend = false,
): Promise<MockResult> {
  if (signal?.aborted) return Promise.reject(mockAbortError());
  const session = mockServer.session;
  mockServer.arrived.push({ label, session });
  const failed = mockTakeServerError(label);
  const early = atSend && !failed ? execute(session) : null;
  const gate = mockServer.holds.get(label)?.shift();
  gate?.reached();
  const server = (gate ? gate.released : Promise.resolve()).then((): MockResult => {
    if (failed) return { data: null, error: { message: "internal error", code: "XX000", status: 500, statusCode: "500" } };
    return early ?? execute(session);
  });
  if (!signal) return server;
  return new Promise<MockResult>((done, fail) => {
    const onAbort = (): void => fail(mockAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    void server.then((result) => {
      signal.removeEventListener("abort", onAbort);
      done(result);
    });
  });
}

function mockRlsDenied(): MockResult {
  return { data: null, error: { message: "new row violates row-level security policy", code: "42501" } };
}

function mockTable(table: string) {
  let op: "select" | "insert" | "update" | "delete" = "select";
  let columns = "*";
  let body: unknown = {};
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
        if (session !== null && matches({ id: session })) {
          mockServer.prefs.set(session, structuredClone((body as Row).privacy_prefs as Row));
        }
        return { data: null, error: null };
      }
      const hit = [...mockServer.prefs].filter(([id]) => id === session && matches({ id }));
      return { data: hit.map(([, prefs]) => ({ privacy_prefs: structuredClone(prefs) })), error: null };
    }
    if (table === "consent_changes") {
      mockServer.ledger.push(...(Array.isArray(body) ? (body as Row[]) : [body as Row]).map((row) => ({ ...row })));
      return { data: null, error: null };
    }
    if (table === "consent_records") return { data: null, error: null };
    const row = body as Row;
    if (table === "ingest_log") {
      if (row.user_id !== session) return mockRlsDenied();
      mockServer.ingestLog.push({ ...row });
      return { data: null, error: null };
    }
    const rows = table === "wiki_pages" ? mockServer.wikiPages : mockServer.sources;
    const visible = rows.filter((candidate) => candidate.user_id === session && matches(candidate));
    if (op === "select") return { data: visible.map((candidate) => ({ ...candidate })), error: null };
    if (op === "update") {
      visible.forEach((candidate) => Object.assign(candidate, row));
      return { data: null, error: null };
    }
    if (op === "delete") {
      const kept = rows.filter((candidate) => !visible.includes(candidate));
      if (table === "wiki_pages") mockServer.wikiPages = kept;
      else mockServer.sources = kept;
      return { data: null, error: null, count: countRequested ? visible.length : null };
    }
    // sources INSERT: 소유자 RLS · 기본키 · (user_id, content_hash) 고유 제약.
    if (row.user_id !== session) return mockRlsDenied();
    const id = typeof row.id === "string" ? row.id : `server-row-${mockServer.sources.length + 1}`;
    const clash = mockServer.sources.some(
      (candidate) => candidate.id === id || (candidate.user_id === row.user_id && candidate.content_hash === row.content_hash),
    );
    if (clash) return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
    const inserted = { ...row, id };
    mockServer.sources.push(inserted);
    return { data: [{ ...inserted }], error: null };
  };

  const send = (): Promise<MockResult> => mockSend(label(), signal, execute, label() === "prefsRead");
  const first = (result: MockResult): MockResult =>
    result.error ? result : { data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: null };

  const builder = {
    select: (list = "*") => {
      if (op === "select") columns = list;
      return builder;
    },
    insert: (next: unknown) => {
      op = "insert";
      body = next;
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
    then: (onDone: (result: MockResult) => unknown, onFail?: (reason: unknown) => unknown) => send().then(onDone, onFail),
  };
  return builder;
}

const mockClient = {
  from: (table: string) => mockTable(table),
  storage: {
    from: () => ({
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
      remove: (paths: string[]) =>
        mockSend("remove", undefined, (session) => {
          const removed = paths.filter((path) => path.startsWith(`${session}/`) && mockServer.objects.delete(path));
          return { data: removed.map((name) => ({ name })), error: null };
        }),
    }),
  },
};

jest.mock("../../lib/supabase/client", () => ({ getSupabaseClient: () => mockClient }));

import { __resetAccountLocalDeletionFencesForTests } from "../../lib/account/local-deletion-fence";
import {
  __resetAccountEpochForTests,
  beginAccountOwnerTransition,
  clearAccountTransition,
  currentAccountEpoch,
  noteResolvedOwner,
  subscribeAccountTransition,
} from "../../lib/auth/account-epoch";
import { chatAutosaveAllowed } from "../../lib/chat/autosave";
import {
  __resetAutosaveConsentForTests,
  autosaveConsentFor,
  beginAutosaveConsentRead,
  finishAutosaveConsentRead,
  subscribeAutosaveConsent,
} from "../../lib/chat/autosave-consent";
import * as runner from "../../lib/chat/autosave-runner";
import {
  __resetAutosaveUndoQueueForTests,
  autosaveUndoStorageKey,
  forgetAutosaveUndo,
  rememberAutosaveUndo,
} from "../../lib/chat/autosave-undo-queue";
import {
  CHAT_KEEP_TAG,
  composeExchangeBody,
  exchangeMarkdown,
  exchangeTopic,
  findPrompt,
  findPromptIndex,
  isKeepable,
  type KeepableTurn,
} from "../../lib/chat/keep-exchange";
import { subscribePrivacyPrefsSaved } from "../../lib/privacy/pref-changes";
import { nextPrivacyPrefs, type PrivacyPrefs } from "../../lib/privacy/prefs";
import { classifyInput } from "../../lib/safety/classifier";
import { readPrivacyPrefs, savePrivacyPref } from "../../lib/supabase/privacy";
import { captureFromMarkdown, type CaptureInput, type CaptureResult } from "../../lib/wiki/capture";

// ── 실제 선언 떼어내기 ─────────────────────────────────────────────────────────────

const SECONDB_FILE = resolve(__dirname, "../secondb.tsx");
const PRIVACY_FILE = resolve(__dirname, "../../screens/deepspace/DeepSpaceDesignScreens.tsx");
const DETAIL_FILE = resolve(__dirname, "../../screens/deepspace/dds-record-detail-screen.tsx");

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** root 아래에서 조건에 맞는 첫 노드. */
function firstNode(root: ts.Node, match: (node: ts.Node) => boolean, what: string): ts.Node {
  const found: { node?: ts.Node } = {};
  const visit = (node: ts.Node): void => {
    if (found.node) return;
    if (match(node)) found.node = node;
    else ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  if (!found.node) throw new Error(`${what} 를 찾지 못했다`);
  return found.node;
}

const functionNamed = (name: string) => (node: ts.Node): boolean => ts.isFunctionDeclaration(node) && node.name?.text === name;

function compile(source: string, tail = ""): string {
  return ts.transpileModule(`${source}\n${tail}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

function run<T>(js: string, bindings: Record<string, unknown>): T {
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as T;
}

const CHAT_AST = parse(SECONDB_FILE);
const text = (node: ts.Node): string => node.getText(CHAT_AST);

function effectNode(marker: string): ts.Node {
  return firstNode(
    CHAT_AST,
    (node) =>
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect" && text(node).includes(marker),
    `${marker} 를 품은 useEffect`,
  );
}

const LOAD_EFFECT = text(effectNode("beginAutosaveConsentRead("));

/**
 * 화면의 useFocusRefetch 부름 문장들, 파일에 적힌 순서대로. Stack 에 남은 화면에 초점이 돌아올 때(설정 · 위키에서 뒤로) 도는
 * 것들이다. 예전 하네스는 그 자리를 "prefsReadKey 올리기" 로 바꿔 두어, 화면이 초점 복귀에 무엇을 거는지 볼 수 없었다
 * (3차 재게이트 G2Z-1814-3 - 초점 복귀에 비우기가 없었다).
 */
function focusHookTexts(): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "useFocusRefetch"
    ) {
      found.push(text(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(CHAT_AST);
  if (found.length === 0) throw new Error("useFocusRefetch 부름을 찾지 못했다");
  return found;
}

function declarationText(name: string): string {
  return text(
    firstNode(
      CHAT_AST,
      (node) =>
        ts.isVariableStatement(node) &&
        node.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name),
      `${name} 선언`,
    ),
  );
}

/** 담기 칩(onPress 가 keepExchange 를 부르는 Pressable)의 속성 묶음. */
function keepChipAttributes(): ts.JsxAttributes {
  const onPress = firstNode(
    CHAT_AST,
    (node) => ts.isJsxAttribute(node) && node.name.getText(CHAT_AST) === "onPress" && (node.initializer?.getText(CHAT_AST) ?? "").includes("keepExchange("),
    "담기 칩의 onPress",
  );
  return onPress.parent as ts.JsxAttributes;
}

function attributeExpression(attributes: ts.JsxAttributes, name: string, source: ts.SourceFile): string {
  const attribute = attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(source) === name,
  );
  const initializer = attribute?.initializer;
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) throw new Error(`${name} 식을 찾지 못했다`);
  return initializer.expression.getText(source);
}

/** 담기 칩 안 문구 식. 화면이 그리는 식 그대로를 계산한다. */
function keepChipLabelText(): string {
  const element = keepChipAttributes().parent.parent;
  const label = firstNode(
    element,
    (node) => ts.isJsxExpression(node) && ts.isJsxElement(node.parent) && text(node).includes('t("keepToWiki")'),
    "담기 칩의 문구 식",
  ) as ts.JsxExpression;
  if (!label.expression) throw new Error("담기 칩의 문구 식이 비어 있다");
  return text(label.expression);
}

/** handleSend 가 질문 턴을 목록에 넣기 직전에 동의 세대를 적는 문장(과 그 세대를 읽는 문장). */
function recordAskedText(): string {
  const record = firstNode(
    CHAT_AST,
    (node) => ts.isIfStatement(node) && text(node).includes("autosaveAskedRef.current.set("),
    "질문 턴에 자동 담기 자격을 적는 문장",
  ) as ts.IfStatement;
  if (!ts.isBlock(record.parent)) throw new Error("질문 턴에 자격을 적는 문장이 블록 안에 있지 않다");
  const statements = record.parent.statements;
  const before = statements.slice(0, statements.indexOf(record)).filter((statement) => text(statement).includes("autosaveConsentFor("));
  return [...before, record].map(text).join("\n");
}

const CHAT = {
  consent: compile(declarationText("autosaveConsent"), "return autosaveConsent;"),
  functions: compile(
    ["exchangeAt", "keepExchange", "startNewConversation"]
      .map((name) => text(firstNode(CHAT_AST, functionNamed(name), `${name} 선언`)))
      .join("\n"),
    "return { exchangeAt, keepExchange, startNewConversation };",
  ),
  module: compile(
    ["subscribeChatAutosaveConsent", "autosaveIsKeeping", "keepCrisisHotline"]
      .map((name) => text(firstNode(CHAT_AST, functionNamed(name), `${name} 선언`)))
      .join("\n"),
    "return { subscribeChatAutosaveConsent, autosaveIsKeeping, keepCrisisHotline };",
  ),
  // effect 는 파일에 적힌 순서대로 돈다(React 가 같은 커밋에서 선언 순서대로 부른다).
  effects: [
    { slot: "load", marker: "beginAutosaveConsentRead(" },
    { slot: "saved", marker: "subscribePrivacyPrefsSaved(" },
    { slot: "jobs", marker: "subscribeAutosaveJobs(" },
    { slot: "autosave", marker: "startAutosaveJob(" },
    { slot: "drain", marker: "drainAutosaveUndoQueue(" },
  ]
    .map(({ slot, marker }) => ({ slot, node: effectNode(marker) }))
    .sort((a, b) => a.node.getStart(CHAT_AST) - b.node.getStart(CHAT_AST))
    .map(({ slot, node }) => ({ slot, js: compile(text(node)) })),
  focusHooks: focusHookTexts().map((statement) => compile(statement)),
  keepChipDisabled: compile(`return (${attributeExpression(keepChipAttributes(), "disabled", CHAT_AST)});`),
  keepChipLabel: compile(`return (${keepChipLabelText()});`),
  recordAsked: compile(recordAskedText()),
};

const MODULE = run<{
  subscribeChatAutosaveConsent: (onChange: () => void) => () => void;
  autosaveIsKeeping: (turn: KeepableTurn) => boolean;
  keepCrisisHotline: (body: string, locale: "en" | "ko", isMinor: boolean | null) => string | null;
}>(CHAT.module, {
  subscribeAutosaveConsent,
  subscribeAccountTransition,
  autosaveTurnPhase: (turn: KeepableTurn) => runner.autosaveTurnPhase(turn),
  classifyInput,
});

const PRIVACY_AST = parse(PRIVACY_FILE);
const PRIVACY_SCREEN = firstNode(PRIVACY_AST, functionNamed("DeepSpacePrivacyDesignScreen"), "DeepSpacePrivacyDesignScreen 선언");
const TOGGLE = compile(
  firstNode(PRIVACY_SCREEN, functionNamed("toggleChatAutosave"), "toggleChatAutosave 선언").getText(PRIVACY_AST),
  "return toggleChatAutosave;",
);

// ── 유지된 대화 화면 ──────────────────────────────────────────────────────────────

type Turn = { role: "user" | "secondb"; text: string; synthetic?: boolean };

interface ChatState {
  turns: Turn[];
  keptTurns: ReadonlySet<Turn>;
  keepingTurns: ReadonlySet<Turn>;
  keepNotice: { turn: Turn; ok: boolean } | null;
  keepCrisis: { visible: boolean; hotline: string };
  adsConsent: boolean | null;
  prefsReadKey: number;
  autosaveRender: number;
}

const OWNER = "user-a";
const OTHER = "user-b";

/** 요청 · 알림 · 기기 기록 쓰기가 다 돌 만큼 이벤트 루프를 돌린다. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((done) => setImmediate(done));
};

/** 테스트가 시작한 작업 · 손 담기 · 비우기와 붙잡은 요청. 테스트가 끝나면 다 풀고 끝까지 기다린다 - 다음 테스트로 새지 않게. */
const started: Promise<unknown>[] = [];
const openHolds: (() => void)[] = [];

class FakeAppState {
  private readonly listeners = new Set<(state: string) => void>();
  readonly addEventListener = (_type: string, listener: (state: string) => void): { remove: () => void } => {
    this.listeners.add(listener);
    return { remove: () => void this.listeners.delete(listener) };
  };
  emit(state: string): void {
    for (const listener of [...this.listeners]) listener(state);
  }
}

type ChatFunctions = {
  exchangeAt: (list: readonly Turn[], index: number) => { body: string; rawMd: string };
  keepExchange: (index: number) => Promise<boolean>;
  startNewConversation: () => void;
};

/**
 * 한 번 마운트돼 Stack 에 남는 대화 화면. 상태가 바뀌면 React 처럼 본문을 다시 돌리고, 의존성 배열이 바뀐 effect 만
 * 선언 순서대로 다시 돌린다(이전 정리 함수를 먼저 부른다). useSyncExternalStore 는 커밋 뒤에 구독하고, 알림이 오면
 * 스냅숏이 달라졌을 때만 다시 그린다.
 */
class KeptChatScreen {
  readonly s: ChatState = {
    turns: [],
    keptTurns: new Set(),
    keepingTurns: new Set(),
    keepNotice: null,
    keepCrisis: { visible: false, hotline: "GLOBAL_988" },
    adsConsent: null,
    prefsReadKey: 0,
    autosaveRender: 0,
  };
  /** 지금 그려진 동의(useSyncExternalStore 가 돌려준 값). */
  autosaveConsent: boolean | null = null;
  readonly announced: string[] = [];
  readonly warnings: string[] = [];
  /** 화면이 실행기에 넘긴 요청(시작 여부와 무관하게). */
  readonly handoffs: runner.AutosaveRequest[] = [];
  /** 화면이 부른 실행기 함수 이름, 부른 순서대로. */
  readonly runnerCalls: string[] = [];
  readonly appState = new FakeAppState();
  readonly userId = OWNER;
  private readonly t = (key: string): string => key;
  private readonly idToReply = new Map<string, Turn>();
  /** 손으로 누른 답변을 그 짝의 본문으로 찾는다. 손 담기의 capture 는 누른 순간이 아니라 계정의 줄이 빌 때 돈다. */
  private readonly manualByRawMd = new Map<string, Turn>();
  private readonly refs = {
    autosaveAskedRef: { current: new WeakMap<object, number>() },
    autosaveBodiesRef: { current: new WeakMap<object, string>() },
    prefsRevisionRef: { current: 0 },
    drainUndoRef: { current: null as (() => void) | null },
  };
  /** 화면이 useFocusRefetch 에 건 콜백(부름 자리마다 마지막으로 그린 것). 실제 훅처럼 첫 초점은 부르지 않는다 - focus() 가 돌아옴이다. */
  private readonly focusHooks = new Map<number, { refetch: () => void; enabled: boolean }>();
  private readonly runnerBindings: Record<string, unknown>;
  private readonly effects = new Map<string, { deps: readonly unknown[]; cleanup?: () => void }>();
  private readonly consent = { getSnapshot: (): boolean | null => null, rendered: null as boolean | null, stop: null as (() => void) | null };
  private fns: ChatFunctions | null = null;
  private dirty = true;
  private rendering = false;
  private unmounted = false;

  constructor(private readonly options: { isMinor?: boolean } = {}) {
    this.runnerBindings = this.wrapRunner();
    this.flush();
  }

  /** 실행기 모듈 전체를 바인딩한다(부른 이름을 적는다). 시작한 작업은 그 답변과 짝지어 둔다. */
  private wrapRunner(): Record<string, unknown> {
    const bindings: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(runner)) {
      if (typeof value !== "function") continue;
      bindings[name] = (...args: unknown[]) => {
        this.runnerCalls.push(name);
        return (value as (...params: unknown[]) => unknown)(...args);
      };
    }
    bindings.startAutosaveJob = (request: runner.AutosaveRequest) => {
      this.runnerCalls.push("startAutosaveJob");
      this.handoffs.push(request);
      const handle = runner.startAutosaveJob(request);
      if (handle) {
        this.idToReply.set(handle.sourceId, request.reply as Turn);
        started.push(handle.settled);
      }
      return handle;
    };
    bindings.drainAutosaveUndoQueue = (ownerId: string) => {
      this.runnerCalls.push("drainAutosaveUndoQueue");
      const draining = runner.drainAutosaveUndoQueue(ownerId);
      started.push(draining);
      return draining;
    };
    return bindings;
  }

  private update(patch: Partial<ChatState>): void {
    if (this.unmounted) return; // 내려간 화면의 setState 는 아무 일도 하지 않는다
    const state = this.s as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.is(state[key], value)) {
        state[key] = value;
        this.dirty = true;
      }
    }
    if (this.dirty && !this.rendering) queueMicrotask(() => this.flush());
  }

  private setter<K extends keyof ChatState>(key: K) {
    return (value: ChatState[K] | ((prev: ChatState[K]) => ChatState[K])): void => {
      const next = typeof value === "function" ? (value as (prev: ChatState[K]) => ChatState[K])(this.s[key]) : value;
      this.update({ [key]: next } as Partial<ChatState>);
    };
  }

  private flush(): void {
    let renders = 0;
    while (this.dirty && !this.unmounted) {
      if ((renders += 1) > 50) throw new Error("render loop");
      this.dirty = false;
      this.render();
    }
  }

  private checkConsent(): void {
    if (this.unmounted || Object.is(this.consent.getSnapshot(), this.consent.rendered)) return;
    this.dirty = true;
    if (!this.rendering) queueMicrotask(() => this.flush());
  }

  private render(): void {
    const pending: (() => void)[] = [];
    this.rendering = true;
    try {
      const s = this.s;
      const useSyncExternalStore = (subscribe: (onChange: () => void) => () => void, getSnapshot: () => boolean | null) => {
        this.consent.getSnapshot = getSnapshot;
        if (!this.consent.stop) {
          pending.push(() => {
            this.consent.stop = subscribe(() => this.checkConsent());
            this.checkConsent();
          });
        }
        const value = getSnapshot();
        this.consent.rendered = value;
        return value;
      };
      this.autosaveConsent = run<boolean | null>(CHAT.consent, {
        useSyncExternalStore,
        subscribeChatAutosaveConsent: MODULE.subscribeChatAutosaveConsent,
        autosaveConsentFor,
        userId: this.userId,
      });
      const effectAt = (slot: string) => (effect: () => void | (() => void), deps: readonly unknown[]) => {
        const previous = this.effects.get(slot);
        const changed = !previous || previous.deps.length !== deps.length || deps.some((dep, i) => !Object.is(dep, previous.deps[i]));
        if (!changed) return;
        pending.push(() => {
          previous?.cleanup?.();
          const cleanup = effect();
          this.effects.set(slot, { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined });
        });
      };
      const bindings: Record<string, unknown> = {
        ...this.runnerBindings,
        ...this.refs,
        userId: this.userId,
        turns: s.turns,
        keptTurns: s.keptTurns,
        keepingTurns: s.keepingTurns,
        prefsReadKey: s.prefsReadKey,
        autosaveConsent: this.autosaveConsent,
        setTurns: this.setter("turns"),
        setKeptTurns: this.setter("keptTurns"),
        setKeepingTurns: this.setter("keepingTurns"),
        setKeepNotice: this.setter("keepNotice"),
        setKeepCrisis: this.setter("keepCrisis"),
        setAdsConsent: this.setter("adsConsent"),
        setAutosaveRender: this.setter("autosaveRender"),
        setPrefsReadKey: this.setter("prefsReadKey"),
        readPrivacyPrefs,
        subscribePrivacyPrefsSaved,
        autosaveConsentFor,
        beginAutosaveConsentRead,
        finishAutosaveConsentRead,
        chatAutosaveAllowed,
        isKeepable,
        findPrompt,
        findPromptIndex,
        composeExchangeBody,
        exchangeMarkdown,
        exchangeTopic,
        CHAT_KEEP_TAG,
        captureFromMarkdown: (input: CaptureInput) => this.capture(input),
        forgetAutosaveUndo,
        keepCrisisHotline: MODULE.keepCrisisHotline,
        AccessibilityInfo: { announceForAccessibility: (message: string) => void this.announced.push(message) },
        AppState: this.appState,
        console: { warn: (...args: unknown[]) => void this.warnings.push(args.map(String).join(" ")) },
        t: this.t,
        locale: "ko",
        isMinor: this.options.isMinor ?? false,
        isCharacterChat: false,
        persona: { name: { ko: "세컨비", en: "SecondB" } },
      };
      this.fns = run<ChatFunctions>(CHAT.functions, bindings);
      for (const { slot, js } of CHAT.effects) run(js, { ...bindings, ...this.fns, useEffect: effectAt(slot) });
      CHAT.focusHooks.forEach((js, slot) => {
        const useFocusRefetch = (refetch: () => void, enabled = true): void => {
          this.focusHooks.set(slot, { refetch, enabled });
        };
        run(js, { ...bindings, useFocusRefetch });
      });
    } finally {
      this.rendering = false;
    }
    for (const fire of pending) fire();
  }

  /** 손 담기의 capture 자리. 실제 capture 를 돌리고, 돌려받은 행을 누른 답변과 짝지어 둔다. */
  private async capture(input: CaptureInput): Promise<CaptureResult> {
    const reply = this.manualByRawMd.get(input.rawMd);
    const result = await captureFromMarkdown(input);
    if (reply) this.idToReply.set(String(result.source.id), reply);
    return result;
  }

  /** 질문을 보낸다(답변은 아직). 돌려주는 것은 질문 턴이다. */
  async ask(question: string): Promise<Turn> {
    const turn: Turn = { role: "user", text: question };
    // 화면의 handleSend 가 질문 턴을 목록에 넣기 직전에 도는 문장 그대로다.
    run(CHAT.recordAsked, { ...this.refs, autosaveConsentFor, userId: this.userId, question: turn });
    this.update({ turns: [...this.s.turns, turn] });
    await settle();
    return turn;
  }

  /** 기다리던 답변이 도착한다. 돌려주는 것은 답변 턴이다. */
  async answer(reply: string): Promise<Turn> {
    const turn: Turn = { role: "secondb", text: reply };
    this.update({ turns: [...this.s.turns, turn] });
    await settle();
    return turn;
  }

  /** 질문 하나와 답변 하나가 오간다. 돌려주는 것은 답변 턴이다. */
  async exchange(question: string, reply: string): Promise<Turn> {
    await this.ask(question);
    return this.answer(reply);
  }

  /** 설정 · 위키 화면에서 뒤로 돌아온다. Stack 에 남은 이 화면에 초점만 돌아온다 - 화면이 useFocusRefetch 에 건 콜백을 그대로 부른다. */
  async focus(): Promise<void> {
    for (const { refetch, enabled } of [...this.focusHooks.values()]) if (enabled) refetch();
    await settle();
  }

  /** "새 대화" 버튼 - 화면의 startNewConversation 을 그대로 부른다. 그 안에서 부른 실행기 함수 이름을 돌려준다. */
  async newConversation(): Promise<string[]> {
    const before = this.runnerCalls.length;
    this.fns?.startNewConversation();
    const called = this.runnerCalls.slice(before);
    await settle();
    return called;
  }

  /** 담기 칩을 손으로 누르고 끝까지 기다린다. */
  async keepByHand(index: number): Promise<boolean> {
    const kept = await this.startKeepByHand(index);
    await settle();
    return kept;
  }

  /** 담기 칩을 손으로 누른다(기다리지 않는다). */
  startKeepByHand(index: number): Promise<boolean> {
    if (!this.fns) throw new Error("화면이 그려지지 않았다");
    const reply = this.s.turns[index];
    if (reply) this.manualByRawMd.set(this.fns.exchangeAt(this.s.turns, index).rawMd, reply);
    const keeping = this.fns.keepExchange(index);
    started.push(keeping);
    return keeping;
  }

  /** 화면이 그 자리 답변의 담기 칩을 닫아 그리는가. */
  chipDisabled(index: number): boolean {
    return run<boolean>(CHAT.keepChipDisabled, {
      keepingTurns: this.s.keepingTurns,
      keptTurns: this.s.keptTurns,
      autosaveTurnPhase: runner.autosaveTurnPhase,
      turn: this.s.turns[index],
      i: index,
    });
  }

  /** 그 자리 담기 칩의 문구 키. */
  chipLabel(index: number): string {
    return run<string>(CHAT.keepChipLabel, {
      keepingTurns: this.s.keepingTurns,
      keptTurns: this.s.keptTurns,
      autosaveIsKeeping: MODULE.autosaveIsKeeping,
      t: this.t,
      turn: this.s.turns[index],
    });
  }

  /** 목 서버에 남은 행을 그 행을 만든 답변으로 읽는다. 이 화면이 만들지 않은 행은 id 그대로 나온다. */
  saved(): (Turn | string)[] {
    return mockServer.sources.map((row) => this.idToReply.get(String(row.id)) ?? String(row.id));
  }

  /** 자동 저장에 넘긴 그 답변의 짝 본문. */
  rawMdFor(reply: Turn): string | undefined {
    return this.handoffs.find((request) => request.reply === reply)?.rawMd;
  }

  /** 담기가 실패해 그 답변 옆에 안내가 떠 있는 상태로 둔다. */
  showKeepFailure(turn: Turn): void {
    this.update({ keepNotice: { turn, ok: false } });
  }

  unmount(): void {
    for (const effect of this.effects.values()) effect.cleanup?.();
    this.effects.clear();
    this.consent.stop?.();
    this.consent.stop = null;
    this.unmounted = true;
  }
}

// ── 배송 /privacy 화면 ───────────────────────────────────────────────────────────

async function openPrivacy() {
  const read = await readPrivacyPrefs(OWNER);
  if (!read.ok) throw new Error("fixture: privacy read failed");
  const shown = { chatSaveOn: [] as unknown[], chatSaveError: [] as unknown[], busy: [] as unknown[] };
  const prefsRef: { current: PrivacyPrefs | null } = { current: read.prefs };
  const toggle = run<(next: boolean) => Promise<void>>(TOGGLE, {
    userId: OWNER,
    busy: false,
    ko: true,
    prefsRef,
    prefsUserRef: { current: OWNER },
    minorRef: { current: false },
    privacyMountedRef: { current: true },
    activeUserRef: { current: OWNER },
    nextPrivacyPrefs,
    savePrivacyPref,
    setChatSaveError: (value: unknown) => shown.chatSaveError.push(value),
    setBusy: (value: unknown) => shown.busy.push(value),
    setChatSaveOn: (value: unknown) => shown.chatSaveOn.push(value),
  });
  return { toggle, shown, prefsRef };
}

// ── 시나리오 ────────────────────────────────────────────────────────────────────

const mounted: KeptChatScreen[] = [];
async function mountChat(options?: { isMinor?: boolean }): Promise<KeptChatScreen> {
  const chat = new KeptChatScreen(options);
  mounted.push(chat);
  await settle();
  return chat;
}

const localValues = new Map<string, string>();
beforeAll(() => {
  // 되돌리기 대기 기록은 웹 경로(localStorage)로 쓰인다. 테스트가 그 바이트를 읽는다.
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => localValues.get(key) ?? null,
    setItem: (key: string, value: string) => void localValues.set(key, String(value)),
    removeItem: (key: string) => void localValues.delete(key),
  };
});
afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

beforeEach(() => {
  // 실제 계정 경계(lib/auth/account-epoch)를 쓴다. AuthContext 가 공개하기 직전에 부르는 것과 같은 호출이다.
  __resetAccountEpochForTests();
  __resetAutosaveConsentForTests();
  runner.__resetAutosaveRunnerForTests();
  __resetAutosaveUndoQueueForTests();
  __resetAccountLocalDeletionFencesForTests();
  localValues.clear();
  noteResolvedOwner(OWNER);
  mockServer.prefs = new Map();
  mockServer.sources = [];
  mockServer.ingestLog = [];
  mockServer.wikiPages = [];
  mockServer.objects = new Map();
  mockServer.ledger = [];
  mockServer.session = OWNER;
  mockServer.arrived = [];
  mockServer.holds = new Map();
  mockServer.serverError = new Map();
});

afterEach(async () => {
  for (const restore of restoreAfterTest.splice(0)) restore();
  for (const release of openHolds.splice(0)) release();
  await Promise.all(started.splice(0));
  await settle();
  while (mounted.length > 0) mounted.pop()?.unmount();
});

/** 다음 요청 하나를 붙잡는다. reached 는 그 요청이 서버에 닿으면 풀린다. 읽기는 요청한 순간의 값으로 늦게 응답한다. */
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
  openHolds.push(() => open());
  return { reached: reachedPromise, release: () => open() };
}

const count = (label: Label): number => mockServer.arrived.filter((request) => request.label === label).length;

/** 읽기 실패 시나리오는 privacy.ts 의 경고를 일부러 부른다. 그 경고만 로그에서 뺀다. */
const restoreAfterTest: (() => void)[] = [];
function silenceReadFailureWarning(): void {
  const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  restoreAfterTest.push(() => spy.mockRestore());
}
const storedChatAutosave = (): unknown => mockServer.prefs.get(OWNER)?.chat_autosave;

describe("유지된 대화 화면 왕복 (r3as H1)", () => {
  test("켜짐 -> 설정에서 끔 -> 돌아옴: 끈 뒤의 답변은 하나도 담지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const first = await chat.exchange("오늘 어땠지?", "켜져 있을 때의 답변");
    expect(chat.saved()).toEqual([first]); // 대조군: 켜져 있으면 담는다

    const privacy = await openPrivacy(); // 대화 화면은 Stack 에 남아 있다
    await privacy.toggle(false);
    expect(storedChatAutosave()).toBe(false);
    expect(mockServer.ledger).toEqual([{ user_id: OWNER, pref_key: "chat_autosave", event_type: "revoke" }]);

    await chat.exchange("설정 화면에 있는 동안 도착한 질문", "숨겨진 화면이 받은 답변");
    await chat.focus();
    await chat.exchange("돌아와서 한 질문", "돌아온 뒤의 답변");

    expect(chat.saved()).toEqual([first]);
    expect(chat.autosaveConsent).toBe(false);
  });

  test("꺼짐 -> 설정에서 켬 -> 돌아옴: 켠 뒤에 도착한 답변만 담는다(화면에 있던 과거 턴 0)", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    await chat.exchange("켜기 전에 한 말", "켜기 전의 답변");
    expect(chat.saved()).toEqual([]);

    const privacy = await openPrivacy();
    await privacy.toggle(true);
    await settle();
    expect(chat.autosaveConsent).toBe(true);
    expect(chat.saved()).toEqual([]); // 소급 저장 없음

    await chat.focus();
    expect(chat.saved()).toEqual([]);
    const after = await chat.exchange("켠 뒤의 질문", "켠 뒤의 답변");
    expect(chat.saved()).toEqual([after]);
  });

  test("새 대화로 목록을 비워도, 켠 뒤의 답변은 같은 자리에서 담긴다", async () => {
    // 경계를 인덱스로 기억하면 비운 뒤 같은 인덱스에 온 새 답변을 과거 턴으로 착각한다.
    mockServer.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    await chat.exchange("켜기 전", "켜기 전의 답변"); // 인덱스 1
    await (await openPrivacy()).toggle(true);
    await chat.newConversation();
    const fresh = await chat.exchange("새 대화", "새 대화의 답변"); // 다시 인덱스 1
    expect(chat.saved()).toEqual([fresh]);
  });

  test("다른 기기에서 끈 동의: 소식도 돌아옴도 없이 도착한 답변을 담기 직전 확인이 막는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    mockServer.prefs.set(OWNER, { chat_autosave: false }); // 이 앱 밖에서 철회
    await chat.exchange("질문", "철회 뒤의 답변");
    expect(chat.saved()).toEqual([]);
    expect(chat.autosaveConsent).toBe(false); // 확인한 사실을 화면에도 반영한다
  });

  test("담기 직전 확인을 못 읽으면 담지 않고, 다음 답변에서 다시 확인한다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    silenceReadFailureWarning();
    mockServer.serverError.set("prefsRead", 1);
    await chat.exchange("질문", "확인하지 못한 답변");
    expect(chat.saved()).toEqual([]);
    expect(chat.autosaveConsent).toBe(true); // 한 번 못 읽었다고 동의를 끈 것으로 치지 않는다
    expect(chat.announced).toEqual([]); // 담지 않은 것은 실패가 아니다
    const next = await chat.exchange("다음 질문", "확인된 답변");
    expect(chat.saved()).toEqual([next]);
  });

  // 옛 이름: "설정 저장이 실패하면 스위치도 대화 화면도 바뀌지 않는다". PR 1814 C2 부터 끄기는 누른 순간 반영되고,
  // 저장이 실패하면 커밋됐는지 모르므로 대화 화면은 모름이다(설계 2-12 의 1). 스위치 쪽 기대는 그대로다.
  test("설정 저장이 실패하면 스위치는 그대로이고, 대화 화면은 모름으로 두었다가 다시 읽은 뒤에 담는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const privacy = await openPrivacy();
    mockServer.serverError.set("prefsUpdate", 1);
    await privacy.toggle(false);

    expect(privacy.shown.chatSaveOn).toEqual([]);
    expect(privacy.shown.chatSaveError.at(-1)).toBe(true);
    expect(privacy.prefsRef.current?.chat_autosave).toBe(true);
    expect(mockServer.ledger).toEqual([]);
    expect(chat.autosaveConsent).toBeNull();
    await chat.exchange("질문", "모를 때의 답변");
    expect(chat.saved()).toEqual([]);

    await chat.focus(); // 다음 읽기가 서버의 켜짐으로 채운다
    expect(chat.autosaveConsent).toBe(true);
    const reply = await chat.exchange("다시 한 질문", "다시 읽은 뒤의 답변");
    expect(chat.saved()).toEqual([reply]);
  });

  // 옛 이름: "설정 저장이 끝나기 전에는 스위치를 먼저 바꾸지 않는다". 스위치 쪽 기대는 그대로이고, 대화 화면은 PR 1814
  // C2 부터 끄기 의도를 저장 왕복보다 먼저 받는다(설계 N2).
  test("설정 저장이 끝나기 전에는 스위치를 먼저 바꾸지 않고, 대화 화면은 누른 순간부터 꺼짐이다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const privacy = await openPrivacy();
    const update = hold("prefsUpdate");
    const saving = privacy.toggle(false);
    await settle();
    expect(privacy.shown.busy).toEqual([true]);
    expect(privacy.shown.chatSaveOn).toEqual([]);
    expect(chat.autosaveConsent).toBe(false);
    await chat.exchange("저장이 왕복 중일 때의 질문", "저장이 왕복 중일 때의 답변");
    expect(chat.handoffs).toEqual([]);

    update.release();
    await saving;
    await settle();
    expect(privacy.shown.chatSaveOn).toEqual([false]);
    expect(chat.autosaveConsent).toBe(false);
    expect(chat.saved()).toEqual([]);
  });
});

describe("담기 표시는 인덱스가 아니라 턴에 붙는다 (r3as2 R3AS2-02)", () => {
  // 게이트가 잡은 것: 자동 담기의 한 번 가드와 담긴 표시가 인덱스를 기억했다. "새 대화" 는 목록만 비워서, 다음 대화의
  // 같은 인덱스 답변을 자동 경로는 서버를 읽기도 전에 건너뛰고 수동 칩은 이미 담긴 것으로 닫았다. 담기 직전 확인을
  // 못 읽은 답변은 표시가 남아 다시 확인되지 않았다.
  test("이미 담긴 대화 뒤 새 대화의 같은 자리 답변도 담긴다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const first = await chat.exchange("첫 대화", "첫 대화의 답변"); // 인덱스 1
    expect(chat.saved()).toEqual([first]);

    await chat.newConversation();
    const second = await chat.exchange("새 대화", "새 대화의 답변"); // 다시 인덱스 1
    expect(chat.saved()).toEqual([first, second]);
  });

  test("손으로 담은 대화 뒤 새 대화의 같은 자리 답변은 담기 칩이 열려 있다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    const first = await chat.exchange("첫 대화", "첫 대화의 답변");
    expect(await chat.keepByHand(1)).toBe(true);
    expect(chat.saved()).toEqual([first]);
    expect(chat.chipDisabled(1)).toBe(true); // 대조군: 담긴 답변의 칩은 닫힌다

    await chat.newConversation();
    await chat.exchange("새 대화", "새 대화의 답변");
    expect(chat.chipDisabled(1)).toBe(false);
  });

  test("새 대화는 담기 실패 안내도 함께 지운다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    const reply = await chat.exchange("질문", "담기에 실패한 답변");
    chat.showKeepFailure(reply);
    await settle();

    await chat.newConversation();
    expect(chat.s.keepNotice).toBeNull();
    expect(chat.s.turns).toEqual([]);
  });

  test("담기 직전 확인을 못 읽은 답변은 돌아왔을 때 다시 확인해 담는다 - 그 전에 스스로 다시 읽지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    silenceReadFailureWarning();
    mockServer.serverError.set("prefsRead", 1);
    const readsBefore = count("prefsRead");
    const reply = await chat.exchange("질문", "확인하지 못한 답변");
    for (let i = 0; i < 5; i += 1) await settle();
    expect(chat.saved()).toEqual([]);
    expect(count("prefsRead") - readsBefore).toBe(1); // 실패한 확인 한 번뿐이다

    await chat.focus();
    expect(chat.saved()).toEqual([reply]);
  });
});

describe("담기 직전 확인이 돌아오기 전에 동의 · 계정 · 대화가 바뀌면 (r3as2 R3AS2-01)", () => {
  // 게이트가 잡은 순서: 답변이 오고 담기 직전 확인 읽기가 나간다(그때의 켜짐을 읽는다). 응답이 오기 전에 같은 앱의
  // 설정에서 끈다. 늦게 온 켜짐 응답이 지금의 동의 · 동의 세대 · 계정 · 턴을 다시 보지 않고 담았다. 여기서는 그 읽기를
  // 실제로 붙잡아 둔 채 실제 savePrivacyPref 로 끄고(저장 소식까지 실제) 나서 푼다.
  test("확인 중에 같은 앱에서 끄면, 늦게 온 켜짐 응답으로 담지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const check = hold("prefsRead");
    await chat.exchange("질문", "확인 중에 철회된 답변");
    await check.reached;
    expect(chat.saved()).toEqual([]); // 확인이 아직 돌아오지 않았다

    await savePrivacyPref(OWNER, "chat_autosave", false);
    expect(chat.autosaveConsent).toBe(false);
    check.release();
    await settle();
    expect(chat.saved()).toEqual([]);
    expect({ upload: count("upload"), insert: count("insert"), notice: chat.s.keepNotice }).toEqual({ upload: 0, insert: 0, notice: null });
  });

  test("확인 중에 끄고 다시 켜도, 끄기 전에 나간 확인으로는 담지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const check = hold("prefsRead");
    await chat.exchange("질문", "끄고 다시 켜는 사이의 답변");
    await savePrivacyPref(OWNER, "chat_autosave", false);
    await settle();
    await savePrivacyPref(OWNER, "chat_autosave", true);
    await settle();
    expect(chat.autosaveConsent).toBe(true); // 지금 값만 보면 켜져 있다 - 막는 것은 동의 세대다
    expect(mockServer.ledger.map((row) => row.event_type)).toEqual(["revoke", "grant"]);

    check.release();
    await settle();
    expect(chat.saved()).toEqual([]);
  });

  test("확인 중에 계정 전환이 시작되면(장면이 아직 남아 있어도) 담지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const check = hold("prefsRead");
    await chat.exchange("질문", "계정 전환 사이의 답변");
    mockServer.session = OTHER;
    beginAccountOwnerTransition(OTHER);
    check.release();
    await settle();
    expect(chat.saved()).toEqual([]);
  });

  test("확인 중에 다른 계정으로 바뀌어 장면이 다시 만들어지면, 앞 계정의 확인으로 담지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const check = hold("prefsRead");
    await chat.exchange("질문", "앞 계정의 답변");
    mockServer.session = OTHER;
    beginAccountOwnerTransition(OTHER);
    chat.unmount(); // _layout.tsx 의 AccountScope 가 epoch 를 key 로 장면을 다시 만든다
    noteResolvedOwner(OTHER);
    check.release();
    await settle();
    expect(chat.saved()).toEqual([]);
  });

  // 옛 이름: "확인 중에 새 대화로 비우면, 비워진 대화의 답변은 담지 않는다". Simon 결정 D-1 ②(2026-09-16)로 기대가
  // 뒤집혔다: 새 대화는 취소 사유가 아니다. 켠 채 오간 짝은 화면을 비워도 끝까지 저장된다.
  test("확인 중에 새 대화로 비워도, 켠 채 오간 짝은 끝까지 담긴다 (Simon 결정 D-1 ②)", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const check = hold("prefsRead");
    const reply = await chat.exchange("질문", "비워진 대화의 답변");
    await chat.newConversation();
    check.release();
    await settle();
    expect(chat.saved()).toEqual([reply]);
  });

  test("대조군: 확인 중에 아무것도 안 바뀌면 담고, 그 사이 다음 질문을 보내도 담는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const check = hold("prefsRead");
    const reply = await chat.exchange("질문", "확인을 기다린 답변");
    await chat.ask("이어서 보낸 질문");
    check.release();
    await settle();
    expect(chat.saved()).toEqual([reply]);
  });
});

describe("동의를 켜기 전에 보낸 질문의 답변 (r3as2 R2-H1)", () => {
  // 게이트가 잡은 경로: 꺼져 있을 때 질문을 보내고, 답을 기다리는 동안 설정에서 켠다. 늦게 온 답변은 "켜기 전부터
  // 화면에 있던 턴" 이 아니라서 자동으로 담겼는데, 담기는 답변을 앞선 질문과 짝으로 저장한다 - 사라질 거라 생각하고
  // 보낸 질문이 함께 남았다. 그래서 자격을 답변이 아니라 짝으로, 질문을 보낸 순간의 동의로 본다.
  test("꺼진 채 보낸 질문의 답이 켠 뒤에 도착해도 담지 않고, 켠 뒤에 보낸 질문의 답은 담는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    await chat.ask("켜기 전에 보낸 질문");
    await (await openPrivacy()).toggle(true); // 답을 기다리는 동안 설정에서 켠다
    await settle();
    expect(chat.autosaveConsent).toBe(true);
    await chat.answer("켠 뒤에 도착한 답변");
    expect(chat.saved()).toEqual([]);

    const after = await chat.exchange("켠 뒤에 보낸 질문", "켠 뒤의 답변");
    expect(chat.saved()).toEqual([after]);
    const body = chat.rawMdFor(after) ?? "";
    expect(body).toContain("켠 뒤에 보낸 질문");
    expect(body).not.toContain("켜기 전에 보낸 질문");
  });

  test("첫 동의 읽기가 돌아오기 전(모름)에 보낸 질문의 답도 담지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const firstRead = hold("prefsRead"); // 화면이 뜨며 나가는 첫 읽기
    const chat = await mountChat();
    await chat.ask("첫 읽기 전에 보낸 질문");
    firstRead.release();
    await settle();
    expect(chat.autosaveConsent).toBe(true);
    await chat.answer("그 질문의 답변");
    expect(chat.saved()).toEqual([]);
  });

  test("켜진 채 보낸 질문이라도 답을 기다리는 사이 끄고 다시 켰으면 담지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    await chat.ask("켜져 있을 때 보낸 질문");
    await (await openPrivacy()).toggle(false);
    await settle();
    await (await openPrivacy()).toggle(true);
    await settle();
    await chat.answer("끄고 다시 켠 뒤 도착한 답변");
    expect(chat.saved()).toEqual([]);
  });

  test("질문이 새 대화로 비워진 뒤 도착한 답변은 짝이 없어 자동으로 담지 않는다 - 손으로는 담을 수 있다", async () => {
    // D-1 ② 와 다른 경우다: 새 대화를 누를 때 이 답변은 아직 오지 않았고 자동 저장도 시작되지 않았다.
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    await chat.ask("보내고 바로 비운 질문");
    await chat.newConversation();
    const reply = await chat.answer("비운 뒤 도착한 답변");
    expect(chat.saved()).toEqual([]);
    expect(chat.chipDisabled(chat.s.turns.indexOf(reply))).toBe(false);
  });
});

describe("설정 읽기가 실패하거나 늦게 도착하면 (r3as2 R2-M1)", () => {
  // 게이트가 잡은 두 경로. (A) 돌아왔을 때 읽기가 한 번 실패하면, 실패를 전부 꺼짐으로 바꾸는 읽기가 켜 둔 동의를
  // 꺼짐으로 덮었다 - 그 뒤 멀쩡한 답변들은 담기 직전 확인까지 가지도 못했다. (B) 꺼짐을 읽던 돌아옴 읽기가 늦게
  // 도착해, 그 사이 설정에서 켠 저장 소식을 덮었다.
  test("돌아왔을 때 읽기가 한 번 실패해도 켜 둔 동의는 그대로이고, 다음 답변은 담긴다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const first = await chat.exchange("질문", "켜져 있을 때의 답변");
    silenceReadFailureWarning();
    mockServer.serverError.set("prefsRead", 1);
    await chat.focus();
    expect(chat.autosaveConsent).toBe(true); // 못 읽은 것은 꺼짐이 아니다
    const next = await chat.exchange("다음 질문", "읽기 실패 뒤의 답변");
    expect(chat.saved()).toEqual([first, next]);
  });

  test("설정에서 켠 저장 소식 뒤에 늦게 도착한 옛 꺼짐 읽기는 버린다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    const stale = hold("prefsRead");
    await chat.focus(); // 꺼짐을 읽은 돌아옴 읽기가 붙잡혀 있다
    await (await openPrivacy()).toggle(true);
    await settle();
    expect(chat.autosaveConsent).toBe(true);

    stale.release();
    await settle();
    expect(chat.autosaveConsent).toBe(true);
    const reply = await chat.exchange("켠 뒤의 질문", "켠 뒤의 답변");
    expect(chat.saved()).toEqual([reply]);
  });

  test("첫 읽기가 실패하면 모름으로 남아 담지 않고, 돌아와서 읽히면 그 뒤 답변을 담는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    silenceReadFailureWarning();
    mockServer.serverError.set("prefsRead", 1);
    const chat = await mountChat();
    expect(chat.autosaveConsent).toBeNull();
    await chat.exchange("질문", "모를 때의 답변");
    expect(chat.saved()).toEqual([]);

    await chat.focus();
    expect(chat.autosaveConsent).toBe(true);
    const reply = await chat.exchange("다시 한 질문", "읽힌 뒤의 답변");
    expect(chat.saved()).toEqual([reply]);
  });
});

describe("실행기 배선 (PR 1814 재설계 C5)", () => {
  test("짝 자격이 맞을 때만 실행기에 넘긴다: 꺼진 채 보낸 질문 · 짝이 없는 답변 · 그 사이 끄고 다시 켠 질문의 답은 넘기지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    await chat.exchange("꺼져 있을 때의 질문", "꺼져 있을 때의 답변");
    expect(chat.handoffs).toEqual([]);

    await savePrivacyPref(OWNER, "chat_autosave", true);
    await settle();
    const generation = autosaveConsentFor(OWNER).generation;
    const reply = await chat.exchange("켠 뒤의 질문", "켠 뒤의 답변");
    expect(chat.handoffs.map(({ ownerId, reply: handed, askedGeneration }) => ({ ownerId, handed, askedGeneration }))).toEqual([
      { ownerId: OWNER, handed: reply, askedGeneration: generation },
    ]);
    expect(chat.rawMdFor(reply)).toContain("켠 뒤의 질문");

    await chat.ask("보내고 바로 비운 질문");
    await chat.newConversation();
    await chat.answer("짝이 없는 답변");
    await chat.ask("켜진 채 보낸 질문");
    await savePrivacyPref(OWNER, "chat_autosave", false);
    await savePrivacyPref(OWNER, "chat_autosave", true);
    await settle();
    await chat.answer("끄고 다시 켠 뒤의 답변");
    expect(chat.handoffs).toHaveLength(1);
  });

  test("새 대화는 실행기에 아무것도 알리지 않는다 - 행 INSERT 중이던 자동 저장은 끝까지 담긴다 (Simon 결정 D-1 ②)", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const insert = hold("insert");
    const reply = await chat.exchange("질문", "새 대화 직전의 답변");
    await insert.reached;
    expect(chat.chipDisabled(1)).toBe(true);

    const called = await chat.newConversation();
    expect(chat.s.turns).toEqual([]);
    insert.release();
    await settle();

    expect(chat.saved()).toEqual([reply]);
    expect(runner.autosaveTurnPhase(reply)).toBe("kept");
    expect(localValues.get(autosaveUndoStorageKey(OWNER))).toBeUndefined();
    expect(called).toEqual([]); // 새 대화가 부른 실행기 함수는 없다
  });

  test("결과 알림의 계정이 이 화면의 계정이 아니면 담김도 실패도 표시하지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: false });
    mockServer.prefs.set(OTHER, { chat_autosave: true });
    const chat = await mountChat();
    const keptElsewhere = await chat.exchange("질문", "다른 계정의 작업이 담을 답변");
    const failedElsewhere = await chat.exchange("다음 질문", "다른 계정의 작업이 실패할 답변");
    expect(chat.handoffs).toEqual([]); // 이 화면의 동의는 꺼져 있다

    // 화면은 그대로인데 공개된 계정만 바뀐 자리 - 두 번째 울타리를 본다. 실제로는 루트가 장면을 새로 만든다.
    mockServer.session = OTHER;
    noteResolvedOwner(OTHER);
    clearAccountTransition(currentAccountEpoch());
    const read = beginAutosaveConsentRead(OTHER);
    finishAutosaveConsentRead(read, await readPrivacyPrefs(OTHER));
    const askedGeneration = autosaveConsentFor(OTHER).generation;
    const kept = runner.startAutosaveJob({ ownerId: OTHER, reply: keptElsewhere, askedGeneration, rawMd: "kept elsewhere" });
    expect(await kept?.settled).toBe("kept");
    mockServer.serverError.set("insert", 1);
    const failed = runner.startAutosaveJob({ ownerId: OTHER, reply: failedElsewhere, askedGeneration, rawMd: "failed elsewhere" });
    expect(await failed?.settled).toBe("failed");
    await settle();

    expect(chat.s.keptTurns.has(keptElsewhere)).toBe(false);
    expect(chat.chipLabel(chat.s.turns.indexOf(keptElsewhere))).toBe("keepToWiki");
    expect(chat.s.keepNotice).toBeNull();
    expect(chat.announced).toEqual([]);
  });

  test("화면이 내려가도 원문 업로드 중이던 자동 저장은 끝까지 담긴다 - 화면 이탈은 취소가 아니다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const upload = hold("upload");
    const reply = await chat.exchange("질문", "화면을 떠나기 직전의 답변");
    await upload.reached;
    chat.unmount();
    upload.release();
    await settle();

    expect(chat.saved()).toEqual([reply]);
    expect(runner.autosaveTurnPhase(reply)).toBe("kept");
  });

  test("턴별 잠금: 한 답변을 손으로 담는 동안 도착한 다음 답변도 자동으로 담긴다 (설계 N1)", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    const byHand = await chat.exchange("켜기 전의 질문", "손으로 담는 답변");
    const upload = hold("upload");
    const keeping = chat.startKeepByHand(1);
    await upload.reached;
    await settle();
    expect(chat.chipLabel(1)).toBe("keeping");

    await savePrivacyPref(OWNER, "chat_autosave", true);
    await settle();
    const next = await chat.exchange("켠 뒤의 질문", "손 담기 중에 도착한 답변");
    expect(chat.saved()).toEqual([next]); // 손 담기는 아직 원문을 올리는 중이다
    expect({ byHand: chat.chipDisabled(1), next: chat.chipLabel(3) }).toEqual({ byHand: true, next: "keptToWiki" });

    upload.release();
    expect(await keeping).toBe(true);
    await settle();
    expect(chat.saved()).toEqual([next, byHand]);
  });

  test("턴별 잠금: 자동 저장 하나가 원문을 올리는 동안 도착한 다음 답변도 자동으로 담긴다 (설계 N1)", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const upload = hold("upload");
    const first = await chat.exchange("첫 질문", "원문을 올리는 중인 답변");
    await upload.reached;
    await settle();
    expect(chat.chipLabel(1)).toBe("keeping");

    const second = await chat.exchange("둘째 질문", "그 사이 도착한 답변");
    expect(chat.saved()).toEqual([second]);
    upload.release();
    await settle();
    expect(chat.saved()).toEqual([second, first]);
  });

  test("같은 답변을 자동 저장이 쓰는 동안에는 칩이 잠기고, 눌러도 두 번째 capture 가 나가지 않는다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const insert = hold("insert");
    const reply = await chat.exchange("질문", "자동으로 담는 중인 답변");
    await insert.reached;
    await settle();
    expect({ disabled: chat.chipDisabled(1), label: chat.chipLabel(1) }).toEqual({ disabled: true, label: "keeping" });

    const before = { candidates: count("candidates"), upload: count("upload") };
    expect(await chat.keepByHand(1)).toBe(false);
    expect({ candidates: count("candidates"), upload: count("upload") }).toEqual(before);

    insert.release();
    await settle();
    expect(chat.saved()).toEqual([reply]);
    expect(chat.chipLabel(1)).toBe("keptToWiki");
  });

  test("손 담기가 이미 있는 행을 돌려받으면 그 행의 되돌리기 대기 기록을 지운다 (설계 2-10)", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const auto = await chat.exchange("같은 질문", "같은 답변");
    expect(chat.saved()).toEqual([auto]);
    const rowId = String(mockServer.sources[0]?.id);
    // 이 행을 되돌리다 끝내지 못해 대기 기록에 남아 있다고 둔다 - 다음 비우기가 지울 행이다.
    expect(await rememberAutosaveUndo({ ownerId: OWNER, sourceId: rowId })).toBe(true);

    await savePrivacyPref(OWNER, "chat_autosave", false);
    await chat.newConversation();
    await chat.exchange("같은 질문", "같은 답변");
    expect(await chat.keepByHand(1)).toBe(true);

    expect(mockServer.sources.map((row) => row.id)).toEqual([rowId]); // 새 행 없이 있던 행을 돌려받았다
    expect(localValues.get(autosaveUndoStorageKey(OWNER))).toBeUndefined();
  });

  test("비우기가 행을 확인하는 동안 같은 답변을 손으로 다시 담으면, 비우기가 다 지운 뒤에 담아 담긴 대화가 남는다 (게이트 r260919 DA-1814-1 · DZ-1814-3)", async () => {
    // 게이트 재현 순서: 되돌리기가 한 번 실패해 대기 기록이 남은 답변 -> 앱이 앞으로 와 비우기가 행 확인을 보낸다 -> 그 사이
    // 사용자가 담기를 누른다(정확 중복) -> 비우기가 이어서 지운다. 담겼다고 표시한 뒤 행과 원문이 사라지면 안 된다.
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const insert = hold("insert");
    const reply = await chat.exchange("같은 질문", "같은 답변");
    await insert.reached;
    mockServer.serverError.set("remove", 1);
    await savePrivacyPref(OWNER, "chat_autosave", false);
    insert.release();
    await settle();
    const rowId = String(mockServer.sources[0]?.id);
    expect(JSON.parse(localValues.get(autosaveUndoStorageKey(OWNER)) ?? "[]")).toEqual([{ ownerId: OWNER, sourceId: rowId }]);
    expect(chat.chipDisabled(1)).toBe(false); // 되돌리기 대기는 칩을 다시 연다

    const probe = hold("rowCheck");
    chat.appState.emit("active");
    await probe.reached;
    const keeping = chat.startKeepByHand(1);
    await settle();
    probe.release();
    expect(await keeping).toBe(true);
    await settle();

    expect({ saved: chat.saved(), objects: mockServer.objects.size, label: chat.chipLabel(1) }).toEqual({
      saved: [reply],
      objects: 1,
      label: "keptToWiki",
    });
    expect(mockServer.sources.map((row) => row.id)).not.toContain(rowId); // 비우기가 먼저 다 지운 옛 행
    expect(localValues.get(autosaveUndoStorageKey(OWNER))).toBeUndefined();
  });

  test("철회한 저장을 지우지도 기기에 적지도 못하면 그 답변 옆에 아직 삭제하지 못했다고 알리고, 앱으로 돌아와 다 지우면 거둔다 (게이트 r260919 DA-1814-2)", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const insert = hold("insert");
    const reply = await chat.exchange("질문", "지우다 만 답변");
    await insert.reached;
    await savePrivacyPref(OWNER, "chat_autosave", false);
    // 기기 저장소가 쓰기를 거부한다(웹 quota 모양). 원문 삭제도 한 번 실패한다.
    const device = globalThis.localStorage as unknown as { setItem: unknown; removeItem: unknown };
    const { setItem, removeItem } = device;
    const refuse = (): never => {
      throw new Error("QuotaExceededError");
    };
    device.setItem = refuse;
    device.removeItem = refuse;
    const restoreDevice = (): void => {
      device.setItem = setItem;
      device.removeItem = removeItem;
    };
    restoreAfterTest.push(restoreDevice);
    mockServer.serverError.set("remove", 1);
    insert.release();
    await settle();

    expect({ notice: chat.s.keepNotice, announced: chat.announced, saved: chat.saved(), chip: chat.chipDisabled(1) }).toEqual({
      notice: { turn: reply, ok: false, notDeleted: true },
      announced: ["chatSaveNotDeleted"],
      saved: [reply],
      chip: false,
    });
    expect(localValues.get(autosaveUndoStorageKey(OWNER))).toBeUndefined(); // 기기에는 아무것도 없다

    restoreDevice();
    chat.appState.emit("active");
    await settle();
    expect({ notice: chat.s.keepNotice, saved: chat.saved(), objects: mockServer.objects.size }).toEqual({
      notice: null,
      saved: [],
      objects: 0,
    });
  });

  test("되돌리기 대기 기록은 화면이 뜰 때와 앱이 앞으로 올 때 비우고, 도는 동안 겹친 부름은 끝난 뒤 한 번으로 합친다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const firstId = "3f0c9a52-8a1d-4b1e-9c2f-6d7e8f9a0b1c";
    const secondId = "7b1e2d3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
    mockServer.objects.set(`${OWNER}/chat-${firstId}.md`, "left behind");
    expect(await rememberAutosaveUndo({ ownerId: OWNER, sourceId: firstId })).toBe(true);

    const chat = await mountChat();
    const drains = (): number => chat.runnerCalls.filter((name) => name === "drainAutosaveUndoQueue").length;
    expect(drains()).toBe(1);
    expect(mockServer.objects.size).toBe(0);
    expect(localValues.get(autosaveUndoStorageKey(OWNER))).toBeUndefined();

    mockServer.objects.set(`${OWNER}/chat-${secondId}.md`, "left behind");
    expect(await rememberAutosaveUndo({ ownerId: OWNER, sourceId: secondId })).toBe(true);
    chat.appState.emit("background");
    await settle();
    expect({ drains: drains(), objects: mockServer.objects.size }).toEqual({ drains: 1, objects: 1 });

    const remove = hold("remove");
    chat.appState.emit("active");
    await remove.reached;
    chat.appState.emit("active"); // 비우는 도중에 한 번 더
    expect(drains()).toBe(2); // 겹쳐 돌지 않는다
    remove.release();
    await settle();
    // 겹친 부름은 버리지 않고 끝난 뒤 한 번 더 돈다(4차 재게이트 G3A-1814-1) - 여기서는 지울 것이 남지 않았다.
    expect({ drains: drains(), objects: mockServer.objects.size }).toEqual({ drains: 3, objects: 0 });
    expect(localValues.get(autosaveUndoStorageKey(OWNER))).toBeUndefined();
  });

  test("철회한 저장을 지우지도 기기에 적지도 못한 뒤, 앱은 앞에 둔 채 설정 · 위키에 갔다가 대화 화면으로 돌아오면(초점 복귀) 다시 지우고 안내를 거둔다 (3차 재게이트 G2Z-1814-3 · G2A-1814-2)", async () => {
    // 안내가 "대화 화면으로 돌아올 때마다 다시 삭제해 볼게요" 라고 약속한다. 설정 · 위키는 Stack 위에 열리므로 대화 화면은 다시
    // 뜨지 않고(마운트 effect 가 다시 돌지 않는다) 앱도 앞에 있어 AppState 도 오지 않는다 - 초점만 돌아온다.
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const insert = hold("insert");
    const reply = await chat.exchange("질문", "지우다 만 답변");
    await insert.reached;
    await savePrivacyPref(OWNER, "chat_autosave", false);
    const device = globalThis.localStorage as unknown as { setItem: unknown; removeItem: unknown };
    const { setItem, removeItem } = device;
    const refuse = (): never => {
      throw new Error("QuotaExceededError");
    };
    device.setItem = refuse;
    device.removeItem = refuse;
    const restoreDevice = (): void => {
      device.setItem = setItem;
      device.removeItem = removeItem;
    };
    restoreAfterTest.push(restoreDevice);
    mockServer.serverError.set("remove", 1);
    insert.release();
    await settle();
    expect({ notice: chat.s.keepNotice, saved: chat.saved() }).toEqual({
      notice: { turn: reply, ok: false, notDeleted: true },
      saved: [reply],
    });

    restoreDevice();
    await chat.focus(); // 위키에서 뒤로 - 앱은 계속 앞에 있다(AppState 알림 없음)
    expect({ notice: chat.s.keepNotice, saved: chat.saved(), objects: mockServer.objects.size }).toEqual({
      notice: null,
      saved: [],
      objects: 0,
    });
  });

  test("초점 복귀도 같은 합치기를 쓴다: 비우는 도중 초점이 다시 돌아오거나 앱이 앞으로 와도 비우기가 겹쳐 돌지 않고, 겹친 부름 둘은 끝난 뒤 한 번으로 합친다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const drains = (): number => chat.runnerCalls.filter((name) => name === "drainAutosaveUndoQueue").length;
    expect(drains()).toBe(1); // 화면이 뜰 때

    const leftId = "3f0c9a52-8a1d-4b1e-9c2f-6d7e8f9a0b1c";
    mockServer.objects.set(`${OWNER}/chat-${leftId}.md`, "left behind");
    expect(await rememberAutosaveUndo({ ownerId: OWNER, sourceId: leftId })).toBe(true);
    const remove = hold("remove");
    const focusing = chat.focus();
    expect(drains()).toBe(2); // 초점 복귀가 비우기를 불렀다
    await remove.reached;
    await chat.focus(); // 비우는 도중에 다시 돌아온다
    chat.appState.emit("active"); // 앱도 앞으로 온다
    expect(drains()).toBe(2); // 겹쳐 돌지 않는다
    remove.release();
    await focusing;
    await settle();
    expect({ drains: drains(), objects: mockServer.objects.size }).toEqual({ drains: 3, objects: 0 });
    expect(localValues.get(autosaveUndoStorageKey(OWNER))).toBeUndefined();
  });

  test("비우는 도중 돌아온 초점 복귀를 버리지 않는다: 도는 비우기가 목록을 읽은 뒤 생긴 대기 기록도 그 비우기가 끝난 뒤 한 번 더 돌아 지운다 (4차 재게이트 G3A-1814-1)", async () => {
    // 게이트 재현 순서: 첫 비우기가 목록을 읽고 첫 삭제를 보낸 채 멈춘다 -> 새 대기 기록 B 가 생긴다 -> 설정 · 위키에서 대화
    // 화면으로 돌아온다(초점 복귀) -> 그 부름이 "도는 중" 이라 버려져, 첫 비우기가 끝나도 B 는 다음 계기까지 남았다.
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const drains = (): number => chat.runnerCalls.filter((name) => name === "drainAutosaveUndoQueue").length;
    expect(drains()).toBe(1); // 화면이 뜰 때(기록 없음)

    const firstId = "3f0c9a52-8a1d-4b1e-9c2f-6d7e8f9a0b1c";
    const laterId = "7b1e2d3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
    mockServer.objects.set(`${OWNER}/chat-${firstId}.md`, "left behind");
    expect(await rememberAutosaveUndo({ ownerId: OWNER, sourceId: firstId })).toBe(true);
    const remove = hold("remove");
    const focusing = chat.focus(); // 초점 복귀 - 비우기가 목록(첫 기록 하나)을 읽고 지우기 시작한다
    await remove.reached;
    mockServer.objects.set(`${OWNER}/chat-${laterId}.md`, "left behind");
    expect(await rememberAutosaveUndo({ ownerId: OWNER, sourceId: laterId })).toBe(true); // 목록을 읽은 뒤 생긴 기록
    await chat.focus(); // 비우는 도중에 다시 돌아온다
    expect(drains()).toBe(2);
    remove.release();
    await focusing;
    await settle();
    expect({ drains: drains(), objects: [...mockServer.objects.keys()] }).toEqual({ drains: 3, objects: [] });
    expect(localValues.get(autosaveUndoStorageKey(OWNER))).toBeUndefined();
  });

  test("화면이 내려간 뒤에는 도는 동안 겹친 부름이 있었어도 한 번 더 돌지 않는다 - 다음 비우기는 화면이 다시 뜰 때다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const drains = (): number => chat.runnerCalls.filter((name) => name === "drainAutosaveUndoQueue").length;
    const leftId = "3f0c9a52-8a1d-4b1e-9c2f-6d7e8f9a0b1c";
    mockServer.objects.set(`${OWNER}/chat-${leftId}.md`, "left behind");
    expect(await rememberAutosaveUndo({ ownerId: OWNER, sourceId: leftId })).toBe(true);
    const remove = hold("remove");
    const focusing = chat.focus();
    await remove.reached;
    await chat.focus(); // 비우는 도중에 다시 돌아온다
    chat.unmount(); // 그리고 화면이 내려간다
    remove.release();
    await focusing;
    await settle();
    expect({ drains: drains(), objects: mockServer.objects.size }).toEqual({ drains: 2, objects: 0 });
  });

  test("손 담기가 쓰기 전에 멈춘 채 시간 상한이 지나면 실패 안내를 띄우고, 그 뒤에는 원문도 행도 나가지 않는다 (3차 재게이트 G2A-1814-1)", async () => {
    // 화면이 실행기가 건네는 울타리를 capture 에 넘기는지 본다. 넘기지 않으면 상한 뒤에도 capture 가 이어 가 원문과 행을 쓴다 -
    // 사용자는 이미 "확인하지 못했다" 는 안내를 봤다.
    mockServer.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    const reply = await chat.exchange("질문", "손으로 담는 답변");
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick", "queueMicrotask"] });
    restoreAfterTest.push(() => jest.useRealTimers());
    const lookup = hold("candidates");
    const keeping = chat.startKeepByHand(1);
    await lookup.reached;
    jest.advanceTimersByTime(runner.OWNER_LANE_TASK_TIMEOUT_MS);
    expect(await keeping).toBe(false);
    lookup.release();
    await settle();
    expect({
      notice: chat.s.keepNotice,
      announced: chat.announced,
      upload: count("upload"),
      insert: count("insert"),
      saved: chat.saved(),
      objects: mockServer.objects.size,
    }).toEqual({ notice: { turn: reply, ok: false }, announced: ["keepFailed"], upload: 0, insert: 0, saved: [], objects: 0 });
  });

  test("자동으로 담긴 대화도 손 담기와 같은 판정으로 위기 안내를 띄운다 (C9)", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    await chat.exchange("오늘 산책 어땠지?", "바람이 좋았다고 했어요.");
    expect(chat.saved()).toHaveLength(1);
    expect(chat.s.keepCrisis.visible).toBe(false); // 대조군

    await chat.exchange("요즘 너무 지쳐", "죽고 싶다는 생각까지 들었다고 했어요.");
    expect(chat.saved()).toHaveLength(2);
    expect(chat.s.keepCrisis).toEqual({ visible: true, hotline: "KR_109" });
  });

  test("자동 저장이 실패하면 손 담기와 같은 실패 안내를 띄우고 칩을 다시 연다", async () => {
    mockServer.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    mockServer.serverError.set("insert", 1);
    const reply = await chat.exchange("질문", "저장이 실패한 답변");

    expect(chat.saved()).toEqual([]);
    expect(chat.s.keepNotice).toEqual({ turn: reply, ok: false });
    expect(chat.announced).toEqual(["keepFailed"]);
    expect({ disabled: chat.chipDisabled(1), label: chat.chipLabel(1) }).toEqual({ disabled: false, label: "keepToWiki" });
    expect(mockServer.objects.size).toBe(0); // 먼저 올린 원문은 지웠다
  });

  test("기록 상세: 지우는 동안에는 위키 페이지 만들기(승격) 버튼을 누를 수 없다 (설계 N4)", () => {
    // 승격은 먼저 보류된 원문 업로드를 마저 올린다. 삭제가 원문을 지운 뒤 행을 지우기 전에 그 업로드가 돌면 지운 원문이
    // 되살아난다. 대화 자동 저장을 한 건씩 되돌리는 길이 이 삭제라서 여기서 함께 본다.
    const detail = parse(DETAIL_FILE);
    const onPress = firstNode(
      detail,
      (node) => ts.isJsxAttribute(node) && node.name.getText(detail) === "onPress" && (node.initializer?.getText(detail) ?? "").includes("promoteToWiki()"),
      "승격 버튼의 onPress",
    );
    const disabled = compile(`return (${attributeExpression(onPress.parent as ts.JsxAttributes, "disabled", detail)});`);
    const at = (deleting: boolean, promoting: boolean, promoted: boolean): boolean => run<boolean>(disabled, { deleting, promoting, promoted });
    expect({
      deleting: at(true, false, false),
      idle: at(false, false, false),
      promoting: at(false, true, false),
      promoted: at(false, false, true),
    }).toEqual({ deleting: true, idle: false, promoting: true, promoted: true });
  });
});

describe("배선", () => {
  const source = readFileSync(SECONDB_FILE, "utf8");

  test("질문 턴을 목록에 넣기 직전에 자동 담기 자격을 적는다", () => {
    const send = firstNode(
      CHAT_AST,
      (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "handleSend",
      "handleSend 선언",
    ).getText(CHAT_AST);
    const read = send.indexOf("const consentAtSend = autosaveConsentFor(userId);");
    const record = send.indexOf("autosaveAskedRef.current.set(question, consentAtSend.generation)");
    expect(read).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(read);
    expect(send.indexOf("[...prev, question]")).toBeGreaterThan(record);
  });

  test("새 대화 버튼 둘이 같은 처리기를 쓰고, 목록만 비우는 곳이 따로 없다", () => {
    expect(source.match(/onPress=\{startNewConversation\}/g)).toHaveLength(2);
    const handler = firstNode(CHAT_AST, functionNamed("startNewConversation"), "startNewConversation 선언").getText(CHAT_AST);
    expect(handler).toContain("setTurns([])");
    expect(source.split("setTurns([])")).toHaveLength(2); // 처리기 안의 한 곳뿐
  });

  test("설정 화면에서 돌아오면 동의를 다시 읽는다", () => {
    expect(source).toContain("useFocusRefetch(() => setPrefsReadKey((k) => k + 1), Boolean(userId))");
    // 방아쇠를 올려도 읽기 effect 가 그 값을 안 보면 다시 읽지 않는다.
    expect(LOAD_EFFECT).toMatch(/\[userId, prefsReadKey\]\s*\)$/);
  });
});
