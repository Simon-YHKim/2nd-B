const fs = require("node:fs");

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function selectReleaseId(pages, tag) {
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
    throw new Error("GitHub paginated releases response is not an array of arrays");
  }
  if (typeof tag !== "string" || tag.length === 0) {
    throw new Error("release tag is invalid");
  }

  const matches = pages.flat().filter((release) => isRecord(release) && release.tag_name === tag);
  if (matches.length > 1) {
    throw new Error(`multiple matching releases: ${matches.length}`);
  }
  if (matches.length === 0) return null;
  return requirePositiveInteger(matches[0].id, "release id");
}

function decideReleaseState(tagExists, releaseExists) {
  if (typeof tagExists !== "boolean" || typeof releaseExists !== "boolean") {
    throw new Error("tag and release existence must be boolean");
  }
  if (tagExists && releaseExists) {
    throw new Error("tag and release already exist; refusing to overwrite or reinterpret them");
  }
  if (tagExists && !releaseExists) {
    throw new Error("tag exists with no release; refusing to mutate partial external state");
  }
  return releaseExists ? "verify-existing" : "create";
}

function assertReleaseIdentity(release, releaseId, tag) {
  if (!isRecord(release)) throw new Error("release response is not an object");
  requirePositiveInteger(releaseId, "expected release id");
  requirePositiveInteger(release.id, "release id");
  if (release.id !== releaseId) throw new Error("release id differs from discovery result");
  if (release.tag_name !== tag) throw new Error("release tag name differs from discovery result");
  return release;
}

function normalizeReleaseAssets(release) {
  if (!isRecord(release) || !Array.isArray(release.assets)) {
    throw new Error("release assets differ");
  }
  const assets = release.assets.map((asset) => {
    if (!isRecord(asset) || typeof asset.name !== "string" || asset.name.length === 0) {
      throw new Error("release assets differ");
    }
    const id = requirePositiveInteger(asset.id, "release asset id");
    if (asset.state !== "uploaded") throw new Error("release asset state differs");
    return { id, name: asset.name, state: asset.state };
  });
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length) {
    throw new Error("release asset ids are not unique");
  }
  return assets.sort((a, b) => a.name.localeCompare(b.name));
}

function assertReleaseAssetsUnchanged(before, after) {
  const beforeAssets = normalizeReleaseAssets(before);
  const afterAssets = normalizeReleaseAssets(after);
  if (JSON.stringify(beforeAssets) !== JSON.stringify(afterAssets)) {
    throw new Error("release asset identities changed");
  }
  return after;
}

function verifyReleaseMetadata(release, expected) {
  if (!isRecord(expected)) throw new Error("expected release metadata is not an object");
  assertReleaseIdentity(release, expected.releaseId, expected.tag);

  if (release.draft !== true) throw new Error("release is not a draft");
  if (release.published_at !== null) throw new Error("draft release has a published timestamp");
  if (
    typeof release.prerelease !== "boolean" ||
    typeof expected.prerelease !== "boolean" ||
    release.prerelease !== expected.prerelease
  ) {
    throw new Error("release prerelease flag differs");
  }

  if (!Array.isArray(expected.assetNames)) {
    throw new Error("release assets differ");
  }
  const wantedAssets = [...expected.assetNames].sort();
  const normalizedAssets = normalizeReleaseAssets(release);
  const actualAssets = normalizedAssets.map((asset) => asset.name).sort();
  if (JSON.stringify(actualAssets) !== JSON.stringify(wantedAssets)) {
    throw new Error("release assets differ");
  }

  if (release.name !== expected.name) throw new Error("release title differs");
  if (
    typeof release.target_commitish !== "string" ||
    release.target_commitish.toLowerCase() !== expected.targetCommitish.toLowerCase()
  ) {
    throw new Error("release target commit differs");
  }
  if (release.body !== expected.body) throw new Error("release notes differ");

  let url;
  try {
    url = new URL(release.html_url);
  } catch {
    throw new Error("release html_url is not an HTTPS github.com URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new Error("release html_url is not an HTTPS github.com URL");
  }
  return release;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function booleanEnv(name) {
  const value = requiredEnv(name);
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function integerEnv(name) {
  const value = requiredEnv(name);
  if (!/^[0-9]+$/.test(value)) throw new Error(`${name} is invalid`);
  return requirePositiveInteger(Number(value), name);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runCli(command) {
  switch (command) {
    case "select-id": {
      const id = selectReleaseId(readJson(requiredEnv("RELEASE_LIST_JSON")), requiredEnv("TAG"));
      if (id !== null) process.stdout.write(String(id));
      return;
    }
    case "state":
      process.stdout.write(decideReleaseState(booleanEnv("TAG_EXISTS"), booleanEnv("RELEASE_EXISTS")));
      return;
    case "assert-identity":
      assertReleaseIdentity(
        readJson(requiredEnv("RELEASE_JSON")),
        integerEnv("RELEASE_ID"),
        requiredEnv("TAG"),
      );
      return;
    case "assert-assets-unchanged":
      assertReleaseAssetsUnchanged(
        readJson(requiredEnv("EXPECTED_RELEASE_JSON")),
        readJson(requiredEnv("RELEASE_JSON")),
      );
      return;
    case "verify": {
      const notesFile = process.env.RELEASE_NOTES_FILE || "RELEASE_NOTES.md";
      verifyReleaseMetadata(readJson(requiredEnv("RELEASE_JSON")), {
        releaseId: integerEnv("RELEASE_ID"),
        tag: requiredEnv("TAG"),
        prerelease: booleanEnv("EXPECT_PRERELEASE"),
        assetNames: [
          requiredEnv("PREVIEW_FILE"),
          requiredEnv("PRODUCTION_FILE"),
          requiredEnv("IOS_FILE"),
          "SHA256SUMS.txt",
        ],
        name: `2nd-Brain ${requiredEnv("VERSION")}`,
        targetCommitish: requiredEnv("RELEASE_COMMIT"),
        body: fs.readFileSync(notesFile, "utf8"),
      });
      return;
    }
    default:
      throw new Error(`unknown command: ${command || "(missing)"}`);
  }
}

if (require.main === module) {
  try {
    runCli(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  assertReleaseAssetsUnchanged,
  assertReleaseIdentity,
  decideReleaseState,
  selectReleaseId,
  verifyReleaseMetadata,
};
