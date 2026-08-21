// The release workflow's job is to put an installable file behind a plain
// link. Every failure mode it can have is quiet: a release with no asset, an
// asset that is a truncated download, a tag that says one version while the
// binary inside says another, or a 403 on create because the job could not
// write to the repo. None of those look like a crash - they look like a
// release that exists and does not work.
//
// So the properties worth pinning are the ones that keep those four quiet
// failures loud, plus the one that keeps the release honest about what it is.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const CR = String.fromCharCode(13);
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

const RAW = read(".github/workflows/github-release.yml");
const APP = JSON.parse(read("app.json")) as { expo: { version: string; android: { versionCode: number } } };
const CHANGELOG = read("CHANGELOG.md");

// Read the workflow as text rather than pulling in a YAML parser: js-yaml ships
// no types here, and adding a dependency to assert six properties is a worse
// trade than slicing on the step headers the file already has.
const STEP_HEADERS = [...RAW.matchAll(/^ {6}- name: (.+)$/gm)];

/** The block belonging to the step whose name contains `fragment`. */
function stepOf(fragment: string): string {
  const i = STEP_HEADERS.findIndex((m) => m[1].includes(fragment));
  if (i < 0) throw new Error(`step not found: ${fragment}`);
  const start = STEP_HEADERS[i].index ?? 0;
  const end = i + 1 < STEP_HEADERS.length ? (STEP_HEADERS[i + 1].index ?? RAW.length) : RAW.length;
  return RAW.slice(start, end);
}
const runOf = stepOf;

describe("the workflow can actually publish", () => {
  test("it has contents: write", () => {
    // Without it, `gh release create` 403s after the build has already been
    // paid for and downloaded. The whole run is wasted at the last step.
    expect(RAW).toMatch(/^permissions:$/m);
    expect(RAW).toMatch(/^ {2}contents: write$/m);
  });

  test("it is manual only", () => {
    // A release on every push would tag noise and burn build minutes.
    expect(RAW).toMatch(/^on:$/m);
    expect(RAW).toMatch(/^ {2}workflow_dispatch:$/m);
    expect(RAW).not.toMatch(/^ {2}(push|schedule|pull_request):$/m);
  });

  test("the timeout outlives a queued EAS build", () => {
    // A timeout here abandons a build that is still being paid for.
    const m = RAW.match(/^ {4}timeout-minutes: (\d+)$/m);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(60);
  });
});

describe("the tag cannot disagree with the binary", () => {
  test("the version is read from app.json, not typed as an input", () => {
    const run = runOf("Resolve version");
    expect(run).toContain("require('./app.json').expo.version");
    expect(run).toContain("TAG=\"v$VERSION\"");
    // No version/tag input exists to be typed wrongly.
    const inputs = [...RAW.matchAll(/^ {6}([a-z_]+):$/gm)].map((x) => x[1]);
    expect(inputs).toContain("profile");
    expect(inputs).not.toContain("version");
    expect(inputs).not.toContain("tag");
  });

  test("an existing tag is refused, not overwritten", () => {
    // Re-releasing a tag replaces a binary someone may already have installed
    // from that link, with no trace that it changed.
    const run = runOf("Resolve version");
    expect(run).toMatch(/gh release view "\$TAG"[\s\S]*?exit 1/);
  });

  test("gh calls carry GH_REPO", () => {
    // `gh` does not read GITHUB_REPOSITORY on its own; a job that omits this
    // fails at the first gh call, and here that is the release itself.
    for (const name of ["Resolve version", "Create the GitHub Release"]) {
      const block = stepOf(name);
      expect(block).toMatch(/GH_REPO: \$\{\{ github\.repository \}\}/);
      expect(block).toMatch(/GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
    }
  });
});

describe("the asset is a real build", () => {
  test("a build that did not finish is refused", () => {
    // The reuse path can be handed a queued or failed build id. Attaching
    // nothing would still produce a release page that looks fine.
    const run = runOf("Get the build artifact");
    expect(run).toContain('status !== "FINISHED"');
    expect(run).toContain("reports no artifact URL");
  });

  test("both artifact field names are accepted", () => {
    // eas-cli has used more than one name for this over time, and reading the
    // wrong one yields an empty URL rather than an error.
    const run = runOf("Get the build artifact");
    expect(run).toContain("applicationArchiveUrl");
    expect(run).toContain("buildUrl");
  });

  test("a truncated or non-zip download fails the run", () => {
    // A short download installs as a corrupt app, which reads to the user as
    // "the app is broken", not "the release is broken".
    const run = runOf("Get the build artifact");
    expect(run).toMatch(/-lt 1000000/);
    expect(run).toContain("is not a zip container");
  });

  test("reusing a build does not start a second one", () => {
    // An EAS Android build costs money and half an hour. The reuse branch
    // exists so a release does not silently pay for a build twice.
    const run = runOf("Get the build artifact");
    expect(run).toContain("REUSE_BUILD_ID");
    expect(run).toMatch(/build:view "\$REUSE_BUILD_ID"/);
    expect(run).toContain("no new build started");
  });
});

describe("the release says what it is", () => {
  test("an AAB is not described as installable", () => {
    // A .aab attached to a release looks like a download but cannot be
    // installed. Saying so is the difference between a release and a trap.
    const run = runOf("Create the GitHub Release");
    expect(run).toContain("cannot be installed directly");
    expect(run).toMatch(/installs directly on Android/);
  });

  test("notes come from the changelog when there is a section", () => {
    expect(runOf("Extract release notes")).toContain("CHANGELOG.md");
    // And when there is no section, the release still gets a body rather than
    // an empty one. That fallback lives in the create step.
    expect(runOf("Create the GitHub Release")).toContain("--generate-notes");
    expect(runOf("Create the GitHub Release")).toContain("--notes-file RELEASE_NOTES.md");
  });
});

describe("this repo is releasable right now", () => {
  test("app.json carries a three-part version and a positive versionCode", () => {
    expect(APP.expo.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP.expo.android.versionCode).toBeGreaterThan(0);
  });

  test("the changelog has a section for the current version", () => {
    // The workflow falls back to generated notes, so this is not fatal there -
    // but a release of a version nobody wrote notes for is a release nobody
    // can read. Kept as a test so the omission is caught before the tag.
    expect(CHANGELOG).toContain(`## [${APP.expo.version}]`);
  });
});
