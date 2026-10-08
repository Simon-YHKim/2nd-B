import React from "react";

// The production bundler uses the automatic JSX runtime; this Jest preset uses classic JSX.
Object.assign(globalThis, { React });

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

let mockPhone = false;
let mockPress: (() => void) | undefined;
let mockChange: ((value: string) => void) | undefined;
let mockSubmit: (() => void) | undefined;
let mockInputStyle: Record<string, unknown> | undefined;

const flatten = (value: unknown): Record<string, unknown> => Array.isArray(value)
  ? Object.assign({}, ...value.map(flatten))
  : value && typeof value === "object" ? value as Record<string, unknown> : {};

jest.mock("react-native", () => ({
  Animated: { createAnimatedComponent: (component: unknown) => component },
  View: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  Pressable: ({ children, onPress, accessibilityLabel }: {
    children: React.ReactNode; onPress: () => void; accessibilityLabel?: string;
  }) => {
    mockPress = onPress;
    return React.createElement("button", { "aria-label": accessibilityLabel }, children);
  },
  TextInput: ({ onChangeText, onSubmitEditing, style, value }: {
    onChangeText: (value: string) => void; onSubmitEditing: () => void; style: unknown; value: string;
  }) => {
    mockChange = onChangeText;
    mockSubmit = onSubmitEditing;
    mockInputStyle = flatten(style);
    return React.createElement("input", { value, readOnly: true });
  },
  StyleSheet: { create: (style: unknown) => style, flatten: (style: unknown) => flatten(style), absoluteFillObject: { position: "absolute", inset: 0 } },
}));
jest.mock("@/lib/theme/phone-design-context", () => ({
  usePhoneDesign: () => mockPhone,
  PhoneForegroundProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/lib/theme/phone-design", () => ({
  phoneStyle: (style: unknown) => ({ ...flatten(style), backgroundColor: "white", borderColor: "gray", color: "black", borderRadius: 0 }),
  phoneTextColor: () => "gray",
  phoneFlatSurface: { backgroundColor: "transparent", borderWidth: 0 },
  phoneInputStyle: { minHeight: 44 },
}));
jest.mock("@/lib/settings/readable-font", () => ({ useFontStyle: () => ({ fontStyle: "pixel" }) }));
jest.mock("@/theme/typography", () => ({ fontFamilies: { readable: "Pretendard" } }));
jest.mock("@/components/pixel/PixelRoundRect", () => ({
  PixelRoundRect: ({ children, fill }: { children: React.ReactNode; fill: string }) => React.createElement("div", { "data-pixel-fill": fill }, children),
}));

import { PhonePressable as OpsPressable, PhoneTextInput as OpsTextInput, PhoneView as OpsView } from "@/components/phone/PhoneUIKit";

beforeEach(() => { mockPhone = false; });

test("standalone surfaces keep their original renderer", () => {
  const markup = renderToStaticMarkup(React.createElement(OpsView, {
    style: { borderWidth: 1, backgroundColor: "navy" }, children: "book",
  }));
  expect(markup).toBe("<div>book</div>");
});

test("phone cells use stepped surfaces and retain content", () => {
  mockPhone = true;
  const markup = renderToStaticMarkup(React.createElement(OpsView, {
    style: { borderWidth: 1, backgroundColor: "navy" }, children: "book",
  }));
  expect(markup).toContain('data-pixel-fill="white"');
  expect(markup).toContain("book");
});

test("phone actions retain their label and original callback", () => {
  mockPhone = true;
  const onPress = jest.fn();
  const markup = renderToStaticMarkup(React.createElement(OpsPressable, {
    style: { minHeight: 44, borderRadius: 4, backgroundColor: "navy" },
    accessibilityLabel: "Save meal", onPress, children: "Save",
  }));
  expect(markup).toContain('aria-label="Save meal"');
  expect(markup).toContain('data-pixel-fill="white"');
  mockPress?.();
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("phone inputs preserve edits and keyboard submit with the phone typography", () => {
  mockPhone = true;
  const onChangeText = jest.fn();
  const onSubmitEditing = jest.fn();
  const markup = renderToStaticMarkup(React.createElement(OpsTextInput, {
    value: "current draft", style: { flex: 1, minWidth: 0, borderWidth: 1 }, onChangeText, onSubmitEditing,
  }));
  expect(markup).toContain('value="current draft"');
  expect(mockInputStyle?.fontFamily).toBe("Galmuri14");
  expect(mockInputStyle?.minHeight).toBe(44);
  mockChange?.("next draft");
  mockSubmit?.();
  expect(onChangeText).toHaveBeenCalledWith("next draft");
  expect(onSubmitEditing).toHaveBeenCalledTimes(1);
});
