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
  test("/northstar hero input: no font padding and a full-advance line, so the placeholder's second line fits", () => {
    const block = styleBlock(read("src/app/northstar.tsx"), "heroInput");
    expect(block).toContain("fontFamily: m3.font.plain");
    expect(block).toContain("fontSize: 24");
    // Galmuri11 hhea 1200 + 200 + 200 = 1600 of 1200 upem -> 32 at 24px.
    expect(block).toContain("lineHeight: 32");
    expect(block).toContain("includeFontPadding: false");
    expect(block).toContain('textAlignVertical: "top"');
  });

  test("loader caption stays on the Galmuri 12 grid with an explicit line height", () => {
    const block = styleBlock(read("src/components/deepspace/DeepSpaceLoader.tsx"), "caption");
    expect(block).toContain("fontSize: m3.type.labelLarge.size");
    expect(block).toContain("lineHeight: m3.type.labelLarge.line");
    expect(block).toMatch(/paddingBottom: [1-9]/);
    expect(block).not.toMatch(/fontSize: 13\b/);
  });
});
