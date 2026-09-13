// 대화 자동 저장이 설정에서 바꾼 동의를 따른다 - 유지된 대화 화면 왕복 (r3as H1, 2026-09-14).
//
// 게이트가 잡은 결함: /secondb 는 /privacy 에 가 있는 동안에도 Stack 에 남는다. 그런데 동의를 처음
// 한 번만 읽고 그 값으로 계속 담았다. 설정에서 대화 저장을 끄고(원장에 revoke 까지 남기고) 돌아와도
// 새 답변이 sources 에 저장됐고, 반대로 켜고 돌아와도 담기지 않았다.
//
// 이 파일은 그 왕복을 **실제 코드로** 돌린다.
//   · 대화 화면: secondb.tsx 의 실제 선언(applyAutosaveConsent, 설정 읽기 effect, 저장 소식 구독
//     effect, 자동 담기 effect)을 AST 로 떼어, 의존성 배열이 바뀐 effect 만 다시 도는 작은 스케줄러
//     위에서 돌린다. 화면은 한 번 마운트된 채 남는다 - Stack 에 유지된 화면이다.
//   · 설정 화면: DeepSpaceDesignScreens.tsx 의 실제 toggleChatAutosave.
//   · 저장 · 읽기 · 소식: 실제 lib/supabase/privacy.ts 와 lib/privacy/pref-changes.ts. DB 만 상태를
//     가진 목이다.
// 실제 capture 대신 keepExchange 자리에서 담긴 턴을 센다. React Navigation 을 띄운 E2E 는 아니다 -
// 이 저장소에서 컴포넌트 렌더 테스트는 막혀 있다(RN 0.85).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type MockLedgerRow = { user_id: string; pref_key: string; event_type: string };

const mockDb = {
  prefs: new Map<string, Record<string, unknown>>(),
  ledger: [] as MockLedgerRow[],
  /** 다음 N 번의 읽기를 실패시킨다. */
  failReads: 0,
  /** 지금까지 prefs 를 읽은 횟수. */
  reads: 0,
  /** 다음 읽기 하나를 이 약속이 풀릴 때까지 붙잡는다. 응답은 요청한 순간의 값이다. */
  holdNextRead: null as Promise<void> | null,
  failUpdate: false,
  /** 이 약속이 풀릴 때까지 쓰기가 끝나지 않는다. */
  holdUpdate: null as Promise<void> | null,
};

jest.mock("../../lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => {
                mockDb.reads += 1;
                if (mockDb.failReads > 0) {
                  mockDb.failReads -= 1;
                  return { data: null, error: new Error("read failed") };
                }
                const data = mockDb.prefs.has(id) ? { privacy_prefs: structuredClone(mockDb.prefs.get(id)) } : null;
                const hold = mockDb.holdNextRead;
                mockDb.holdNextRead = null;
                if (hold) await hold; // 늦게 도착한 응답은 요청할 때의 값을 싣는다
                return { data, error: null };
              },
            }),
          }),
          update: (patch: { privacy_prefs: Record<string, unknown> }) => ({
            eq: async (_column: string, id: string) => {
              if (mockDb.holdUpdate) await mockDb.holdUpdate;
              if (mockDb.failUpdate) return { error: new Error("update failed") };
              mockDb.prefs.set(id, structuredClone(patch.privacy_prefs));
              return { error: null };
            },
          }),
        };
      }
      if (table === "consent_changes") {
        return {
          insert: async (rows: MockLedgerRow[]) => {
            mockDb.ledger.push(...rows);
            return { error: null };
          },
        };
      }
      if (table === "consent_records") return { insert: async () => ({ error: null }) };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { chatAutosaveAllowed } from "../../lib/chat/autosave";
import { isKeepable } from "../../lib/chat/keep-exchange";
import { subscribePrivacyPrefsSaved } from "../../lib/privacy/pref-changes";
import { nextPrivacyPrefs, type PrivacyPrefs } from "../../lib/privacy/prefs";
import { fetchPrivacyPrefs, readPrivacyPrefs, savePrivacyPref } from "../../lib/supabase/privacy";
import {
  __resetAccountEpochForTests,
  beginAccountOwnerTransition,
  captureAccountOwnerLease,
  noteResolvedOwner,
} from "../../lib/auth/account-epoch";

// ── 실제 선언 떼어내기 ─────────────────────────────────────────────────────────────

const SECONDB_FILE = resolve(__dirname, "../secondb.tsx");
const PRIVACY_FILE = resolve(__dirname, "../../screens/deepspace/DeepSpaceDesignScreens.tsx");

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

function effectText(ast: ts.SourceFile, marker: string): string {
  return firstNode(
    ast,
    (node) =>
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useEffect" &&
      node.getText(ast).includes(marker),
    `${marker} 를 품은 useEffect`,
  ).getText(ast);
}

function compile(source: string, tail = ""): string {
  return ts.transpileModule(`${source}\n${tail}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

function run<T>(js: string, bindings: Record<string, unknown>): T {
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as T;
}

const CHAT_AST = parse(SECONDB_FILE);
const LOAD_EFFECT = effectText(CHAT_AST, "fetchPrivacyPrefs(userId)");

/** 답변 옆 담기 칩의 disabled 식. 화면이 그리는 식 그대로를 계산한다. */
function keepChipDisabledText(): string {
  const onPress = firstNode(
    CHAT_AST,
    (node) =>
      ts.isJsxAttribute(node) &&
      node.name.getText(CHAT_AST) === "onPress" &&
      (node.initializer?.getText(CHAT_AST) ?? "").includes("keepExchange("),
    "담기 칩의 onPress",
  );
  const disabled = (onPress.parent as ts.JsxAttributes).properties.find(
    (attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.getText(CHAT_AST) === "disabled",
  );
  const initializer = disabled?.initializer;
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) throw new Error("담기 칩의 disabled 식을 찾지 못했다");
  return initializer.expression.getText(CHAT_AST);
}

const CHAT = {
  apply: compile(firstNode(CHAT_AST, functionNamed("applyAutosaveConsent"), "applyAutosaveConsent 선언").getText(CHAT_AST), "return applyAutosaveConsent;"),
  load: compile(LOAD_EFFECT),
  subscribe: compile(effectText(CHAT_AST, "subscribePrivacyPrefsSaved(")),
  autosave: compile(effectText(CHAT_AST, "autoKeptRef.current.add(")),
  newConversation: compile(
    firstNode(CHAT_AST, functionNamed("startNewConversation"), "startNewConversation 선언").getText(CHAT_AST),
    "return startNewConversation;",
  ),
  keepChipDisabled: compile(`return (${keepChipDisabledText()});`),
};

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
  autosaveConsent: boolean | null;
  adsConsent: boolean | null;
  prefsReadKey: number;
  keptTurns: ReadonlySet<Turn>;
  keepNotice: { turn: Turn; ok: boolean } | null;
}

const OWNER = "user-a";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise((done) => setImmediate(done));
};

/**
 * 한 번 마운트돼 Stack 에 남는 대화 화면. 상태가 바뀌면 React 처럼 본문을 다시 돌리고, 의존성 배열이
 * 바뀐 effect 만 선언 순서대로 다시 돌린다(이전 정리 함수를 먼저 부른다).
 */
class KeptChatScreen {
  readonly s: ChatState = {
    turns: [],
    autosaveConsent: null,
    adsConsent: null,
    prefsReadKey: 0,
    keptTurns: new Set(),
    keepNotice: null,
  };
  readonly saved: Turn[] = [];
  private readonly refs = {
    autosaveConsentRef: { current: null as boolean | null },
    autosaveBeforeRef: { current: new WeakSet<object>() },
    turnsRef: { current: [] as Turn[] },
    autoKeptRef: { current: new WeakSet<object>() },
    autosaveGenerationRef: { current: 0 },
    autosaveListenerRef: { current: null as object | null },
  };
  private readonly effects = new Map<string, { deps: readonly unknown[]; cleanup?: () => void }>();
  private dirty = true;
  private rendering = false;

  constructor() {
    this.flush();
  }

  private set(patch: Partial<ChatState>): void {
    const state = this.s as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.is(state[key], value)) {
        state[key] = value;
        this.dirty = true;
      }
    }
    if (this.dirty && !this.rendering) queueMicrotask(() => this.flush());
  }

  private flush(): void {
    let renders = 0;
    while (this.dirty) {
      if ((renders += 1) > 50) throw new Error("render loop");
      this.dirty = false;
      this.render();
    }
  }

  private render(): void {
    const pending: (() => void)[] = [];
    this.rendering = true;
    try {
      const s = this.s;
      const turnsAtRender = s.turns;
      this.refs.turnsRef.current = s.turns; // 본문의 turnsRef.current = turns
      const setAutosaveConsent = (value: boolean | null) => this.set({ autosaveConsent: value });
      const setAdsConsent = (value: boolean | null) => this.set({ adsConsent: value });
      const applyAutosaveConsent = run<(allowed: boolean) => void>(CHAT.apply, { ...this.refs, setAutosaveConsent });
      const effectAt = (slot: string) => (effect: () => void | (() => void), deps: readonly unknown[]) => {
        const previous = this.effects.get(slot);
        const changed =
          !previous || previous.deps.length !== deps.length || deps.some((dep, i) => !Object.is(dep, previous.deps[i]));
        if (!changed) return;
        pending.push(() => {
          previous?.cleanup?.();
          const cleanup = effect();
          this.effects.set(slot, { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined });
        });
      };
      const shared = { ...this.refs, userId: OWNER, applyAutosaveConsent, setAutosaveConsent, setAdsConsent };
      run(CHAT.load, { ...shared, useEffect: effectAt("load"), fetchPrivacyPrefs, prefsReadKey: s.prefsReadKey });
      run(CHAT.subscribe, { ...shared, useEffect: effectAt("subscribe"), subscribePrivacyPrefsSaved });
      run(CHAT.autosave, {
        ...shared,
        useEffect: effectAt("autosave"),
        chatAutosaveAllowed,
        autosaveConsent: s.autosaveConsent,
        keeping: null,
        turns: s.turns,
        isKeepable,
        autosaveBeforeRef: this.refs.autosaveBeforeRef,
        autoKeptRef: this.refs.autoKeptRef,
        keptTurns: s.keptTurns,
        prefsReadKey: s.prefsReadKey,
        readPrivacyPrefs,
        captureAccountOwnerLease,
        // 실제 keepExchange 처럼 이 렌더의 turns 를 쥔다(effect 가 부르는 것은 그 렌더의 함수다). s 는 계속
        // 바뀌는 객체라 여기서 값을 떼어 둔다.
        keepExchange: (index: number) => this.keep(turnsAtRender, index),
      });
    } finally {
      this.rendering = false;
    }
    for (const fire of pending) fire();
  }

  /** keepExchange 자리. 실제 capture 대신 담긴 턴을 센다. */
  private async keep(turns: readonly Turn[], index: number): Promise<boolean> {
    const turn = turns[index];
    if (!turn) return false;
    this.saved.push(turn);
    this.set({ keptTurns: new Set(this.s.keptTurns).add(turn) });
    return true;
  }

  /** 질문을 보낸다(답변은 아직). 돌려주는 것은 질문 턴이다. */
  async ask(question: string): Promise<Turn> {
    const turn: Turn = { role: "user", text: question };
    this.set({ turns: [...this.s.turns, turn] });
    await settle();
    return turn;
  }

  /** 질문 하나와 답변 하나가 오간다. 돌려주는 것은 답변 턴이다. */
  async exchange(question: string, answer: string): Promise<Turn> {
    const reply: Turn = { role: "secondb", text: answer };
    await this.ask(question);
    this.set({ turns: [...this.s.turns, reply] });
    await settle();
    return reply;
  }

  /** 설정 화면에서 뒤로 돌아온다(useFocusRefetch 가 올리는 방아쇠). */
  async focus(): Promise<void> {
    this.set({ prefsReadKey: this.s.prefsReadKey + 1 });
    await settle();
  }

  /** "새 대화" 버튼 - 화면의 startNewConversation 을 그대로 부른다. */
  async newConversation(): Promise<void> {
    run<() => void>(CHAT.newConversation, {
      setTurns: (turns: Turn[]) => this.set({ turns }),
      setKeptTurns: (keptTurns: ReadonlySet<Turn>) => this.set({ keptTurns }),
      setKeepNotice: (keepNotice: ChatState["keepNotice"]) => this.set({ keepNotice }),
      autoKeptRef: this.refs.autoKeptRef,
      turnsRef: this.refs.turnsRef,
    })();
    await settle();
  }

  /** 담기 칩을 손으로 누른다(담는 자리는 keep 과 같다). */
  async keepByHand(index: number): Promise<void> {
    await this.keep(this.s.turns, index);
    await settle();
  }

  /** 화면이 그 자리 답변의 담기 칩을 닫아 그리는가. */
  chipDisabled(i: number): boolean {
    const s = this.s;
    return run<boolean>(CHAT.keepChipDisabled, { keeping: null, keptTurns: s.keptTurns, turn: s.turns[i], i });
  }

  /** 담기가 실패해 그 답변 옆에 안내가 떠 있는 상태로 둔다. */
  showKeepFailure(turn: Turn): void {
    this.set({ keepNotice: { turn, ok: false } });
  }

  unmount(): void {
    for (const effect of this.effects.values()) effect.cleanup?.();
    this.effects.clear();
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
async function mountChat(): Promise<KeptChatScreen> {
  const chat = new KeptChatScreen();
  mounted.push(chat);
  await settle();
  return chat;
}

beforeEach(() => {
  // 실제 계정 경계(lib/auth/account-epoch)를 쓴다. AuthContext 가 공개하기 직전에 부르는 것과 같은 호출이다.
  __resetAccountEpochForTests();
  noteResolvedOwner(OWNER);
  mockDb.holdNextRead = null;
  mockDb.prefs = new Map();
  mockDb.ledger = [];
  mockDb.failReads = 0;
  mockDb.reads = 0;
  mockDb.failUpdate = false;
  mockDb.holdUpdate = null;
});

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

const storedChatAutosave = (): unknown => mockDb.prefs.get(OWNER)?.chat_autosave;

/** 다음 prefs 읽기를 붙잡는다. 돌려준 함수를 부르면 요청한 순간의 값으로 응답한다. */
function holdNextRead(): () => void {
  let release: () => void = () => undefined;
  mockDb.holdNextRead = new Promise<void>((done) => {
    release = done;
  });
  return () => release();
}

describe("유지된 대화 화면 왕복 (r3as H1)", () => {
  test("켜짐 -> 설정에서 끔 -> 돌아옴: 끈 뒤의 답변은 하나도 담지 않는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const first = await chat.exchange("오늘 어땠지?", "켜져 있을 때의 답변");
    expect(chat.saved).toEqual([first]); // 대조군: 켜져 있으면 담는다

    const privacy = await openPrivacy(); // 대화 화면은 Stack 에 남아 있다
    await privacy.toggle(false);
    expect(storedChatAutosave()).toBe(false);
    expect(mockDb.ledger).toEqual([{ user_id: OWNER, pref_key: "chat_autosave", event_type: "revoke" }]);

    await chat.exchange("설정 화면에 있는 동안 도착한 질문", "숨겨진 화면이 받은 답변");
    await chat.focus();
    await chat.exchange("돌아와서 한 질문", "돌아온 뒤의 답변");

    expect(chat.saved).toEqual([first]);
    expect(chat.s.autosaveConsent).toBe(false);
  });

  test("꺼짐 -> 설정에서 켬 -> 돌아옴: 켠 뒤에 도착한 답변만 담는다(화면에 있던 과거 턴 0)", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    await chat.exchange("켜기 전에 한 말", "켜기 전의 답변");
    expect(chat.saved).toEqual([]);

    const privacy = await openPrivacy();
    await privacy.toggle(true);
    await settle();
    expect(chat.s.autosaveConsent).toBe(true);
    expect(chat.saved).toEqual([]); // 소급 저장 없음

    await chat.focus();
    expect(chat.saved).toEqual([]);
    const after = await chat.exchange("켠 뒤의 질문", "켠 뒤의 답변");
    expect(chat.saved).toEqual([after]);
  });

  test("새 대화로 목록을 비워도, 켠 뒤의 답변은 같은 자리에서 담긴다", async () => {
    // 경계를 인덱스로 기억하면 비운 뒤 같은 인덱스에 온 새 답변을 과거 턴으로 착각한다.
    mockDb.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    await chat.exchange("켜기 전", "켜기 전의 답변"); // 인덱스 1
    await (await openPrivacy()).toggle(true);
    await chat.newConversation();
    const fresh = await chat.exchange("새 대화", "새 대화의 답변"); // 다시 인덱스 1
    expect(chat.saved).toEqual([fresh]);
  });

  test("다른 기기에서 끈 동의: 소식도 돌아옴도 없이 도착한 답변을 담기 직전 확인이 막는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    mockDb.prefs.set(OWNER, { chat_autosave: false }); // 이 앱 밖에서 철회
    await chat.exchange("질문", "철회 뒤의 답변");
    expect(chat.saved).toEqual([]);
    expect(chat.s.autosaveConsent).toBe(false); // 확인한 사실을 화면에도 반영한다
  });

  test("담기 직전 확인을 못 읽으면 담지 않고, 다음 답변에서 다시 확인한다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      mockDb.failReads = 1;
      await chat.exchange("질문", "확인하지 못한 답변");
      expect(chat.saved).toEqual([]);
      expect(chat.s.autosaveConsent).toBe(true); // 한 번 못 읽었다고 동의를 끈 것으로 치지 않는다
      const next = await chat.exchange("다음 질문", "확인된 답변");
      expect(chat.saved).toEqual([next]);
    } finally {
      warn.mockRestore();
    }
  });

  test("설정 저장이 실패하면 스위치도 대화 화면도 바뀌지 않는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const privacy = await openPrivacy();
    mockDb.failUpdate = true;
    await privacy.toggle(false);

    expect(privacy.shown.chatSaveOn).toEqual([]);
    expect(privacy.shown.chatSaveError.at(-1)).toBe(true);
    expect(privacy.prefsRef.current?.chat_autosave).toBe(true);
    expect(mockDb.ledger).toEqual([]);
    expect(chat.s.autosaveConsent).toBe(true);
    const reply = await chat.exchange("질문", "여전히 켜져 있을 때의 답변");
    expect(chat.saved).toEqual([reply]);
  });

  test("설정 저장이 끝나기 전에는 스위치를 먼저 바꾸지 않는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const privacy = await openPrivacy();
    let release: () => void = () => undefined;
    mockDb.holdUpdate = new Promise<void>((done) => {
      release = done;
    });
    const saving = privacy.toggle(false);
    await settle();
    expect(privacy.shown.busy).toEqual([true]);
    expect(privacy.shown.chatSaveOn).toEqual([]);
    expect(chat.s.autosaveConsent).toBe(true);

    release();
    await saving;
    await settle();
    expect(privacy.shown.chatSaveOn).toEqual([false]);
    expect(chat.s.autosaveConsent).toBe(false);
  });
});

describe("담기 표시는 인덱스가 아니라 턴에 붙는다 (r3as2 R3AS2-02)", () => {
  // 게이트가 잡은 것: 자동 담기의 한 번 가드(autoKeptRef)와 담긴 표시(keptIdx)가 인덱스를 기억했다.
  // "새 대화" 는 목록만 비워서, 다음 대화의 같은 인덱스 답변을 자동 경로는 서버를 읽기도 전에 건너뛰고
  // 수동 칩은 이미 담긴 것으로 닫았다. 담기 직전 확인을 못 읽은 답변은 표시가 남아 다시 확인되지 않았다.
  test("이미 담긴 대화 뒤 새 대화의 같은 자리 답변도 담긴다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const first = await chat.exchange("첫 대화", "첫 대화의 답변"); // 인덱스 1
    expect(chat.saved).toEqual([first]);

    await chat.newConversation();
    const second = await chat.exchange("새 대화", "새 대화의 답변"); // 다시 인덱스 1
    expect(chat.saved).toEqual([first, second]);
  });

  test("손으로 담은 대화 뒤 새 대화의 같은 자리 답변은 담기 칩이 열려 있다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    await chat.exchange("첫 대화", "첫 대화의 답변");
    await chat.keepByHand(1);
    expect(chat.chipDisabled(1)).toBe(true); // 대조군: 담긴 답변의 칩은 닫힌다

    await chat.newConversation();
    await chat.exchange("새 대화", "새 대화의 답변");
    expect(chat.chipDisabled(1)).toBe(false);
  });

  test("새 대화는 담기 실패 안내도 함께 지운다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: false });
    const chat = await mountChat();
    const reply = await chat.exchange("질문", "담기에 실패한 답변");
    chat.showKeepFailure(reply);
    await settle();

    await chat.newConversation();
    expect(chat.s.keepNotice).toBeNull();
    expect(chat.s.turns).toEqual([]);
  });

  test("담기 직전 확인을 못 읽은 답변은 돌아왔을 때 다시 확인해 담는다 - 그 전에 스스로 다시 읽지 않는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      mockDb.failReads = 1;
      const readsBefore = mockDb.reads;
      const reply = await chat.exchange("질문", "확인하지 못한 답변");
      for (let i = 0; i < 5; i += 1) await settle();
      expect(chat.saved).toEqual([]);
      expect(mockDb.reads - readsBefore).toBe(1); // 실패한 확인 한 번뿐이다

      await chat.focus();
      expect(chat.saved).toEqual([reply]);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("담기 직전 확인이 돌아오기 전에 동의 · 계정 · 대화가 바뀌면 (r3as2 R3AS2-01)", () => {
  // 게이트가 잡은 순서: 답변이 오고 담기 직전 확인 읽기가 나간다(그때의 켜짐을 읽는다). 응답이 오기 전에 같은
  // 앱의 설정에서 끈다. 늦게 온 켜짐 응답이 지금의 동의 · 동의 세대 · 계정 · 턴을 다시 보지 않고 담았다.
  // 여기서는 그 읽기를 실제로 붙잡아 둔 채 실제 savePrivacyPref 로 끄고(저장 소식까지 실제) 나서 푼다.
  test("확인 중에 같은 앱에서 끄면, 늦게 온 켜짐 응답으로 담지 않는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const release = holdNextRead();
    await chat.exchange("질문", "확인 중에 철회된 답변");
    expect(chat.saved).toEqual([]); // 확인이 아직 돌아오지 않았다

    await savePrivacyPref(OWNER, "chat_autosave", false);
    expect(chat.s.autosaveConsent).toBe(false);
    release();
    await settle();
    expect(chat.saved).toEqual([]);
  });

  test("확인 중에 끄고 다시 켜도, 끄기 전에 나간 확인으로는 담지 않는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const release = holdNextRead();
    await chat.exchange("질문", "끄고 다시 켜는 사이의 답변");
    await savePrivacyPref(OWNER, "chat_autosave", false);
    await settle();
    await savePrivacyPref(OWNER, "chat_autosave", true);
    await settle();
    expect(chat.s.autosaveConsent).toBe(true); // 지금 값만 보면 켜져 있다 - 막는 것은 동의 세대다
    expect(mockDb.ledger.map((row) => row.event_type)).toEqual(["revoke", "grant"]);

    release();
    await settle();
    expect(chat.saved).toEqual([]);
  });

  test("확인 중에 계정 전환이 시작되면(장면이 아직 남아 있어도) 담지 않는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const release = holdNextRead();
    await chat.exchange("질문", "계정 전환 사이의 답변");
    beginAccountOwnerTransition("user-b");
    release();
    await settle();
    expect(chat.saved).toEqual([]);
  });

  test("확인 중에 다른 계정으로 바뀌어 장면이 다시 만들어지면, 앞 계정의 확인으로 담지 않는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const release = holdNextRead();
    await chat.exchange("질문", "앞 계정의 답변");
    beginAccountOwnerTransition("user-b");
    chat.unmount(); // _layout.tsx 의 AccountScope 가 epoch 를 key 로 장면을 다시 만든다
    noteResolvedOwner("user-b");
    release();
    await settle();
    expect(chat.saved).toEqual([]);
  });

  test("확인 중에 새 대화로 비우면, 비워진 대화의 답변은 담지 않는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const release = holdNextRead();
    await chat.exchange("질문", "비워진 대화의 답변");
    await chat.newConversation();
    release();
    await settle();
    expect(chat.saved).toEqual([]);
  });

  test("대조군: 확인 중에 아무것도 안 바뀌면 담고, 그 사이 다음 질문을 보내도 담는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true });
    const chat = await mountChat();
    const release = holdNextRead();
    const reply = await chat.exchange("질문", "확인을 기다린 답변");
    await chat.ask("이어서 보낸 질문");
    release();
    await settle();
    expect(chat.saved).toEqual([reply]);
  });
});

describe("배선", () => {
  const source = readFileSync(SECONDB_FILE, "utf8");

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
