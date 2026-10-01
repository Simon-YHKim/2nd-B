jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }, useLocalSearchParams: () => ({}) }));

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hrefToPath, splitPhoneRoute } from "../phone-embed";

test("hrefToPath keeps strings and fills dynamic segments from params", () => {
  expect(hrefToPath("/settings")).toBe("/settings");
  expect(hrefToPath({ pathname: "/community/[room]", params: { room: "a b/c" } })).toBe("/community/a%20b%2Fc");
  expect(hrefToPath({ pathname: "/import", params: { mode: "account", empty: undefined } })).toBe("/import?mode=account");
  expect(hrefToPath({ pathname: "/community/join/[token]", params: { token: "t1", from: "list" } })).toBe("/community/join/t1?from=list");
});

test("splitPhoneRoute returns the path and query params", () => {
  expect(splitPhoneRoute("/settings")).toEqual({ path: "/settings", params: {} });
  expect(splitPhoneRoute("/import?mode=account&x=1")).toEqual({ path: "/import", params: { mode: "account", x: "1" } });
});

test("a round trip through the phone stack keeps the params", () => {
  const route = hrefToPath({ pathname: "/import", params: { mode: "account" } });
  expect(splitPhoneRoute(route).params).toEqual({ mode: "account" });
});

const shell = readFileSync(join(__dirname, "..", "..", "..", "components", "deep-space", "DeepSpaceScreen.tsx"), "utf8");

test("DeepSpaceScreen inside the phone drops the app dock and uses the phone's back", () => {
  const start = shell.indexOf("if (embed) {");
  const end = shell.indexOf("return (", shell.indexOf("return (", start) + 1);
  expect(start).toBeGreaterThan(0);
  const embedded = shell.slice(start, end);
  expect(embedded).toContain("onPress={onBack ?? embed.back}");
  expect(embedded).not.toContain("MdNavBar");
  expect(embedded).not.toContain("SafeAreaView");
  // Hooks stay above the early return (rules of hooks).
  expect(shell.indexOf("const embed = usePhoneEmbed();")).toBeLessThan(start);
  expect(shell.indexOf("useEffect(() => {")).toBeLessThan(start);
});
