import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { fallbackShareText } from "../insight-card";

const ROOT = resolve(__dirname, "../../../..");
const screen = readFileSync(resolve(ROOT, "src/app/share-card.tsx"), "utf8");
const card = readFileSync(resolve(ROOT, "src/components/deepspace/ShareCard.tsx"), "utf8");
function find(source: string, predicate: (node: ts.Node) => boolean): string {
  const ast = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: string | undefined;
  function visit(node: ts.Node): void {
    if (predicate(node)) found = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!found) throw new Error("Missing export contract node");
  return found;
}

const imageExpression = find(card, (node) => ts.isConditionalExpression(node) && node.condition.getText() === "aiCopyTail");
const imageCode = ts.transpileModule(`(${imageExpression});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;

test.each(["ko", "en", "es", "pt", "id"])("image and both export actions retain the approved %s tail", async (language) => {
  const tail = (JSON.parse(readFileSync(resolve(ROOT, `locales/${language}/secondb.json`), "utf8")) as { aiCopyTail: string }).aiCopyTail;
  // Evaluate only the disclosure JSX as a data tree, without RN or a renderer.
  const image = runInNewContext(imageCode, {
    aiCopyTail: tail, k: 1, Text: "Text", styles: { disclosure: {} }, inkColor: () => ({}),
    React: { createElement: (_type: unknown, _props: unknown, text: string) => text },
  });
  expect(image).toBe(tail);
  for (const name of ["handleShare", "handleSave"]) {
    const fn = find(screen, (node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    const code = ts.transpileModule(`${fn}\n${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const share = jest.fn().mockResolvedValue(undefined);
    const action = runInNewContext(code, {
      aiCopyTail: tail, variant: "A", card: { insight: "Selected sentence", handle: "me" }, litCount: 2,
      sharing: false, saving: false, setSharing: jest.fn(), setSaving: jest.fn(),
      captureRef: { current: "image-host" }, shareInsightCard: share,
    }) as () => Promise<void>;
    await action();
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ aiCopyTail: tail, viewRef: "image-host" }));
    expect(fallbackShareText(share.mock.calls[0][0]).endsWith(tail)).toBe(true);
  }
});

test("an unmarked card renders no disclosure", () => {
  expect(runInNewContext(imageCode, { aiCopyTail: undefined })).toBeNull();
});

test("the preview and the captured image receive the same disclosure", () => {
  expect(screen.match(/<ShareCard\b[^>]*aiCopyTail=\{aiCopyTail\}/g)).toHaveLength(2);
  expect(screen).toContain('t("secondb:aiCopyTail")');
});

test.each([1, 1080 / 330])("the disclosure stays one line with the existing 1.3 scale cap (card scale %s)", (k) => {
  const props = runInNewContext(imageCode, {
    aiCopyTail: "Contenido generado por IA (PolaScope)", k, Text: "Text", styles: { footerText: { fontFamily: "readable" }, disclosure: {} }, inkColor: () => ({}),
    React: { createElement: (_type: unknown, attributes: unknown) => attributes },
  });
  expect(props.numberOfLines).toBe(1);
  expect(props.maxFontSizeMultiplier).toBe(1.3);
  expect(props.style[0]).toEqual({ fontFamily: "readable" });
});
