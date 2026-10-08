import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = resolve(__dirname, "../../../..");
function declaration(file: string, name: string) {
  const source = ts.createSourceFile(file, readFileSync(resolve(root, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const node = source.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node) throw new Error(`${name} is missing`);
  return { source, node };
}

function motionEffect(kind: "shared" | "home") {
  const { source, node } = kind === "shared"
    ? declaration("public/proto/sb-data.jsx", "SbHead")
    : declaration("public/proto/sb-home.jsx", "ConstellationHome");
  let effect: ts.Node | undefined;
  function visit(child: ts.Node) {
    if (ts.isCallExpression(child) && child.expression.getText(source) === "useEffect" && child.arguments[0]?.getText(source).includes("headRef.current.style.transform")) effect = child.arguments[0];
    ts.forEachChild(child, visit);
  }
  visit(node);
  if (!effect) throw new Error(`${kind} head motion effect is missing`);
  return effect.getText(source);
}

function harness(kind: "shared" | "home", reduced = false, options = {}) {
  const listeners = new Map<string, (event: unknown) => void>();
  const mediaListeners = new Set<() => void>();
  const frames = new Map<number, () => void>();
  let frameId = 0;
  let now = 1000;
  const media = { matches: reduced, addEventListener: (_: string, callback: () => void) => mediaListeners.add(callback), removeEventListener: (_: string, callback: () => void) => mediaListeners.delete(callback) };
  const headRef = { current: { style: { transform: "" } } };
  const stageRef = { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 152, height: 152 }) } };
  const hold = { current: null as null | { x: number; y: number; until: number } };
  const factory = runInNewContext(`(${motionEffect(kind)})`, {
    headRef, rootRef: stageRef, stageRef, hold,
    leftEyeRef: { current: null }, rightEyeRef: { current: null }, mouthRef: { current: null },
    track: true, bob: false, scale: 1, motion: 1, ...options,
    Date: { now: () => now },
    window: { innerWidth: 600, innerHeight: 600, matchMedia: () => media,
      addEventListener: (event: string, callback: (event: unknown) => void) => listeners.set(event, callback),
      removeEventListener: (event: string) => listeners.delete(event) },
    requestAnimationFrame: (callback: () => void) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  }) as () => (() => void) | undefined;
  const cleanup = factory();
  return { listeners, mediaListeners, frames, headRef, hold, cleanup,
    reduce(value: boolean) { media.matches = value; for (const listener of mediaListeners) listener(); },
    frame(count = 1) { for (let i = 0; i < count; i++) { now += 100; const queue = [...frames.values()]; frames.clear(); queue.forEach(callback => callback()); } },
  };
}

test.each(["shared", "home"] as const)("%s portrait tracks pointer/touch using only integer translations and cleans up", kind => {
  const h = harness(kind);
  h.listeners.get("pointermove")?.({ clientX: 500, clientY: 500 });
  h.frame(10);
  expect(h.headRef.current.style.transform).toMatch(/^translate\(-?\d+px,\s?-?\d+px\)$/);
  expect(h.headRef.current.style.transform).not.toBe("translate(0px,0px)");
  h.listeners.get("touchmove")?.({ touches: [{ clientX: 0, clientY: 0 }] });
  h.frame(10);
  expect(h.frames.size).toBe(1);
  h.cleanup?.();
  expect(h.frames.size).toBe(0);
  expect(h.listeners.size).toBe(0);
  expect(h.mediaListeners.size).toBe(0);
});

test.each(["shared", "home"] as const)("%s motion responds to reduced-motion changes without leaving duplicate loops", kind => {
  const h = harness(kind, true);
  expect(h.frames.size).toBe(0);
  expect(h.listeners.size).toBe(0);
  h.reduce(false);
  expect(h.frames.size).toBe(1);
  expect(h.listeners.size).toBe(2);
  h.listeners.get("pointermove")?.({ clientX: 500, clientY: 500 });
  h.frame(10);
  h.reduce(true);
  expect(h.headRef.current.style.transform).toBe("translate(0px,0px)");
  expect(h.frames.size).toBe(0);
  expect(h.listeners.size).toBe(0);
  h.reduce(false);
  expect(h.frames.size).toBe(1);
  h.cleanup?.();
  expect(h.mediaListeners.size).toBe(0);
});

test("shared static portraits do not subscribe while bob-only portraits still move in whole pixels", () => {
  const still = harness("shared", false, { track: false, bob: false });
  expect(still.frames.size).toBe(0);
  expect(still.listeners.size).toBe(0);
  const bob = harness("shared", false, { track: false, bob: true });
  expect(bob.listeners.size).toBe(0);
  bob.frame(10);
  expect(bob.headRef.current.style.transform).toMatch(/^translate\(0px,-?\d+px\)$/);
  expect(bob.headRef.current.style.transform).not.toBe("translate(0px,0px)");
  bob.cleanup?.();
});

test("home forwards its head ref and delegates tracking to exactly one owner", () => {
  const { source, node } = declaration("public/proto/sb-home.jsx", "SecondBHead");
  const code = ts.transpileModule(`(${node.getText(source)})`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  const render = runInNewContext(code, { React: { createElement: (type: unknown, props: Record<string, unknown>, ...children: unknown[]) => ({ type, props, children }) }, window: { SbHead: "portrait" } });
  const headRef = { current: null };
  const tree = render({ headRef, scale: 1, expression: "positive" });
  expect(tree.props.ref).toBe(headRef);
  expect(tree.children[0].props).toMatchObject({ track: false, expression: "positive", size: 152 });
  const h = harness("home");
  h.hold.current = { x: 1, y: -1, until: 10000 };
  h.frame(10);
  expect(h.headRef.current.style.transform).toMatch(/^translate\([1-9]\d*px,-[1-9]\d*px\)$/);
  h.cleanup?.();
});
