import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup(element: React.ReactNode): string;
};

type HostProps = Record<string, unknown> & { children?: React.ReactNode };
const mockHosts: Array<{ kind: string; props: HostProps }> = [];

jest.mock("react-native", () => {
  const flatten = (value: unknown): Record<string, unknown> | undefined => {
    if (!value) return undefined;
    if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten));
    return value as Record<string, unknown>;
  };
  const host = (kind: string) => React.forwardRef<unknown, HostProps>((props, _ref) => {
    mockHosts.push({ kind, props: { ...props, style: flatten(props.style) } });
    return React.createElement("div", { "data-host": kind }, props.children as React.ReactNode);
  });
  return {
    View: host("view"), Pressable: host("pressable"), Text: host("text"),
    TextInput: host("input"), ScrollView: host("scroll"), FlatList: host("list"),
    TouchableOpacity: host("touchable"), TouchableWithoutFeedback: host("touchable"),
    Animated: { createAnimatedComponent: (component: unknown) => component },
    StyleSheet: { create: (value: unknown) => value, flatten, absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
    Platform: { OS: "web", select: (options: Record<string, unknown>) => options.web ?? options.default },
  };
});
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("@/lib/settings/readable-font", () => ({ useFontStyle: () => ({ fontStyle: "pixel" }) }));
jest.mock("@/lib/theme/ThemeContext", () => ({
  useThemePalette: () => require("@/lib/theme/tokens").semantic,
}));
jest.mock("@/lib/interview/probe", () => {
  const layers = ["fact", "feeling", "meaning", "belief", "echo"];
  const labels = Object.fromEntries(layers.map(layer => [layer, layer]));
  return {
    DRILL_LAYERS: layers, LAYER_LABEL: { en: labels, ko: labels },
    PERIOD_LABEL: { en: { now: "Now" }, ko: { now: "지금" } },
  };
});

import { LikertChoiceGroup } from "../LikertChoiceGroup";
import { PhoneDesignProvider } from "@/lib/theme/phone-design-context";
import { phoneIos } from "@/lib/theme/phone-ios";
import { semantic } from "@/lib/theme/tokens";
import { DrillProgress } from "@/components/ui/DrillProgress";

// The repository's ts-jest transform uses classic JSX for files whose runtime
// uses Expo's automatic JSX transform.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderGroup(phone: boolean, onSelect = jest.fn()) {
  mockHosts.length = 0;
  const group = React.createElement(LikertChoiceGroup, {
    choices: [{ value: 1, label: "Low" }, { value: 2, label: "High" }],
    locale: "en", question: "A real questionnaire", value: 2, onSelect,
  });
  renderToStaticMarkup(phone ? React.createElement(PhoneDesignProvider, {}, group) : group);
  return mockHosts.map(host => ({ ...host }));
}

test("questionnaire answer choices use iOS surfaces only while hosted and retain selection behavior", () => {
  const onSelect = jest.fn();
  const standalone = renderGroup(false, onSelect);
  const originalButtons = standalone.filter(host => host.kind === "pressable");
  expect(originalButtons).toHaveLength(2);
  expect(originalButtons[0].props.style).toEqual(expect.objectContaining({ backgroundColor: semantic.surfaceAlt }));
  expect(originalButtons[1].props.style).toEqual(expect.objectContaining({ backgroundColor: semantic.brand }));

  const hosted = renderGroup(true, onSelect);
  const buttons = hosted.filter(host => host.kind === "pressable");
  expect(buttons).toHaveLength(2);
  for (let index = 0; index < buttons.length; index += 1) {
    expect(buttons[index].props.accessibilityRole).toBe("radio");
    expect(buttons[index].props.accessibilityState).toEqual({ checked: index === 1 });
    expect(buttons[index].props.accessibilityLabel).toBe(originalButtons[index].props.accessibilityLabel);
    expect(buttons[index].props.style).toEqual(expect.objectContaining({ flex: 1, minWidth: 44, minHeight: 48 }));
    (buttons[index].props.onPress as () => void)();
  }
  expect(onSelect.mock.calls).toEqual([[1], [2]]);
  const backgrounds = hosted.map(host => (host.props.style as Record<string, unknown> | undefined)?.backgroundColor).filter(Boolean);
  expect(backgrounds).toContain(phoneIos.cell);
  expect(backgrounds).toContain(phoneIos.blue);
  expect(backgrounds).not.toContain(semantic.surfaceAlt);
  expect(backgrounds).not.toContain(semantic.brand);
  // A hosted render cannot mutate the module-scoped styles used by the next
  // standalone render, even when both instances live in the same React tree.
  expect(renderGroup(false).filter(host => host.kind === "pressable").map(host => host.props.style))
    .toEqual(originalButtons.map(host => host.props.style));
});

test("the phone's interview matrix preserves each count level and the current target", () => {
  const coverage = { now: { fact: 0, feeling: 1, meaning: 2, belief: 3, echo: 4 } } as React.ComponentProps<typeof DrillProgress>["coverage"];
  const matrix = React.createElement(DrillProgress, {
    coverage, periods: ["now"], locale: "en", activePeriod: "now", activeLayer: "meaning",
  });
  const cells = (phone: boolean) => {
    mockHosts.length = 0;
    renderToStaticMarkup(phone ? React.createElement(PhoneDesignProvider, {}, matrix) : matrix);
    return mockHosts.filter(host => host.kind === "view" && String(host.props.accessibilityLabel).startsWith("Now ·"));
  };
  const standalone = cells(false);
  const hosted = cells(true);
  expect(hosted.map(cell => cell.props.accessibilityLabel)).toEqual(standalone.map(cell => cell.props.accessibilityLabel));
  const styles = hosted.map(cell => cell.props.style as Record<string, unknown>);
  expect(styles.map(style => style.backgroundColor)).toEqual([
    phoneIos.fill, phoneIos.lightBlue, phoneIos.blue, phoneIos.bluePressed, phoneIos.bluePressed,
  ]);
  expect(styles[2].borderColor).toBe(phoneIos.green);
  expect(cells(false).map(cell => cell.props.style)).toEqual(standalone.map(cell => cell.props.style));
});

test.each([
  "src/app/settings.tsx", "src/app/secondb.tsx", "src/app/reasoning.tsx", "src/app/iden.tsx",
  "src/app/core-brain.tsx", "src/app/notices.tsx", "src/components/community/CommunityRoomContent.tsx",
  "src/components/deep-space/DeepSpaceViews.tsx", "src/screens/deepspace/DeepSpaceDesignScreens.tsx",
  "src/screens/deepspace/import/ImportHubScreen.tsx", "src/screens/deepspace/growth/WeeklyGrowthScreen.tsx",
])("%s keeps raw local surfaces under the phone's visual scope", path => {
  const source = readFileSync(resolve(__dirname, "../../../..", path), "utf8");
  // These screens own raw StyleSheet/View surfaces that do not pass through
  // PixelSurface. Reintroducing native imports here recreates the original
  // mixed iOS shell / clay app regression.
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']react-native["']/g)];
  for (const imported of imports) {
    const values = imported[1].split(",").map(value => value.trim()).filter(value => !value.startsWith("type "));
    expect(values.filter(value => /^(View|Pressable|TextInput|ScrollView|FlatList|TouchableOpacity)(?:\s|$)/.test(value))).toEqual([]);
  }
  expect(source).toContain('from "@/components/phone/PhoneUIKit"');
});
