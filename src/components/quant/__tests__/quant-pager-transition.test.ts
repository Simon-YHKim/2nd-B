import React from "react";

type Props = Record<string, unknown> & { children?: React.ReactNode };
const mockStates: unknown[] = [];
let mockCursor = 0;
const mockButtons: Props[] = [];
const mockScenes: Props[] = [];
const mockItems: number[] = [];
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useMemo: (factory: () => unknown) => factory(),
  useState: (initial: unknown) => {
    const index = mockCursor++;
    if (!(index in mockStates)) mockStates[index] = initial;
    return [mockStates[index], (value: unknown) => {
      mockStates[index] = typeof value === "function" ? value(mockStates[index]) : value;
    }];
  },
}));
jest.mock("react-native", () => ({ StyleSheet: { create: (value: unknown) => value }, Platform: { OS: "web" } }));
jest.mock("@/components/phone/PhoneUIKit", () => ({
  PhoneView: (props: Props) => React.createElement("div", {}, props.children),
  PhoneScrollView: (props: Props) => React.createElement("div", {}, props.children),
}));
jest.mock("@/components/ui/Text", () => ({ Text: (props: Props) => React.createElement("span", {}, props.children) }));
jest.mock("@/components/ui/Button", () => ({ Button: (props: Props) => { mockButtons.push(props); return null; } }));
jest.mock("@/components/motion/SceneTransition", () => ({
  SceneTransition: (props: Props) => { mockScenes.push(props); return React.createElement("div", {}, props.children); },
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { QuantPager } from "../QuantPager";
const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup: (element: React.ReactNode) => string };
(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("moving pages changes only the visible items, keeps submit semantics, and reverses the animation", () => {
  mockStates.length = 0;
  const submit = jest.fn();
  const render = () => {
    mockCursor = 0; mockButtons.length = 0; mockScenes.length = 0; mockItems.length = 0;
    renderToStaticMarkup(React.createElement(QuantPager, {
      totalItems: 6, perPage: 3, answered: 6, complete: true, locale: "en", onSubmit: submit,
      renderItem: (index: number) => { mockItems.push(index); return React.createElement("span", {}, index); },
    }));
  };
  render();
  expect(mockItems).toEqual([0, 1, 2]);
  expect(mockScenes).toHaveLength(1);
  expect(mockScenes[0]).toEqual(expect.objectContaining({ transitionKey: 0, animateOnMount: false }));
  expect(mockButtons[0].disabled).toBe(true);
  (mockButtons.find(button => button.label === "quantNext")!.onPress as () => void)();
  render();
  expect(mockItems).toEqual([3, 4, 5]);
  expect(mockScenes[0]).toEqual(expect.objectContaining({ transitionKey: 1, kind: "page-forward" }));
  (mockButtons.find(button => button.label === "quantSaveResult")!.onPress as () => void)();
  expect(submit).toHaveBeenCalledTimes(1);
  (mockButtons.find(button => button.label === "quantBack")!.onPress as () => void)();
  render();
  expect(mockItems).toEqual([0, 1, 2]);
  expect(mockScenes[0]).toEqual(expect.objectContaining({ transitionKey: 0, kind: "page-back" }));
});
