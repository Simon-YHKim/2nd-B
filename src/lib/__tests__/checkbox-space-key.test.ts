import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

let mockPlatform = "web";
jest.mock("react-native", () => ({ Platform: { get OS() { return mockPlatform; } } }));

// Run the actual component bodies with inert host tags. Browser behavior is
// separately checked against the installed RNWeb renderer.
//
// 2026-10-04 retarget (qa261004 L1-20). The "consent" case used to execute the
// ConsentCheckRow in src/screens/deepspace/dds-auth-screens.tsx. That copy is a
// shadow: the /sign-up route imports DeepSpaceSignUpDesignScreen from
// dds-sign-up-screen.tsx, so the row #1677 wired was never drawn and this test
// was green over a screen nobody saw. The same happened to the /ops routine
// row (DeepSpaceDesignScreens.tsx vs dds-ops-screen.tsx). Both shipped rows
// draw role=checkbox through the shared PixelPressable, which forwarded no key
// handler, so on web they answered Enter and the mouse but not Space.
//
// The cases below now start from the file the route imports and run the
// shipped row through the real PixelPressable body down to the Pressable host.
const ROOT = path.resolve(__dirname, "../../..");
const SHIPPED_SIGN_UP = "src/screens/deepspace/dds-sign-up-screen.tsx";
const SHIPPED_OPS = "src/screens/deepspace/dds-ops-screen.tsx";
const PIXEL_PRESSABLE = "src/components/pixel/PixelPressable.tsx";

const read = (file: string) => readFileSync(path.resolve(ROOT, file), "utf8");
const styleStub = new Proxy({}, { get: () => ({}) });
const realSpaceKey = (...args: unknown[]) =>
  require("../ui/checkbox-space-key").checkboxSpaceKeyProps(...args);

function load(file: string, name: string, scope: Record<string, unknown>) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!fn) throw new Error(`Missing ${name} in ${file}`);
  const source = ts.transpileModule(fn.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return new Function("require", "exports", ...Object.keys(scope), `${source}\nreturn ${name};`)(require, {}, ...Object.values(scope));
}

const asList = (children: unknown) => (Array.isArray(children) ? children : [children]);

/** The real PixelPressable body. Hooks are inert: this checks props, not rendering. */
function pixelPressable(props: Record<string, unknown>) {
  const PixelPressable = load(PIXEL_PRESSABLE, "PixelPressable", {
    Pressable: "Pressable", View: "View", PixelSurface: "PixelSurface", styles: styleStub,
    useState: (initial: unknown) => [initial, () => {}], useCallback: (fn: unknown) => fn,
    checkboxSpaceKeyProps: realSpaceKey,
  });
  const host = PixelPressable(props);
  expect(host.type).toBe("Pressable");
  return host.props;
}

function control(kind: "chip" | "consent", onPress: () => void, filter = true) {
  if (kind === "chip") {
    const MdChip = load("src/components/m3/MdChip.tsx", "MdChip", {
      View: "View", Pressable: "Pressable", Text: "Text", RNText: "Text", PixelGlyph: "PixelGlyph",
      styles: {}, m3: { color: {} }, m3TextStyle: () => ({}), colors: {},
      checkboxSpaceKeyProps: realSpaceKey,
    });
    const tree = MdChip({ kind: filter ? "filter" : "assist", label: "Filter", onPress });
    return asList(tree.props.children).find((child: any) => child?.type === "Pressable").props;
  }
  const ConsentCheckRow = load(SHIPPED_SIGN_UP, "ConsentCheckRow", {
    View: "View", PixelPressable: "PixelPressable", PixelSurface: "PixelSurface",
    PixelGlyph: "PixelGlyph", Text: "Text", styles: styleStub, m3: { color: {} },
  });
  const tree = ConsentCheckRow({ checked: false, label: "Consent", disabled: false, onToggle: onPress });
  const row = asList(tree.props.children).find(
    (child: any) => child?.type === "PixelPressable" && child.props.accessibilityRole === "checkbox",
  );
  if (!row) throw new Error("the shipped ConsentCheckRow no longer draws a PixelPressable checkbox");
  return pixelPressable(row.props);
}

function event(overrides: Record<string, unknown> = {}) {
  const target = {};
  return { key: " ", target, currentTarget: target, repeat: false, defaultPrevented: false,
    altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault: jest.fn(), ...overrides };
}

beforeEach(() => { mockPlatform = "web"; });

describe("the harness reads the screens the routes actually render", () => {
  test.each([
    ["src/app/(auth)/sign-up.tsx", "DeepSpaceSignUpDesignScreen", SHIPPED_SIGN_UP],
    ["src/app/ops.tsx", "DeepSpaceOpsScreen", SHIPPED_OPS],
  ])("%s imports %s from the file under test", (route, component, file) => {
    const from = `@/${file.replace(/^src\//, "").replace(/\.tsx$/, "")}`;
    expect(read(route)).toMatch(new RegExp(`import \\{ ${component} \\} from "${from.replace(/\//g, "\\/")}"`));
  });
});

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

describe("PixelPressable adds Space only where RNWeb drops it", () => {
  test.each(["checkbox", "switch"])("a %s toggles on Space", role => {
    const press = jest.fn();
    pixelPressable({ onPress: press, accessibilityRole: role }).onKeyDown?.(event());
    expect(press).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, "button", "link"])("role %p keeps RNWeb's own handling (no extra keydown)", role => {
    const props = role === undefined ? { onPress: jest.fn() } : { onPress: jest.fn(), accessibilityRole: role };
    expect(pixelPressable(props).onKeyDown).toBeUndefined();
  });

  test("a disabled checkbox answers neither the key nor the press", () => {
    const press = jest.fn();
    const props = pixelPressable({ onPress: press, accessibilityRole: "checkbox", disabled: true });
    expect(props.onKeyDown).toBeUndefined();
    expect(props.disabled).toBe(true);
  });
});

describe("the shipped /ops routine row inherits the key from PixelPressable", () => {
  // The row lives inside a FlatList renderItem, so it cannot be called on its
  // own. Read the element instead and hand its declared role and lock to the
  // real PixelPressable above.
  function routineRow() {
    const file = SHIPPED_OPS;
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: ts.JsxOpeningLikeElement[] = [];
    const visit = (node: ts.Node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(ast) === "onPress" &&
          (p.initializer?.getText(ast) ?? "").includes("completeRoutine(item)"))) found.push(node);
      node.forEachChild(visit);
    };
    visit(ast);
    if (found.length !== 1) throw new Error(`expected one routine row in ${file}, found ${found.length}`);
    const element = found[0];
    const attributes = new Map<string, string>();
    for (const p of element.attributes.properties) {
      if (ts.isJsxAttribute(p)) attributes.set(p.name.getText(ast), p.initializer?.getText(ast) ?? "true");
      else attributes.set(`...${p.expression.getText(ast)}`, "spread");
    }
    return { tag: element.tagName.getText(ast), attributes };
  }

  test("it is a PixelPressable checkbox locked while done or completing", () => {
    const row = routineRow();
    expect(row.tag).toBe("PixelPressable");
    expect(row.attributes.get("accessibilityRole")).toBe('"checkbox"');
    expect(row.attributes.get("disabled")).toBe("{done || completing}");
    // Nothing on the row may replace the handler PixelPressable adds.
    expect([...row.attributes.keys()].filter(k => k === "onKeyDown" || k.startsWith("..."))).toEqual([]);
  });

  test("an open routine completes on Space; a done one does not", () => {
    const complete = jest.fn();
    pixelPressable({ onPress: complete, accessibilityRole: "checkbox", disabled: false }).onKeyDown?.(event());
    expect(complete).toHaveBeenCalledTimes(1);
    expect(pixelPressable({ onPress: complete, accessibilityRole: "checkbox", disabled: true }).onKeyDown).toBeUndefined();
  });
});
