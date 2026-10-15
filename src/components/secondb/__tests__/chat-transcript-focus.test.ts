import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";

type Props = Record<string, unknown>;
type ScrollInstance = {
  getScrollableNode: () => unknown;
  scrollToEnd: (options: { animated: boolean }) => void;
  _handleScroll: (event: unknown) => void;
};

// Use the installed RNW behavior, not a mock that assumes programmatic scrolls
// are exempt from keyboardDismissMode="on-drag". RNW dismisses on every scroll.
const requireWeb = createRequire(__filename);
const WebScrollView = requireWeb("react-native-web/dist/cjs/exports/ScrollView") as {
  render: (props: Props, ref: null) => { type: new (props: Props) => ScrollInstance; props: Props };
};
const TextInputState = requireWeb("react-native-web/dist/cjs/modules/TextInputState") as {
  focusTextInput: (node: unknown) => void;
  _currentlyFocusedNode: unknown;
};
const path = resolve(__dirname, "../../../app/secondb.tsx");
const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let transcript: ts.JsxOpeningElement | undefined;
function visit(node: ts.Node) {
  if (ts.isJsxOpeningElement(node) && node.attributes.properties.some(prop =>
    ts.isJsxAttribute(prop) && prop.name.getText(source) === "testID"
      && prop.initializer && ts.isStringLiteral(prop.initializer) && prop.initializer.text === "chat-transcript")) {
    transcript = node;
  }
  ts.forEachChild(node, visit);
}
visit(source);

function attribute(name: string, platform: string, followingLatest = { current: true }, scrollRef = { current: null as ScrollInstance | null }) {
  const attr = transcript?.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === name);
  if (!attr || !ts.isJsxAttribute(attr) || !attr.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression) {
    throw new Error(`Missing transcript expression: ${name}`);
  }
  return new Function("Platform", "followingLatest", "scrollRef", `return (${attr.initializer.expression.getText(source)});`)(
    { OS: platform }, followingLatest, scrollRef,
  );
}

test.each(["onLayout", "onContentSizeChange"])("%s keeps the composer focused when a nonempty transcript follows its end", callback => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = { activeElement: null as unknown };
  const input = { blur: jest.fn(() => { document.activeElement = null; }) };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  document.activeElement = input;
  TextInputState.focusTextInput(input);
  try {
    const followingLatest = { current: true };
    const scrollRef = { current: null as ScrollInstance | null };
    const props = {
      keyboardDismissMode: attribute("keyboardDismissMode", "web"),
      scrollEventThrottle: attribute("scrollEventThrottle", "web"),
      onScroll: attribute("onScroll", "web", followingLatest, scrollRef),
    };
    const element = WebScrollView.render(props, null);
    const scroll = new element.type(element.props);
    const scrollNode = { scrollHeight: 1000, scrollWidth: 300, scroll: jest.fn(() => {
      scroll._handleScroll({ nativeEvent: {
        contentOffset: { y: 600 }, contentSize: { height: 1000 }, layoutMeasurement: { height: 400 },
      } });
    }) };
    scroll.getScrollableNode = () => scrollNode;
    scrollRef.current = scroll;
    const onResize = attribute(callback, "web", followingLatest, scrollRef) as () => void;
    onResize();
    expect(scrollNode.scroll).toHaveBeenCalledWith({ top: 1000, left: 0, behavior: "auto" });
    expect(document.activeElement).toBe(input);
    expect(input.blur).not.toHaveBeenCalled();
    // Reading older messages must continue to suppress automatic scrolling.
    followingLatest.current = false;
    onResize();
    expect(scrollNode.scroll).toHaveBeenCalledTimes(1);
  } finally {
    TextInputState._currentlyFocusedNode = null;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test.each([["ios", "interactive"], ["android", "on-drag"]])("%s keeps its native keyboard dismissal behavior", (platform, mode) => {
  expect(attribute("keyboardDismissMode", platform)).toBe(mode);
});
