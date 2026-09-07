/**
 * The portable lineage verifier pins the sha256 of each canonical file's INDEX
 * blob. Git LFS replaces that blob with a ~130-byte pointer, so a naive reader
 * would hash the pointer text: the verifier would fail, and if someone then
 * "fixed" it by rewriting the expected hashes it would go on passing while
 * proving nothing about the content it exists to protect.
 *
 * The pointer already carries the answer. Its `oid sha256:` IS the sha256 of the
 * file content, which is exactly the number EXPECTED_CANONICAL_FILES pins. So
 * reading the oid keeps every expected hash unchanged across an LFS migration.
 * These tests pin that equivalence (Q-260905-08 groundwork, 2026-09-06).
 *
 * The verifier is an ESM .mjs and this suite runs under ts-jest's CommonJS, so
 * the cases run in a child node process, the same way the sibling suite drives
 * the script.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MODULE_URL = pathToFileURL(
  resolve(__dirname, "..", "verify-portable-handoff.mjs"),
).href;

/** Runs lfsOid on a base64-encoded blob in a child process. */
function lfsOid(blob: Buffer): string | null {
  const script = `
    const { lfsOid } = await import(${JSON.stringify(MODULE_URL)});
    const bytes = Buffer.from(process.argv[1], "base64");
    process.stdout.write(JSON.stringify(lfsOid(bytes) ?? null));
  `;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script, blob.toString("base64")], {
    encoding: "utf8",
  });
  if (run.status !== 0) throw new Error(`child failed: ${run.stderr}`);
  return JSON.parse(run.stdout) as string | null;
}

function pointerFor(content: Buffer): Buffer {
  const oid = createHash("sha256").update(content).digest("hex");
  return Buffer.from(
    `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${content.length}\n`,
    "utf8",
  );
}

describe("lfsOid", () => {
  it("returns the content sha256 that the pointer stands in for", () => {
    // The whole point: migrating a pinned file to LFS must not change its hash.
    const content = Buffer.from("the bytes a canonical lineage file would hold", "utf8");
    const expected = createHash("sha256").update(content).digest("hex");
    expect(lfsOid(pointerFor(content))).toBe(expected);
  });

  it("returns null for ordinary content so it falls through to hashing bytes", () => {
    expect(lfsOid(Buffer.from("#!/usr/bin/env node\nconsole.log(1);\n", "utf8"))).toBeNull();
    expect(lfsOid(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
  });

  it("refuses a blob too large to be a pointer without stringifying it", () => {
    // A real canonical file is megabytes of binary; turning that into a string
    // to test a prefix would be wasteful and, for the GIF, meaningless.
    const big = Buffer.alloc(4096, 0x41);
    big.write(`version https://git-lfs.github.com/spec/v1\noid sha256:${"a".repeat(64)}\n`, 0, "utf8");
    expect(lfsOid(big)).toBeNull();
  });

  it("refuses a pointer whose oid line is missing or malformed", () => {
    expect(lfsOid(Buffer.from("version https://git-lfs.github.com/spec/v1\nsize 12\n", "utf8"))).toBeNull();
    expect(
      lfsOid(Buffer.from("version https://git-lfs.github.com/spec/v1\noid sha256:abc123\nsize 12\n", "utf8")),
    ).toBeNull();
    expect(
      lfsOid(
        Buffer.from(
          `version https://git-lfs.github.com/spec/v1\noid sha1:${"a".repeat(40)}\nsize 12\n`,
          "utf8",
        ),
      ),
    ).toBeNull();
  });

  it("refuses a file that merely mentions the pointer spec later on", () => {
    // Prefix, not substring: a doc quoting the spec must not be read as a pointer.
    const doc = Buffer.from(
      `# notes\nGit LFS pointers start with version https://git-lfs.github.com/spec/v1\noid sha256:${"b".repeat(64)}\n`,
      "utf8",
    );
    expect(lfsOid(doc)).toBeNull();
  });
});
