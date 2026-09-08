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
  // ⚠ 라우트 파일을 읽으면 은퇴한 레거시 반쪽을 읽게 된다. 이 계약이 오랫동안
  // 초록이었던 것이 그래서다 — /insights 와 /record/[id] 는 훅이 레거시 반쪽에만
  // 있었고 배송되는 화면에는 없었다(2026-09-08 실측, 둘 다 이번에 배선했다).
  // 그래서 화면이 라우트 밖에 있으면 **그 함수 본문만** 잘라서 본다.
  const screens: Array<{ file: string; fn?: string }> = [
    { file: "src/components/deep-space/DeepSpaceShell.tsx", fn: "DeepSpaceShell" },
    { file: "src/screens/deepspace/dds-wiki-records-screens.tsx", fn: "DeepSpaceRecordsScreen" },
    { file: "src/app/core-brain.tsx", fn: "CoreBrainScreen" },
    { file: "src/screens/deepspace/DeepSpaceDesignScreens.tsx", fn: "DeepSpaceInsightsScreen" },
    { file: "src/app/trinity.tsx", fn: "TrinityDeepSpace" },
    { file: "src/screens/deepspace/dds-record-detail-screen.tsx", fn: "DeepSpaceRecordDetailScreen" },
  ];

  /** `function <fn>` 선언부터 다음 최상위 function 직전까지. export 여부는 안 본다
   *  — CoreBrainScreen·TrinityDeepSpace 는 라우트 파일 안의 비-export 선언이다. */
  function functionBody(source: string, fn: string): string {
    const normalized = source.replace(/\r\n?/g, "\n");
    const decl = new RegExp(`^(?:export )?function ${fn}\\b`, "m");
    const hit = decl.exec(normalized);
    if (hit === null) throw new Error(`${fn} 선언을 못 찾았다`);
    const next = normalized.slice(hit.index + 1).search(/^(?:export )?function \w+/m);
    return next < 0 ? normalized.slice(hit.index) : normalized.slice(hit.index, hit.index + 1 + next);
  }

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
    // 헬퍼 이름이 아니라 **동작**을 본다. DeepSpaceShell 은 useFocusRefetch 를
    // 안 쓰고 useFocusEffect 로 직접 refreshTick 을 올린다 — 계약이 요구하는 것을
    // 하고 있으므로 통과여야 한다. 이름만 보면 그 화면이 거짓 위반으로 잡힌다.
    for (const screen of screens) {
      const file = read(screen.file);
      const source = screen.fn ? functionBody(file, screen.fn) : file;

      const viaHelper = source.includes("useFocusRefetch(");
      const viaEffect = source.includes("useFocusEffect(");
      expect({ screen: screen.fn ?? screen.file, refreshesOnFocus: viaHelper || viaEffect }).toEqual({
        screen: screen.fn ?? screen.file,
        refreshesOnFocus: true,
      });
      if (viaHelper) expect(file).toContain('from "@/lib/nav/use-focus-refetch"');
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
