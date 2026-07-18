// Metro config. NativeWind v4 (withNativeWind wires the global.css entry) +
// react-native-svg-transformer (import *.svg as React components, web + native).
//
// The svg babelTransformerPath is set BEFORE withNativeWind. NativeWind v4's
// metro integration does not override babelTransformerPath, and
// react-native-svg-transformer/expo extends babel-preset-expo's transformer, so
// the two chain cleanly. svg is moved from assetExts → sourceExts so an
// `import './x.svg'` resolves to a component instead of an image asset.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve("react-native-svg-transformer/expo");
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

// Disable package "exports" map resolution. Several deps (@supabase/supabase-js' OTEL
// loader, pdfjs-dist' fake-worker loader) expose ESM variants via their exports map that
// use dynamic import() of a RUNTIME value (import(OTEL_PKG), import(this.workerSrc)).
// Metro can't statically transform a non-literal import(), so it survives into
// main.jsbundle and Hermes' bytecode compiler fails with "Invalid expression encountered".
// Falling back to the legacy main/react-native/browser fields resolves the CJS/UMD builds
// (require-based), which Hermes accepts. This fixes all such packages at once.
config.resolver.unstable_enablePackageExports = false;

// Nested git worktrees (.worktrees/<branch>) are full repo copies. Keep Metro from
// crawling them, or the haste map collides on duplicate module names + the watch
// set balloons. (Team rule: all 2ndB worktrees live under .worktrees/.)
//
// Anchored to THIS project root's own .worktrees dir (2026-07-18): the old bare
// /[\\/]\.worktrees[\\/]/ pattern matched the ABSOLUTE path of every file when
// Metro itself ran inside a worktree checkout (the project path contains
// .worktrees), which blocked the project's own node_modules and 404'd the
// entry bundle. Anchoring keeps the fleet-copy exclusion in the canonical
// checkout and makes worktree-local Metro (emulator QA flows) work unchanged.
const escapeForRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [
  new RegExp(`^${escapeForRegExp(require("path").join(__dirname, ".worktrees"))}[\\\\/].*`),
  // Never bundle tests into the app. expo-router globs src/app via require.context,
  // so a *.test.* / __tests__ file there pulls in node:* builtins that Hermes can't
  // resolve and breaks the native / OTA export (see .github/workflows/eas-update.yml).
  // jest uses ts-jest (not Metro), so this exclusion does not affect the test run.
  /[\\/]__tests__[\\/]/,
  /\.(test|spec)\.[jt]sx?$/,
];

module.exports = withNativeWind(config, { input: "./global.css" });
