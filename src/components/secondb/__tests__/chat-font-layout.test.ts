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

  // Android 16 emulator, 2026-10-10: one typed character left the box at one line (47.14dp at 1.31,
  // 62dp at 2.0, plus up to 4dp of border) yet the buttons dropped to the bottom because the old
  // comparison was exact.
  test.each([
    [1.31, 47.14], [1.31, 51], [2, 62.3], [2, 66], [1, 40.2], [1.3, 51],
  ])("scale %s keeps a one-line box of %sdp centered despite pixel rounding and the border", (scale, measured) => {
    expect(chatComposerAlignment("android", scale, measured)).toBe("center");
  });

  test.each([
    [1, 58], [1.3, 71.2], [1.31, 75.8], [2, 106],
  ])("scale %s still bottom-aligns a two-line box of %sdp", (scale, measured) => {
    expect(chatComposerAlignment("android", scale, measured)).toBe("flex-end");
  });

  // Re-check on the same emulator, 2026-10-10 23:56: one line measured 62.0dp (2.0) and 47.1dp (1.31),
  // two lines 84.0dp and 64.0dp. The earlier limit at 2.0 was exactly 84, so a two-line box read a
  // fraction low would have been centered.
  test.each([
    [2, 62.0], [1.31, 47.1],
  ])("scale %s centers the one-line box the device reported (%sdp)", (scale, measured) => {
    expect(chatComposerAlignment("android", scale, measured)).toBe("center");
  });

  test.each([
    [2, 84.0], [2, 83.5], [2, 80], [1.31, 64.0], [1.31, 63.5],
  ])("scale %s bottom-aligns the two-line box the device reported, with room to spare (%sdp)", (scale, measured) => {
    expect(chatComposerAlignment("android", scale, measured)).toBe("flex-end");
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

test("the status uses the live scale, allows two lines and keeps the shared Text scale cap", () => {
  const node = opening("Text", "bannerDesc");
  for (const fontScale of scales) {
    expect(attribute(node, "numberOfLines", { fontScale, chatStatusMaxLines })).toBe(fontScale > 1.3 ? 2 : 1);
  }
  // The shared Text caps body copy at 1.7; this line follows the same rule as its neighbours.
  expect(node.attributes.getText(ast)).not.toMatch(/maxFontSizeMultiplier|allowFontScaling|adjustsFontSizeToFit/);
  expect(screen.slice(screen.indexOf("function SecondBChatBody()"))).toMatch(/^function SecondBChatBody\(\) \{\s+const \{ fontScale \} = useWindowDimensions\(\)/);
});
