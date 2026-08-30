import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = join(ROOT, "scripts", "verify-portable-handoff.mjs");

type Verification = {
  schemaVersion: number;
  status: "PASS" | "FAIL";
  checks: Array<{
    id: string;
    status: "PASS" | "FAIL";
    count?: number;
    treeSha256?: string;
    matches?: string[];
  }>;
};

const run = (root: string, extraArgs: string[] = []) =>
  spawnSync(process.execPath, [SCRIPT, "--json", "--root", root, ...extraArgs], {
    cwd: ROOT,
    encoding: "utf8",
  });

describe("portable handoff asset verifier", () => {
  test("the committed clone contains the exact portable asset lineage", () => {
    const result = run(ROOT);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");

    const report = JSON.parse(result.stdout) as Verification;
    expect(report.schemaVersion).toBe(1);
    expect(report.status).toBe("PASS");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "tracked-required", status: "PASS" }),
        expect.objectContaining({ id: "canonical-file-hashes", status: "PASS" }),
        expect.objectContaining({
          id: "pixel-clay-captures",
          status: "PASS",
          count: 93,
          treeSha256: "4cbc34c5d20e80a7431a17433d69ef59fdb93871baf942f992f7545cc470c84b",
        }),
        expect.objectContaining({
          id: "pixel-clay-structure",
          status: "PASS",
          count: 93,
          treeSha256: "f83405a533cec09182c678718785934e3d33d825a164804388f17b876548c18d",
        }),
        expect.objectContaining({ id: "canonical-checkout-clean", status: "PASS" }),
        expect.objectContaining({ id: "canonical-file-boundaries", status: "PASS" }),
        expect.objectContaining({ id: "forbidden-lineage-assets", status: "PASS" }),
      ]),
    );
  });

  test("a directory without the tracked handoff fails closed", () => {
    const empty = mkdtempSync(join(tmpdir(), "2ndb-portable-handoff-"));
    try {
      const result = run(empty);
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as Verification;
      expect(report.status).toBe("FAIL");
      expect(report.checks.some((check) => check.status === "FAIL")).toBe(true);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test("tracked Pixy provenance files are rejected explicitly", () => {
    const fixture = mkdtempSync(join(tmpdir(), "2ndb-portable-forbidden-"));
    try {
      expect(spawnSync("git", ["init", "-q", fixture]).status).toBe(0);
      mkdirSync(join(fixture, "assets"), { recursive: true });
      writeFileSync(join(fixture, "assets", "rejected.pix"), "forbidden\n");
      writeFileSync(join(fixture, "pixy.spec.json"), "{}\n");
      expect(spawnSync("git", ["-C", fixture, "add", "assets/rejected.pix", "pixy.spec.json"]).status)
        .toBe(0);

      const result = run(fixture);
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as Verification;
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "forbidden-lineage-assets",
          status: "FAIL",
          matches: expect.arrayContaining(["assets/rejected.pix", "pixy.spec.json"]),
        }),
      ]));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("generated opening evidence must match both validations and the tracked strip hash", () => {
    const fixture = mkdtempSync(join(tmpdir(), "2ndb-portable-generated-"));
    try {
      mkdirSync(join(fixture, "Output", "hustlek-opening"), { recursive: true });
      mkdirSync(join(fixture, "Output", "hustlek-opening-v2"), { recursive: true });
      mkdirSync(join(fixture, "Output", "portable-handoff"), { recursive: true });
      writeFileSync(join(fixture, "Output", "hustlek-opening", "validation.json"), JSON.stringify({
        status: "PASS",
        atlas_sha256: "2780df89aa6f1d472ec82a03610a6d7e81a20dbf9e767103cd198233e44213be",
        rendered_frame_count: 165,
        duration_ms: 13200,
        decoded_rgb_frame_stream_sha256:
          "be712f383b207d0de5508f485481aa41d8fe8769b087220993a357342780ff33",
      }));
      writeFileSync(join(fixture, "Output", "hustlek-opening-v2", "validation.json"), JSON.stringify({
        status: "PASS",
        source_png_sha256:
          "2780df89aa6f1d472ec82a03610a6d7e81a20dbf9e767103cd198233e44213be",
        output_json_sha256:
          "b599f379db85305b0a2aa82db3f87d7682bc70e59369186bcdcac7c65a79664f",
        walk_cells: 12,
        turn_contact_cells: 6,
        telescope_cells: 1,
      }));
      copyFileSync(
        join(ROOT, "assets", "opening", "hustlek-opening-strip.png"),
        join(fixture, "Output", "portable-handoff", "hustlek-opening-strip.png"),
      );

      const result = run(fixture, ["--generated"]);
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as Verification;
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "generated-opening", status: "PASS" }),
      ]));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("tracked symlink modes and hidden index flags fail the file boundary", () => {
    const fixture = mkdtempSync(join(tmpdir(), "2ndb-portable-index-flags-"));
    try {
      expect(spawnSync("git", ["init", "-q", fixture]).status).toBe(0);
      writeFileSync(join(fixture, "CLAUDE.md"), "rules\n");
      expect(spawnSync("git", ["-C", fixture, "add", "CLAUDE.md"]).status).toBe(0);
      expect(spawnSync("git", ["-C", fixture, "update-index", "--skip-worktree", "CLAUDE.md"]).status)
        .toBe(0);
      const blob = spawnSync("git", ["-C", fixture, "hash-object", "-w", "--stdin"], {
        input: "CLAUDE.md\n",
        encoding: "utf8",
      });
      expect(blob.status).toBe(0);
      writeFileSync(join(fixture, "AGENTS.md"), "CLAUDE.md\n");
      expect(spawnSync("git", [
        "-C",
        fixture,
        "update-index",
        "--add",
        "--cacheinfo",
        `120000,${blob.stdout.trim()},AGENTS.md`,
      ]).status).toBe(0);

      const result = run(fixture);
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as Verification;
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "canonical-file-boundaries",
          status: "FAIL",
        }),
      ]));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("ignored reproducible outputs cannot be force-added to the portable contract", () => {
    const fixture = mkdtempSync(join(tmpdir(), "2ndb-portable-output-boundary-"));
    try {
      expect(spawnSync("git", ["init", "-q", fixture]).status).toBe(0);
      writeFileSync(join(fixture, ".gitignore"), "Output/\n");
      mkdirSync(join(fixture, "Output", "hustlek-opening"), { recursive: true });
      writeFileSync(join(fixture, "Output", "hustlek-opening", "validation.json"), "{}\n");
      expect(spawnSync("git", [
        "-C",
        fixture,
        "add",
        "-f",
        "Output/hustlek-opening/validation.json",
      ]).status).toBe(0);

      const result = run(fixture);
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as Verification;
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "ignored-reproducible-boundary", status: "FAIL" }),
      ]));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
