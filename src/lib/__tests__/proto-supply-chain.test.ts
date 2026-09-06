import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";

import { transformSync } from "esbuild";

const ROOT = process.cwd();
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8").replace(/\r\n?/g, "\n");
const readMaybe = (path: string): string =>
  existsSync(join(ROOT, path)) ? read(path) : "";

const html = read("public/proto/2nd-Brain.html");
const css = read("public/proto/m3-theme.css");
const workflow = read(".github/workflows/web-deploy.yml");
const buildScript = readMaybe("scripts/build-proto.mjs");
const tweaksSource = read("public/proto/tweaks-panel.jsx");
const protoIndex = read("public/proto/index.html");
const landingReadme = read("public/landing/README.md");
const packageJson = JSON.parse(read("package.json")) as {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

const JSX_OUTPUT_ORDER = [
  "tweaks-panel.js",
  "sb-data.js",
  "sb-neural.js",
  "sb-wikigraph.js",
  "sb-relgraph.js",
  "sb-persona.js",
  "sb-home.js",
  "sb-screens-core.js",
  "sb-screens-know.js",
  "sb-screens-extra.js",
  "sb-enrich.js",
  "sb-museum.js",
  "sb-flows.js",
  "sb-validate.js",
  "sb-more.js",
  "sb-surfaces.js",
  "sb-gaps.js",
  "sb-digest.js",
  "sb-audit.js",
  "sb-hobby.js",
  "sb-health.js",
  "sb-healthinput.js",
  "sb-careerinput.js",
  "sb-drilldown.js",
  "sb-relinput.js",
  "sb-me.js",
  "sb-ops.js",
  "sb-app.js",
];

function scripts(): Array<{ attrs: string; body: string; src: string | null }> {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(
    ([, attrs, body]) => ({
      attrs,
      body,
      src: attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? null,
    }),
  );
}

function contentSecurityPolicy(markup = html): Record<string, string[]> {
  const match = markup.match(
    /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([\s\S]*?)["']\s*\/?>/i,
  );
  if (!match) throw new Error("proto Content-Security-Policy meta is missing");

  return Object.fromEntries(
    match[1]
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/);
        return [name, values];
      }),
  );
}

type ProtocolHarnessOptions = {
  ancestorOrigins?: string[];
  parentIsSelf?: boolean;
  referrer?: string;
};

function loadTweaksProtocol({
  ancestorOrigins,
  parentIsSelf = false,
  referrer = "",
}: ProtocolHarnessOptions) {
  const effects: Array<() => void | (() => void)> = [];
  const outbound: Array<{ message: unknown; targetOrigin: string }> = [];
  const stateTransitions: unknown[] = [];
  const listeners = new Map<string, Set<(event: { type: string }) => void>>();
  const parent = {
    postMessage(message: unknown, targetOrigin: string) {
      outbound.push({ message, targetOrigin });
    },
  };
  const browserWindow: Record<string, unknown> = {
    addEventListener(type: string, listener: (event: { type: string }) => void) {
      const typeListeners = listeners.get(type) ?? new Set();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    },
    dispatchEvent(event: { type: string }) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
    innerHeight: 768,
    innerWidth: 1024,
    location: {
      ...(ancestorOrigins === undefined ? {} : { ancestorOrigins }),
      origin: "https://proto.example",
    },
    parent,
    removeEventListener(type: string, listener: (event: { type: string }) => void) {
      listeners.get(type)?.delete(listener);
    },
  };
  if (parentIsSelf) browserWindow.parent = browserWindow;

  const react = {
    Fragment: Symbol("Fragment"),
    createElement: () => null,
    useCallback: <T,>(callback: T): T => callback,
    useEffect(effect: () => void | (() => void)) {
      effects.push(effect);
    },
    useRef: <T,>(value: T) => ({ current: value }),
    useState: <T,>(value: T) => [
      value,
      (next: T) => stateTransitions.push(next),
    ],
  };
  const context = createContext({
    CustomEvent: class {
      constructor(
        public type: string,
        public init?: { detail?: unknown },
      ) {}
    },
    document: { documentElement: {}, referrer },
    React: react,
    ResizeObserver: undefined,
    URL,
    window: browserWindow,
  });
  const compiled = transformSync(tweaksSource, {
    format: "iife",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    loader: "jsx",
    target: "es2020",
  }).code;
  runInContext(compiled, context);
  (browserWindow.TweaksPanel as (props: { children: null }) => unknown)({ children: null });
  for (const effect of effects) effect();

  return {
    dispatch(dataExpression: string, origin: string, fromParent = true) {
      runInContext(
        `window.dispatchEvent({type:"message",source:${
          fromParent ? "window.parent" : "{}"
        },origin:${JSON.stringify(origin)},data:${dataExpression}})`,
        context,
      );
    },
    outbound,
    setTweak(key: string, value: unknown) {
      const [, setTweak] = (
        browserWindow.useTweaks as (
          defaults: Record<string, unknown>,
        ) => [Record<string, unknown>, (name: string, next: unknown) => void]
      )({});
      setTweak(key, value);
    },
    stateTransitions,
  };
}

describe("standalone proto supply chain", () => {
  test("loads one local React vendor and compiled scripts in dependency order", () => {
    const tags = scripts();
    const sources = tags.map(({ src }) => src);

    expect(sources).toEqual([
      "./vendor.js",
      "./sb-boot.js",
      "./tweaks-panel.js",
      "./image-slot.js",
      ...JSX_OUTPUT_ORDER.slice(1).map((name) => `./${name}`),
    ]);
    expect(tags.every(({ body, src }) => src !== null && body.trim() === "")).toBe(true);
    expect(html).not.toMatch(/\btext\/babel\b|@babel\/standalone|\bunpkg\.com\b/i);
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=["']https?:\/\//i);
    expect(html).not.toMatch(/<script\b[^>]*\btype=["']importmap["']/i);
    expect(html).not.toMatch(/\bon[a-z]+\s*=|javascript:|unsafe-eval/i);
  });

  test("covers every JSX source exactly once with a local compiled output", () => {
    const sources = scripts()
      .map(({ src }) => src?.replace(/^\.\//, ""))
      .filter((src): src is string => src?.endsWith(".js") ?? false);
    const compiledSources = sources.filter(
      (src) => !["vendor.js", "sb-boot.js", "image-slot.js"].includes(src),
    );
    const expectedFromDisk = readdirSync(join(ROOT, "public/proto"))
      .filter((name) => name.endsWith(".jsx"))
      .map((name) => name.replace(/\.jsx$/, ".js"))
      .sort();

    expect(compiledSources).toEqual(JSX_OUTPUT_ORDER);
    expect([...compiledSources].sort()).toEqual(expectedFromDisk);
    expect(new Set(compiledSources).size).toBe(compiledSources.length);
  });

  test("uses an exact default-deny CSP and no-referrer policy", () => {
    expect(contentSecurityPolicy()).toEqual({
      "default-src": ["'none'"],
      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'none'"],
      "connect-src": ["'self'"],
      "worker-src": ["'none'"],
      "media-src": ["'none'"],
      "object-src": ["'none'"],
      "frame-src": ["'none'"],
      "manifest-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'none'"],
    });
    expect(html).toMatch(/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i);
  });

  test("uses only local CSS with system font fallbacks", () => {
    expect(css).not.toMatch(/@import|url\(\s*["']?https?:\/\//i);
    expect(html).not.toMatch(/<link\b[^>]*\bhref=["']https?:\/\//i);
    expect(css).toMatch(/--md-ref-typeface-brand:\s*system-ui,/);
    expect(css).toMatch(/--md-ref-typeface-plain:\s*system-ui,/);
    expect(css).toMatch(/--md-ref-typeface-mono:\s*ui-monospace,/);
    expect(html).not.toMatch(/<style\b/i);
  });

  test("chains the deterministic proto compiler into the existing static build", () => {
    expect(packageJson.scripts?.["build:static"]).toBe("npm run build:static:landing");
    expect(packageJson.scripts?.["build:static:proto"]).toBe("node scripts/build-proto.mjs");
    expect(packageJson.scripts?.["postbuild:static:landing"]).toBe(
      "npm run build:static:proto",
    );
    expect(buildScript).toContain('createRequire(import.meta.url)');
    expect(buildScript).toContain('require("esbuild")');
    expect(buildScript).toContain('import React from "react"');
    expect(buildScript).toContain('import { createRoot } from "react-dom/client"');
    expect(buildScript).toContain("globalThis.React = React");
    expect(buildScript).toContain("globalThis.ReactDOM = { createRoot }");
    expect(buildScript).toMatch(/\.filter\([^\n]+\.jsx/);
    expect(buildScript).toContain(".sort(");
    expect(buildScript).toContain('format: "iife"');
    expect(buildScript).toContain("sourcemap: false");
    expect(buildScript).toContain("isSymbolicLink()");
    expect(buildScript).toContain("realpath(");

    const exportIndex = workflow.indexOf("expo export --platform web --output-dir dist");
    const staticBuildIndex = workflow.indexOf("npm run build:static");
    expect(exportIndex).toBeGreaterThanOrEqual(0);
    expect(staticBuildIndex).toBeGreaterThan(exportIndex);
  });

  test("binds the edit protocol to the exact trusted parent origin", () => {
    const harness = loadTweaksProtocol({
      ancestorOrigins: ["https://editor.example"],
      referrer: "https://editor.example/session/42",
    });

    expect(harness.outbound).toEqual([
      {
        message: { type: "__edit_mode_available" },
        targetOrigin: "https://editor.example",
      },
    ]);
    harness.setTweak("density", "compact");
    expect(harness.outbound.at(-1)).toEqual({
      message: {
        edits: { density: "compact" },
        type: "__edit_mode_set_keys",
      },
      targetOrigin: "https://editor.example",
    });
    expect(tweaksSource).not.toMatch(/\.postMessage\([\s\S]{0,200}?,\s*["']\*["']\s*\)/);
    expect(tweaksSource).not.toMatch(/\bconsole\.(?:debug|error|info|log|warn)\s*\(/);
    expect(tweaksSource).not.toMatch(
      /(?:location\.(?:hash|href|search)|history\.(?:pushState|replaceState))\s*=/,
    );
  });

  test("accepts only exact control messages from the bound parent", () => {
    const harness = loadTweaksProtocol({
      ancestorOrigins: ["https://editor.example"],
      referrer: "https://editor.example/session/42",
    });

    harness.dispatch('{type:"__activate_edit_mode"}', "https://editor.example", false);
    harness.dispatch('{type:"__activate_edit_mode"}', "https://attacker.example");
    harness.dispatch('["__activate_edit_mode"]', "https://editor.example");
    harness.dispatch(
      'Object.assign(Object.create({}),{type:"__activate_edit_mode"})',
      "https://editor.example",
    );
    harness.dispatch(
      '{type:"__activate_edit_mode",extra:true}',
      "https://editor.example",
    );
    harness.dispatch('{type:"__activate_edit_mode_extra"}', "https://editor.example");
    expect(harness.stateTransitions).toEqual([]);

    harness.dispatch('{type:"__activate_edit_mode"}', "https://editor.example");
    harness.dispatch('{type:"__deactivate_edit_mode"}', "https://editor.example");
    expect(harness.stateTransitions).toEqual([true, false]);
  });

  test.each([
    ["top-level document", { parentIsSelf: true, referrer: "https://editor.example/" }],
    ["missing candidates", {}],
    [
      "candidate mismatch",
      {
        ancestorOrigins: ["https://editor.example"],
        referrer: "https://attacker.example/embed",
      },
    ],
    ["public HTTP host", { referrer: "http://editor.example/embed" }],
    ["file referrer", { referrer: "file:///tmp/host.html" }],
  ])("disables the edit protocol for %s", (_label, options) => {
    const harness = loadTweaksProtocol(options as ProtocolHarnessOptions);
    expect(harness.outbound).toEqual([]);
    harness.dispatch('{type:"__activate_edit_mode"}', "https://editor.example");
    expect(harness.stateTransitions).toEqual([]);
  });

  test.each([
    [{ ancestorOrigins: ["https://editor.example"] }, "https://editor.example"],
    [{ referrer: "https://editor.example/session/42" }, "https://editor.example"],
    [{ referrer: "http://localhost:8777/host" }, "http://localhost:8777"],
    [{ referrer: "http://127.0.0.1:8777/host" }, "http://127.0.0.1:8777"],
  ])("keeps a secure embedded-host fallback for %j", (options, expectedOrigin) => {
    const harness = loadTweaksProtocol(options);
    expect(harness.outbound[0]).toEqual({
      message: { type: "__edit_mode_available" },
      targetOrigin: expectedOrigin,
    });
  });

  test("keeps the proto redirect document network-closed", () => {
    expect(contentSecurityPolicy(protoIndex)).toEqual({
      "default-src": ["'none'"],
      "script-src": ["'none'"],
      "style-src": ["'none'"],
      "img-src": ["'none'"],
      "font-src": ["'none'"],
      "connect-src": ["'none'"],
      "worker-src": ["'none'"],
      "media-src": ["'none'"],
      "object-src": ["'none'"],
      "frame-src": ["'none'"],
      "manifest-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'none'"],
    });
    expect(protoIndex).toMatch(/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i);
    expect(protoIndex).not.toMatch(/https?:\/\//i);
  });

  test("documents the local deterministic landing build", () => {
    expect(landingReadme).toContain("npm run build:static");
    expect(landingReadme).toContain("dist/landing");
    expect(landingReadme).toMatch(/local.*three|three.*local/i);
    expect(landingReadme).toContain("esbuild");
    expect(packageJson.devDependencies?.three).toBe("0.160.0");
    expect(landingReadme).toContain("three.js r160 (local pinned package)");
    expect(landingReadme).not.toMatch(/No build step|loads from a CDN/i);
  });
});
