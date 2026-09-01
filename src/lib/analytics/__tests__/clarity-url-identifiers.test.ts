// The stop that protects an allow-listed route has exactly one trigger: the
// page_view that _layout.tsx emits when the ROUTE changes. That is enough
// today only because of a fact about the app that nothing else pins:
//
//   every navigation that puts an identifier in the query of an allow-listed
//   path also changes the path, so a page_view always fires.
//
// Three call sites do it, all landing on "/" (the home route, allow-listed):
//
//   src/app/capture.tsx        /capture     -> /?highlightRecordId=<uuid>
//   src/app/record/[id].tsx    /record/[id] -> /?highlightRecordId=<uuid>
//   src/app/wiki.tsx           /wiki        -> /?highlightWikiPageId=<id>
//
// A fourth one that changed only the query — router.setParams on "/", or a push
// from "/" back to "/" — would emit no page_view at all, because
// _layout.tsx:461 dedupes on `${userId}:${routePath}` and the path would not
// have moved. The guard would never be consulted and Clarity would keep
// recording a URL with an id in it. That failure is silent: no error, no test,
// nothing on screen.
//
// So this pins the set of files allowed to do it. Adding a fourth is not
// forbidden — it just has to be a decision someone makes on purpose, with the
// trigger question answered, rather than a line that slips in.
//
// Note what this does NOT do: it does not check parameter names. The guard in
// index.ts reads window.location.search, so it does not care what the field is
// called. That is deliberate — an earlier version of this protection keyed on
// "highlightRecordId" and would have sailed straight past wiki.tsx's
// "highlightWikiPageId".

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { CLARITY_ALLOWED_ROUTE_PREFIXES } from "../index";

const ROOT = join(__dirname, "..", "..", "..", "..");
const APP_DIR = join(ROOT, "src", "app");

/** Every .tsx/.ts under src/app, as repo-relative POSIX paths. */
function appSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      appSources(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
    out.push(relative(ROOT, full).split(sep).join("/"));
  }
  return out;
}

/**
 * Files that navigate to an allow-listed path AND carry params on the way.
 *
 * Matched on the literal shape the router takes — `pathname: "<allowed>"`
 * followed by `params:` inside the same object — rather than on line numbers,
 * so moving the code around does not trip it. `setParams` is matched on its
 * own because it rewrites the URL of the route already on screen, which is the
 * exact no-page_view case.
 */
function filesPuttingParamsOnAllowedRoutes(): string[] {
  const allowed = CLARITY_ALLOWED_ROUTE_PREFIXES.map(
    (p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|");
  const pushWithParams = new RegExp(
    `pathname:\\s*"(?:${allowed})"[^}]*\\bparams:`,
    "s",
  );
  return appSources(APP_DIR)
    .filter((rel) => pushWithParams.test(readFileSync(join(ROOT, rel), "utf8")))
    .sort();
}

describe("identifiers in the URL of an allow-listed route", () => {
  test("only the three known screens put params on an allow-listed path", () => {
    // If this fails with a NEW file, the question to answer before updating the
    // list is: does that navigation change the PATH? If yes, a page_view fires
    // and the existing guard covers it - add the file. If it only changes the
    // query (setParams, or "/" -> "/"), the guard is never called and the fix
    // is to stop putting the id in the URL, not to extend this list.
    expect(filesPuttingParamsOnAllowedRoutes()).toEqual([
      "src/app/capture.tsx",
      "src/app/record/[id].tsx",
      "src/app/wiki.tsx",
    ]);
  });

  test("no screen rewrites the query of an allow-listed route in place", () => {
    // router.setParams keeps the path and changes the URL, so _layout.tsx's
    // dedupe swallows it and the stop never runs. Today the only setParams
    // calls are on /capture and /records, neither of which is allow-listed, so
    // Clarity is not running there to begin with.
    const offenders = appSources(APP_DIR).filter((rel) => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      if (!/router\.setParams\(/.test(src)) return false;
      // The route a screen sets params on is its own. Map file -> route the
      // same way expo-router does: src/app/foo.tsx -> /foo, index -> /.
      const route =
        "/" +
        rel
          .replace(/^src\/app\//, "")
          .replace(/\.tsx?$/, "")
          .replace(/(^|\/)index$/, "");
      return CLARITY_ALLOWED_ROUTE_PREFIXES.includes(route.replace(/\/$/, "") || "/");
    });
    expect(offenders).toEqual([]);
  });

  test("the home route really is allow-listed, so the pin above is load-bearing", () => {
    // Guards the guard: if "/" ever left the allow-list, Clarity would not run
    // on home at all and both tests above would be pinning a dead concern.
    // Better to be told than to keep a green test that means nothing.
    expect(CLARITY_ALLOWED_ROUTE_PREFIXES).toContain("/");
  });
});
