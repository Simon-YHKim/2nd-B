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
                if (mockDb.failReads > 0) {
                  mockDb.failReads -= 1;
                  return { data: null, error: new Error("read failed") };
                }
                return {
                  data: mockDb.prefs.has(id) ? { privacy_prefs: structuredClone(mockDb.prefs.get(id)) } : null,
                  error: null,
                };
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
const CHAT = {
  apply: compile(firstNode(CHAT_AST, functionNamed("applyAutosaveConsent"), "applyAutosaveConsent 선언").getText(CHAT_AST), "return applyAutosaveConsent;"),
  load: compile(LOAD_EFFECT),
  subscribe: compile(effectText(CHAT_AST, "subscribePrivacyPrefsSaved(")),
  autosave: compile(effectText(CHAT_AST, "autoKeptRef.current.add(idx)")),
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
  keptIdx: Set<number>;
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
  readonly s: ChatState = { turns: [], autosaveConsent: null, adsConsent: null, prefsReadKey: 0, keptIdx: new Set() };
  readonly saved: Turn[] = [];
  private readonly refs = {
    autosaveConsentRef: { current: null as boolean | null },
    autosaveBeforeRef: { current: new WeakSet<object>() },
    turnsRef: { current: [] as Turn[] },
    autoKeptRef: { current: new Set<number>() },
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
      const shared = { userId: OWNER, applyAutosaveConsent, setAutosaveConsent, setAdsConsent };
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
        keptIdx: s.keptIdx,
        readPrivacyPrefs,
        keepExchange: (index: number) => this.keep(index),
      });
    } finally {
      this.rendering = false;
    }
    for (const fire of pending) fire();
  }

  /** keepExchange 자리. 실제 capture 대신 담긴 턴을 센다. */
  private async keep(index: number): Promise<boolean> {
    const turn = this.s.turns[index];
    if (!turn) return false;
    this.saved.push(turn);
    this.set({ keptIdx: new Set(this.s.keptIdx).add(index) });
    return true;
  }

  /** 질문 하나와 답변 하나가 오간다. 돌려주는 것은 답변 턴이다. */
  async exchange(question: string, answer: string): Promise<Turn> {
    const reply: Turn = { role: "secondb", text: answer };
    this.set({ turns: [...this.s.turns, { role: "user", text: question }] });
    await settle();
    this.set({ turns: [...this.s.turns, reply] });
    await settle();
    return reply;
  }

  /** 설정 화면에서 뒤로 돌아온다(useFocusRefetch 가 올리는 방아쇠). */
  async focus(): Promise<void> {
    this.set({ prefsReadKey: this.s.prefsReadKey + 1 });
    await settle();
  }

  /** "새 대화" 버튼 - 목록을 비운다. */
  async newConversation(): Promise<void> {
    this.set({ turns: [] });
    await settle();
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
  mockDb.prefs = new Map();
  mockDb.ledger = [];
  mockDb.failReads = 0;
  mockDb.failUpdate = false;
  mockDb.holdUpdate = null;
});

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

const storedChatAutosave = (): unknown => mockDb.prefs.get(OWNER)?.chat_autosave;

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

describe("배선", () => {
  const source = readFileSync(SECONDB_FILE, "utf8");

  test("설정 화면에서 돌아오면 동의를 다시 읽는다", () => {
    expect(source).toContain("useFocusRefetch(() => setPrefsReadKey((k) => k + 1), Boolean(userId))");
    // 방아쇠를 올려도 읽기 effect 가 그 값을 안 보면 다시 읽지 않는다.
    expect(LOAD_EFFECT).toMatch(/\[userId, prefsReadKey\]\s*\)$/);
  });
});
