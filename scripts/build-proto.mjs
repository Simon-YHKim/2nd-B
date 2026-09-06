import { createRequire } from "node:module";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { build, transform } = require("esbuild");

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(projectRoot, "public/proto");
const distRoot = resolve(projectRoot, "dist");
const outputRoot = resolve(distRoot, "proto");

const VENDOR_ENTRY = `
import React from "react";
import { createRoot } from "react-dom/client";

globalThis.React = React;
globalThis.ReactDOM = { createRoot };
`;

function assertInside(root, candidate, label) {
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(`${label} escapes its allowed root`);
  }
}

async function assertNoSymlinkSegments(root, candidate, label) {
  assertInside(root, candidate, label);
  const pathFromRoot = relative(root, candidate);
  let cursor = root;

  for (const segment of pathFromRoot.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    try {
      if ((await lstat(cursor)).isSymbolicLink()) {
        throw new Error(`${label} contains a symbolic link`);
      }
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw error;
    }
  }
}

async function prepareRoots() {
  const projectReal = await realpath(projectRoot);
  await assertNoSymlinkSegments(projectRoot, sourceRoot, "proto source path");
  const sourceReal = await realpath(sourceRoot);
  assertInside(projectReal, sourceReal, "proto source path");

  await assertNoSymlinkSegments(projectRoot, outputRoot, "proto output path");
  await mkdir(outputRoot, { recursive: true });
  await assertNoSymlinkSegments(projectRoot, outputRoot, "proto output path");
  const distReal = await realpath(distRoot);
  const outputReal = await realpath(outputRoot);
  assertInside(distReal, outputReal, "proto output path");

  return { sourceReal, outputReal };
}

async function writeVendor(outputReal) {
  const vendorPath = resolve(outputRoot, "vendor.js");
  assertInside(outputReal, vendorPath, "vendor output");
  await assertNoSymlinkSegments(outputRoot, vendorPath, "vendor output");

  const result = await build({
    stdin: {
      contents: VENDOR_ENTRY,
      loader: "js",
      resolveDir: projectRoot,
      sourcefile: "proto-vendor-entry.js",
    },
    bundle: true,
    charset: "utf8",
    define: { "process.env.NODE_ENV": '"production"' },
    format: "iife",
    legalComments: "none",
    minify: true,
    platform: "browser",
    sourcemap: false,
    target: "es2020",
    write: false,
  });
  if (result.outputFiles.length !== 1) {
    throw new Error("proto vendor build produced an unexpected output set");
  }
  await writeFile(vendorPath, result.outputFiles[0].contents);
}

async function compileJsx(sourceReal, outputReal) {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const jsxEntries = entries.filter((entry) => entry.name.endsWith(".jsx")).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
  if (jsxEntries.length === 0) throw new Error("no proto JSX sources found");

  for (const entry of jsxEntries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`unsafe proto source entry: ${entry.name}`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.jsx$/u.test(entry.name)) {
      throw new Error(`invalid proto source name: ${entry.name}`);
    }

    const sourcePath = resolve(sourceRoot, entry.name);
    const sourcePathReal = await realpath(sourcePath);
    assertInside(sourceReal, sourcePathReal, `proto source ${entry.name}`);
    if ((await lstat(sourcePath)).isSymbolicLink()) {
      throw new Error(`unsafe proto source link: ${entry.name}`);
    }

    const outputName = entry.name.replace(/\.jsx$/u, ".js");
    const outputPath = resolve(outputRoot, outputName);
    assertInside(outputReal, outputPath, `proto output ${outputName}`);
    await assertNoSymlinkSegments(outputRoot, outputPath, `proto output ${outputName}`);

    const transformed = await transform(await readFile(sourcePathReal, "utf8"), {
      charset: "utf8",
      format: "iife",
      jsx: "transform",
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment",
      legalComments: "none",
      loader: "jsx",
      minify: false,
      sourcefile: entry.name,
      sourcemap: false,
      target: "es2020",
    });
    if (/\beval\s*\(|\bnew\s+Function\s*\(/u.test(transformed.code)) {
      throw new Error(`unsafe runtime compilation primitive in ${entry.name}`);
    }
    await writeFile(outputPath, transformed.code, "utf8");
  }
}

const roots = await prepareRoots();
await writeVendor(roots.outputReal);
await compileJsx(roots.sourceReal, roots.outputReal);
