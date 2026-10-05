import { readFileSync } from "node:fs";
import { join } from "node:path";

// D-08 (QA 261004): Android clipped text on two Galmuri surfaces. RN render
// tests are blocked here, so the fix is held as a source contract on the
// shipped style objects. (The avatar tab strips and the legal-doc title are
// guarded next to their own contracts: avatar-studio-contract.test.ts and
// legal-back-and-inset.test.ts.)

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

function styleBlock(source: string, key: string): string {
  const start = source.indexOf(`  ${key}: {`);
  if (start < 0) throw new Error(`style ${key} not found`);
  const end = source.indexOf("\n  },", start);
  const oneLine = source.indexOf("},", start);
  // `key: { ... },` on one line, or a multi-line block closed by `  },`.
  const close = oneLine >= 0 && (end < 0 || oneLine < end) ? oneLine : end;
  return source.slice(start, close + 3);
}

describe("D-08 Android text clipping", () => {
  // Retargeted 2026-10-05 (QA R2A-06). D-08 pinned `lineHeight: 32`, which fit only at
  // font scale 1.0: Fabric measures the empty box from the placeholder with that
  // lineHeight (32sp stays ~32dp at 1.3 on Android 14+), but the EditText draws the
  // hint at the face's own spacing, which grows with the font. At 1.3 the box stayed
  // 64dp and the second hint line lost ~5dp. The property is the same (the second
  // placeholder line fits); the contract is now "no fixed lineHeight", so measuring
  // and drawing share one spacing at every scale.
  test("/northstar hero input: no font padding and no fixed lineHeight, so the placeholder's second line fits at any font scale", () => {
    const block = styleBlock(read("src/app/northstar.tsx"), "heroInput");
    expect(block).toContain("fontFamily: m3.font.plain");
    expect(block).toContain("fontSize: 24");
    expect(block).not.toMatch(/lineHeight\s*:/);
    expect(block).toContain("includeFontPadding: false");
    expect(block).toContain('textAlignVertical: "top"');
  });

  test("/northstar hero input: the native hint keeps Korean words whole (no '찾 / 고')", () => {
    const source = read("src/app/northstar.tsx");
    expect(source).toContain('placeholder={keepAllPlaceholder(t("ds.northstar.placeholder"), Platform.OS)}');
  });

  test("loader caption stays on the Galmuri 12 grid with an explicit line height", () => {
    const block = styleBlock(read("src/components/deepspace/DeepSpaceLoader.tsx"), "caption");
    expect(block).toContain("fontSize: m3.type.labelLarge.size");
    expect(block).toContain("lineHeight: m3.type.labelLarge.line");
    expect(block).toMatch(/paddingBottom: [1-9]/);
    expect(block).not.toMatch(/fontSize: 13\b/);
  });
});
