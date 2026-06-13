import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("profile hub chips", () => {
  test("quick hub chips expose glyph, label, and hint hierarchy", () => {
    const source = readRepoFile("src/app/profile.tsx");

    expect(source).toContain("function HubGlyph");
    expect(source).toContain("<HubGlyph itemKey={item.key} color={item.accent} />");
    expect(source).toContain('variant="body"');
    expect(source).toContain('style={styles.quickChipLabel}');
    expect(source).toContain("{itemCopy.hint}");
    expect(source).toContain('style={styles.quickChipHint}');
    expect(source).not.toContain('<Text variant="caption" color="textMuted" numberOfLines={1}>\n                  {itemCopy.label}');
  });

  test("quick hub chips keep stable touch dimensions without color-only signaling", () => {
    const source = readRepoFile("src/app/profile.tsx");

    expect(source).toContain("minHeight: 84");
    expect(source).toContain('flexBasis: "48%"');
    expect(source).toContain("quickChipIcon");
    expect(source).toContain("borderColor: item.accent");
  });
});
