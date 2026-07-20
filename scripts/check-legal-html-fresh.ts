// Legal-pages freshness gate (review 260720, #1109 P2 - the "code claims it,
// nothing checks it" class): docs/legal/*.md is canonical and the committed
// public/legal/*.html twins each footer-claim they are kept identical, but
// nothing enforced regeneration - a policy edit could pass CI while the
// public pages went stale. This gate regenerates into a temp directory with
// the SAME zero-dependency generator and fails when any committed page
// differs. Deploy keeps using the committed artifacts (no new dependency in
// the web pipeline); this only verifies they are current.
//
// The page list is NOT duplicated here (round-2 review): whatever *.html the
// generator emits into the temp dir is the comparison set, so adding a page
// to the generator automatically extends the gate; a missing committed twin
// fails as stale rather than being silently skipped.
//
// Line endings: the generator emits LF; on Windows checkouts core.autocrlf
// materializes the committed files as CRLF. Compare with CR stripped so the
// gate is byte-honest about content while agnostic to checkout EOL.
//
// Cleanup: failures set process.exitCode (never process.exit inside try), so
// the finally rmSync always removes the temp directory (round-2 review).

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();

const tmp = mkdtempSync(join(tmpdir(), "legal-html-"));
try {
  execFileSync(process.execPath, [join(ROOT, "scripts", "build-legal-html.mjs"), tmp], {
    stdio: ["ignore", "ignore", "inherit"],
  });

  const pages = readdirSync(tmp).filter((name) => name.endsWith(".html")).sort();
  if (pages.length === 0) {
    console.error("Legal HTML freshness FAILED - the generator produced no pages.");
    process.exitCode = 1;
  }

  const stale: string[] = [];
  for (const page of pages) {
    const committedPath = join(ROOT, "public", "legal", page);
    if (!existsSync(committedPath)) {
      stale.push(`${page} (missing from public/legal)`);
      continue;
    }
    const committed = readFileSync(committedPath, "utf8").replaceAll("\r", "");
    const fresh = readFileSync(join(tmp, page), "utf8").replaceAll("\r", "");
    if (committed !== fresh) stale.push(page);
  }

  // Reverse direction (round-4 review): a page removed or renamed in the
  // generator must not leave its old committed HTML silently deployed (the
  // web export publishes everything under public/). Any flat *.html in
  // public/legal that the generator no longer emits fails the gate. The
  // privacy/ legacy-redirect lives in a SUBDIRECTORY (privacy/index.html),
  // so this flat listing excludes it by construction.
  const committedPages = readdirSync(join(ROOT, "public", "legal"))
    .filter((name) => name.endsWith(".html"))
    .sort();
  for (const page of committedPages) {
    if (!pages.includes(page)) stale.push(`${page} (orphaned - generator no longer emits it)`);
  }

  if (stale.length > 0) {
    console.error("Legal HTML freshness FAILED - committed pages differ from regenerated output:");
    for (const page of stale) console.error(`  - public/legal/${page}`);
    console.error("\nRun `node scripts/build-legal-html.mjs` and commit the result so the");
    console.error("public pages match their canonical docs/legal/*.md sources.");
    process.exitCode = 1;
  } else if (pages.length > 0) {
    console.log(`Legal HTML freshness PASS  ${pages.length} pages match docs/legal sources`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
