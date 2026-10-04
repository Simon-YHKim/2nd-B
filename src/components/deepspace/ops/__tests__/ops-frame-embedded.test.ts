import React from "react";

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

let mockRouteBack: (() => void) | undefined;
let mockEmbeddedBack: (() => void) | undefined;

jest.mock("react-native", () => ({
  Modal: "div",
  Pressable: ({ children, onPress, accessibilityLabel }: {
    children: React.ReactNode; onPress: () => void; accessibilityLabel: string;
  }) => {
    mockEmbeddedBack = onPress;
    return React.createElement("button", { "aria-label": accessibilityLabel }, children);
  },
  ScrollView: ({ children }: { children: React.ReactNode }) => React.createElement("div", { "data-scroll": "inner" }, children),
  View: "div",
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("@/components/ui/PlainText", () => ({ PlainText: "span" }));
jest.mock("@/components/ui/Text", () => ({ Text: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children) }));
jest.mock("@/components/pixel/PixelGlyph", () => ({ PixelGlyph: () => React.createElement("span", null, "←") }));
jest.mock("@/components/deep-space/DeepSpaceScreen", () => ({
  DeepSpaceScreen: ({ children, onBack }: { children: React.ReactNode; onBack: () => void }) => {
    mockRouteBack = onBack;
    return React.createElement("section", { "data-shell": "route" }, children);
  },
}));
jest.mock("@/lib/theme/m3", () => ({ m3: { shape: { none: 0, small: 2, medium: 4, large: 6 } } }));
jest.mock("@/lib/theme/tokens", () => ({
  deepSpace: new Proxy({}, { get: () => "#123456" }),
  deepSpaceRadii: { phone: 4 },
  deepSpaceSpacing: { sm: 4, md: 8, lg: 12, xl: 16 },
  withAlpha: () => "#123456",
}));
jest.mock("@/lib/ops/domains", () => ({ OPS_DOMAIN_GROUP: {} }));

import { router } from "expo-router";
import { OpsEmbeddedFrameHost, OpsFrame } from "../kit";

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteBack = undefined;
  mockEmbeddedBack = undefined;
});

test("standalone OpsFrame keeps route shell, inner scrolling, and route back", () => {
  const markup = renderToStaticMarkup(React.createElement(OpsFrame, {
    title: "My shelf",
    children: React.createElement("span", null, "saved book"),
  }));

  expect(markup).toContain('data-shell="route"');
  expect(markup).toContain('data-scroll="inner"');
  expect(markup).toContain("saved book");
  mockRouteBack?.();
  expect(router.back).toHaveBeenCalledTimes(1);
});

test("embedded OpsFrame uses the phone back callback and parent's scrolling", () => {
  const onBack = jest.fn();
  const markup = renderToStaticMarkup(React.createElement(OpsEmbeddedFrameHost, {
    onBack,
    backLabel: "Back to apps",
    children: React.createElement(OpsFrame, {
      title: "My shelf",
      children: React.createElement("span", null, "saved book"),
    }),
  }));

  expect(markup).not.toContain('data-shell="route"');
  expect(markup).not.toContain('data-scroll="inner"');
  expect(markup).toContain('aria-label="Back to apps"');
  expect(markup).toContain("My shelf");
  expect(markup).toContain("saved book");
  mockEmbeddedBack?.();
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(router.back).not.toHaveBeenCalled();
});
