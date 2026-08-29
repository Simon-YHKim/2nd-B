import type { DependencyList, EffectCallback, ReactElement, SetStateAction } from "react";
import type { CenterCard } from "../persona/center";
import type { PersonaCard } from "../persona/build";

type AuthState = {
  userId: string | null;
  loading: boolean;
  hasProfile: boolean | null;
  isMinor: boolean | null;
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface EffectSlot {
  deps: DependencyList | undefined;
  cleanup?: () => void;
}

const mockAuth: { current: AuthState } = {
  current: { userId: null, loading: true, hasProfile: null, isMinor: null },
};
const mockLanguage: { current: "en" | "ko" } = { current: "en" };
const mockDeepSpaceUI: { current: boolean } = { current: false };
const mockLoadPersonaSnapshot = jest.fn();
let mockRealLoadPersonaSnapshot: (userId: string) => Promise<PersonaCard | null>;
let mockRealBuildCenterCards: (persona: PersonaCard, locale: "en" | "ko") => CenterCard[];
const mockBuildCenterCards = jest.fn();
const mockLoadLatestStrengths = jest.fn((..._args: unknown[]) => Promise.resolve(null));
const mockLoadDomainLevels = jest.fn((..._args: unknown[]) => Promise.resolve(null));
const mockLoadSevenLevels = jest.fn((..._args: unknown[]) =>
  Promise.resolve({ northStarBrightness: 0.6 }),
);
const mockLoadProfileStarLevel = jest.fn((..._args: unknown[]) => Promise.resolve(null));
const mockFireCompanion = jest.fn();
const mockForbiddenBuildPersona = jest.fn((..._args: unknown[]) => {
  throw new Error("buildPersona must not run during Core Brain lifecycle");
});
const mockForbiddenLlm = jest.fn((..._args: unknown[]) => {
  throw new Error("LLM must not run during Core Brain lifecycle");
});
const mockForbiddenUsage = jest.fn((..._args: unknown[]) => {
  throw new Error("usage writer must not run during Core Brain lifecycle");
});
const mockMutationWriter = jest.fn((operation: string, ..._args: unknown[]) => {
  throw new Error(`Supabase ${operation} must not run during Core Brain lifecycle`);
});
const mockSelectCalls: { table: string; columns: string; userId: string | null }[] = [];
const mockFocus: { current: { callback: () => void; enabled: boolean } | null } = { current: null };
let mockReadError: { message: string } | null = null;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function persona(id: string) {
  const confidence = { source: "journal_text" as const, confidence: "low" as const, observationCount: 1 };
  return {
    version: 1,
    traits: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
    traitsSource: "heuristic" as const,
    traitConfidence: {
      openness: confidence,
      conscientiousness: confidence,
      extraversion: confidence,
      agreeableness: confidence,
      neuroticism: confidence,
    },
    mbti: null,
    attachment: null,
    values: [id],
    patterns: {},
    markdownExport: "",
  };
}

function persistedPersonaRow(id: string) {
  return {
    version: 1,
    traits: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
    values: [id],
    patterns: {},
    markdown_export: "",
  };
}

let mockPersonaRowForUser = (userId: string | null) => persistedPersonaRow(userId ?? "unknown");

function queryFor(table: string, columns: string) {
  let userId: string | null = null;
  const response = () => {
    mockSelectCalls.push({ table, columns, userId });
    if (mockReadError) return { data: null, error: mockReadError };
    if (table === "personas") return { data: mockPersonaRowForUser(userId), error: null };
    if (table === "records" && columns.includes("id, kind, topic")) {
      return {
        data: [
          {
            id: `${userId ?? "unknown"}-record`,
            kind: "journal",
            topic: "topic",
            created_at: "2026-08-29T00:00:00Z",
            tags: [],
          },
        ],
        error: null,
      };
    }
    return { data: [], error: null };
  };
  const chain = {
    eq(column: string, value: unknown) {
      if (column === "user_id") userId = String(value);
      return chain;
    },
    order() {
      return chain;
    },
    contains() {
      return chain;
    },
    limit() {
      return chain;
    },
    maybeSingle() {
      return Promise.resolve(response());
    },
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(response()).then(onfulfilled, onrejected);
    },
  };
  return chain;
}

const mockSupabase = {
  from: jest.fn((table: string) => ({
    select: (columns: string) => queryFor(table, columns),
    insert: (...args: unknown[]) => mockMutationWriter("insert", ...args),
    update: (...args: unknown[]) => mockMutationWriter("update", ...args),
    upsert: (...args: unknown[]) => mockMutationWriter("upsert", ...args),
    delete: (...args: unknown[]) => mockMutationWriter("delete", ...args),
  })),
  rpc: (...args: unknown[]) => mockMutationWriter("rpc", ...args),
};

class HookHarness {
  readonly states: unknown[] = [];
  readonly updates: { index: number; value: unknown }[] = [];
  private readonly effects: (EffectSlot | undefined)[] = [];
  private pending: { index: number; effect: EffectCallback; deps: DependencyList | undefined }[] = [];
  private stateCursor = 0;
  private effectCursor = 0;

  render(component: () => ReactElement): ReactElement {
    this.stateCursor = 0;
    this.effectCursor = 0;
    mockActiveHarness = this;
    try {
      return component();
    } finally {
      mockActiveHarness = null;
    }
  }

  useState<T>(initial: T | (() => T)): [T, (next: SetStateAction<T>) => void] {
    const index = this.stateCursor++;
    if (!(index in this.states)) {
      this.states[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    }
    const setState = (next: SetStateAction<T>) => {
      const previous = this.states[index] as T;
      const value = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      this.states[index] = value;
      this.updates.push({ index, value });
    };
    return [this.states[index] as T, setState];
  }

  useEffect(effect: EffectCallback, deps?: DependencyList) {
    const index = this.effectCursor++;
    const previous = this.effects[index];
    const changed =
      !previous ||
      !deps ||
      !previous.deps ||
      deps.length !== previous.deps.length ||
      deps.some((value, dependencyIndex) => !Object.is(value, previous.deps?.[dependencyIndex]));
    if (changed) this.pending.push({ index, effect, deps });
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

  clearUpdates() {
    this.updates.length = 0;
  }

  unmount() {
    for (const slot of this.effects) slot?.cleanup?.();
    this.effects.length = 0;
    this.pending = [];
  }
}

let mockActiveHarness: HookHarness | null = null;
let mockExpectedWarn: jest.SpyInstance | null = null;

jest.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  Modal: "Modal",
  Pressable: "Pressable",
  TouchableOpacity: "TouchableOpacity",
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: mockLanguage.current } }),
}));
jest.mock("expo-router", () => ({ Redirect: "Redirect", router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("@/components/ui/Text", () => ({ Text: "Text" }));
jest.mock("@/components/ui/Button", () => ({ Button: "Button" }));
jest.mock("@/components/premium", () => ({
  PremiumAppShell: "PremiumAppShell",
  PremiumCTA: "PremiumCTA",
  PremiumLoadingState: "PremiumLoadingState",
  SceneHero: "SceneHero",
  StatTile: "StatTile",
}));
jest.mock("@/lib/theme/tokens", () => ({
  cosmic: new Proxy({}, { get: (_target, key) => String(key) }),
  semantic: new Proxy({}, { get: (_target, key) => String(key) }),
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  flattenAlpha: (color: string) => color,
}));
jest.mock("@/components/pixel/PixelDither", () => ({ PixelScrim: "PixelScrim" }));
jest.mock("@/lib/ui-mode", () => ({ isDeepSpaceUI: () => mockDeepSpaceUI.current }));
jest.mock("@/components/deep-space/DeepSpaceScreen", () => ({ DeepSpaceScreen: "DeepSpaceScreen" }));
jest.mock("@/components/deep-space/PolarisDeck", () => ({ PolarisDeck: "PolarisDeck" }));
jest.mock("@/components/m3", () => ({ MdButton: "MdButton", m3TextStyle: () => ({}) }));
jest.mock("@/lib/theme/m3", () => ({
  m3: {
    color: new Proxy({}, { get: (_target, key) => String(key) }),
    font: new Proxy({}, { get: (_target, key) => String(key) }),
    shape: { none: 0 },
  },
}));
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth.current }));
jest.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => mockSupabase }));
jest.mock("@/lib/persona/build", () => {
  const actual = jest.requireActual<typeof import("../persona/build")>("@/lib/persona/build");
  mockRealLoadPersonaSnapshot = actual.loadPersonaSnapshot;
  return {
    ...actual,
    buildPersona: (...args: unknown[]) => mockForbiddenBuildPersona(...args),
    loadLatestStrengths: (...args: unknown[]) => mockLoadLatestStrengths(...args),
    loadPersonaSnapshot: (...args: [string]) => mockLoadPersonaSnapshot(...args),
  };
});
jest.mock("@/lib/llm/boundary", () => ({ callLlm: (...args: unknown[]) => mockForbiddenLlm(...args) }));
jest.mock("@/lib/entitlements/usage", () => ({
  incrementReasoningUsage: (...args: unknown[]) => mockForbiddenUsage(...args),
}));
jest.mock("@/lib/persona/strengths-survey", () => ({ STRENGTH_LABEL_EN: {}, STRENGTH_LABEL_KO: {} }));
jest.mock("@/lib/persona/domain-stars", () => ({ DOMAIN_STARS: [], getDomainStar: () => null }));
jest.mock("@/lib/persona/load-domain-levels", () => ({
  loadDomainLevels: (...args: unknown[]) => mockLoadDomainLevels(...args),
}));
jest.mock("@/lib/persona/home-stars", () => ({ HOME_STAR_IDS: [] }));
jest.mock("@/lib/assess/registry", () => ({ OFFERABLE: [] }));
jest.mock("@/lib/persona/load-profile-star", () => ({
  loadProfileStarLevel: (...args: unknown[]) => mockLoadProfileStarLevel(...args),
}));
jest.mock("@/lib/persona/load-seven-levels", () => ({
  loadSevenLevels: (...args: unknown[]) => mockLoadSevenLevels(...args),
}));
jest.mock("@/lib/persona/brightness-visual", () => ({
  brightnessVisual: () => ({ opacity: 0.2 }),
  brightnessBand: () => "dim",
}));
jest.mock("@/lib/persona/center", () => {
  const actual = jest.requireActual<typeof import("../persona/center")>("@/lib/persona/center");
  mockRealBuildCenterCards = actual.buildCenterCards;
  return {
    ...actual,
    buildCenterCards: (...args: [PersonaCard, "en" | "ko"]) => mockBuildCenterCards(...args),
  };
});
jest.mock("@/lib/persona/evidence", () => ({
  mergeEvidence: (rows: { id: string }[]) =>
    rows.map((row) => ({ id: row.id, origin: "record", title: row.id, dateLabel: "", type: "journal" })),
  evidenceTypeLabel: () => "record",
}));
jest.mock("@/components/art/CompanionSprite", () => ({
  CompanionMoment: "CompanionMoment",
  useCompanionMoment: () => ({ moment: null, fire: mockFireCompanion }),
}));
jest.mock("@/components/art/IslandArt", () => ({ IslandArt: "IslandArt" }));
jest.mock("@/lib/village-ui", () => ({
  CORE_VILLAGE_UI: { island: "core", worker: "worker", accent: "accent", speech: { en: "", ko: "" } },
}));
jest.mock("@/lib/settings/readable-font", () => ({ subscribeFontStyle: () => jest.fn() }));
jest.mock("@/lib/nav/use-focus-refetch", () => ({
  useFocusRefetch: (callback: () => void, enabled: boolean) => {
    mockFocus.current = { callback, enabled };
  },
}));

let renderCoreBrainScreen: (harness: HookHarness) => ReactElement;
let restoreReactHooks: () => void;

async function flushAsync(rounds = 12) {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

function findElement(
  node: unknown,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  const React = jest.requireActual<typeof import("react")>("react");
  if (!React.isValidElement<Record<string, unknown>>(node)) return null;
  if (predicate(node)) return node;
  return findElement(node.props.children, predicate);
}

function renderedText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join(" ");
  const React = jest.requireActual<typeof import("react")>("react");
  if (!React.isValidElement<Record<string, unknown>>(node)) return "";
  return renderedText(node.props.children);
}

function assertNoMutationEgress() {
  expect(mockForbiddenBuildPersona).not.toHaveBeenCalled();
  expect(mockForbiddenLlm).not.toHaveBeenCalled();
  expect(mockForbiddenUsage).not.toHaveBeenCalled();
  expect(mockMutationWriter).not.toHaveBeenCalled();
}

beforeAll(() => {
  try {
    const React = jest.requireActual<typeof import("react")>("react");
    const stateSpy = jest.spyOn(React, "useState").mockImplementation(((initial: unknown) => {
      if (!mockActiveHarness) throw new Error("useState called outside HookHarness render");
      return mockActiveHarness.useState(initial);
    }) as typeof React.useState);
    const effectSpy = jest.spyOn(React, "useEffect").mockImplementation(((effect: EffectCallback, deps?: DependencyList) => {
      if (!mockActiveHarness) throw new Error("useEffect called outside HookHarness render");
      mockActiveHarness.useEffect(effect, deps);
    }) as typeof React.useEffect);
    const CoreBrain = jest.requireActual("../../app/core-brain").default as () => ReactElement;
    const screen = CoreBrain().type as () => ReactElement;
    renderCoreBrainScreen = (harness) => harness.render(screen);
    restoreReactHooks = () => {
      stateSpy.mockRestore();
      effectSpy.mockRestore();
    };
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
    throw new Error(`Core Brain harness setup failed: ${detail}`);
  }
});

afterAll(() => restoreReactHooks?.());

beforeEach(() => {
  mockAuth.current = { userId: null, loading: true, hasProfile: null, isMinor: null };
  mockLanguage.current = "en";
  mockDeepSpaceUI.current = false;
  mockReadError = null;
  mockFocus.current = null;
  mockSelectCalls.length = 0;
  mockPersonaRowForUser = (userId) => persistedPersonaRow(userId ?? "unknown");
  mockLoadPersonaSnapshot.mockReset().mockImplementation((userId: string) => mockRealLoadPersonaSnapshot(userId));
  mockBuildCenterCards.mockReset().mockImplementation((card: PersonaCard, locale: "en" | "ko") =>
    mockRealBuildCenterCards(card, locale).map((centerCard) =>
      centerCard.id === "direction"
        ? { ...centerCard, body: `${centerCard.body} [persona:${card.values[0] ?? "none"}]` }
        : centerCard,
    ),
  );
  mockLoadLatestStrengths.mockClear();
  mockLoadDomainLevels.mockClear();
  mockLoadSevenLevels.mockClear();
  mockLoadProfileStarLevel.mockClear();
  mockFireCompanion.mockClear();
  mockForbiddenBuildPersona.mockClear();
  mockForbiddenLlm.mockClear();
  mockForbiddenUsage.mockClear();
  mockMutationWriter.mockClear();
  mockSupabase.from.mockClear();
});

afterEach(() => {
  mockExpectedWarn?.mockRestore();
  mockExpectedWarn = null;
});

describe("Core Brain rendered read-only lifecycle", () => {
  test("does not read before auth resolves, then runs one SELECT-only mount load", async () => {
    const harness = new HookHarness();
    renderCoreBrainScreen(harness);
    harness.flushEffects();

    expect(mockSelectCalls).toEqual([]);
    expect(mockLoadPersonaSnapshot).not.toHaveBeenCalled();
    expect(mockFocus.current?.enabled).toBe(false);

    mockAuth.current = { userId: "u1", loading: false, hasProfile: null, isMinor: null };
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    expect(mockSelectCalls).toEqual([]);
    expect(mockFocus.current?.enabled).toBe(false);

    mockAuth.current = { userId: "u1", loading: false, hasProfile: true, isMinor: null };
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    expect(mockSelectCalls).toEqual([]);

    mockAuth.current = { userId: "u1", loading: false, hasProfile: true, isMinor: false };
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();

    expect(mockLoadPersonaSnapshot).toHaveBeenCalledTimes(1);
    expect(mockLoadPersonaSnapshot).toHaveBeenCalledWith("u1");
    expect(mockSelectCalls.map((call) => call.table)).toEqual(expect.arrayContaining(["records", "sources"]));
    expect(harness.states[0]).toMatchObject({ values: ["u1"] });
    assertNoMutationEgress();
  });

  test("renders a legacy snapshot as an unprovenanced saved result, not a current direction", async () => {
    const harness = new HookHarness();
    mockAuth.current = { userId: "legacy", loading: false, hasProfile: true, isMinor: false };

    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();
    const tree = renderCoreBrainScreen(harness);
    const text = renderedText(tree);

    expect(mockLoadPersonaSnapshot).toHaveBeenCalledWith("legacy");
    expect(harness.states[0]).toMatchObject({
      traitConfidence: { openness: { source: "default", confidence: "low" } },
    });
    expect(text).toContain("Previously saved result");
    expect(text).toContain("source was not recorded");
    expect(text).not.toContain("journal-based estimate");
    expect(text).not.toContain("What's lit brightest");

    mockLanguage.current = "ko";
    const koreanText = renderedText(renderCoreBrainScreen(harness));
    expect(koreanText).toContain("기존 저장 결과");
    expect(koreanText).toContain("출처가 기록되지 않아");
    expect(koreanText).not.toContain("일기 기반 추정");
    expect(koreanText).not.toContain("요즘 가장 밝게");
    assertNoMutationEgress();
  });

  test("keeps unprovenanced persona derivations out of the deep-space Polaris deck", async () => {
    const harness = new HookHarness();
    mockDeepSpaceUI.current = true;
    mockAuth.current = { userId: "legacy", loading: false, hasProfile: true, isMinor: false };
    mockPersonaRowForUser = () => persistedPersonaRow("values:achievement");

    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();
    const tree = renderCoreBrainScreen(harness);
    const deck = findElement(tree, (element) => element.type === "PolarisDeck");

    expect(deck).not.toBeNull();
    const pages = deck?.props.pages as { key: string; body: ReactElement }[];
    expect(pages.map((page) => page.key)).toEqual(["role", "portrait", "evidence"]);
    const pageText = renderedText(pages.map((page) => page.body));
    expect(pageText).toContain("Previously saved result");
    expect(pageText).toContain("source was not recorded");
    expect(pageText).not.toContain("BIG FIVE");
    expect(pageText).not.toContain("Open");
    expect(pageText).not.toContain("Values · Achievement");
    assertNoMutationEgress();
  });

  test("focus refresh performs SELECT reads without rebuilding the snapshot", async () => {
    const harness = new HookHarness();
    mockAuth.current = { userId: "u1", loading: false, hasProfile: true, isMinor: false };
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();
    const selectsAfterMount = mockSelectCalls.length;

    expect(mockFocus.current?.enabled).toBe(true);
    mockFocus.current?.callback();
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();

    expect(mockSelectCalls.length).toBeGreaterThan(selectsAfterMount);
    expect(mockLoadPersonaSnapshot).toHaveBeenCalledTimes(1);
    assertNoMutationEgress();
  });

  test("retry re-runs the same SELECT-only mount loader after a read failure", async () => {
    const harness = new HookHarness();
    mockExpectedWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockAuth.current = { userId: "u1", loading: false, hasProfile: true, isMinor: false };
    mockReadError = { message: "offline" };
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();

    expect(harness.states[7]).toBe(true);
    mockReadError = null;
    const errorTree = renderCoreBrainScreen(harness);
    harness.flushEffects();
    const retry = findElement(errorTree, (element) => element.props.label === "tryAgain");
    expect(retry).not.toBeNull();
    (retry?.props.onPress as () => void)();

    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();

    expect(mockLoadPersonaSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.states[7]).toBe(false);
    expect(mockExpectedWarn).toHaveBeenCalledWith("[core-brain] load failed", "offline");
    assertNoMutationEgress();
  });

  test("unmount cancels a deferred snapshot before it can update state", async () => {
    const harness = new HookHarness();
    const pending = deferred<ReturnType<typeof persona>>();
    mockAuth.current = { userId: "u1", loading: false, hasProfile: true, isMinor: false };
    mockLoadPersonaSnapshot.mockImplementationOnce(() => pending.promise);
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();
    expect(mockLoadPersonaSnapshot).toHaveBeenCalledWith("u1");

    harness.clearUpdates();
    harness.unmount();
    pending.resolve(persona("stale-u1"));
    await flushAsync();

    expect(harness.updates).toEqual([]);
    assertNoMutationEgress();
  });

  test("never paints the completed user's markers during the next user's pre-effect render", async () => {
    const harness = new HookHarness();
    mockLoadPersonaSnapshot.mockImplementation((userId: string) =>
      Promise.resolve(persona(`${userId}-marker`)),
    );
    mockAuth.current = { userId: "u1", loading: false, hasProfile: true, isMinor: false };
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();

    const u1Tree = renderCoreBrainScreen(harness);
    expect(renderedText(u1Tree)).toContain("persona:u1-marker");

    mockAuth.current = { userId: "u2", loading: false, hasProfile: true, isMinor: false };
    const preEffectTree = renderCoreBrainScreen(harness);
    expect(renderedText(preEffectTree)).not.toContain("persona:u1-marker");

    harness.flushEffects();
    await flushAsync();
    const u2Tree = renderCoreBrainScreen(harness);
    expect(renderedText(u2Tree)).toContain("persona:u2-marker");
    expect(renderedText(u2Tree)).not.toContain("persona:u1-marker");
    assertNoMutationEgress();
  });

  test("keeps the previous user's persona hidden when the next snapshot fails and focus is requested", async () => {
    const harness = new HookHarness();
    let rejectU2Snapshot = true;
    mockExpectedWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockLoadPersonaSnapshot.mockImplementation((userId: string) => {
      if (userId === "u1") return Promise.resolve(persona("u1-marker"));
      if (rejectU2Snapshot) return Promise.reject(new Error("u2 snapshot offline"));
      return Promise.resolve(persona("u2-marker"));
    });

    mockAuth.current = { userId: "u1", loading: false, hasProfile: true, isMinor: false };
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();
    expect(renderedText(renderCoreBrainScreen(harness))).toContain("persona:u1-marker");

    mockAuth.current = { userId: "u2", loading: false, hasProfile: true, isMinor: false };
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();
    const errorTree = renderCoreBrainScreen(harness);
    expect(renderedText(errorTree)).toContain("loadError");
    expect(renderedText(errorTree)).not.toContain("persona:u1-marker");

    rejectU2Snapshot = false;
    const u2SnapshotCallsBeforeFocus = mockLoadPersonaSnapshot.mock.calls.filter(
      ([userId]) => userId === "u2",
    ).length;
    mockFocus.current?.callback();
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();

    const afterFocusTree = renderCoreBrainScreen(harness);
    expect(mockLoadPersonaSnapshot.mock.calls.filter(([userId]) => userId === "u2")).toHaveLength(
      u2SnapshotCallsBeforeFocus,
    );
    expect(renderedText(afterFocusTree)).not.toContain("persona:u1-marker");
    expect(renderedText(afterFocusTree)).toContain("loadError");
    assertNoMutationEgress();
  });

  test("user change cleans up the old deferred load and blocks stale state", async () => {
    const harness = new HookHarness();
    const oldUser = deferred<ReturnType<typeof persona>>();
    mockAuth.current = { userId: "u1", loading: false, hasProfile: true, isMinor: false };
    mockLoadPersonaSnapshot.mockImplementation((userId: string) =>
      userId === "u1" ? oldUser.promise : Promise.resolve(persona(userId)),
    );
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();

    mockAuth.current = { userId: "u2", loading: false, hasProfile: true, isMinor: false };
    renderCoreBrainScreen(harness);
    harness.flushEffects();
    await flushAsync();
    expect(harness.states[0]).toMatchObject({ values: ["u2"] });
    expect(harness.states[1]).toEqual([
      expect.objectContaining({ id: "u2-record" }),
    ]);

    harness.clearUpdates();
    oldUser.resolve(persona("stale-u1"));
    await flushAsync();

    expect(harness.states[0]).toMatchObject({ values: ["u2"] });
    expect(harness.states[1]).toEqual([
      expect.objectContaining({ id: "u2-record" }),
    ]);
    expect(harness.updates.filter((update) => update.index === 0 || update.index === 1)).toEqual([]);
    assertNoMutationEgress();
  });
});
