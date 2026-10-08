import React from "react";

// IosParts is compiled with the automatic runtime in the app, classic JSX in Jest.
Object.assign(globalThis, { React });

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

let mockRouteBack: (() => void) | undefined;
let mockEmbeddedBack: (() => void) | undefined;
let mockBackStyle: Record<string, unknown> | undefined;
let mockModalClose: (() => void) | undefined;

jest.mock("react-native", () => ({
  Modal: ({ children, onRequestClose }: { children: React.ReactNode; onRequestClose: () => void }) => {
    mockModalClose = onRequestClose;
    return React.createElement("div", { "data-modal": true }, children);
  },
  Pressable: ({ children, onPress, accessibilityLabel, style }: {
    children: React.ReactNode; onPress: () => void; accessibilityLabel: string; style: Record<string, unknown>;
  }) => {
    mockEmbeddedBack = onPress;
    mockBackStyle = style;
    return React.createElement("button", { "aria-label": accessibilityLabel }, children);
  },
  ScrollView: ({ children }: { children: React.ReactNode }) => React.createElement("div", { "data-scroll": "inner" }, children),
  View: "div",
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("@/components/ui/PlainText", () => ({ PlainText: "span" }));
jest.mock("@/components/ui/Text", () => ({ Text: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children) }));
jest.mock("@/components/pixel/PixelGlyph", () => ({ PixelGlyph: ({ name, color }: { name: string; color: string }) => React.createElement("span", { "data-glyph": name, "data-color": color }) }));
jest.mock("@/components/phone/PhoneUIKit", () => {
  const native = jest.requireMock("react-native") as { Pressable: unknown; View: unknown };
  return { PhonePressable: native.Pressable, PhoneView: native.View };
});
jest.mock("@/components/pixel/PixelRoundRect", () => ({ PixelRoundRect: "div" }));
jest.mock("@/components/pixel/PixelDither", () => ({ PixelDither: ({ density }: { density: number }) => React.createElement("div", { "data-dither": density }) }));
jest.mock("@/lib/theme/phone-design", () => ({ phoneStyleSheet: (styles: unknown) => styles }));
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
import { OpsEmbeddedFrameHost, OpsFrame, OpsPushSheet } from "../kit";
import { PhoneDesignProvider } from "@/lib/theme/phone-design-context";
import { phoneIos } from "@/lib/theme/phone-ios";

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteBack = undefined;
  mockEmbeddedBack = undefined;
  mockBackStyle = undefined;
  mockModalClose = undefined;
});

test("the phone theme gives Ops a blue 44px back control and a large title", () => {
  const onBack = jest.fn();
  const markup = renderToStaticMarkup(React.createElement(PhoneDesignProvider, {
    children: React.createElement(OpsEmbeddedFrameHost, {
      onBack, backLabel: "Back to apps",
      children: React.createElement(OpsFrame, { title: "My shelf", children: "saved book" }),
    }),
  }));

  expect(markup).toContain('data-glyph="chevron_left"');
  expect(markup).toContain(`data-color="${phoneIos.blue}"`);
  expect(markup).toContain("My shelf");
  expect(mockBackStyle?.minHeight).toBe(44);
  expect(mockBackStyle?.minWidth).toBe(44);
  mockEmbeddedBack?.();
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(router.back).not.toHaveBeenCalled();
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

test("phone sheets keep Android Back and confirmation callbacks with a pixel scrim", () => {
  const onClose = jest.fn();
  const onConfirm = jest.fn();
  const markup = renderToStaticMarkup(React.createElement(PhoneDesignProvider, {
    children: React.createElement(OpsPushSheet, {
      visible: true, title: "Send routine", options: [], needsConsent: true,
      consentLabel: "Allow calendar access", confirmLabel: "Continue", closeLabel: "Cancel", onConfirm, onClose,
    }),
  }));
  expect(markup).toContain('data-dither="50"');
  expect(markup).toContain("Allow calendar access");
  expect(markup).toContain("Continue");
  mockModalClose?.();
  expect(onClose).toHaveBeenCalledTimes(1);
  // The final Pressable is the existing confirmation action.
  mockEmbeddedBack?.();
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
