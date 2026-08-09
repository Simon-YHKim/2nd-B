// Draft the release notice for the version in app.json, and stop.
//
//   npm run notice:release
//
// It reads app.json and CHANGELOG.md, decides whether this release owes users a
// popup (docs/RELEASE-PROCESS.md), and for a major release prints the INSERT
// that publishes it. It never connects to anything: no Supabase import exists
// anywhere under src/lib/release/ or in this file, which is what makes "a robot
// published a notice" impossible rather than merely unlikely. A human reads the
// statement, rewrites the Korean, and runs it in the SQL Editor.
//
// It is NOT in `npm run verify` and must not be added to it. .github/workflows/
// ci.yml runs verify verbatim on every PR, so membership in that chain is the
// same thing as running on every push.
//
// Flags need npm's `--` separator, or npm eats them (see NPM_SWALLOWED below):
//
//   npm run notice:release -- --force-major
//
//   --previous <x.y.z>   compare against this instead of the newest released
//                        CHANGELOG section
//   --announce <x.y.z>   announce this instead of app.json expo.version. NOT
//                        called --version: npm intercepts that one outright and
//                        prints its own version without running the script.
//   --force-major        publish even when the numbers say minor/patch, for the
//                        0.x case described in docs/RELEASE-PROCESS.md
//   --sections A,B       CHANGELOG sub-headings to summarise (default Added,Changed)
//   --max-bullets <n>    body bullet cap (default 5)

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  latestReleased,
  parseChangelog,
  releasedBefore,
  summarizeEntry,
  unreleasedEntry,
  type ChangelogEntry,
} from "../src/lib/release/changelog";
import {
  buildNoticeInsert,
  buildNoticePrecheck,
  isPublishableVersion,
} from "../src/lib/release/notice-sql";
import {
  classifyRelease,
  noticeRequired,
  parseSemver,
  type ReleaseClass,
} from "../src/lib/release/semver";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function fail(message: string, hints: string[] = []): never {
  console.error(`[release-notice] ${message}`);
  for (const hint of hints) console.error(`  - ${hint}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

// The whole point of the pipeline is that a person publishes. Refusing in CI
// makes that a property of the tool rather than a rule in a document that a
// future workflow author will not have read.
if (process.env.CI) {
  fail("refusing to run in CI.", [
    "Publishing a notice is a human step: run this locally, review the SQL, then paste it into the Supabase SQL Editor.",
    "Do not add notice:release to npm run verify.",
  ]);
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

const FLAG_NAMES = ["force-major", "previous", "announce", "sections", "max-bullets"] as const;

// `npm run notice:release --force-major` does NOT forward the flag: npm claims
// it as its own config and exports it as npm_config_force_major instead, so the
// script runs with an empty argv and reports SILENT. On a 0.x line --force-major
// is the only route to a notice at all, so that silence is the difference
// between publishing and not publishing - it has to be an error, not a shrug.
//
// Verified against npm 11.11.0: a plain `npm run` sets none of these, and the
// bare flag sets exactly the matching one. So a hit here is unambiguous.
const swallowed = FLAG_NAMES.filter(
  (name) =>
    !argv.includes(`--${name}`) &&
    process.env[`npm_config_${name.replace(/-/g, "_")}`] !== undefined,
);
if (swallowed.length > 0) {
  fail(`npm swallowed ${swallowed.map((name) => `--${name}`).join(", ")} instead of passing it through.`, [
    "npm needs a -- separator before script flags.",
    `Re-run as: npm run notice:release -- ${swallowed.map((name) => `--${name}`).join(" ")}`,
  ]);
}

function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}

function option(name: string): string | null {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    fail(`--${name} needs a value.`);
  }
  return value;
}

const forceMajor = flag("force-major");
const sectionsOption = option("sections");
const maxBulletsOption = option("max-bullets");
const maxBullets = maxBulletsOption === null ? 5 : Number(maxBulletsOption);
if (!Number.isInteger(maxBullets) || maxBullets < 1) {
  fail(`--max-bullets must be a positive integer, got "${maxBulletsOption}".`);
}
const sections = sectionsOption
  ? sectionsOption
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
  : undefined;

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

// app.json expo.version is the source of truth. It is the only version the repo
// validates (scripts/check-ota-runtime.js), the only one the running app can
// read back (Constants.expoConfig.version), and the one min_app_version is
// compared against. package.json version is unrelated build metadata.
const appConfig = JSON.parse(read("app.json")) as { expo?: { version?: string } };
const appVersion = appConfig.expo?.version;
if (typeof appVersion !== "string" || appVersion === "") {
  fail("app.json has no expo.version.");
}

const announced = option("announce") ?? appVersion;

const changelog = parseChangelog(read("CHANGELOG.md"));
if (changelog.length === 0) {
  fail("CHANGELOG.md has no '## [...]' sections to read.");
}

const cut = changelog.find((entry) => entry.version === announced) ?? null;
const previousOption = option("previous");
const previousEntry = cut
  ? releasedBefore(changelog, announced)
  : latestReleased(changelog);
const previous = previousOption ?? previousEntry?.version ?? null;

if (previous === null) {
  fail(`cannot tell what came before ${announced}.`, [
    "CHANGELOG.md has no released '## [x.y.z] - date' section below it.",
    "Pass --previous <x.y.z> to say what this release is measured against.",
  ]);
}

// The body comes from the cut section when there is one, and from [Unreleased]
// otherwise. Both are legitimate: drafting the notice before cutting the
// section is how you find out the changelog is thin, so this warns instead of
// refusing.
let source: ChangelogEntry | null = cut;
if (!source) {
  source = unreleasedEntry(changelog);
  if (!source) {
    fail(`CHANGELOG.md has neither a '## [${announced}]' section nor '## [Unreleased]'.`);
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

// classifyRelease() returns null for two unrelated reasons: the release did not
// move forward, or a version is unparseable. Collapsing them produces the worst
// message in the script - "--announce v9.9.9 is not ahead of 0.0.3" blames the
// ordering when the real problem is the "v". Rule the parse errors out here so
// the null below can only mean one thing.
// The announced version is held to the STRICTER shape, because it is the value
// that ends up in notices.min_app_version and that column's CHECK wants all
// three segments. Checking it here rather than letting buildNoticeInsert() throw
// at the bottom means the operator gets the message before the draft is built.
if (!isPublishableVersion(announced)) {
  fail(`"${announced}" cannot be published as a version.`, [
    "It came from --announce, or from app.json expo.version.",
    'Write all three segments and no "v" prefix (1.5.0, not v1.5 or 1.5).',
    "notices.min_app_version has the same CHECK.",
  ]);
}
if (parseSemver(previous) === null) {
  fail(`the previous version "${previous}" is not a major.minor.patch version.`, [
    "It came from --previous, or from the newest released CHANGELOG.md heading.",
    "Pass --previous <x.y.z> to say what this release is measured against.",
  ]);
}

const derived: ReleaseClass | null = classifyRelease(previous, announced);
const release: ReleaseClass | null = forceMajor ? "major" : derived;

console.log(`[release-notice] previous ${previous} -> announced ${announced}`);
console.log(
  `[release-notice] classified ${release ?? "none"}` +
    (forceMajor ? ` (forced; derived ${derived ?? "none"})` : ""),
);
if (!cut) {
  console.log(
    `[release-notice] WARN CHANGELOG.md has no '## [${announced}]' section yet - reading [Unreleased].`,
  );
}
if (derived === null && !forceMajor) {
  console.log(
    `[release-notice] WARN ${announced} is not ahead of ${previous}; nothing to announce.`,
  );
}

if (!noticeRequired(release)) {
  // The silent path is the common one and it exits 0. A minor or patch release
  // shipping without a popup is the policy working, not a problem to report.
  console.log(
    `[release-notice] ${release ?? "no"} release -> SILENT. No notice, nothing to publish.`,
  );
  console.log(
    `[release-notice] If this release does change how the app is used, it should not have been a ${release ?? "non"} bump - see docs/RELEASE-PROCESS.md, then re-run with 'npm run notice:release -- --force-major' (the -- is required) and write the reason in the PR.`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

const body = summarizeEntry(source, { sections, maxBullets });
if (body === "") {
  fail(`the ${source.isUnreleased ? "[Unreleased]" : `[${announced}]`} section has no bullets to summarise.`, [
    "notices.body_ko / body_en are NOT NULL with a non-blank CHECK.",
    "Write the changelog entry first, or pass --sections to point at a section that has content.",
  ]);
}

const titleEn = `What is new in ${announced}`;
const titleKo = `${announced} 업데이트 안내`;

let statement: string;
try {
  statement = buildNoticeInsert({
    version: announced,
    titleKo,
    titleEn,
    bodyKo: body,
    bodyEn: body,
  });
} catch (e) {
  fail((e as Error).message);
}

console.log("");
console.log("-- ---------------------------------------------------------------");
console.log(`-- Major release ${announced}. Review, then run in the Supabase SQL Editor.`);
console.log("--");
console.log("-- BEFORE YOU RUN IT:");
console.log("--   1. Rewrite title_ko / body_ko in Korean. The draft below repeats the");
console.log("--      English CHANGELOG text in both columns because this script does not");
console.log("--      translate - and body_ko is what most of your users will read.");
console.log("--   2. Rewrite both bodies for users, not for maintainers. CHANGELOG prose");
console.log("--      describes the code; a notice describes what the user can now do.");
console.log("--   3. No clinical vocabulary. The lexicon CI scan does not reach the");
console.log("--      database (src/lib/safety/lexicon.ts is the source of truth).");
console.log("--   4. Only paragraphs and '- ' bullets render. Bold, links and images");
console.log("--      appear as literal characters (docs/OPERATIONS-NOTICES.md N2).");
console.log("-- ---------------------------------------------------------------");
console.log("");
console.log("-- What is already published for this version:");
console.log(buildNoticePrecheck(announced));
console.log("");
console.log(statement);
console.log("");
console.log(
  "-- STOP. Nothing has been written. This script cannot reach the database; publishing is a human step.",
);
