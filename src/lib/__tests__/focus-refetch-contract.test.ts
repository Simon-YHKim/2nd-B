import fs from "node:fs";
import path from "node:path";
import type { DependencyList } from "react";

const mockRegisteredFocusEffects: (() => void | undefined)[] = [];
let mockLastFocusEffect: (() => void | undefined) | null = null;

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | undefined) => {
    if (effect !== mockLastFocusEffect) {
      mockLastFocusEffect = effect;
      mockRegisteredFocusEffects.push(effect);
    }
  },
}));

class FocusHookHarness {
  private readonly refs: { current: unknown }[] = [];
  private readonly callbacks: { callback: unknown; deps: DependencyList }[] = [];
  private refCursor = 0;
  private callbackCursor = 0;

  render(run: () => void) {
    this.refCursor = 0;
    this.callbackCursor = 0;
    mockActiveFocusHarness = this;
    try {
      run();
    } finally {
      mockActiveFocusHarness = null;
    }
  }

  useRef<T>(initial: T): { current: T } {
    const index = this.refCursor++;
    if (!this.refs[index]) this.refs[index] = { current: initial };
    return this.refs[index] as { current: T };
  }

  useCallback<T>(callback: T, deps: DependencyList): T {
    const index = this.callbackCursor++;
    const previous = this.callbacks[index];
    const changed =
      !previous ||
      deps.length !== previous.deps.length ||
      deps.some((value, dependencyIndex) => !Object.is(value, previous.deps[dependencyIndex]));
    if (changed) this.callbacks[index] = { callback, deps };
    return this.callbacks[index].callback as T;
  }
}

let mockActiveFocusHarness: FocusHookHarness | null = null;
let actualUseFocusRefetch: (refetch: () => void, enabled?: boolean) => void;
let restoreFocusReactHooks: () => void;

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

beforeAll(() => {
  const React = jest.requireActual<typeof import("react")>("react");
  const refSpy = jest.spyOn(React, "useRef").mockImplementation(((initial: unknown) => {
    if (!mockActiveFocusHarness) throw new Error("useRef called outside FocusHookHarness render");
    return mockActiveFocusHarness.useRef(initial);
  }) as typeof React.useRef);
  const callbackSpy = jest.spyOn(React, "useCallback").mockImplementation(((callback: unknown, deps: DependencyList) => {
    if (!mockActiveFocusHarness) throw new Error("useCallback called outside FocusHookHarness render");
    return mockActiveFocusHarness.useCallback(callback, deps);
  }) as typeof React.useCallback);
  actualUseFocusRefetch = jest.requireActual<typeof import("../nav/use-focus-refetch")>(
    "../nav/use-focus-refetch"
  ).useFocusRefetch;
  restoreFocusReactHooks = () => {
    refSpy.mockRestore();
    callbackSpy.mockRestore();
  };
});

afterAll(() => restoreFocusReactHooks?.());

beforeEach(() => {
  mockRegisteredFocusEffects.length = 0;
  mockLastFocusEffect = null;
});

describe("core-loop focus refetch contract", () => {
  const screens = [
    "src/app/index.tsx",
    "src/app/records.tsx",
    "src/app/core-brain.tsx",
    "src/app/insights.tsx",
    "src/app/trinity.tsx",
    "src/app/record/[id].tsx",
  ];

  it("keeps the shared hook as a focus-only refetch helper", () => {
    const source = read("src/lib/nav/use-focus-refetch.ts");

    expect(source).toContain('from "expo-router"');
    expect(source).toContain("useFocusEffect");
    expect(source).toContain("initialFocusHandledRef");
    expect(source).toContain("refetchRef.current()");
  });

  it("runs the actual focus hook with initial-focus skip and enabled re-registration", () => {
    const harness = new FocusHookHarness();
    const refetch = jest.fn();

    harness.render(() => actualUseFocusRefetch(refetch, false));
    expect(mockRegisteredFocusEffects).toHaveLength(1);
    mockRegisteredFocusEffects[0]();
    expect(refetch).not.toHaveBeenCalled();

    harness.render(() => actualUseFocusRefetch(refetch, true));
    expect(mockRegisteredFocusEffects).toHaveLength(2);
    expect(mockRegisteredFocusEffects[1]).not.toBe(mockRegisteredFocusEffects[0]);
    mockRegisteredFocusEffects[1]();
    expect(refetch).not.toHaveBeenCalled();
    mockRegisteredFocusEffects[1]();
    expect(refetch).toHaveBeenCalledTimes(1);

    harness.render(() => actualUseFocusRefetch(refetch, false));
    expect(mockRegisteredFocusEffects).toHaveLength(3);
    mockRegisteredFocusEffects[2]();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes all stale core-loop screens when they regain focus", () => {
    for (const screen of screens) {
      const source = read(screen);

      expect(source).toContain('from "@/lib/nav/use-focus-refetch"');
      expect(source).toContain("useFocusRefetch(");
    }
  });

  it("keeps Core Brain mount/retry and focus refresh read-only", () => {
    const source = read("src/app/core-brain.tsx");
    expect(source).toContain("function loadCoreBrainEvidence");
    expect(source).toContain("useFocusRefetch(() => setEvidenceReloadKey((k) => k + 1), Boolean(userId && hasProfile === true))");
    expect(source).not.toContain("buildPersona");

    const mountEffect = source.slice(
      source.indexOf("// The snapshot path is SELECT-only"),
      source.indexOf("useFocusRefetch("),
    );
    expect(mountEffect).toContain("loadCoreBrainEvidence(userId, locale)");
    expect(mountEffect).toContain("loadPersonaSnapshot(userId)");
    expect(mountEffect).not.toMatch(/\.(?:insert|update|upsert|delete)\(/);

    const evidenceRefreshStart = source.indexOf("if (evidenceReloadKey === 0");
    const evidenceRefreshEnd = source.indexOf(
      "}, [userId, hasProfile, locale, evidenceReloadKey, resolvedUserId]);",
      evidenceRefreshStart,
    );
    expect(evidenceRefreshStart).toBeGreaterThanOrEqual(0);
    expect(evidenceRefreshEnd).toBeGreaterThan(evidenceRefreshStart);
    const evidenceRefreshEffect = source.slice(evidenceRefreshStart, evidenceRefreshEnd);
    expect(evidenceRefreshEffect).toContain("hasProfile !== true");
    expect(evidenceRefreshEffect).toContain("loadCoreBrainEvidence(userId, locale)");
    expect(evidenceRefreshEffect).not.toContain("buildPersona");
    expect(evidenceRefreshEffect).not.toMatch(/\.(?:insert|update|upsert|delete)\(/);
  });

  it("keeps Home data-node identity stabilization in the refetch path", () => {
    const source = read("src/app/index.tsx");

    expect(source).toContain("retainStableDataNodes(dataNodesRef.current, nextDataNodes)");
    expect(source).toContain("useFocusRefetch(() => setGraphReloadKey((k) => k + 1), Boolean(userId))");
  });
});
