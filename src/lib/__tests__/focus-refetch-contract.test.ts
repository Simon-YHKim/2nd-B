import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("core-loop focus refetch contract", () => {
  // Legacy UI track removed 2026-06-23: index/records/insights/record-detail are now
  // thin wrappers over the deep-space shell, which does not use the focus-refetch hook
  // (the village data-node graph that drove that path is gone). core-brain and trinity
  // are still real screens that own a Gemini-billing refetch, so the contract stays on
  // them — the surviving screens that must not re-bill on focus.
  const screens = ["src/app/core-brain.tsx", "src/app/trinity.tsx"];

  it("keeps the shared hook as a focus-only refetch helper", () => {
    const source = read("src/lib/nav/use-focus-refetch.ts");

    expect(source).toContain('from "expo-router"');
    expect(source).toContain("useFocusEffect");
    expect(source).toContain("initialFocusHandledRef");
    expect(source).toContain("refetchRef.current()");
  });

  it("refreshes all stale core-loop screens when they regain focus", () => {
    for (const screen of screens) {
      const source = read(screen);

      expect(source).toContain('from "@/lib/nav/use-focus-refetch"');
      expect(source).toContain("useFocusRefetch(");
    }
  });

  it("keeps Core Brain focus refresh evidence-only so re-focus does not re-bill Gemini", () => {
    const source = read("src/app/core-brain.tsx");
    expect(source).toContain("function loadCoreBrainEvidence");
    expect(source).toContain("useFocusRefetch(() => setEvidenceReloadKey((k) => k + 1), Boolean(userId && hasProfile !== false))");
    expect(source).toContain("buildPersona");

    const evidenceRefreshEffect = source.slice(
      source.indexOf("if (evidenceReloadKey === 0"),
      source.indexOf("}, [userId, hasProfile, locale, evidenceReloadKey]"),
    );
    expect(evidenceRefreshEffect).toContain("loadCoreBrainEvidence(userId, locale)");
    expect(evidenceRefreshEffect).not.toContain("buildPersona");
  });

  // Legacy UI track removed 2026-06-23: the "Home data-node identity stabilization"
  // case pinned the village graph's retainStableDataNodes + setGraphReloadKey wiring
  // inside src/app/index.tsx, which is now a thin deep-space wrapper. The
  // retainStableDataNodes helper itself survives in src/lib/graph/data-nodes.ts and is
  // covered by src/lib/graph/__tests__/data-nodes.test.ts. No deep-space equivalent of
  // this focus-refetch graph path exists, so the legacy-only case is removed.
});
