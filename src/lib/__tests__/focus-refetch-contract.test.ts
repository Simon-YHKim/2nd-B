import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

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

  it("refreshes all stale core-loop screens when they regain focus", () => {
    for (const screen of screens) {
      const source = read(screen);

      expect(source).toContain('from "@/lib/nav/use-focus-refetch"');
      expect(source).toContain("useFocusRefetch(");
    }
  });

  it("keeps Home data-node identity stabilization in the refetch path", () => {
    const source = read("src/app/index.tsx");

    expect(source).toContain("retainStableDataNodes(dataNodesRef.current, nextDataNodes)");
    expect(source).toContain("useFocusRefetch(() => setGraphReloadKey((k) => k + 1), Boolean(userId))");
  });
});
