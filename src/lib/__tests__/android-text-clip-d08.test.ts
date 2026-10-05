import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

// D-08 (QA 261004): Android clipped text on two Galmuri surfaces. RN render
// tests are blocked here, so the fix is held as a source contract on the
// shipped style objects. (The avatar tab strips and the legal-doc title are
// guarded next to their own contracts: avatar-studio-contract.test.ts and
// legal-back-and-inset.test.ts.)

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

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

// R2A-04 (QA 261005): the Korean boot loader still read "불러오는" without "중" after
// the fix above, and the cause was not the style. Native RootLayout drew InlineLoader
// under the splash while Galmuri was still loading, so its caption was measured in the
// fallback face. Android's text-measure cache keys on the family NAME and the requested
// size, not on whether that family is registered yet (RN 0.85.3 TextLayoutManager.cpp
// 193-201, TextMeasureCache.h 111-133), so every later loader with the same words got
// the narrower fallback width back, wrapped its last word onto a second line and clipped
// it. Galmuri: "불러오는 중" 227.5px, "Loading" 171.5px at 12sp (verify-R2A-04 font_check).
// The rule that removes it for every language: no loader caption is laid out before the
// font is in. (Device measurement of the cache hit was not done; this guards the cause
// the verification traced in code.)
function jsxName(node: ts.JsxSelfClosingElement | ts.JsxOpeningElement): string {
  return node.tagName.getText();
}

function hasAttribute(node: ts.JsxSelfClosingElement, name: string): boolean {
  return node.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText() === name);
}

/** Every <InlineLoader .../> rendered inside an `if` whose condition reads fontsReady. */
function loadersBehindFontGates(path: string): { text: string; bare: boolean }[] {
  const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { text: string; bare: boolean }[] = [];
  const visitGate = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) && jsxName(node) === "InlineLoader") {
      found.push({ text: node.getText(), bare: hasAttribute(node, "bare") });
    }
    ts.forEachChild(node, visitGate);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node) && /\bfontsReady\b/.test(node.expression.getText())) {
      visitGate(node.thenStatement);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("R2A-04 no loader caption is measured before the pixel font is registered", () => {
  test("both font waits in the root layout draw the loader bare", () => {
    const loaders = loadersBehindFontGates("src/app/_layout.tsx");
    // RootLayout's native font wait and IntroGate's web font hand-over. If a gate is
    // removed or renamed, this count is where to look first.
    expect(loaders.map((l) => l.text)).toEqual(["<InlineLoader bare={!fontsReady} />", "<InlineLoader bare />"]);
    expect(loaders.every((l) => l.bare)).toBe(true);
  });

  test("bare reaches the caption: InlineLoader forwards it and the dots loader then draws no Text", () => {
    const inline = read("src/components/ui/InlineLoader.tsx");
    expect(inline).toContain('<DeepSpaceLoader variant="dots" caption={message} bare={bare} />');
    const loader = read("src/components/deepspace/DeepSpaceLoader.tsx");
    const dots = loader.slice(loader.indexOf("// A: short route/data wait"));
    expect(dots).toContain('{bare ? null : <Text variant="caption" style={styles.caption}>{cap}</Text>}');
    // The star keeps its accessible name; only the measured caption is withheld.
    expect(dots).toContain("<LoadingPolaris size={72} accessibilityLabel={cap} />");
  });
});
