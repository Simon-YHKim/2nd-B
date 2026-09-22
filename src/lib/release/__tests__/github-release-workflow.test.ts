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
const APP = JSON.parse(read("app.json")) as {
  expo: {
    version: string;
    android: { versionCode: number };
    ios: { bundleIdentifier: string };
  };
};
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
const occurrences = (text: string, fragment: string) => text.split(fragment).length - 1;

describe("the workflow can actually publish", () => {
  test("historical code runs in a credential-free job and cannot reach privileged tooling", () => {
    const policyAt = RAW.indexOf("  release-policy:");
    const releaseAt = RAW.indexOf("\n  release:", policyAt);
    const policy = RAW.slice(policyAt, releaseAt);
    const release = RAW.slice(releaseAt);

    expect(policyAt).toBeGreaterThanOrEqual(0);
    expect(releaseAt).toBeGreaterThan(policyAt);
    expect(policy).toContain("ref: ${{ inputs.release_commit }}");
    expect(policy).toContain("npm run check:ota-runtime");
    expect(policy).not.toContain("environment: production");
    expect(policy).not.toContain("secrets.");
    expect(policy).not.toContain("GITHUB_OUTPUT");
    expect(release).toMatch(/^ {4}needs: release-policy$/m);
    expect(stepOf("Checkout workflow tooling commit")).toContain("ref: ${{ github.sha }}");
    expect(release).not.toContain("npm run check:ota-runtime");
    expect(RAW.indexOf("- name: Materialize release state helper after artifact verification")).toBeGreaterThan(
      RAW.indexOf("- name: Get the build artifacts"),
    );
    expect(RAW.indexOf("- name: Require protected release app configuration")).toBeGreaterThan(
      RAW.indexOf("- name: Materialize release state helper after artifact verification"),
    );
    expect(RAW.indexOf("- name: Mint a short-lived release app token")).toBeGreaterThan(
      RAW.indexOf("- name: Require protected release app configuration"),
    );
  });

  test("the default token is read-only and release mutation uses a scoped app token", () => {
    const preflight = stepOf("Require protected release app configuration");
    const token = stepOf("Mint a short-lived release app token");
    const publish = runOf("Create the GitHub Release");

    expect(RAW).toMatch(/^permissions:$/m);
    expect(RAW).toMatch(/^ {2}contents: read$/m);
    expect(RAW).not.toMatch(/^ {2}contents: write$/m);
    expect(token).toContain(
      "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1",
    );
    expect(token).toContain("client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}");
    expect(token).toContain("private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}");
    expect(token).toContain("permission-contents: write");
    expect(token).toContain("permission-workflows: write");
    expect(token).toContain("repositories: ${{ github.event.repository.name }}");
    expect(preflight).toContain("RELEASE_APP_CLIENT_ID: ${{ vars.RELEASE_APP_CLIENT_ID }}");
    expect(preflight).toContain("RELEASE_APP_PRIVATE_KEY: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}");
    expect(preflight).toContain("Protected Production release app configuration is missing");
    expect(publish).toContain("GH_TOKEN: ${{ steps.release-app-token.outputs.token }}");
    expect(publish).not.toContain("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
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
  test("the release target is the exact build commit on main", () => {
    const policyGuard = runOf("Require the policy checkout");
    const guard = runOf("Require release data and workflow tooling");
    const artifacts = runOf("Get the build artifact");
    const publish = runOf("Create the GitHub Release");

    expect(RAW).toMatch(/^ {6}release_commit:$/m);
    expect(RAW).toMatch(/release_commit:[\s\S]*?required: true[\s\S]*?type: string/);
    expect(stepOf("Checkout release target for policy-only validation")).toContain(
      "ref: ${{ inputs.release_commit }}",
    );
    expect(stepOf("Checkout workflow tooling commit")).toContain("ref: ${{ github.sha }}");
    expect(policyGuard).toContain('"$(git rev-parse HEAD)" != "${RELEASE_COMMIT,,}"');
    expect(guard).toContain('RELEASE_COMMIT: ${{ inputs.release_commit }}');
    expect(guard).toContain('TOOLING_COMMIT: ${{ github.sha }}');
    expect(guard).toContain("^[0-9a-fA-F]{40}$");
    expect(guard).toContain('git merge-base --is-ancestor "$RELEASE_COMMIT" origin/main');
    expect(guard).toContain('"$(git rev-parse HEAD)" != "${TOOLING_COMMIT,,}"');
    expect(guard).toContain('git show "$RELEASE_COMMIT:app.json"');
    expect(artifacts).toContain('EXPECTED_COMMIT: ${{ inputs.release_commit }}');
    expect(publish).toContain('RELEASE_COMMIT: ${{ inputs.release_commit }}');
    expect(publish).toContain('--target "$RELEASE_COMMIT"');
    expect(publish).toContain('git merge-base --is-ancestor "$RELEASE_COMMIT" origin/main');
    expect(publish).not.toContain('--target "$GITHUB_SHA"');
  });

  test("the version is read from app.json, not typed as an input", () => {
    const run = runOf("Resolve version");
    expect(run).toContain("process.env.RELEASE_APP_JSON");
    expect(runOf("Require release data and workflow tooling")).toContain(
      'git show "$RELEASE_COMMIT:app.json"',
    );
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
    expect(run).toContain('node "$RELEASE_STATE_HELPER" state');
    expect(run).not.toMatch(/gh release (?:delete|upload)/);
  });

  test("a draft is not asked for the tag a draft cannot have", () => {
    // `gh release create --draft` does not create the ref -- GitHub creates it
    // when the draft is published. So asserting the tag resolves immediately
    // after creating the draft could never pass. It failed the v0.7.0 release
    // (2026-09-07) after the draft and all four assets were already correct,
    // and the release had to be finished by hand.
    //
    // What binds a draft to its commit is target_commitish, which is asserted
    // below it. Any tag appearing while the release is still a draft is an
    // unexpected external-state race and must fail closed.
    const run = runOf("Resolve version");
    expect(run).toContain('if [ -n "$CREATED_TAG_SHA" ]; then');
    expect(run).not.toContain("Created tag does not resolve to the requested commit.");
    expect(run).toContain('node "$RELEASE_STATE_HELPER" verify');
  });

  test("the state helper is pinned to the workflow commit, not the older release checkout", () => {
    const helper = stepOf("Materialize release state helper after artifact verification");
    const publish = runOf("Create the GitHub Release");

    expect(helper).toContain("TOOLING_COMMIT: ${{ github.sha }}");
    expect(helper).toContain('tooling_dir="$(mktemp -d "$RUNNER_TEMP/release-state-helper.XXXXXX")"');
    expect(helper).toContain('git show "${TOOLING_COMMIT}:${helper_source}"');
    expect(helper).toContain('node --check "$helper"');
    expect(helper).toContain('test "$(git hash-object "$helper")" = "$helper_blob"');
    expect(helper).toContain("RELEASE_STATE_HELPER_BLOB=");
    expect(helper).toContain("RELEASE_STATE_HELPER=");
    expect(helper).toContain('>> "$GITHUB_ENV"');
    expect(publish).toContain('test "$(git hash-object "$RELEASE_STATE_HELPER")" = "$RELEASE_STATE_HELPER_BLOB"');
    expect(publish).not.toContain("node scripts/github-release-state.js");
  });

  test("a draft is discovered by listing and then fetched by release ID", () => {
    // GET /releases/tags/{tag} only matches PUBLISHED releases. Both places
    // that read the release used it, so a draft was invisible: the existence
    // probe concluded "no release" and would create a second one, and the
    // read-back after creating the draft died on the 404. That is what stopped
    // the v0.7.1 release on 2026-09-07, one line after the tag check above.
    const run = runOf("Resolve version");
    expect(run).not.toContain("releases/tags/$TAG");
    expect((run.match(/releases\?per_page=100/g) ?? []).length).toBe(1);
    expect(run).toContain("--paginate --slurp");
    expect(run).toContain('node "$RELEASE_STATE_HELPER" select-id');
    expect(run).toContain('discover_and_fetch_release "$RELEASE_JSON"');
    expect(run).toContain('discover_and_fetch_release "$CREATED_RELEASE_JSON"');
    expect(run).toContain('"repos/$GITHUB_REPOSITORY/releases/$release_id"');
    expect(run).toContain('node "$RELEASE_STATE_HELPER" assert-identity');
    expect(run).not.toContain("| .[0] // empty");
  });

  test("an exact no-tag draft is an immutable rerun, while every tag state fails closed", () => {
    const run = runOf("Create the GitHub Release");

    expect(run).not.toContain('[ "$TAG_EXISTS" != "$RELEASE_EXISTS" ]');
    expect(run).toContain('node "$RELEASE_STATE_HELPER" state');
    expect(run).toContain('if [ "$RELEASE_STATE" = verify-existing ]; then');
    expect(run).toContain("Exact immutable draft rerun verified; no GitHub state changed.");
    expect(run).toContain('verify_release_metadata "$RELEASE_JSON" "$RELEASE_ID"');
  });

  test("success re-reads the same release ID and absent tag after asset verification", () => {
    const run = runOf("Create the GitHub Release");
    const start = run.indexOf("final_recheck() {");
    const end = run.indexOf("\n          RELEASE_JSON=", start);
    const recheck = run.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(recheck).toContain('discover_and_fetch_release "$fresh_release_json"');
    expect(recheck).toContain('[ "$FETCHED_RELEASE_ID" != "$expected_release_id" ]');
    expect(recheck).toContain('verify_release_metadata "$fresh_release_json" "$expected_release_id"');
    expect(recheck).toContain("assert-assets-unchanged");
    expect(recheck).toContain('git ls-remote --tags origin "refs/tags/$TAG"');
    expect(recheck).toContain('FINAL_RELEASE_JSON="$fresh_release_json"');
    expect(occurrences(run, 'final_recheck "$')).toBe(2);
    expect(run).toMatch(
      /verify_release_assets "\$RELEASE_JSON"[\s\S]*final_recheck "\$RELEASE_ID"/,
    );
    expect(run).toMatch(
      /verify_release_assets "\$CREATED_RELEASE_JSON"[\s\S]*final_recheck "\$CREATED_RELEASE_ID"/,
    );
  });

  test("the workflow definition remains on main immediately before create", () => {
    const run = runOf("Create the GitHub Release");
    expect(run).toContain("WORKFLOW_COMMIT: ${{ github.sha }}");
    expect(run).toMatch(
      /git fetch --no-tags origin[\s\S]*git merge-base --is-ancestor "\$WORKFLOW_COMMIT" origin\/main[\s\S]*gh "\$\{ARGS\[@\]\}"/,
    );
    expect(run).toMatch(
      /discover_and_fetch_release "\$PRECREATE_RELEASE_JSON"[\s\S]*PRECREATE_TAG_SHA=[\s\S]*gh "\$\{ARGS\[@\]\}"/,
    );
    expect(run).toContain("A release for $TAG appeared after discovery; no mutation was attempted.");
    expect(run).toContain("Tag $TAG appeared immediately before creation; no draft was created.");
  });

  test("draft readback uses release and asset IDs, never the published-only tag endpoint", () => {
    const run = runOf("Create the GitHub Release");

    expect(run).not.toContain('gh release download "$TAG"');
    expect(run).not.toContain('gh release view "$TAG"');
    expect(run).toContain('"Accept: application/octet-stream"');
    expect(run).toContain('"repos/$GITHUB_REPOSITORY/releases/$release_id"');
    expect(run).toContain('releases/assets/$asset_id');
    expect(run).toContain(".html_url");
  });

  test("gh calls carry GH_REPO", () => {
    // `gh` does not read GITHUB_REPOSITORY on its own; a job that omits this
    // fails at the first gh call, and here that is the release itself.
    const block = stepOf("Create the GitHub Release");
    expect(block).toMatch(/GH_REPO: \$\{\{ github\.repository \}\}/);
    expect(block).toContain("GH_TOKEN: ${{ steps.release-app-token.outputs.token }}");
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

  test("secret-bearing verification runs tooling from the workflow commit", () => {
    const artifacts = runOf("Get the build artifact");
    const signatures = runOf("Verify protected Android signer identities");

    expect(artifacts).toContain('node "$APK_VERIFIER" --json "$PREVIEW_FILE"');
    expect(artifacts).toContain('node "$APK_VERIFIER" --json "$PRODUCTION_FILE"');
    expect(artifacts).toMatch(
      /unset EXPO_TOKEN[\s\S]*git show "\$\{TOOLING_COMMIT\}:\$\{apk_source\}"[\s\S]*node "\$APK_VERIFIER" --self-test/,
    );
    expect(artifacts).not.toContain("node scripts/check-apk-target-sdk.js");
    expect(signatures).toContain('git show "${TOOLING_COMMIT}:${signature_source}"');
    expect(signatures).toContain('test "$(git hash-object "$SIGNATURE_VERIFIER")" = "$signature_blob"');
    expect(signatures).toContain('node "$SIGNATURE_VERIFIER" verify');
    expect(signatures).not.toContain("node scripts/check-android-release-signatures.js");
  });
});

describe("the release is one verified cross-platform set", () => {
  test("the manual contract requires all three finished EAS build ids", () => {
    expect(RAW).toContain("GitHub Release (APK + AAB + IPA)");
    expect(RAW).toMatch(/^ {6}ios_build_id:$/m);
    expect(RAW).toContain('IOS_BUILD_ID: ${{ inputs.ios_build_id }}');
    expect(runOf("Get the build artifact")).toContain('for id in "$PREVIEW_BUILD_ID" "$PRODUCTION_BUILD_ID" "$IOS_BUILD_ID"');
  });

  test("iOS metadata and authenticated provenance are fail-closed", () => {
    const run = runOf("Get the build artifact");
    expect(run).toContain('String(build?.platform).toUpperCase() !== expectedPlatform');
    expect(run).toContain('config.ios?.bundleIdentifier');
    expect(run).toContain('fetchBuildProvenance(process.env.IOS_BUILD_ID, "ios")');
    expect(run).toContain('validateProvenance(iosProvenance, "ios", process.env.IOS_BUILD_ID)');
    expect(run).toContain('preview.appVersion !== ios.appVersion');
    expect(run).toContain('build?.isForIosSimulator === true');
    expect(run).toContain('parsed.pathname.toLowerCase().endsWith(".ipa")');
    expect(run).toContain('iosPath, "ios", "production"');
  });

  test("the downloaded IPA identity and App Store profile are verified", () => {
    const run = runOf("Get the build artifact");
    expect(run).toContain('Payload/[^/]+\\.app/Info\\.plist');
    expect(run).toContain('Payload/[^/]+\\.app/embedded\\.mobileprovision');
    expect(run).toContain('CFBundleIdentifier');
    expect(run).toContain('CFBundleShortVersionString');
    expect(run).toContain('CFBundleVersion');
    expect(run).toContain('application-identifier');
    expect(run).toContain('TeamIdentifier');
    expect(run).toContain('get-task-allow');
    expect(run).toContain('DeveloperCertificates');
    expect(run).toContain('CFBundleExecutable');
    expect(run).toContain('archive.getinfo(executable)');
    expect(run).toContain('archive.getinfo(signatures[0]).file_size');
    expect(run).toContain('new X509Certificate(certificate)');
    expect(run).toContain('certificateSubjectHasTeam');
    expect(RAW).toMatch(/^ {2}APPLE_TEAM_ID: "[A-Z0-9]{10}"$/m);
    expect(run).toContain('teamId !== process.env.APPLE_TEAM_ID');
    expect(run).toContain('`${process.env.APPLE_TEAM_ID}.${process.env.IOS_BUNDLE_ID}`');
    expect(run).toContain('certificates.map((encoded)');
    expect(run).toContain('validCertificates.length === 0');
    expect(run).toContain('new Date(expires).toISOString()');
    expect(run).toContain('hasDevices || provisionsAllDevices');
    expect(run).toContain('getTaskAllowDenied');
  });

  test("hash manifest, create, and immutable readback all include the IPA", () => {
    const artifactRun = runOf("Get the build artifact");
    const publishRun = runOf("Create the GitHub Release");
    expect(artifactRun).toContain('IOS_HASH="$(sha256sum "$IOS_FILE"');
    expect(artifactRun).toMatch(/SHA256SUMS\.txt[\s\S]*ios_file=\$IOS_FILE/);
    expect(publishRun).toContain('node "$RELEASE_STATE_HELPER" verify');
    expect(publishRun).toContain('"$IOS_FILE" SHA256SUMS.txt');
    expect(publishRun).toContain('"$IOS_HASH"');
    expect(publishRun).toContain('download_release_asset "$release_json" "$IOS_FILE"');
    expect(publishRun).toContain('sha256sum "$download_dir/$IOS_FILE"');
  });

  test("artifact downloads cannot redirect away from HTTPS", () => {
    const run = runOf("Get the build artifact");
    expect(occurrences(run, "--proto '=https' --proto-redir '=https'")).toBe(3);
  });

  test("release notes identify the iOS build, version, runtime, bundle, and hash", () => {
    const notes = runOf("Extract release notes");
    expect(notes).toContain("Production IPA");
    expect(notes).toContain("IOS_BUILD_ID");
    expect(notes).toContain("IOS_BUILD_NUMBER");
    expect(notes).toContain("IOS_RUNTIME");
    expect(notes).toContain("IOS_BUNDLE_ID");
    expect(notes).toContain("IOS_HASH");
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
    const notes = runOf("Extract release notes");
    const publish = runOf("Create the GitHub Release");
    const executablePublish = publish
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");

    expect(notes).toContain("$RELEASE_CHANGELOG");
    // A missing section still produces a deterministic notes file. Generated
    // notes are intentionally absent from executable lines because they would
    // make an exact rerun mutable.
    expect(notes).toContain("printf 'Release %s\\n'");
    expect(executablePublish).not.toContain("--generate-notes");
    expect(executablePublish).toContain("--notes-file RELEASE_NOTES.md");
  });
});

describe("this repo is releasable right now", () => {
  test("app.json carries a three-part version and a positive versionCode", () => {
    expect(APP.expo.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP.expo.android.versionCode).toBeGreaterThan(0);
    expect(APP.expo.ios.bundleIdentifier).toMatch(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/);
  });

  test("the changelog has a section for the current version", () => {
    // The workflow falls back to generated notes, so this is not fatal there -
    // but a release of a version nobody wrote notes for is a release nobody
    // can read. Kept as a test so the omission is caught before the tag.
    expect(CHANGELOG).toContain(`## [${APP.expo.version}]`);
  });
});
