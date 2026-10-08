import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type StackState = { index: number; routes: Array<{ key: string; name: string; state?: StackState }> };
let mockState: StackState | undefined;
let mockFocused = true;
const mockScenes: Array<Record<string, unknown>> = [];
jest.mock("expo-router", () => ({ useIsFocused: () => mockFocused }));
jest.mock("expo-router/react-navigation", () => ({ useNavigationState: (selector: (state: StackState | undefined) => boolean) => selector(mockState) }));
jest.mock("@/components/motion/SceneTransition", () => ({
  SceneTransition: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    mockScenes.push(props);
    return React.createElement("div", {}, props.children);
  },
}));

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};
(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderRoute(routeName: string, stack: "world" | "auth" = "world") {
  const { WorldRouteTransition } = require("../WorldRouteTransition");
  mockScenes.length = 0;
  return renderToStaticMarkup(React.createElement(WorldRouteTransition, {
    routeName, routeKey: "route-unique-key", stack,
  }, React.createElement("span", {}, "current scene")));
}

test("world routes animate the one live scene and stop while covered", () => {
  for (const focused of [true, false]) {
    mockState = { index: focused ? 0 : 1, routes: [{ key: "route-unique-key", name: "settings" }, { key: "other", name: "records" }] };
    expect(renderRoute("settings").match(/current scene/g)).toHaveLength(1);
    expect(mockScenes).toHaveLength(1);
    expect(mockScenes[0]).toEqual(expect.objectContaining({
      scope: "world", active: focused, transitionKey: "route-unique-key", kind: "replace",
    }));
  }
});

test("the phone and Polaris rise into the world; auth's child stack owns its transition", () => {
  mockState = { index: 0, routes: [{ key: "route-unique-key", name: "dashboard" }] };
  for (const routeName of ["dashboard", "core-brain"]) {
    renderRoute(routeName);
    expect(mockScenes[0]).toEqual(expect.objectContaining({ scope: "world", kind: "open" }));
  }
  expect(renderRoute("(auth)")).toContain("current scene");
  expect(mockScenes).toHaveLength(0);
});

test("transparent push/pop keeps the underlay visible, while opaque Back re-enters it", () => {
  const home = { key: "route-unique-key", name: "index" };
  const phone = { key: "phone", name: "dashboard" };
  const polaris = { key: "polaris", name: "core-brain" };
  const records = { key: "records", name: "records" };
  const activeFor = (routes: StackState["routes"], index = routes.length - 1) => {
    mockState = { index, routes };
    renderRoute("index");
    return mockScenes[0].active;
  };
  expect([[home], [home, phone], [home, phone, polaris], [home, phone], [home]].map(routes => activeFor(routes)))
    .toEqual([true, true, true, true, true]);
  expect([[home], [home, records], [home, records, phone], [home]].map(routes => activeFor(routes)))
    .toEqual([true, false, false, true]);
  // A future/preloaded route beyond index cannot cover the visible scene.
  expect(activeFor([home, records], 0)).toBe(true);
  // Account reset removes the old route key; it must not remain visible.
  expect(activeFor([records])).toBe(false);
});

test("a nested auth scene observes opaque ancestors as well as its own stack", () => {
  mockState = { index: 0, routes: [{ key: "route-unique-key", name: "sign-in" }] };
  mockFocused = true;
  renderRoute("sign-in", "auth");
  expect(mockScenes[0].active).toBe(true);
  // The auth stack still points at sign-in, but NavigationProvider's focus
  // becomes false when an opaque root route covers the auth group.
  mockFocused = false;
  renderRoute("sign-in", "auth");
  expect(mockScenes[0].active).toBe(false);
  mockState = undefined;
  renderRoute("sign-in");
  expect(mockScenes[0].active).toBe(false);
});

test("installed Expo 56 selects the closest Stack below its synthetic __root provider", () => {
  const { NavigationStateListenerProvider, useNavigationState } = require("expo-router/build/react-navigation/core/useNavigationState");
  const { worldRouteVisible } = require("@/lib/motion/route-visibility");
  const appStack = { index: 1, routes: [{ key: "home", name: "index" }, { key: "phone", name: "dashboard" }] };
  const expoRoot = { index: 0, routes: [{ key: "generated", name: "__root", state: appStack }] };
  let selected: unknown;
  function Probe() {
    const visible = useNavigationState((state: StackState) => {
      selected = state;
      return worldRouteVisible(state, "home");
    });
    return React.createElement("span", {}, String(visible));
  }
  const result = renderToStaticMarkup(React.createElement(NavigationStateListenerProvider, { state: expoRoot },
    React.createElement(NavigationStateListenerProvider, { state: appStack }, React.createElement(Probe))));
  expect(selected).toBe(appStack);
  expect(result).toContain("true");
  const source = readFileSync(resolve(process.cwd(), "src/components/motion/WorldRouteTransition.tsx"), "utf8");
  expect(source).toContain('from "expo-router/react-navigation"');
  expect(source).toContain("useNavigationState((state) => worldRouteVisible(state, routeKey))");
  expect(source).not.toContain("useRootNavigationState");
});

test("both stacks disable native smooth animation and account/profile guards remain around the scene", () => {
  const root = readFileSync(resolve(process.cwd(), "src/app/_layout.tsx"), "utf8");
  const auth = readFileSync(resolve(process.cwd(), "src/app/(auth)/_layout.tsx"), "utf8");
  for (const source of [root, auth]) {
    expect(source).toContain("WorldRouteTransition");
    expect(source).toContain('animation: "none"');
    expect(source).not.toContain("pixelStackTransition");
  }
  expect(root).toMatch(/<ProfileProbeScope[\s\S]*<AvatarSetupSceneGuard[\s\S]*<WorldRouteTransition[\s\S]*<AccountScope routeName=\{route.name\}>\{screen\}<\/AccountScope>/);
});
