// Regression guard for the web-bundle platform split (audit D5-01 / D5-11 /
// D5-13). Metro walks the module graph STATICALLY: a require() inside a
// function, wrapped in try/catch, keeps a native SDK from THROWING on web but
// does not keep it OUT of the web bundle. That is how react-native-purchases
// (+ @revenuecat/purchases-js-hybrid-mappings), expo-notifications,
// expo-calendar and the two health SDKs rode into the web entry for callers
// that all report "unavailable" on web anyway.
//
// The contract this file pins, same shape as src/lib/ads/__tests__/platform-split.test.ts:
//   - each SDK is referenced ONLY from its native/default file; the .web.ts
//     variant is reference-free (no import, no require, no typeof import);
//   - web and native variants have the same export surface and the same types;
//   - the web variants fail closed with exactly the values the native file
//     returns on web at runtime;
//   - no OTHER file under src/ reaches for those SDKs directly, so the seam
//     cannot be bypassed by a future lazy require somewhere else;
//   - the canon index does not carry the museum pack (only ./museum.ts does).
//
// jest and tsc resolve the .ts files (no platform extensions), so both variants
// are imported here by explicit filename.

jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("react-native-purchases", () => ({ __esModule: true, default: {} }));

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import * as purchasesNative from "../payments/purchases";
import * as purchasesWeb from "../payments/purchases.web";
import * as healthKitNative from "../health/sources/healthkit";
import * as healthKitWeb from "../health/sources/healthkit.web";
import * as healthConnectNative from "../health/sources/health-connect";
import * as healthConnectWeb from "../health/sources/health-connect.web";
import * as notificationsNative from "../ops/notifications-sdk";
import * as notificationsWeb from "../ops/notifications-sdk.web";
import * as calendarNative from "../ops/calendar-sdk";
import * as calendarWeb from "../ops/calendar-sdk.web";

// Compile-time parity: each side must satisfy the other's export types, so a
// signature drift between stub and native impl fails type-check (and ts-jest).
const _purchasesNativeCoversWeb: typeof purchasesWeb = purchasesNative;
const _purchasesWebCoversNative: typeof purchasesNative = purchasesWeb;
const _healthKitNativeCoversWeb: typeof healthKitWeb = healthKitNative;
const _healthKitWebCoversNative: typeof healthKitNative = healthKitWeb;
const _healthConnectNativeCoversWeb: typeof healthConnectWeb = healthConnectNative;
const _healthConnectWebCoversNative: typeof healthConnectNative = healthConnectWeb;
const _notificationsNativeCoversWeb: typeof notificationsWeb = notificationsNative;
const _notificationsWebCoversNative: typeof notificationsNative = notificationsWeb;
const _calendarNativeCoversWeb: typeof calendarWeb = calendarNative;
const _calendarWebCoversNative: typeof calendarNative = calendarWeb;
void _purchasesNativeCoversWeb;
void _purchasesWebCoversNative;
void _healthKitNativeCoversWeb;
void _healthKitWebCoversNative;
void _healthConnectNativeCoversWeb;
void _healthConnectWebCoversNative;
void _notificationsNativeCoversWeb;
void _notificationsWebCoversNative;
void _calendarNativeCoversWeb;
void _calendarWebCoversNative;

const SRC = path.resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

// import "...", from "...", require("..."), import("..."), typeof import("...")
// -- every form Metro (or a future refactor) could follow.
function sdkRef(pkg: string): RegExp {
  const p = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(from\\s*["']|require\\(\\s*["']|import\\(\\s*["']|import\\s+["'])${p}`);
}

// Type-only imports are erased by Babel before Metro sees them, so they are the
// one form allowed outside the seam (the plans screens import PurchasesPackage
// that way). Strip them before scanning.
function stripTypeOnlyImports(src: string): string {
  return src.replace(/(import|export)\s+type\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["']/g, "");
}

interface Seam {
  pkg: string;
  /** The ONLY src/ files allowed to reference the SDK in an importable form. */
  native: string[];
  /** The web-resolved variants that must stay reference-free. */
  web: string[];
}

const SEAMS: Seam[] = [
  {
    pkg: "react-native-purchases",
    native: ["lib/payments/purchases.ts"],
    web: ["lib/payments/purchases.web.ts"],
  },
  {
    pkg: "@kingstinct/react-native-healthkit",
    native: ["lib/health/sources/healthkit.ts"],
    web: ["lib/health/sources/healthkit.web.ts"],
  },
  {
    pkg: "react-native-health-connect",
    native: ["lib/health/sources/health-connect.ts"],
    web: ["lib/health/sources/health-connect.web.ts"],
  },
  {
    pkg: "expo-notifications",
    native: ["lib/ops/notifications-sdk.ts"],
    web: ["lib/ops/notifications-sdk.web.ts"],
  },
  {
    pkg: "expo-calendar",
    native: ["lib/ops/calendar-sdk.ts"],
    web: ["lib/ops/calendar-sdk.web.ts"],
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(path.relative(SRC, full).split(path.sep).join("/"));
  }
  return out;
}

describe("web bundle platform split (audit D5-01 / D5-11)", () => {
  const allSources = walk(SRC);

  test.each(SEAMS)("$pkg: the web variants never reference the SDK in any importable form", ({ pkg, web }) => {
    for (const f of web) expect(read(f)).not.toMatch(sdkRef(pkg));
  });

  test.each(SEAMS)("$pkg: the SDK reference lives in the native variant (sanity of the guard itself)", ({ pkg, native }) => {
    // If the SDK ever moves elsewhere, this fails and forces the seam list
    // above to be revisited instead of silently guarding nothing.
    for (const f of native) expect(read(f)).toMatch(sdkRef(pkg));
  });

  test.each(SEAMS)("$pkg: no other src/ file reaches for the SDK directly", ({ pkg, native }) => {
    const ref = sdkRef(pkg);
    const offenders = allSources.filter((f) => !native.includes(f) && ref.test(stripTypeOnlyImports(read(f))));
    expect(offenders).toEqual([]);
  });

  test("export surfaces match between web and native variants", () => {
    expect(Object.keys(purchasesWeb).sort()).toEqual(Object.keys(purchasesNative).sort());
    expect(Object.keys(healthKitWeb).sort()).toEqual(Object.keys(healthKitNative).sort());
    expect(Object.keys(healthConnectWeb).sort()).toEqual(Object.keys(healthConnectNative).sort());
    expect(Object.keys(notificationsWeb).sort()).toEqual(Object.keys(notificationsNative).sort());
    expect(Object.keys(calendarWeb).sort()).toEqual(Object.keys(calendarNative).sort());
  });

  test("web stubs fail closed with the values the native files give web at runtime", async () => {
    // purchases.ts on Platform.OS === "web" (mocked above): same answers.
    purchasesNative.configurePurchases();
    expect(purchasesNative.arePurchasesAvailable()).toBe(false);
    await expect(purchasesNative.getOfferings()).resolves.toEqual([]);
    await expect(purchasesNative.getProStatus()).resolves.toBe(false);

    purchasesWeb.configurePurchases();
    expect(purchasesWeb.arePurchasesAvailable()).toBe(false);
    expect(purchasesWeb.PRO_ENTITLEMENT).toBe(purchasesNative.PRO_ENTITLEMENT);
    await expect(purchasesWeb.getOfferings()).resolves.toEqual([]);
    await expect(purchasesWeb.purchasePackage({} as never)).resolves.toEqual({ status: "unavailable" });
    await expect(purchasesWeb.restorePurchases()).resolves.toEqual({ status: "unavailable" });
    await expect(purchasesWeb.getProStatus()).resolves.toBe(false);

    for (const source of [healthKitWeb.healthKitSource, healthConnectWeb.healthConnectSource]) {
      expect(source.isAvailable()).toBe(false);
      await expect(source.requestPermission()).resolves.toBe("unavailable");
      await expect(source.read({ startIso: "2026-01-01T00:00:00.000Z", endIso: "2026-01-02T00:00:00.000Z" })).resolves.toEqual([]);
    }
    expect(healthKitWeb.healthKitSource.id).toBe(healthKitNative.healthKitSource.id);
    expect(healthConnectWeb.healthConnectSource.id).toBe(healthConnectNative.healthConnectSource.id);

    expect(notificationsWeb.loadNotifications()).toBeNull();
    expect(calendarWeb.loadExpoCalendar()).toBeNull();
  });
});

describe("canon index stays structural (audit D5-13)", () => {
  test("the museum pack is imported only by lib/canon/museum.ts", () => {
    const museumJson = /screens\/museum\.json/;
    expect(read("lib/canon/index.ts")).not.toMatch(museumJson);
    expect(read("lib/canon/museum.ts")).toMatch(museumJson);
    const offenders = walk(SRC).filter((f) => f !== "lib/canon/museum.ts" && museumJson.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
