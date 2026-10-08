import React from "react";

type Props = Record<string, unknown> & { children?: React.ReactNode };
let mockPhone = false;
let mockReduced = false;
const mockScroll = { scrollTo: jest.fn() };
const mockButtons: Props[] = [];
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useRef: (value: unknown) => ({ current: value === null ? mockScroll : value }),
}));
jest.mock("react-native", () => ({ StyleSheet: { create: (value: unknown) => value } }));
jest.mock("@/components/phone/PhoneUIKit", () => ({
  PhoneView: (props: Props) => React.createElement("div", {}, props.children),
  PhoneScrollView: (props: Props) => React.createElement("div", {}, props.children),
  PhonePressable: (props: Props) => { mockButtons.push(props); return null; },
}));
jest.mock("@/components/ui/Text", () => ({ Text: (props: Props) => React.createElement("span", {}, props.children) }));
jest.mock("@/components/m3", () => ({ MdCard: (props: Props) => React.createElement("div", {}, props.children), m3TextStyle: () => ({}) }));
jest.mock("@/components/motion/SceneTransition", () => ({ SceneTransition: (props: Props) => React.createElement("div", {}, props.children) }));
jest.mock("@/lib/settings/readable-font", () => ({ subscribeFontStyle: () => () => {} }));
jest.mock("@/lib/theme/phone-design-context", () => ({ usePhoneDesign: () => mockPhone }));
jest.mock("@/lib/motion/use-reduced-motion", () => ({ useReducedMotionPref: () => mockReduced }));
jest.mock("../polaris-card-edges", () => ({ usePolarisCardEdgeReport: () => () => {} }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { PolarisDeck } from "../PolarisDeck";
const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup: (element: React.ReactNode) => string };
(globalThis as typeof globalThis & { React: typeof React }).React = React;

test.each([
  [false, false, false], [false, true, false], [true, false, true], [true, true, false],
])("dot paging: phone=%s reduced=%s native animation=%s", (phone, reduced, animated) => {
  mockPhone = phone; mockReduced = reduced; mockButtons.length = 0; mockScroll.scrollTo.mockClear();
  renderToStaticMarkup(React.createElement(PolarisDeck, {
    isKo: false,
    pages: [{ key: "one", title: "One", body: "First" }, { key: "two", title: "Two", body: "Second" }],
  }));
  expect(mockButtons).toHaveLength(2);
  expect(mockButtons[1].accessibilityRole).toBe("tab");
  (mockButtons[1].onPress as () => void)();
  expect(mockScroll.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ animated }));
});
