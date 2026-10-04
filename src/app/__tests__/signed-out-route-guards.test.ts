// W-13 (qa-legacy-261004): opened by URL while signed out, eight data screens
// drew their input UI with no trip to /sign-in. Every write on them needs an
// owner, so the save button silently did nothing; /review showed a "take a test
// first" empty state that was not true. The same screens inside the dashboard
// phone were already gated (PhoneOpsContent), the standalone routes were not.
//
// These call the route components directly instead of rendering a tree: each
// route only reads useAuth (mocked here) and returns one element, so the element
// it returns IS the behaviour - a redirect, nothing yet, or the screen keyed by
// its owner. Rendering React Native is blocked in this repo; nothing here does.
import React from "react";

let mockAuth: { userId: string | null; loading: boolean } = { userId: null, loading: true };

jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("expo-router", () => ({ Redirect: function Redirect() { return null; } }));
jest.mock("@/screens/deepspace/ops", () => ({
  LedgerScreen: function LedgerScreen() { return null; },
  MilestonesScreen: function MilestonesScreen() { return null; },
  MealsScreen: function MealsScreen() { return null; },
  ReadingScreen: function ReadingScreen() { return null; },
  RemindersScreen: function RemindersScreen() { return null; },
}));
jest.mock("@/screens/deepspace/growth/WeeklyGrowthScreen", () => ({
  WeeklyGrowthScreen: function WeeklyGrowthScreen() { return null; },
}));
jest.mock("@/screens/deepspace/DeepSpaceDesignScreens", () => ({
  DeepSpaceReviewScreen: function DeepSpaceReviewScreen() { return null; },
  DeepSpaceDiscoverScreen: function DeepSpaceDiscoverScreen() { return null; },
}));

// The route files use JSX without importing React (the app compiles with the
// automatic runtime); the test transform emits React.createElement, so it has
// to be reachable as a global before the routes are required.
(globalThis as { React?: typeof React }).React = React;

type Route = () => React.ReactElement | null;

const ROUTES: readonly [file: string, screen: string][] = [
  ["ledger", "LedgerScreen"],
  ["milestones", "MilestonesScreen"],
  ["meals", "MealsScreen"],
  ["reading", "ReadingScreen"],
  ["reminders", "RemindersScreen"],
  ["growth", "WeeklyGrowthScreen"],
  ["review", "DeepSpaceReviewScreen"],
  ["discover", "DeepSpaceDiscoverScreen"],
];

function route(file: string): Route {
  return (require(`../${file}`) as { default: Route }).default;
}

function typeName(element: React.ReactElement | null): string | null {
  if (!element) return null;
  const type = element.type as { name?: string } | string;
  return typeof type === "string" ? type : type.name ?? null;
}

describe.each(ROUTES)("/%s while signed out", (file, screen) => {
  test("waits for auth instead of mounting the screen or redirecting", () => {
    mockAuth = { userId: null, loading: true };
    expect(route(file)()).toBeNull();
  });

  test("sends a signed-out visitor to /sign-in", () => {
    mockAuth = { userId: null, loading: false };
    const element = route(file)();
    expect(typeName(element)).toBe("Redirect");
    expect((element?.props as { href?: string }).href).toBe("/sign-in");
  });

  test(`mounts ${screen} keyed by its owner once signed in`, () => {
    mockAuth = { userId: "owner-a", loading: false };
    const element = route(file)();
    expect(typeName(element)).toBe(screen);
    // Remounting by owner keeps one account's state and late results out of the next.
    expect(element?.key).toBe("owner-a");
  });
});
