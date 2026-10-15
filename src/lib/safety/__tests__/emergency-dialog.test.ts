import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

Object.assign(globalThis, { React });
const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};
let mockLocale = "ko";
const mockCall = jest.fn().mockResolvedValue(undefined);
const mockPresses: (() => void)[] = [];
const mockClose = jest.fn();

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
  Linking: { openURL: (...args: unknown[]) => mockCall(...args) },
}));
jest.mock("@/components/phone/PhoneUIKit", () => ({
  PhoneView: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  PhoneScrollView: ({ children }: { children: React.ReactNode }) => React.createElement("div", { "data-scroll": true }, children),
  PhonePressable: ({ children, onPress, accessibilityLabel }: { children: React.ReactNode; onPress: () => void; accessibilityLabel: string }) => {
    mockPresses.push(onPress);
    return React.createElement("button", { "aria-label": accessibilityLabel }, children);
  },
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({
  i18n: { language: mockLocale },
  t: (key: string) => {
    const copy = JSON.parse(readFileSync(resolve(process.cwd(), `locales/${mockLocale}/safety.json`), "utf8"));
    return key.split(".").reduce((value, part) => value[part], copy);
  },
}) }));
jest.mock("@/components/ui/ScreenModal", () => ({ ScreenModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null }));
jest.mock("@/components/ui/MotionModal", () => ({ MotionModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null }));
jest.mock("@/components/ui/Text", () => ({ Text: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children) }));
jest.mock("@/components/ui/Button", () => ({ Button: ({ label, onPress }: { label: string; onPress: () => void }) => {
  mockClose.mockImplementation(onPress);
  return React.createElement("button", null, label);
} }));
jest.mock("@/components/pixel/PixelDither", () => ({ PixelScrim: () => null }));

import { CrisisRouter, CRISIS_DIRECTORY_URL } from "@/components/safety/CrisisRouter";
import { CRISIS_DIRECTORY_URL as sharedDirectoryUrl } from "../help-directory";
import { classifyInputAnyLocale } from "../classifier";

beforeEach(() => { mockCall.mockClear(); mockPresses.length = 0; mockClose.mockReset(); });

test.each([
  ["약을 이미 많이 먹었어", "119"],
  ["지금 누가 나를 칼로 위협하고 있어", "112"],
] as const)("%s renders and dials the same conditional number", (text, number) => {
  for (const locale of ["ko", "en", "es", "pt", "id"]) {
    mockLocale = locale;
    mockPresses.length = 0;
    mockCall.mockClear();
    const onClose = jest.fn();
    const hotline = classifyInputAnyLocale(text, locale === "ko" ? "ko" : "en", { minor: true }).crisisRouting!.hotline;
    const markup = renderToStaticMarkup(React.createElement(CrisisRouter, { visible: true, hotline, onClose }));
    expect(markup).toContain(locale === "ko" ? `한국에 계시면 ${number}` : `In South Korea, call ${number}`);
    expect(markup).toContain('data-scroll="true"');
    expect(markup).not.toMatch(/109|1388|988/);
    expect(mockCall).not.toHaveBeenCalled();
    expect(mockPresses).toHaveLength(1);
    mockPresses[0]();
    expect(mockCall).toHaveBeenCalledWith(`tel:${number}`);
    mockClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  }
});

test("self-harm alone retains the youth support dialog", () => {
  mockLocale = "ko";
  const hotline = classifyInputAnyLocale("죽고 싶어", "ko", { minor: true }).crisisRouting!.hotline;
  const markup = renderToStaticMarkup(React.createElement(CrisisRouter, { visible: true, hotline, onClose: jest.fn() }));
  expect(markup).toContain("1388");
  expect(markup).not.toMatch(/119|112/);
  mockPresses[0]();
  expect(mockCall).toHaveBeenCalledWith("tel:1388");
});

test.each(["ko", "en", "es", "pt", "id"])("%s opens the shared directory only on its explicit press", (locale) => {
  mockLocale = locale;
  const markup = renderToStaticMarkup(React.createElement(CrisisRouter, {
    visible: true, hotline: "GLOBAL_988", onClose: jest.fn(),
  }));
  expect(CRISIS_DIRECTORY_URL).toBe(sharedDirectoryUrl);
  expect(sharedDirectoryUrl).toBe("https://findahelpline.com");
  expect(markup).toContain("988");
  expect(mockCall).not.toHaveBeenCalled();
  expect(mockPresses).toHaveLength(2);
  mockPresses[1]();
  expect(mockCall).toHaveBeenCalledTimes(1);
  expect(mockCall).toHaveBeenLastCalledWith(sharedDirectoryUrl);
  mockPresses[0]();
  expect(mockCall).toHaveBeenCalledTimes(2);
  expect(mockCall).toHaveBeenLastCalledWith("tel:988");
});
