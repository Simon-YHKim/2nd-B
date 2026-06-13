import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("PremiumTabBar active state", () => {
  test("active tabs do not rely on color alone", () => {
    const source = readRepoFile("src/components/premium/tab-bar.tsx");

    expect(source).toContain("{active ? <View style={styles.activeCue} /> : null}");
    expect(source).toContain("active ? styles.labelActive : null");
    expect(source).toContain("activeCue:");
    expect(source).toContain('alignSelf: "center"');
    expect(source).toContain("labelActive:");
    expect(source).toContain("accessibilityState={{ selected: active }}");
  });

  test("tab labels stay bumped above caption size", () => {
    const source = readRepoFile("src/components/premium/tab-bar.tsx");

    expect(source).toContain("fontSize: typography.sizes.sm");
    expect(source).not.toContain("fontSize: typography.sizes.xs");
  });
});
