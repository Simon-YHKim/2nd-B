#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED_CANONICAL_FILES = Object.freeze({
  "design/hustlek-opening-v1/hustlek-opening-atlas.png":
    "2780df89aa6f1d472ec82a03610a6d7e81a20dbf9e767103cd198233e44213be",
  "design/hustlek-opening-v1/hustlek-opening-preview.gif":
    "0bb0053cff1eb830d1858e4021c9c09f80051bb28f995df23eac5a25f357b89f",
  "assets/deepspace/hustlek-opening-v2.json":
    "b599f379db85305b0a2aa82db3f87d7682bc70e59369186bcdcac7c65a79664f",
  "assets/opening/hustlek-opening-strip.png":
    "4753a818e59970908c79f5e82416b4e8781ddf5f019e311b2fdbe3252de56bc5",
  "design/pixel_clay_260825/app-offline.html":
    "c69f32dd2b85abc969c63d9d0b77de322f8a9e138627e9aa1300a48d6a60f105",
  "scripts/build-hustlek-opening.py":
    "7fe0a2a17ea99f947c26cc04ce3913afc5107f513e809750c3b5e30a275f0f68",
  "scripts/build-hustlek-opening-v2.py":
    "c711be4db61eb93869e0f358d2f37be80414dda41759e6ef1c268f10585e00b3",
  "scripts/build-opening-strip.py":
    "e038d4f317f90215f58bd226905bb73f7e054fc82e3c80b8e5099e8e53a1af58",
  "docs/HUSTLEK-OPENING.md":
    "58f7da55ab055e35b68a8a132cda5951d5cabe6675ad2c1ddc7eb1ff11bbd74c",
});

const EXPECTED_TREES = Object.freeze({
  captures: {
    directory: "design/pixel_clay_260825/captures",
    count: 93,
    sha256: "4cbc34c5d20e80a7431a17433d69ef59fdb93871baf942f992f7545cc470c84b",
  },
  structure: {
    directory: "design/pixel_clay_260825/data/structure",
    count: 93,
    sha256: "f83405a533cec09182c678718785934e3d33d825a164804388f17b876548c18d",
  },
});

const IGNORED_REPRODUCIBLE = Object.freeze([
  "Output/hustlek-opening/validation.json",
  "Output/hustlek-opening-v2/validation.json",
  "Output/portable-handoff/hustlek-opening-strip.png",
]);

const REQUIRED_TRACKED = Object.freeze([
  "AGENTS.md",
  "CLAUDE.md",
  "docs/HANDOFF.md",
  "docs/handoff/PORTABLE-ASSET-LINEAGE-2026-08-30.md",
  "docs/handoff/portable-handoff-report-260830.html",
  "docs/ASSETS.md",
  "docs/HUSTLEK-OPENING.md",
  "design/CODEX-START-HERE.md",
  "design/CODEX-UIUX-260827.md",
  "design/CODEX-OPENING-260827.md",
  "design/pixel_clay_260825/data/screens.json",
  "scripts/build-hustlek-opening.py",
  "scripts/build-hustlek-opening-v2.py",
  "scripts/build-opening-strip.py",
  "scripts/verify-portable-handoff.mjs",
  ...Object.keys(EXPECTED_CANONICAL_FILES),
]);

const sortCodepoint = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const posix = (value) => value.split(sep).join("/");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function parseArgs(argv) {
  let root = SCRIPT_ROOT;
  let json = false;
  let generated = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      json = true;
    } else if (argument === "--generated") {
      generated = true;
    } else if (argument === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root requires a path");
      root = resolve(value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return { root, json, generated };
}

function walkFiles(root, directory) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return { files: [], invalid: [directory] };
  const output = [];
  const invalid = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relativePath = posix(join(directory, entry.name));
    if (entry.isDirectory()) {
      const nested = walkFiles(root, relativePath);
      output.push(...nested.files);
      invalid.push(...nested.invalid);
    } else if (entry.isFile()) output.push(relativePath);
    else invalid.push(relativePath);
  }
  return {
    files: output.sort(sortCodepoint),
    invalid: invalid.sort(sortCodepoint),
  };
}

function indexBytes(root, relativePath) {
  const result = spawnSync("git", ["-C", root, "show", `:${relativePath}`], {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return result.status === 0 && Buffer.isBuffer(result.stdout) ? result.stdout : null;
}

function hashIndexFile(root, relativePath) {
  const bytes = indexBytes(root, relativePath);
  return bytes ? sha256(bytes) : null;
}

function hashIndexTree(root, directory, tracked) {
  const prefix = `${directory}/`;
  const files = tracked.files.filter((file) => file.startsWith(prefix)).sort(sortCodepoint);
  const digest = createHash("sha256");
  for (const file of files) {
    const fileSha256 = hashIndexFile(root, file);
    if (!fileSha256) return { files, count: files.length, sha256: null };
    digest.update(file, "utf8");
    digest.update(Buffer.from([0]));
    digest.update(fileSha256, "ascii");
    digest.update("\n", "ascii");
  }
  return { files, count: files.length, sha256: digest.digest("hex") };
}

function readJson(root, relativePath) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(join(root, relativePath), "utf8")) };
  } catch {
    return { ok: false, value: null };
  }
}

function pngDimensions(root, relativePath) {
  try {
    const bytes = readFileSync(join(root, relativePath));
    const signature = "89504e470d0a1a0a";
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function trackedFiles(root) {
  const result = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const stageResult = spawnSync("git", ["-C", root, "ls-files", "--stage", "-z"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const tagResult = spawnSync("git", ["-C", root, "ls-files", "-v", "-z"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0 || stageResult.status !== 0 || tagResult.status !== 0) {
    return { ok: false, files: [], modes: new Map(), tags: new Map() };
  }
  const modes = new Map();
  for (const entry of stageResult.stdout.split("\0").filter(Boolean)) {
    const tab = entry.indexOf("\t");
    if (tab < 0) continue;
    const [mode, , stage] = entry.slice(0, tab).split(" ");
    if (stage === "0") modes.set(entry.slice(tab + 1).replaceAll("\\", "/"), mode);
  }
  const tags = new Map();
  for (const entry of tagResult.stdout.split("\0").filter(Boolean)) {
    const split = entry.indexOf(" ");
    if (split < 0) continue;
    tags.set(entry.slice(split + 1).replaceAll("\\", "/"), entry.slice(0, split));
  }
  return {
    ok: true,
    files: result.stdout
      .split("\0")
      .filter(Boolean)
      .map((file) => file.replaceAll("\\", "/"))
      .sort(sortCodepoint),
    modes,
    tags,
  };
}

function sameStrings(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function verifyTracked(root) {
  const tracked = trackedFiles(root);
  const trackedSet = new Set(tracked.files);
  const missing = REQUIRED_TRACKED.filter((file) => !trackedSet.has(file));
  return {
    tracked,
    check: {
      id: "tracked-required",
      status: tracked.ok && missing.length === 0 ? "PASS" : "FAIL",
      required: REQUIRED_TRACKED.length,
      missing,
    },
  };
}

function verifyCanonicalFiles(root) {
  const files = Object.entries(EXPECTED_CANONICAL_FILES).map(([path, expectedSha256]) => {
    const actualSha256 = hashIndexFile(root, path);
    return {
      path,
      status: actualSha256 === expectedSha256 ? "PASS" : "FAIL",
      expectedSha256,
      actualSha256,
    };
  });
  return {
    id: "canonical-file-hashes",
    status: files.every((file) => file.status === "PASS") ? "PASS" : "FAIL",
    files,
  };
}

function verifyGeneratedOpening(root) {
  const v1 = readJson(root, "Output/hustlek-opening/validation.json");
  const v2 = readJson(root, "Output/hustlek-opening-v2/validation.json");
  const stripPath = "Output/portable-handoff/hustlek-opening-strip.png";
  let stripSha256 = null;
  try {
    stripSha256 = sha256(readFileSync(join(root, stripPath)));
  } catch {
    // The check remains fail-closed when the generated strip is absent or unreadable.
  }
  const v1Pass = v1.ok
    && v1.value?.status === "PASS"
    && v1.value?.atlas_sha256 === EXPECTED_CANONICAL_FILES[
      "design/hustlek-opening-v1/hustlek-opening-atlas.png"
    ]
    && v1.value?.rendered_frame_count === 165
    && v1.value?.duration_ms === 13200
    && v1.value?.decoded_rgb_frame_stream_sha256
      === "be712f383b207d0de5508f485481aa41d8fe8769b087220993a357342780ff33";
  const v2Pass = v2.ok
    && v2.value?.status === "PASS"
    && v2.value?.source_png_sha256 === EXPECTED_CANONICAL_FILES[
      "design/hustlek-opening-v1/hustlek-opening-atlas.png"
    ]
    && v2.value?.output_json_sha256 === EXPECTED_CANONICAL_FILES[
      "assets/deepspace/hustlek-opening-v2.json"
    ]
    && v2.value?.walk_cells === 12
    && v2.value?.turn_contact_cells === 6
    && v2.value?.telescope_cells === 1;
  const stripPass = stripSha256 === EXPECTED_CANONICAL_FILES[
    "assets/opening/hustlek-opening-strip.png"
  ];
  return {
    id: "generated-opening",
    status: v1Pass && v2Pass && stripPass ? "PASS" : "FAIL",
    v1: v1Pass ? "PASS" : "FAIL",
    v2: v2Pass ? "PASS" : "FAIL",
    strip: stripPass ? "PASS" : "FAIL",
    stripSha256,
  };
}

function verifyPixelClay(root, kind, tracked) {
  const expected = EXPECTED_TREES[kind];
  const tree = hashIndexTree(root, expected.directory, tracked);
  const checkout = walkFiles(root, expected.directory);
  const checkoutFilesMatch = sameStrings(tree.files, checkout.files);
  const screensResult = readJson(root, "design/pixel_clay_260825/data/screens.json");
  const screens = screensResult.ok && Array.isArray(screensResult.value?.screens)
    ? screensResult.value.screens
    : [];
  const ids = screens
    .map((screen) => screen?.id)
    .filter((id) => typeof id === "string")
    .sort(sortCodepoint);
  const fileIds = tree.files
    .map((file) => basename(file, extname(file)))
    .sort(sortCodepoint);
  const idsMatch = sameStrings(ids, fileIds);
  const phone = screensResult.value?.phone;
  const width = Number(phone?.width);
  const height = Number(phone?.height);

  let geometryMatches = Number.isInteger(width) && Number.isInteger(height);
  if (geometryMatches && kind === "captures") {
    geometryMatches = tree.files.every((file) => {
      const dimensions = pngDimensions(root, file);
      return dimensions?.width === width && dimensions?.height === height;
    });
  }
  if (geometryMatches && kind === "structure") {
    geometryMatches = tree.files.every((file) => {
      const structure = readJson(root, file);
      return structure.ok
        && Array.isArray(structure.value?.box)
        && structure.value.box[0] === width
        && structure.value.box[1] === height;
    });
  }

  const pass = screensResult.ok
    && tree.count === expected.count
    && tree.sha256 === expected.sha256
    && checkoutFilesMatch
    && checkout.invalid.length === 0
    && idsMatch
    && geometryMatches;

  return {
    id: `pixel-clay-${kind}`,
    status: pass ? "PASS" : "FAIL",
    count: tree.count,
    expectedCount: expected.count,
    treeSha256: tree.sha256,
    expectedTreeSha256: expected.sha256,
    checkoutFilesMatch,
    invalidCheckoutEntries: checkout.invalid,
    screenIdsMatch: idsMatch,
    geometry: Number.isInteger(width) && Number.isInteger(height) ? `${width}x${height}` : null,
    geometryMatches,
  };
}

function verifyCheckoutClean(root) {
  const scopes = [
    ...Object.keys(EXPECTED_CANONICAL_FILES),
    EXPECTED_TREES.captures.directory,
    EXPECTED_TREES.structure.directory,
    "design/pixel_clay_260825/data/screens.json",
  ];
  const result = spawnSync("git", ["-C", root, "diff", "--name-only", "HEAD", "--", ...scopes], {
    encoding: "utf8",
    windowsHide: true,
  });
  const modified = result.status === 0
    ? result.stdout.split(/\r?\n/).filter(Boolean).map((file) => file.replaceAll("\\", "/"))
    : [];
  return {
    id: "canonical-checkout-clean",
    status: result.status === 0 && modified.length === 0 ? "PASS" : "FAIL",
    modified,
  };
}

function verifyFileBoundaries(root, tracked) {
  const files = [...new Set([
    ...REQUIRED_TRACKED,
    ...Object.keys(EXPECTED_CANONICAL_FILES),
    ...tracked.files.filter((file) =>
      file.startsWith(`${EXPECTED_TREES.captures.directory}/`)
      || file.startsWith(`${EXPECTED_TREES.structure.directory}/`)),
  ])].sort(sortCodepoint);
  const rootReal = existsSync(root) ? realpathSync(root) : root;
  const normalizedRoot = process.platform === "win32" ? rootReal.toLowerCase() : rootReal;
  const invalid = new Set();
  for (const file of files) {
    try {
      const mode = tracked.modes.get(file);
      const tag = tracked.tags.get(file);
      const indexFlagged = tag === "S" || (typeof tag === "string" && /[a-z]/.test(tag));
      if ((mode !== "100644" && mode !== "100755") || indexFlagged) invalid.add(file);
      const absolute = join(root, file);
      const stat = lstatSync(absolute);
      const real = realpathSync(absolute);
      const normalizedReal = process.platform === "win32" ? real.toLowerCase() : real;
      const inside = normalizedReal.startsWith(`${normalizedRoot}${sep}`);
      if (!stat.isFile() || stat.isSymbolicLink() || !inside) invalid.add(file);
      let parent = dirname(absolute);
      while (resolve(parent) !== resolve(root)) {
        const parentStat = lstatSync(parent);
        const parentReal = realpathSync(parent);
        const normalizedParent = process.platform === "win32"
          ? parentReal.toLowerCase()
          : parentReal;
        if (!parentStat.isDirectory()
          || parentStat.isSymbolicLink()
          || !normalizedParent.startsWith(`${normalizedRoot}${sep}`)) {
          invalid.add(file);
          break;
        }
        parent = dirname(parent);
      }
    } catch {
      invalid.add(file);
    }
  }
  const invalidFiles = [...invalid].sort(sortCodepoint);
  return {
    id: "canonical-file-boundaries",
    status: invalidFiles.length === 0 ? "PASS" : "FAIL",
    invalid: invalidFiles,
  };
}

function verifyForbidden(tracked) {
  const matches = tracked.files.filter((path) => {
    const lower = path.toLowerCase();
    if (lower.includes("legacy-pixy") || lower.includes("rejected-associated")) return true;
    if (lower.endsWith(".pix") || lower === "pixy.spec.json" || lower.endsWith("/pixy.spec.json")) {
      return true;
    }
    if (lower.endsWith("farm-character-32-native.png")) return true;
    const assetRoot = lower.startsWith("assets/")
      || lower.startsWith("public/assets/")
      || lower.startsWith("design/hustlek-opening-v1/")
      || lower.startsWith("design/pixel_clay_260825/captures/");
    return assetRoot && lower.includes("diagnostic");
  });
  return {
    id: "forbidden-lineage-assets",
    status: tracked.ok && matches.length === 0 ? "PASS" : "FAIL",
    matches,
  };
}

function verifyIgnoredReproducible(root, tracked) {
  const trackedOutput = tracked.files.filter((path) => path === "Output" || path.startsWith("Output/"));
  const result = spawnSync("git", ["-C", root, "check-ignore", "-z", "--stdin"], {
    input: `${IGNORED_REPRODUCIBLE.join("\0")}\0`,
    encoding: "utf8",
    windowsHide: true,
  });
  const ignored = result.status === 0
    ? result.stdout.split("\0").filter(Boolean).map((path) => path.replaceAll("\\", "/"))
    : [];
  const ignoredSet = new Set(ignored);
  const notIgnored = IGNORED_REPRODUCIBLE.filter((path) => !ignoredSet.has(path));
  return {
    id: "ignored-reproducible-boundary",
    status: tracked.ok && trackedOutput.length === 0 && notIgnored.length === 0 ? "PASS" : "FAIL",
    trackedOutput,
    notIgnored,
  };
}

export function verifyPortableHandoff(root = SCRIPT_ROOT, options = {}) {
  const tracked = verifyTracked(root);
  const checks = [
    tracked.check,
    verifyCanonicalFiles(root),
    verifyPixelClay(root, "captures", tracked.tracked),
    verifyPixelClay(root, "structure", tracked.tracked),
    verifyCheckoutClean(root),
    verifyFileBoundaries(root, tracked.tracked),
    verifyForbidden(tracked.tracked),
    verifyIgnoredReproducible(root, tracked.tracked),
  ];
  if (options.generated) checks.push(verifyGeneratedOpening(root));
  return {
    schemaVersion: 1,
    status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
    checks,
  };
}

function renderHuman(report) {
  const lines = [`Portable handoff asset verification: ${report.status}`];
  for (const check of report.checks) {
    const count = typeof check.count === "number" ? ` (${check.count})` : "";
    lines.push(`[${check.status}] ${check.id}${count}`);
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const report = verifyPortableHandoff(args.root, { generated: args.generated });
  process.stdout.write(args.json ? `${JSON.stringify(report)}\n` : renderHuman(report));
  return report.status === "PASS" ? 0 : 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
