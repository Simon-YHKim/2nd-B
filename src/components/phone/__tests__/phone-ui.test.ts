import React from "react";

Object.assign(globalThis, { React });
const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};
let mockText: { label: string; style: Record<string, unknown> }[] = [];
let mockButtons: Record<string, unknown>[] = [];
const flatten = (style: unknown): Record<string, unknown> => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten)) : style && typeof style === "object" ? style as Record<string, unknown> : {};

jest.mock("react-native", () => ({
  Platform: { OS: "web", select: (values: Record<string, unknown>) => values.web ?? values.default },
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => flatten(style), absoluteFill: { position: "absolute" } },
  Animated: { createAnimatedComponent: (component: unknown) => component },
  View: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  Text: ({ children, style }: { children: string; style: unknown }) => {
    mockText.push({ label: children, style: flatten(style) });
    return React.createElement("span", null, children);
  },
  Pressable: ({ children, ...props }: { children: React.ReactNode }) => {
    mockButtons.push(props);
    return React.createElement("button", null, children);
  },
  ActivityIndicator: ({ color }: { color: string }) => React.createElement("i", { "data-loading": color }),
}));

import { PhoneDesignProvider } from "@/lib/theme/phone-design-context";
import { phoneIos } from "@/lib/theme/phone-ios";
import { m3 } from "@/lib/theme/m3";
import { cosmic } from "@/lib/theme/tokens";
import { PhoneView } from "../PhoneUIKit";
import { PlainText } from "@/components/ui/PlainText";
import { MdButton } from "@/components/m3/MdButton";
import { PixelPressable } from "@/components/pixel/PixelPressable";

beforeEach(() => { mockText = []; mockButtons = []; });

test("same text subtree remains dark outside the phone and follows its blue surface inside", () => {
  const tree = React.createElement(PhoneView, { style: { backgroundColor: m3.color.primary } },
    React.createElement(PhoneView, null,
      React.createElement(PlainText, { style: { color: cosmic.moonWhite, fontFamily: "Pretendard" } }, "body")));
  renderToStaticMarkup(React.createElement(React.Fragment, null, tree,
    React.createElement(PhoneDesignProvider, null, tree)));
  expect(mockText[0].style).toMatchObject({ color: cosmic.moonWhite, fontFamily: "Pretendard" });
  expect(mockText[1].style).toMatchObject({ color: phoneIos.onBlue, fontFamily: "Pretendard" });
});

test("phone M3 primary retains events and disabled/loading accessibility", () => {
  const onPress = jest.fn();
  renderToStaticMarkup(React.createElement(PhoneDesignProvider, null,
    React.createElement(MdButton, { label: "Save", onPress }),
    React.createElement(MdButton, { label: "Wait", onPress, loading: true }),
    React.createElement(MdButton, { label: "Unavailable", onPress, disabled: true })));
  expect(mockText.find(text => text.label === "Save")?.style.color).toBe(phoneIos.onBlue);
  expect(mockText.find(text => text.label === "Unavailable")?.style.color).toBe(phoneIos.label2);
  expect(mockButtons[0].onPress).toBe(onPress);
  expect(mockButtons[1]).toMatchObject({ disabled: true, accessibilityState: { disabled: true, busy: true } });
  expect(mockButtons[2]).toMatchObject({ disabled: true, accessibilityState: { disabled: true, busy: false } });
});

test("one-pixel separators keep their solid geometry instead of card corners", () => {
  const html = renderToStaticMarkup(React.createElement(PhoneDesignProvider, null,
    React.createElement(PhoneView, { style: { height: 1, backgroundColor: m3.color.outline } })));
  // No corner layers are mounted for small decorative marks.
  expect(html).toBe("<div></div>");
});

test("disabled pixel controls retain their native disabled state and gray phone label", () => {
  renderToStaticMarkup(React.createElement(PhoneDesignProvider, null,
    React.createElement(PixelPressable, { onPress: jest.fn(), disabled: true, background: m3.color.primary },
      React.createElement(PlainText, { style: { color: m3.color.onPrimary } }, "Disabled"))));
  expect(mockButtons[0]).toMatchObject({ disabled: true, accessibilityState: { disabled: true } });
  expect(mockText[0].style.color).toBe(phoneIos.label2);
});
