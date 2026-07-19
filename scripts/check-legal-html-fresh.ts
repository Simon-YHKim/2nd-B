// Legal-pages freshness gate (review 260720, #1109 P2 - the "code claims it,
// nothing checks it" class): docs/legal/*.md is canonical and the committed
// public/legal/*.html twins each footer-claim they are kept identical, but
// nothing enforced regeneration - a policy edit could pass CI while the
// public pages went stale. This gate regenerates into a temp directory with
// the SAME zero-dependency generator and fails when any committed page
// differs. Deploy keeps using the committed artifacts (no new dependency in
// the web pipeline); this only verifies they are current.
//
// Line endings: the generator emits LF; on Windows checkouts core.autocrlf
// materializes the committed files as CRLF. Compare with CR stripped so the
// gate is byte-honest about content while agnostic to checkout EOL.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const PAGES = ["terms.html", "privacy.html", "refund.html"];

const tmp = mkdtempSync(join(tmpdir(), "legal-html-"));
try {
  execFileSync(process.execPath, [join(ROOT, "scripts", "build-legal-html.mjs"), tmp], {
    stdio: ["ignore", "ignore", "inherit"],
  });

  const stale: string[] = [];
  for (const page of PAGES) {
    const committed = readFileSync(join(ROOT, "public", "legal", page), "utf8").replaceAll("\r", "");
    const fresh = readFileSync(join(tmp, page), "utf8").replaceAll("\r", "");
    if (committed !== fresh) stale.push(page);
  }

  if (stale.length > 0) {
    console.error("Legal HTML freshness FAILED - committed pages differ from regenerated output:");
    for (const page of stale) console.error(`  - public/legal/${page}`);
    console.error("\nRun `node scripts/build-legal-html.mjs` and commit the result so the");
    console.error("public pages match their canonical docs/legal/*.md sources.");
    process.exit(1);
  }

  console.log(`Legal HTML freshness PASS  ${PAGES.length} pages match docs/legal sources`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
