import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactNode) => string;
};

let mockAuth: { userId: string | null; loading: boolean } = { userId: null, loading: true };
let mockChildKey: string | null = null;
let mockOwner: string | null = null;
let mockHostBack: (() => void) | null = null;
let mockOpenAssistant: (() => void) | null = null;

jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => React.createElement("div", { "data-redirect": href }),
}));
jest.mock("@/components/deepspace/ops", () => ({
  OpsEmbeddedFrameHost: ({ children, onBack, backLabel }: {
    children: React.ReactNode; onBack: () => void; backLabel: string;
  }) => {
    mockHostBack = onBack;
    mockChildKey = React.isValidElement(children) ? String(children.key) : null;
    return React.createElement("section", { "data-back-label": backLabel }, children);
  },
}));
jest.mock("../screens", () => ({
  OpsHomeScreen: () => React.createElement("div", { "data-screen": "ops" }),
  ReadingScreen: () => React.createElement("div", { "data-screen": "reading" }),
  RemindersScreen: ({ onOpenAssistant }: { onOpenAssistant: () => void }) => {
    mockOpenAssistant = onOpenAssistant;
    return React.createElement("div", { "data-screen": "reminders" });
  },
  LedgerScreen: () => React.createElement("div", { "data-screen": "ledger" }),
  MilestonesScreen: () => React.createElement("div", { "data-screen": "milestones" }),
  MealsScreen: () => React.createElement("div", { "data-screen": "meals" }),
  SideProjectScreen: ({ userId }: { userId: string }) => {
    mockOwner = userId;
    return React.createElement("div", { "data-screen": "side-project" });
  },
}));

import { OpsPhoneContent } from "../PhoneOpsContent";

beforeEach(() => {
  mockAuth = { userId: null, loading: true };
  mockChildKey = null;
  mockOwner = null;
  mockHostBack = null;
  mockOpenAssistant = null;
});

test("waits for auth and redirects signed-out phone content", () => {
  const onBack = jest.fn();
  expect(renderToStaticMarkup(React.createElement(OpsPhoneContent, { screen: "reading", onBack, onNavigate: jest.fn() }))).toBe("");
  expect(mockChildKey).toBeNull();

  mockAuth = { userId: null, loading: false };
  expect(renderToStaticMarkup(React.createElement(OpsPhoneContent, { screen: "side-project", onBack, onNavigate: jest.fn() })))
    .toContain('data-redirect="/sign-in"');
  expect(mockOwner).toBeNull();
});

test("mounts the actual reading screen under the account-keyed phone host", () => {
  mockAuth = { userId: "reader-a", loading: false };
  const onBack = jest.fn();
  const markup = renderToStaticMarkup(React.createElement(OpsPhoneContent, { screen: "reading", onBack, onNavigate: jest.fn() }));

  expect(markup).toContain('data-screen="reading"');
  expect(markup).not.toContain('data-screen="side-project"');
  expect(markup).toContain('data-back-label="phone.appsBack"');
  expect(mockChildKey).toBe("reader-a");
  expect(mockHostBack).toBe(onBack);
});

test("passes the authenticated owner to the existing side-project screen", () => {
  mockAuth = { userId: "owner-a", loading: false };
  const markup = renderToStaticMarkup(React.createElement(OpsPhoneContent, {
    screen: "side-project", onBack: jest.fn(), onNavigate: jest.fn(),
  }));

  expect(markup).toContain('data-screen="side-project"');
  expect(mockOwner).toBe("owner-a");
  expect(mockChildKey).toBe("owner-a");
});

test.each(["reminders", "ledger", "milestones", "meals"] as const)(
  "mounts the real %s domain screen in the account-keyed phone host",
  (screen) => {
    mockAuth = { userId: "owner-b", loading: false };
    const onNavigate = jest.fn();
    const markup = renderToStaticMarkup(React.createElement(OpsPhoneContent, {
      screen, onBack: jest.fn(), onNavigate,
    }));
    expect(markup).toContain(`data-screen="${screen}"`);
    expect(mockChildKey).toBe("owner-b");
    if (screen === "reminders") {
      expect(mockOpenAssistant).not.toBeNull();
      mockOpenAssistant?.();
      expect(onNavigate).toHaveBeenCalledWith("/ops");
    }
  },
);

test("standalone routes still mount the same screens", () => {
  const reading = readFileSync(join(process.cwd(), "src/app/reading.tsx"), "utf8");
  const sideProject = readFileSync(join(process.cwd(), "src/app/side-project.tsx"), "utf8");

  // The standalone route takes the same gate as the phone (W-13, 2026-10-04):
  // before it, /reading opened signed out and its saves did nothing.
  expect(reading).toContain("if (!userId) return <Redirect href=\"/sign-in\" />;");
  expect(reading).toContain("return <ReadingScreen key={userId} />;");
  expect(sideProject).toContain("if (!userId) return <Redirect href=\"/sign-in\" />;");
  expect(sideProject).toContain("<SideProjectScreen key={userId} userId={userId} />");
});
