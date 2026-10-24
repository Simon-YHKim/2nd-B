import React from "react";

Object.assign(globalThis, { React });
const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup(element: React.ReactNode): string;
};
type Host = { kind: "view" | "text" | "pressable"; props: Record<string, unknown>; text?: string };
let mockHosts: Host[] = [];
const mockOpen = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
const flatten = (style: unknown): Record<string, unknown> => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten)) : style && typeof style === "object" ? style as Record<string, unknown> : {};

// Actual row, PhoneUIKit, Text/PlainText and resolver run through React SSR.
// Only native hosts/Linking are seams; this is not a native layout/device test.
jest.mock("react-native", () => ({
  Platform: { OS: "web", select: (values: Record<string, unknown>) => values.web ?? values.default },
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => flatten(style), absoluteFill: {} },
  Animated: { createAnimatedComponent: (component: unknown) => component },
  Linking: { openURL: (url: string) => mockOpen(url) },
  View: ({ children, ...props }: { children: React.ReactNode }) => {
    mockHosts.push({ kind: "view", props });
    return React.createElement("div", null, children);
  },
  Text: ({ children, ...props }: { children: string; accessibilityRole?: string }) => {
    mockHosts.push({ kind: "text", props, text: children });
    return React.createElement("span", { role: props.accessibilityRole === "header" ? "heading" : undefined }, children);
  },
  Pressable: ({ children, ...props }: { children: React.ReactNode; accessibilityLabel?: string; accessibilityRole?: string }) => {
    mockHosts.push({ kind: "pressable", props });
    return React.createElement("button", { "aria-label": props.accessibilityLabel, role: props.accessibilityRole }, children);
  },
}));

import { InterviewGuidanceRow } from "../InterviewGuidanceRow";
import { PhoneDesignProvider } from "@/lib/theme/phone-design-context";
import { resolveProbeGuidanceCopy, type ProbeGuidanceCopy, type ProbeGuidanceBlockId } from "@/lib/interview/probe-guidance-copy";
import type { ContactId, ProbeGuidance } from "@/lib/interview/probe-guidance";
import { AVAILABLE_UI_LOCALES } from "@/lib/i18n/locales";
import { CRISIS_DIRECTORY_URL } from "@/lib/safety/help-directory";

type Ready = Extract<ProbeGuidanceCopy, { kind: "ready" }>;
const guidance = (...contacts: ContactId[]): ProbeGuidance => ({
  kind: "contacts", contacts, physicalUrgency: contacts.includes("KR_119"), corrections: [],
});
function ready(input: ProbeGuidance, locale: string): Ready {
  const copy = resolveProbeGuidanceCopy(input, locale);
  if (copy.kind !== "ready") throw new Error("Expected approved ready copy");
  return copy;
}
function render(copy: Ready, phone = false, onDismiss = jest.fn()) {
  mockHosts = [];
  const row = React.createElement(InterviewGuidanceRow, { copy, onDismiss });
  const markup = renderToStaticMarkup(phone ? React.createElement(PhoneDesignProvider, null, row) : row);
  const texts = mockHosts.filter(host => host.kind === "text");
  const controls = mockHosts.filter(host => host.kind === "pressable");
  return { markup, texts, controls, onDismiss };
}
function press(control: Host) {
  const callback = control.props.onPress;
  if (typeof callback !== "function") throw new Error("Missing native press callback");
  return callback();
}

// Approved literals are independent expectations for the actual displayed bodies.
const expected: Record<"ko" | "en", Record<ProbeGuidanceBlockId, string>> = {
  ko: {
    "physical-emergency": "지금 신체에 위험이 있다면 현지 긴급전화로 연락해 주세요. 한국에 계시면 119입니다. 가능하면 가까운 사람에게 도움을 요청해 주세요.",
    "immediate-threat": "누군가 지금 위협하고 있다면 가능한 경우 안전한 곳으로 이동해 현지 긴급전화로 연락해 주세요. 한국에 계시면 112입니다.",
    "kr-support": "한국에서 대화 지원이 필요하면 109로 연락할 수 있습니다.",
    "kr-youth-support": "한국에서는 청소년전화 1388 또는 109로 연락할 수 있습니다.",
    "us-support": "미국에서는 988로 전화하거나 문자를 보낼 수 있습니다. 다른 나라의 연락처는 도움 전화 찾기에서 확인하세요.",
    unresolved: "연락처를 확인하지 못했습니다. 지금 신체에 위험이 있으면 현지 긴급전화로 연락해 주세요. 다른 도움이 필요하면 도움 전화 찾기에서 확인하세요.",
  },
  en: {
    "physical-emergency": "If you are in physical danger now, contact your local emergency service. In South Korea, call 119. If you can, ask someone nearby for help.",
    "immediate-threat": "If someone is threatening you now, move to a safe place if you can and contact your local emergency service. In South Korea, call 112.",
    "kr-support": "In South Korea, you can call 109 for support.",
    "kr-youth-support": "In South Korea, young people can call 1388 or 109 for support.",
    "us-support": "In the US, you can call or text 988 for support. For other countries, use the helpline directory.",
    unresolved: "The contact details could not be verified. If you are in physical danger now, contact your local emergency service. For other support, use the helpline directory.",
  },
};
const cases: [ProbeGuidance, ProbeGuidanceBlockId][] = [
  [guidance("KR_119"), "physical-emergency"], [guidance("KR_112"), "immediate-threat"],
  [guidance("KR_109"), "kr-support"], [guidance("KR_1388"), "kr-youth-support"],
  [guidance("GLOBAL_988"), "us-support"], [{ kind: "unresolved", reason: "unsupported-contact" }, "unresolved"],
];

beforeEach(() => { mockHosts = []; mockOpen.mockReset().mockResolvedValue(undefined); });

test.each(["ko", "en"] as const)("%s displays all six complete approved bodies in ordinary and phone hosts", locale => {
  for (const [input, id] of cases) for (const phone of [false, true]) {
    const copy = ready(input, locale);
    const row = render(copy, phone);
    const labels = [locale === "ko" ? "연락 안내" : "Contact information", expected[locale][id],
      ...(copy.directory ? [locale === "ko" ? "도움 전화 찾기" : "Find a helpline"] : []), locale === "ko" ? "닫기" : "Close"];
    expect(row.texts.map(host => host.text)).toEqual(labels);
    expect(row.markup).toContain(expected[locale][id]);
    expect(row.controls).toHaveLength(copy.directory ? 2 : 1);
    expect(mockOpen).not.toHaveBeenCalled();
    expect(row.onDismiss).not.toHaveBeenCalled();
  }
});

test.each(AVAILABLE_UI_LOCALES)("%s retains country, purpose and title/body/directory/dismiss order for three blocks", locale => {
  const copy = ready(guidance("GLOBAL_988", "KR_112", "KR_119"), locale);
  const language = locale === "ko" ? "ko" : "en";
  const row = render(copy, true);
  expect(row.texts.map(host => host.text)).toEqual([copy.title, expected[language]["physical-emergency"],
    expected[language]["immediate-threat"], expected[language]["us-support"], copy.directory!.label, copy.dismissLabel]);
  expect(row.controls.map(host => host.props.accessibilityRole)).toEqual(["link", "button"]);
  expect(row.markup).not.toMatch(/tel:|role="alert"|aria-live|dialog/);
});

test("complete longest accepted three-block copies remain untruncated and have no duplicate body label", () => {
  for (const locale of ["ko", "en"]) for (const phone of [false, true]) {
    for (const input of [guidance("KR_119", "KR_112", "GLOBAL_988"), guidance("KR_119", "KR_112", "KR_1388")]) {
      const copy = ready(input, locale);
      const row = render(copy, phone);
      expect(copy.blocks).toHaveLength(3);
      for (const block of copy.blocks) expect(row.texts.filter(host => host.text === block.body)).toHaveLength(1);
      for (const host of mockHosts) {
        expect(host.props.numberOfLines).toBeUndefined();
        expect(host.props.ellipsizeMode).toBeUndefined();
        expect(host.props.accessibilityLiveRegion).toBeUndefined();
        expect(host.props.onLayout).toBeUndefined();
        const style = flatten(host.props.style);
        expect(style.height).toBeUndefined(); expect(style.maxHeight).toBeUndefined();
        expect(style.overflow).not.toBe("hidden");
      }
      for (const host of row.texts) expect(host.props.accessibilityLabel).toBeUndefined();
      expect(row.texts[0].props.accessibilityRole).toBe("header");
      expect(row.texts.every(host => host.props.maxFontSizeMultiplier === 1.7)).toBe(true);
    }
  }
});

test.each(["ko", "en"])("%s uses visible control labels, the approved directory hint, and explicit presses only", async locale => {
  const copy = ready(guidance("GLOBAL_988"), locale);
  const row = render(copy, true);
  expect(row.controls[0].props).toMatchObject({ accessibilityRole: "link", accessibilityLabel: copy.directory!.label,
    accessibilityHint: copy.directory!.hint });
  expect(row.controls[1].props).toMatchObject({ accessibilityRole: "button", accessibilityLabel: copy.dismissLabel });
  expect(row.controls[1].props.accessibilityHint).toBeUndefined();
  expect(mockOpen).not.toHaveBeenCalled();
  await press(row.controls[0]);
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(mockOpen).toHaveBeenLastCalledWith(CRISIS_DIRECTORY_URL);
  expect(row.onDismiss).not.toHaveBeenCalled();
  press(row.controls[1]);
  expect(row.onDismiss).toHaveBeenCalledTimes(1);
  expect(mockOpen).toHaveBeenCalledTimes(1);
});

test("telephone numbers are text and the directory-free row only dismisses", () => {
  const row = render(ready(guidance("KR_119", "KR_112", "KR_1388"), "ko"));
  expect(row.controls).toHaveLength(1);
  for (const body of row.texts.slice(1, -1)) expect(body.props.onPress).toBeUndefined();
  press(row.controls[0]);
  expect(row.onDismiss).toHaveBeenCalledTimes(1);
  expect(mockOpen).not.toHaveBeenCalled();
});

test.each(["reject", "throw"])("directory %s leaves fixed copy and dismiss available without logging raw errors", async mode => {
  const copy = ready({ kind: "unresolved", reason: "conflicting-intent" }, "en");
  const row = render(copy);
  const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  const error = new Error("synthetic browser failure");
  if (mode === "reject") mockOpen.mockRejectedValueOnce(error);
  else mockOpen.mockImplementationOnce(() => { throw error; });
  try {
    await expect(press(row.controls[0])).resolves.toBeUndefined();
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
    expect(render(copy).texts.map(host => host.text)).toEqual(row.texts.map(host => host.text));
    press(row.controls[1]); expect(row.onDismiss).toHaveBeenCalledTimes(1);
  } finally { log.mockRestore(); warn.mockRestore(); }
});
