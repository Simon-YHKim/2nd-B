import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { CHAT_INPUT_SIZE, chatComposerAlignment, chatInputMinimumHeight, chatStatusMaxLines } from "../chat-font-layout";

const scales = [1, 1.3, 1.31, 2];

describe("chatfont: Android composer alignment", () => {
  test.each([
    [1, 36, 40, 62], [1.3, 36, 47, 76], [1.31, 47, 47, 76], [2, 62, 62, 106],
  ])("scale %s centers an empty/single line and bottom-aligns wrapped or multiline input", (scale, minimum, single, multiple) => {
    expect(chatInputMinimumHeight("android", scale)).toBe(minimum);
    for (const height of [0, minimum, Math.max(44, minimum), single]) {
      expect(chatComposerAlignment("android", scale, height)).toBe("center");
    }
    for (const height of [multiple, 124]) {
      expect(chatComposerAlignment("android", scale, height)).toBe("flex-end");
    }
  });

  test("clearing, wrapping and shrinking follow measured heights without counting newline characters", () => {
    expect([0, 62, 106, 124, 62, 0].map(height => chatComposerAlignment("android", 2, height)))
      .toEqual(["center", "center", "flex-end", "flex-end", "center", "center"]);
    expect(CHAT_INPUT_SIZE).toEqual({ minHeight: 36, maxHeight: 124, lineHeight: 22, verticalPadding: 7 });
    expect(chatInputMinimumHeight("android", 8)).toBe(124);
  });

  test.each(["web", "ios"])("%s retains its original input minimum and bottom alignment", platform => {
    for (const scale of scales) {
      expect(chatInputMinimumHeight(platform, scale)).toBe(36);
      for (const height of [0, 36, 44, 62, 106, 124]) {
        expect(chatComposerAlignment(platform, scale, height)).toBe("flex-end");
      }
    }
  });
});

describe("chatfont: status line budget", () => {
  test("keeps the #2207 one-line rule through scale 1.3", () => {
    expect(chatStatusMaxLines(1)).toBe(1);
    expect(chatStatusMaxLines(1.3)).toBe(1);
  });

  test.each([1.31, 2])("scale %s allows a second line without changing text size", scale => {
    expect(chatStatusMaxLines(scale)).toBe(2);
  });
});

// Execute only shipping JSX attribute expressions and callbacks, not an RN renderer.
const screen = readFileSync(resolve(__dirname, "../../../app/secondb.tsx"), "utf8");
const ast = ts.createSourceFile("secondb.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (!found && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!found) throw new Error("Missing chat layout source contract");
  return found;
}
function opening(name: string, style?: string) {
  return find(node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
    && node.tagName.getText(ast) === name
    && (!style || node.attributes.getText(ast).includes(`ds.${style}`))) as ts.JsxOpeningElement;
}
function attribute(node: ts.JsxOpeningElement, name: string, scope: Record<string, unknown> = {}) {
  const prop = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === name) as ts.JsxAttribute;
  const expr = (prop?.initializer as ts.JsxExpression | undefined)?.expression;
  if (!expr) throw new Error(`Missing ${name}`);
  const code = ts.transpileModule(`return (${expr.getText(ast)});`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(scope), code)(...Object.values(scope));
}

test("both composer rows apply the calculated alignment after their base styles", () => {
  for (const composerAlignment of ["center", "flex-end"]) {
    for (const name of ["composer", "inputPill"]) {
      const styles = attribute(opening("View", name), "style", { ds: { [name]: { alignItems: "flex-end" } }, composerAlignment });
      expect(Object.assign({}, ...styles).alignItems).toBe(composerAlignment);
    }
  }
});

test("the input reports actual layout height locally; clearing bypasses its previous multiline height", () => {
  const setInputHeight = jest.fn();
  const onLayout = attribute(opening("ChatTextInput"), "onLayout", { setInputHeight });
  onLayout({ nativeEvent: { layout: { width: 220, height: 106 } } });
  expect(setInputHeight).toHaveBeenCalledWith(106);
  const composer = screen.slice(screen.indexOf("const ChatComposer ="), screen.indexOf("export default function SecondBChat"));
  expect(composer).toContain("const { fontScale } = useWindowDimensions()");
  expect(composer).toContain("const [inputHeight, setInputHeight] = useState(0)");
  expect(composer).toContain("chatComposerAlignment(Platform.OS, fontScale, draft.length === 0 ? 0 : inputHeight)");
  const input = readFileSync(resolve(__dirname, "../ChatTextInput.tsx"), "utf8");
  expect(input).toContain("chatInputMinimumHeight(Platform.OS, fontScale)");
  expect(input).toContain("onLayout={event => { measureWeb(); onLayout?.(event); }}");
});

test("the status uses the live scale, allows two lines and explicitly removes Text's inherited scale cap", () => {
  const node = opening("Text", "bannerDesc");
  for (const fontScale of scales) {
    expect(attribute(node, "numberOfLines", { fontScale, chatStatusMaxLines })).toBe(fontScale > 1.3 ? 2 : 1);
  }
  // RN defines 0 as unlimited; omission would restore the shared Text's 1.7 cap.
  expect(attribute(node, "maxFontSizeMultiplier")).toBe(0);
  expect(node.attributes.getText(ast)).not.toMatch(/allowFontScaling|adjustsFontSizeToFit/);
  expect(screen.slice(screen.indexOf("function SecondBChatBody()"))).toMatch(/^function SecondBChatBody\(\) \{\s+const \{ fontScale \} = useWindowDimensions\(\)/);
});
