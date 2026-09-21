type ReleaseAsset = {
  id: number;
  name: string;
  state: string;
};

type GitHubRelease = {
  id: number;
  tag_name: string;
  draft: boolean;
  published_at: string | null;
  prerelease: boolean;
  name: string;
  target_commitish: string;
  body: string;
  html_url: string;
  assets: ReleaseAsset[];
};

type ExpectedRelease = {
  releaseId: number;
  tag: string;
  prerelease: boolean;
  assetNames: string[];
  name: string;
  targetCommitish: string;
  body: string;
};

const loadReleaseState = () =>
  require("../github-release-state") as {
    selectReleaseId: (pages: unknown, tag: string) => number | null;
    decideReleaseState: (tagExists: boolean, releaseExists: boolean) => "create" | "verify-existing";
    assertReleaseIdentity: (
      release: GitHubRelease,
      releaseId: number,
      tag: string,
    ) => GitHubRelease;
    assertReleaseAssetsUnchanged: (
      before: GitHubRelease,
      after: GitHubRelease,
    ) => GitHubRelease;
    verifyReleaseMetadata: (
      release: GitHubRelease,
      expected: ExpectedRelease,
    ) => GitHubRelease;
  };

const SHA = "8f7743c4c5b6f716945eaa5a713beedb3ee12e5f";

const exactRelease = (overrides: Partial<GitHubRelease> = {}): GitHubRelease => ({
  id: 901,
  tag_name: "v0.9.0",
  draft: true,
  published_at: null,
  prerelease: false,
  name: "2nd-Brain 0.9.0",
  target_commitish: SHA,
  body: "verified release notes\n",
  html_url: "https://github.com/Simon-YHKim/2nd-B/releases/tag/untagged-abc",
  assets: [
    { id: 11, name: "2nd-Brain-v0.9.0-preview.apk", state: "uploaded" },
    { id: 12, name: "2nd-Brain-v0.9.0-production.aab", state: "uploaded" },
    { id: 13, name: "2nd-Brain-v0.9.0-production.ipa", state: "uploaded" },
    { id: 14, name: "SHA256SUMS.txt", state: "uploaded" },
  ],
  ...overrides,
});

const expectedRelease = (overrides: Partial<ExpectedRelease> = {}): ExpectedRelease => ({
  releaseId: 901,
  tag: "v0.9.0",
  prerelease: false,
  assetNames: [
    "2nd-Brain-v0.9.0-preview.apk",
    "2nd-Brain-v0.9.0-production.aab",
    "2nd-Brain-v0.9.0-production.ipa",
    "SHA256SUMS.txt",
  ],
  name: "2nd-Brain 0.9.0",
  targetCommitish: SHA,
  body: "verified release notes\n",
  ...overrides,
});

describe("GitHub draft discovery", () => {
  test("finds the target on the first page", () => {
    const { selectReleaseId } = loadReleaseState();
    expect(selectReleaseId([[exactRelease()], []], "v0.9.0")).toBe(901);
  });

  test("finds the target on a later page", () => {
    const { selectReleaseId } = loadReleaseState();
    const other = exactRelease({ id: 800, tag_name: "v0.8.0" });
    expect(selectReleaseId([[other], [exactRelease()]], "v0.9.0")).toBe(901);
  });

  test("returns no id when the tag is absent", () => {
    const { selectReleaseId } = loadReleaseState();
    expect(selectReleaseId([[exactRelease({ tag_name: "v0.8.0" })], []], "v0.9.0")).toBeNull();
  });

  test("rejects duplicate same-tag releases across pages", () => {
    const { selectReleaseId } = loadReleaseState();
    expect(() =>
      selectReleaseId([[exactRelease()], [exactRelease({ id: 902 })]], "v0.9.0"),
    ).toThrow("multiple matching releases: 2");
  });
});

describe("GitHub release state transition", () => {
  test.each([
    [false, false, "create"],
    [false, true, "verify-existing"],
  ] as const)("tag=%s release=%s chooses %s", (tagExists, releaseExists, expected) => {
    const { decideReleaseState } = loadReleaseState();
    expect(decideReleaseState(tagExists, releaseExists)).toBe(expected);
  });

  test.each([
    [true, false],
    [true, true],
  ] as const)("tag=%s release=%s fails closed", (tagExists, releaseExists) => {
    const { decideReleaseState } = loadReleaseState();
    expect(() => decideReleaseState(tagExists, releaseExists)).toThrow("refusing");
  });
});

describe("release-ID readback", () => {
  test("accepts only the object fetched by the discovered id and tag", () => {
    const { assertReleaseIdentity } = loadReleaseState();
    expect(assertReleaseIdentity(exactRelease(), 901, "v0.9.0")).toEqual(exactRelease());
    expect(() => assertReleaseIdentity(exactRelease({ id: 902 }), 901, "v0.9.0")).toThrow(
      "release id differs",
    );
    expect(() =>
      assertReleaseIdentity(exactRelease({ tag_name: "v0.9.1" }), 901, "v0.9.0"),
    ).toThrow("release tag name differs");
  });

  test("rejects a same-name asset replaced with a new ID", () => {
    const { assertReleaseAssetsUnchanged } = loadReleaseState();
    expect(assertReleaseAssetsUnchanged(exactRelease(), exactRelease())).toEqual(exactRelease());
    const replaced = exactRelease({
      assets: exactRelease().assets.map((asset, i) => i === 0 ? { ...asset, id: 99 } : asset),
    });
    expect(() => assertReleaseAssetsUnchanged(exactRelease(), replaced)).toThrow(
      "release asset identities changed",
    );
  });
});

describe("exact immutable draft metadata", () => {
  test("accepts the exact release", () => {
    const { verifyReleaseMetadata } = loadReleaseState();
    expect(verifyReleaseMetadata(exactRelease(), expectedRelease())).toEqual(exactRelease());
  });

  test.each([
    ["id", () => exactRelease({ id: 902 }), "release id differs"],
    ["tag", () => exactRelease({ tag_name: "v0.9.1" }), "release tag name differs"],
    ["draft", () => exactRelease({ draft: false }), "release is not a draft"],
    [
      "published timestamp",
      () => exactRelease({ published_at: "2026-09-22T00:00:00Z" }),
      "draft release has a published timestamp",
    ],
    ["prerelease", () => exactRelease({ prerelease: true }), "prerelease flag differs"],
    [
      "draft type",
      () => ({ ...exactRelease(), draft: "true" }) as unknown as GitHubRelease,
      "release is not a draft",
    ],
    [
      "prerelease type",
      () => ({ ...exactRelease(), prerelease: "false" }) as unknown as GitHubRelease,
      "release prerelease flag differs",
    ],
    [
      "asset names",
      () => exactRelease({ assets: exactRelease().assets.slice(0, 3) }),
      "release assets differ",
    ],
    [
      "asset id",
      () => exactRelease({ assets: exactRelease().assets.map((asset, i) => i === 0 ? { ...asset, id: -1 } : asset) }),
      "release asset id is invalid",
    ],
    [
      "asset state",
      () => exactRelease({ assets: exactRelease().assets.map((asset, i) => i === 0 ? { ...asset, state: "new" } : asset) }),
      "release asset state differs",
    ],
    [
      "duplicate asset ids",
      () => exactRelease({ assets: exactRelease().assets.map((asset, i) => i === 1 ? { ...asset, id: 11 } : asset) }),
      "release asset ids are not unique",
    ],
    ["title", () => exactRelease({ name: "wrong" }), "release title differs"],
    ["target commit", () => exactRelease({ target_commitish: "0".repeat(40) }), "target commit differs"],
    ["notes", () => exactRelease({ body: "wrong\n" }), "release notes differ"],
    [
      "URL",
      () => exactRelease({ html_url: "http://example.com/release" }),
      "release html_url is not an HTTPS github.com URL",
    ],
  ] as const)("rejects a mismatch in %s", (_field, mutate, message) => {
    const { verifyReleaseMetadata } = loadReleaseState();
    expect(() => verifyReleaseMetadata(mutate(), expectedRelease())).toThrow(message);
  });
});
