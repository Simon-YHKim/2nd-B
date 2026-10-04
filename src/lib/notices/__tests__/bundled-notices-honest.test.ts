// D-06 (QA 261004): the bundled notes in src/app/notices.tsx were design mock data.
//
// PRODUCT_NOTICES held five entries copied from the PIXEL-CLAY prototype
// (design/pixel_clay_v4/app/sb-data.jsx): "Patch v1.4.0 · Today", "Note · 3 days ago",
// "Maintenance · 1 week ago" and a letter quoting a usage figure nobody measured. The
// app is 0.x. Because the bundled cursor is device-local, every fresh install popped
// "NEW v1.4.0 · 2026.07.17" over the first home screen, and the list showed frozen
// relative times next to real remote dates (with "1 week ago" sorted above "Today").
//
// The array is now empty: announcements go out as remote notices (DECISIONS 26.09.28).
// These checks keep anything that comes back honest, and pin the first-run outcome.
//
// The screen module pulls React Native, which this node suite cannot load, so the
// array is read from the source with the TypeScript AST and evaluated as the plain
// object literal it is.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { composeNoticeCenter } from "../center";
import type { ProductNotice } from "../types";
import { compareVersions } from "../version";

const ROOT = join(__dirname, "..", "..", "..", "..");
const FILE = join(ROOT, "src", "app", "notices.tsx");
const SOURCE = readFileSync(FILE, "utf8");
const APP_VERSION = (JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8")) as { expo: { version: string } }).expo
  .version;

function bundledNotices(): ProductNotice[] {
  const ast = ts.createSourceFile(FILE, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let literal: ts.ArrayLiteralExpression | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "PRODUCT_NOTICES") {
      let init = node.initializer;
      while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init))) {
        init = init.expression;
      }
      if (init && ts.isArrayLiteralExpression(init)) literal = init;
    }
    node.forEachChild(visit);
  };
  visit(ast);
  if (!literal) throw new Error("PRODUCT_NOTICES array literal not found in src/app/notices.tsx");
  // The entries are plain object literals (strings and arrays only).
  return new Function(`return ${(literal as ts.ArrayLiteralExpression).getText(ast)};`)() as ProductNotice[];
}

// Display labels that only mean something on the day they were written.
const RELATIVE_TIME = /오늘|어제|\d+\s*(일|주|개월|달|년)\s*전|\btoday\b|\byesterday\b|\bago\b/i;

describe("bundled release notes (D-06)", () => {
  const notices = bundledNotices();

  test("the prototype's mock entries are gone", () => {
    const ids = notices.map((n) => n.id);
    for (const mock of [
      "patch-1.4.0",
      "developer-letter-2026-07",
      "maintenance-2026-07-20",
      "patch-1.3.0",
      "beta-thanks-2026-06",
    ]) {
      expect(ids).not.toContain(mock);
    }
  });

  test("no bundled note announces a version newer than this build", () => {
    for (const n of notices) {
      if (!n.version) continue;
      const cmp = compareVersions(n.version.replace(/^v/i, ""), APP_VERSION);
      expect({ id: n.id, version: n.version, newerThanApp: cmp === null || cmp > 0 }).toEqual({
        id: n.id,
        version: n.version,
        newerThanApp: false,
      });
    }
  });

  test("no bundled label carries a relative time that freezes on the day it was written", () => {
    for (const n of notices) {
      for (const field of [n.listMeta, n.when]) {
        for (const text of [field.ko, field.en]) {
          expect({ id: n.id, text, relative: RELATIVE_TIME.test(text) }).toEqual({ id: n.id, text, relative: false });
        }
      }
    }
  });

  test("a fresh install with no unread remote notice opens no popup", () => {
    // Fresh install = no device cursor (bundledSeenId null), nothing remote to show.
    const state = composeNoticeCenter({
      remote: [],
      remoteReadIds: new Set<string>(),
      bundled: notices,
      bundledSeenId: null,
      appVersion: APP_VERSION,
    });
    expect(state.popupNotice).toBeNull();
    expect(state.unreadCount).toBe(0);
  });
});
