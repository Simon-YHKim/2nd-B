// /star/[domain] 맨 위 카드("여기 담겼어요")를 실제 화면 함수로 돌려서 잰다.
//
// PR #1812 인가 게이트 M1 (2026-09-14): 카드 -> 상세(router.push) -> 상세에서 영역 옮기기
// (updateRecordTags) -> 뒤로(router.back). 이 길에서 영역 화면은 마운트된 채로 남고 주소도
// 그대로라, 주소에만 매인 요약 읽기가 다시 돌지 않았다. 카드는 처음 읽은 태그를 보고 옛 영역에
// 계속 떠 있었다. 게이트 보고서의 발췌 재현(INITIAL -> MOVE_IN_DETAIL_THEN_BACK)을 여기로 옮겼다.
//
// 컴포넌트 렌더 테스트는 이 저장소에서 막혀 있다(RN 0.85 upstream). 그래서 core-brain-minor-gate
// 처럼 화면 함수를 훅 대역 위에서 돌린다. useFocusRefetch 는 진짜를 쓰고, 그 밑의
// useFocusEffect 만 React Navigation 이 하는 대로(포커스 중 마운트 · focus · blur) 흉내 낸다.
// DB 는 메모리 표 하나다 - 상세의 영역 옮기기는 그 표에서 행의 태그를 바꾸는 일이다.
import type { DependencyList, EffectCallback, ReactElement, SetStateAction } from "react";

interface StoredPiece {
  id: string;
  userId: string;
  kind: string;
  /** 보통은 문자열이다. B1 은 모양이 틀린 행을 그대로 돌려주려고 아무 값이나 넣는다. */
  title: unknown;
  createdAt: string;
  /** 보통은 문자열 배열이다. B1 은 모양이 틀린 행을 그대로 돌려주려고 아무 값이나 넣는다. */
  tags: unknown;
}

interface EffectSlot {
  deps: DependencyList | undefined;
  cleanup?: () => void;
}

const OWNER = "owner-a";
const RECORD_ID = "11111111-2222-4333-8444-555555555555";
const TITLE = "Fixture title";
const CARD_LABEL = `star.pieceHere. ${TITLE}`;

const mockAuth: { current: { userId: string | null; loading: boolean } } = {
  current: { userId: OWNER, loading: false },
};
const mockParams: { current: { domain: string; pieceId?: string | string[] } } = {
  current: { domain: "career" },
};
/** `${table}:${id}` -> 저장된 행. */
const mockRows = new Map<string, StoredPiece>();
/** 요약 읽기(maybeSingle) 한 번마다 한 줄. 아래 목록 읽기는 세지 않는다. */
const mockSummaryReads: { table: string; id: unknown }[] = [];

const mockNavigation = {
  focused: true,
  listeners: { focus: new Set<() => void>(), blur: new Set<() => void>() },
  emit(type: "focus" | "blur") {
    this.focused = type === "focus";
    for (const listener of [...this.listeners[type]]) listener();
  },
};

function mockQuery(table: string) {
  const filters = new Map<string, unknown>();
  const chain = {
    eq(column: string, value: unknown) {
      filters.set(column, value);
      return chain;
    },
    contains() {
      return chain;
    },
    order() {
      return chain;
    },
    // 아래 목록 읽기(listDomainRecords)는 limit 에서 끝난다. 이 파일은 카드만 본다.
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
    maybeSingle() {
      mockSummaryReads.push({ table, id: filters.get("id") });
      const row = mockRows.get(`${table}:${String(filters.get("id"))}`);
      // 본인 행만 돌려준다(owner RLS 와 같은 모양). 남의 행은 없는 행과 같다.
      if (!row || row.userId !== filters.get("user_id")) {
        return Promise.resolve({ data: null, error: null });
      }
      // 배열은 복사해서 돌려준다(읽은 뒤에 표의 태그를 바꿔도 읽은 값은 그대로다). 배열이 아니면 그대로.
      const tags = Array.isArray(row.tags) ? [...(row.tags as unknown[])] : row.tags;
      return Promise.resolve({
        data:
          table === "sources"
            ? { id: row.id, kind: row.kind, title: row.title, captured_at: row.createdAt, tags }
            : { id: row.id, kind: row.kind, topic: row.title, created_at: row.createdAt, tags },
        error: null,
      });
    },
  };
  return chain;
}

const mockSupabase = { from: (table: string) => ({ select: () => mockQuery(table) }) };

function sameDeps(previous: DependencyList, next: DependencyList): boolean {
  return previous.length === next.length && previous.every((value, index) => Object.is(value, next[index]));
}

class ScreenHarness {
  tree: ReactElement | null = null;
  private readonly states: unknown[] = [];
  private readonly refs: { current: unknown }[] = [];
  private readonly callbacks: { callback: unknown; deps: DependencyList }[] = [];
  private readonly effects: (EffectSlot | undefined)[] = [];
  private pending: { index: number; effect: EffectCallback; deps: DependencyList | undefined }[] = [];
  private cursor = { state: 0, ref: 0, callback: 0, effect: 0 };
  private changed = false;

  constructor(private readonly screen: () => ReactElement | null) {}

  /** 한 번 그린다. 커밋되지 않은 지난 그리기의 effect 는 버린다 - React 도 마지막 그리기만 커밋한다. */
  render(): ReactElement | null {
    this.cursor = { state: 0, ref: 0, callback: 0, effect: 0 };
    this.pending = [];
    this.changed = false;
    mockActiveHarness = this;
    try {
      this.tree = this.screen();
    } finally {
      mockActiveHarness = null;
    }
    return this.tree;
  }

  useState<T>(initial: T | (() => T)): [T, (next: SetStateAction<T>) => void] {
    const index = this.cursor.state++;
    if (!(index in this.states)) {
      this.states[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    }
    const setState = (next: SetStateAction<T>) => {
      const previous = this.states[index] as T;
      const value = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      if (Object.is(value, previous)) return;
      this.states[index] = value;
      this.changed = true;
    };
    return [this.states[index] as T, setState];
  }

  useRef<T>(initial: T): { current: T } {
    const index = this.cursor.ref++;
    if (!this.refs[index]) this.refs[index] = { current: initial };
    return this.refs[index] as { current: T };
  }

  useCallback<T>(callback: T, deps: DependencyList): T {
    const index = this.cursor.callback++;
    const previous = this.callbacks[index];
    if (!previous || !sameDeps(previous.deps, deps)) this.callbacks[index] = { callback, deps };
    return this.callbacks[index].callback as T;
  }

  useEffect(effect: EffectCallback, deps?: DependencyList) {
    const index = this.cursor.effect++;
    const previous = this.effects[index];
    if (!previous || !deps || !previous.deps || !sameDeps(previous.deps, deps)) {
      this.pending.push({ index, effect, deps });
    }
  }

  flushEffects() {
    const pending = this.pending;
    this.pending = [];
    for (const item of pending) {
      this.effects[item.index]?.cleanup?.();
      const cleanup = item.effect();
      this.effects[item.index] = {
        deps: item.deps,
        cleanup: typeof cleanup === "function" ? cleanup : undefined,
      };
    }
  }

  /** 그리기 · effect · 비동기 응답을 더 바뀌는 것이 없을 때까지 돌린다. */
  async settle() {
    for (let round = 0; round < 20; round += 1) {
      this.render();
      this.flushEffects();
      await new Promise((resolve) => setImmediate(resolve));
      if (!this.changed) return;
    }
    throw new Error("화면이 가라앉지 않는다 - 읽기가 스스로 다시 돌고 있다");
  }

  unmount() {
    for (const slot of this.effects) slot?.cleanup?.();
    this.effects.length = 0;
    this.pending = [];
  }
}

let mockActiveHarness: ScreenHarness | null = null;

jest.mock("react-native", () => ({
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  View: "View",
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en", resolvedLanguage: "en" } }),
}));
jest.mock("expo-router", () => ({
  Redirect: "Redirect",
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  // React Navigation 의 useFocusEffect 를 줄인 것: 포커스 중에 마운트되거나 콜백이 바뀌면 바로
  // 돌고, focus 에서 (그 포커스에 아직 안 돌았으면) 돌고, blur 에서 정리한다.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(() => {
      let ran = false;
      let cleanup: void | (() => void);
      const run = () => {
        cleanup = effect();
        ran = true;
      };
      const onFocus = () => {
        if (!ran) run();
      };
      const onBlur = () => {
        if (typeof cleanup === "function") cleanup();
        cleanup = undefined;
        ran = false;
      };
      if (mockNavigation.focused) run();
      mockNavigation.listeners.focus.add(onFocus);
      mockNavigation.listeners.blur.add(onBlur);
      return () => {
        if (typeof cleanup === "function") cleanup();
        mockNavigation.listeners.focus.delete(onFocus);
        mockNavigation.listeners.blur.delete(onBlur);
      };
    }, [effect]);
  },
}));
jest.mock("@/components/deep-space/DomainStarLens", () => ({ DomainStarLens: "DomainStarLens" }));
jest.mock("@/components/deep-space/DeepSpaceScreen", () => ({ DeepSpaceScreen: "DeepSpaceScreen" }));
jest.mock("@/components/m3", () => ({ MdButton: "MdButton", MdCard: "MdCard", m3TextStyle: () => ({}) }));
jest.mock("@/components/deepspace/SecondbHead", () => ({ SecondbHead: "SecondbHead" }));
jest.mock("@/components/pixel/PixelGlyph", () => ({ PixelGlyph: "PixelGlyph" }));
jest.mock("@/components/pixel/PixelPressable", () => ({ PixelPressable: "PixelPressable" }));
jest.mock("@/components/premium", () => ({ PremiumLoadingState: "PremiumLoadingState" }));
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth.current }));
jest.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => mockSupabase }));
jest.mock("@/lib/persona/load-domain-levels", () => ({
  loadDomainLevels: () => Promise.resolve({ domainLevels: {} }),
}));
jest.mock("@/lib/records/create", () => ({ getRecordById: jest.fn() }));
jest.mock("@/lib/theme/m3", () => ({
  m3: {
    accent: { stageFloor: "stageFloor" },
    color: new Proxy({}, { get: (_target, key) => String(key) }),
    font: new Proxy({}, { get: (_target, key) => String(key) }),
    shape: { none: 0 },
  },
}));
jest.mock("@/lib/theme/tokens", () => ({
  deepSpace: { bgEdge: "bgEdge" },
  flattenAlpha: (color: string) => color,
}));

let Screen: () => ReactElement | null;
let restoreReact: () => void;

beforeAll(() => {
  const React = jest.requireActual<typeof import("react")>("react");
  const active = () => {
    if (!mockActiveHarness) throw new Error("화면 밖에서 훅을 불렀다");
    return mockActiveHarness;
  };
  const spies = [
    jest
      .spyOn(React, "useState")
      .mockImplementation(((initial: unknown) => active().useState(initial)) as typeof React.useState),
    jest
      .spyOn(React, "useRef")
      .mockImplementation(((initial: unknown) => active().useRef(initial)) as typeof React.useRef),
    jest
      .spyOn(React, "useCallback")
      .mockImplementation(((callback: unknown, deps: DependencyList) =>
        active().useCallback(callback, deps)) as typeof React.useCallback),
    jest
      .spyOn(React, "useEffect")
      .mockImplementation(((effect: EffectCallback, deps?: DependencyList) =>
        active().useEffect(effect, deps)) as typeof React.useEffect),
  ];
  // 테스트 변환은 JSX 를 고전 방식(React.createElement)으로 바꾼다(jest.config.js). 화면 파일은
  // React 를 import 하지 않으므로(앱 번들은 자동 방식) 그 이름을 전역에 둔다.
  (globalThis as { React?: unknown }).React = React;
  Screen = jest.requireActual<{ default: () => ReactElement | null }>("../star/[domain]").default;
  restoreReact = () => {
    for (const spy of spies) spy.mockRestore();
    delete (globalThis as { React?: unknown }).React;
  };
});

afterAll(() => restoreReact?.());

const harnesses: ScreenHarness[] = [];

afterEach(() => {
  for (const screen of harnesses.splice(0)) screen.unmount();
  mockNavigation.focused = true;
  mockNavigation.listeners.focus.clear();
  mockNavigation.listeners.blur.clear();
  mockRows.clear();
  mockSummaryReads.length = 0;
  mockParams.current = { domain: "career" };
});

async function open(params: { domain: string; pieceId?: string | string[] }): Promise<ScreenHarness> {
  mockParams.current = params;
  const screen = new ScreenHarness(Screen);
  harnesses.push(screen);
  await screen.settle();
  return screen;
}

/** 카드를 눌러 상세가 위에 쌓였다가(blur), 뒤로 와서 같은 화면에 포커스가 돌아온다(focus). */
async function leaveAndReturn(screen: ScreenHarness, whileAway: () => void = () => undefined) {
  mockNavigation.emit("blur");
  await screen.settle();
  whileAway();
  mockNavigation.emit("focus");
}

/** 기록을 저장한다. 상세의 영역 옮기기(updateRecordTags)도 이 행의 태그를 바꾸는 일이다. */
function fileRecord(tags: string[]) {
  mockRows.set(`records:${RECORD_ID}`, {
    id: RECORD_ID,
    userId: OWNER,
    kind: "journal",
    title: TITLE,
    createdAt: "2026-09-13T10:00:00Z",
    tags,
  });
}

function findByHint(node: unknown, hint: string): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByHint(child, hint);
      if (found) return found;
    }
    return null;
  }
  const React = jest.requireActual<typeof import("react")>("react");
  if (!React.isValidElement<Record<string, unknown>>(node)) return null;
  if (node.props.accessibilityHint === hint) return node;
  return findByHint(node.props.children, hint);
}

/** 맨 위 카드의 접근성 라벨("여기 담겼어요. 제목"). 카드가 없으면 null. */
function cardLabel(screen: ScreenHarness): unknown {
  return findByHint(screen.tree, "star.pieceOpenHint")?.props.accessibilityLabel ?? null;
}

describe("/star/[domain] 카드 - 상세에 다녀오면 다시 읽는다 (M1)", () => {
  test("상세에서 영역을 옮기고 돌아오면 옛 영역의 카드가 사라진다", async () => {
    fileRecord(["domain:career"]);
    const screen = await open({ domain: "career", pieceId: RECORD_ID });
    // INITIAL
    expect({ card: cardLabel(screen), reads: mockSummaryReads.length }).toEqual({ card: CARD_LABEL, reads: 1 });

    // MOVE_IN_DETAIL_THEN_BACK
    await leaveAndReturn(screen, () => fileRecord(["domain:finance"]));
    // 다시 읽는 동안에는 지난 읽기의 카드를 보이지 않는다.
    screen.render();
    expect(cardLabel(screen)).toBeNull();

    await screen.settle();
    expect({ card: cardLabel(screen), reads: mockSummaryReads.length }).toEqual({ card: null, reads: 2 });
    expect(mockSummaryReads).toEqual([
      { table: "records", id: RECORD_ID },
      { table: "records", id: RECORD_ID },
    ]);
  });

  test("영역이 그대로면 다시 읽은 뒤에도 카드가 남는다", async () => {
    fileRecord(["domain:career"]);
    const screen = await open({ domain: "career", pieceId: RECORD_ID });

    await leaveAndReturn(screen);
    screen.render();
    expect(cardLabel(screen)).toBeNull();

    await screen.settle();
    expect({ card: cardLabel(screen), reads: mockSummaryReads.length }).toEqual({ card: CARD_LABEL, reads: 2 });
  });

  test("돌아올 때마다 요약은 한 번만 읽는다 - 결과를 받아 다시 그려도 더 읽지 않는다", async () => {
    fileRecord(["domain:career"]);
    const screen = await open({ domain: "career", pieceId: RECORD_ID });

    for (const reads of [2, 3]) {
      await leaveAndReturn(screen);
      await screen.settle();
      await screen.settle();
      expect({ card: cardLabel(screen), reads: mockSummaryReads.length }).toEqual({ card: CARD_LABEL, reads });
    }
    // 포커스를 잃는 것만으로는 읽지 않는다.
    mockNavigation.emit("blur");
    await screen.settle();
    expect(mockSummaryReads.length).toBe(3);
  });
});

// 인가 재게이트 L1 (PR #1812, 2026-09-14): 같은 화면에서 pieceId 가 유효 -> 무효 -> 유효로 바뀌면 마지막
// 전환에서 요약을 두 번 읽었다. 포커스 재조회를 pieceId 가 유효할 때만 켜 두었더니, 다시 켜지는 순간
// useFocusEffect 의 콜백이 바뀌어 (이미 포커스된 화면이라) 곧바로 읽기 번호를 올렸고, 같은 커밋의 요약
// effect 도 바뀐 주소로 읽었다. 게이트 보고서의 발췌 재현(RE_ENABLE_VALID_ROUTE)을 여기로 옮겼다.
describe("/star/[domain] 카드 - 주소가 한 번 바뀌면 한 번만 읽는다 (L1)", () => {
  test("유효 -> 무효 -> 유효로 돌아와도 마지막 전환의 요약 읽기는 한 번이다", async () => {
    fileRecord(["domain:career"]);
    const screen = await open({ domain: "career", pieceId: RECORD_ID });
    expect({ card: cardLabel(screen), reads: mockSummaryReads.length }).toEqual({ card: CARD_LABEL, reads: 1 });

    // 라우터의 setParams 처럼 같은 화면에서 주소만 바뀐다. 다시 마운트하지도, 포커스를 잃지도 않는다.
    mockParams.current = { domain: "career", pieceId: "bad" };
    await screen.settle();
    expect({ card: cardLabel(screen), reads: mockSummaryReads.length }).toEqual({ card: null, reads: 1 });

    mockParams.current = { domain: "career", pieceId: RECORD_ID };
    await screen.settle();
    expect({ card: cardLabel(screen), reads: mockSummaryReads.length }).toEqual({ card: CARD_LABEL, reads: 2 });

    // 그 뒤로도 포커스가 돌아올 때마다 한 번이다(M1 은 그대로).
    await leaveAndReturn(screen);
    await screen.settle();
    expect({ card: cardLabel(screen), reads: mockSummaryReads.length }).toEqual({ card: CARD_LABEL, reads: 3 });
  });
});

// 생성물 게이트 A1 (2026-09-14): 이 화면이 형식이 틀린 pieceId 로 DB 를 부르지 않는다는 것이 소스
// 문자열로만 지켜지고 있었다. 파싱 앞에 읽기를 끼워 넣어도 그 핀은 초록이었다. 그 순서는 이제
// getPieceSummaryFromRoute 가 갖고(get-piece-summary.test.ts 가 DB 호출 수로 잰다), 여기서는 화면이
// 실제로 그 길로만 읽는지를 요약 읽기 수로 잰다. 돌아와도 0 이다.
describe("/star/[domain] 카드 - 형식이 틀린 pieceId 는 읽지 않는다 (A1)", () => {
  const MALFORMED: [string, string | string[] | undefined][] = [
    ["없음", undefined],
    ["빈 문자열", ""],
    ["uuid 아님", "not-a-uuid"],
    ["src- 뒤가 uuid 아님", "src-not-a-uuid"],
    ["빈 배열", []],
    ["첫 값이 틀림", [`${RECORD_ID}?`, RECORD_ID]],
    ["줄바꿈 붙은 uuid", `${RECORD_ID}\n`],
  ];

  test.each(MALFORMED)("%s", async (_label, pieceId) => {
    // 읽으면 카드가 뜰 수 있게 행을 둔다. 그래야 "안 읽었다"와 "읽었는데 안 맞았다"가 갈린다.
    fileRecord(["domain:career"]);
    const screen = await open({ domain: "career", pieceId });
    await leaveAndReturn(screen);
    await screen.settle();
    expect({ card: cardLabel(screen), reads: mockSummaryReads }).toEqual({ card: null, reads: [] });
  });
});

// 생성물 재게이트 B1 (PR #1812, 2026-09-14): 요약 행을 `as` 로 단언만 해서, 모양이 틀린 행이 오면 이 화면이
// filedDomainOf 의 for...of(tags) 나 제목의 .trim() 에서 멈췄고, tags 가 "domain:collect" 같은 문자열이면
// /star/collect 에 카드를 띄웠다. 스키마(tags text[] NOT NULL)상 정상으로는 오지 않는 행이지만, 오더라도 다른
// 실패와 같이 카드 없음이어야 한다. 함수의 판정은 get-piece-summary.test.ts 가 재고, 여기서는 그 행을 받은
// 화면이 멈추지 않고 카드를 비우는지를 잰다.
describe("/star/[domain] 카드 - 모양이 틀린 요약 행은 카드 없음이다 (B1)", () => {
  type Table = "records" | "sources";
  type Broken = { title?: unknown; tags?: unknown };

  /** 행을 표에 두고, 그 행을 가리키는 pieceId 를 돌려준다(소스는 src- 접두사). */
  function fileRow(table: Table, domain: string, broken: Broken = {}): string {
    mockRows.set(`${table}:${RECORD_ID}`, {
      id: RECORD_ID,
      userId: OWNER,
      kind: "journal",
      title: TITLE,
      createdAt: "2026-09-13T10:00:00Z",
      tags: [`domain:${domain}`],
      ...broken,
    });
    return table === "sources" ? `src-${RECORD_ID}` : RECORD_ID;
  }

  // 대조: 아래에서 카드가 없는 것이 이 자리에 원래 카드가 안 뜨기 때문이 아니라는 것.
  test.each<[Table, string]>([
    ["records", "career"],
    ["records", "collect"],
    ["sources", "career"],
  ])("대조 - 모양이 맞는 %s 행은 /star/%s 에서 카드가 뜬다", async (table, domain) => {
    const pieceId = fileRow(table, domain);
    const screen = await open({ domain, pieceId });
    expect({ card: cardLabel(screen), reads: mockSummaryReads }).toEqual({
      card: CARD_LABEL,
      reads: [{ table, id: RECORD_ID }],
    });
  });

  test.each<[string, Table, string, Broken]>([
    ["tags 가 숫자", "records", "career", { tags: 7 }],
    ["tags 가 문자열", "records", "collect", { tags: "domain:collect" }],
    ["tags 가 객체", "sources", "career", { tags: { 0: "domain:career", length: 1 } }],
    ["tags 안에 문자열 아닌 값", "records", "career", { tags: [7, "domain:career"] }],
    ["제목이 숫자", "records", "career", { title: 7 }],
    ["제목이 객체", "sources", "career", { title: { text: TITLE } }],
  ])("%s (%s, /star/%s)", async (_label, table, domain, broken) => {
    const pieceId = fileRow(table, domain, broken);
    const screen = await open({ domain, pieceId });
    expect({ card: cardLabel(screen), reads: mockSummaryReads }).toEqual({
      card: null,
      reads: [{ table, id: RECORD_ID }],
    });
  });
});
