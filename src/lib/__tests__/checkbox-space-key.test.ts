import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

let mockPlatform = "web";
jest.mock("react-native", () => ({ Platform: { get OS() { return mockPlatform; } } }));

// Run the actual two component bodies with inert host tags. Browser behavior
// is separately checked against the installed RNWeb renderer.
function control(kind: "chip" | "consent", onPress: () => void, filter = true) {
  const file = kind === "chip" ? "src/components/m3/MdChip.tsx" : "src/screens/deepspace/dds-auth-screens.tsx";
  const name = kind === "chip" ? "MdChip" : "ConsentCheckRow";
  const ast = ts.createSourceFile(file, readFileSync(path.resolve(__dirname, "../../..", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!fn) throw new Error(`Missing ${name}`);
  const source = ts.transpileModule(fn.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const scope = {
    View: "View", Pressable: "Pressable", Text: "Text", RNText: "Text", PixelGlyph: "PixelGlyph",
    styles: {}, m3: { color: {} }, m3TextStyle: () => ({}), colors: {},
    checkboxSpaceKeyProps: (...args: unknown[]) => require("../ui/checkbox-space-key").checkboxSpaceKeyProps(...args),
  };
  const Component = new Function("require", "exports", ...Object.keys(scope), `${source}\nreturn ${name};`)(require, {}, ...Object.values(scope));
  const tree = Component(kind === "chip" ? { kind: filter ? "filter" : "assist", label: "Filter", onPress } : { checked: false, label: "Consent", onToggle: onPress });
  const children = Array.isArray(tree.props.children) ? tree.props.children : [tree.props.children];
  return children.find((child: any) => child?.type === "Pressable").props;
}

function event(overrides: Record<string, unknown> = {}) {
  const target = {};
  return { key: " ", target, currentTarget: target, repeat: false, defaultPrevented: false,
    altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault: jest.fn(), ...overrides };
}

beforeEach(() => { mockPlatform = "web"; });

describe.each(["chip", "consent"] as const)("%s web checkbox Space", kind => {
  test("toggles once and suppresses the default scroll", () => {
    const press = jest.fn();
    const props = control(kind, press);
    const e = event();
    props.onKeyDown?.(e);
    expect(press).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(props.onKeyUp).toBeUndefined();
  });

  test("repeated Space still prevents scroll but does not toggle again", () => {
    const press = jest.fn();
    const props = control(kind, press);
    const e = event({ repeat: true });
    props.onKeyDown?.(e);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(press).not.toHaveBeenCalled();
  });

  test.each(["altKey", "ctrlKey", "metaKey", "shiftKey"])("keeps %s combinations unchanged", modifier => {
    const press = jest.fn();
    const e = event({ [modifier]: true });
    control(kind, press).onKeyDown?.(e);
    expect(press).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  test.each([{ key: "Enter" }, { defaultPrevented: true }, { target: {} }])("leaves native Enter, handled events and descendant keys alone: %p", overrides => {
    const press = jest.fn();
    const e = event(overrides);
    control(kind, press).onKeyDown?.(e);
    expect(press).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  test("keeps click callback and native props unchanged", () => {
    const press = jest.fn();
    mockPlatform = "android";
    const props = control(kind, press);
    expect(props.onKeyDown).toBeUndefined();
    expect(props.onPress).toBe(press);
    expect(props.accessibilityRole).toBe("checkbox");
  });
});

test("plain button chips retain the existing RNWeb Space handler only", () => {
  expect(control("chip", jest.fn(), false).onKeyDown).toBeUndefined();
});
