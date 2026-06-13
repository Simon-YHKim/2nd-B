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

const finalConfig = withNativeWind(config, { input: "./global.css" });

// Native (iOS/Android) standalone bundles must resolve the CommonJS ("require")
// package export, not the ESM ("import") one. Some deps (e.g. @supabase/supabase-js'
// optional OpenTelemetry loader) ship an .mjs variant that does
// `import(/* webpackIgnore */ SOME_VAR)` — a dynamic import of a runtime variable.
// Metro can't statically transform that, so it survives into main.jsbundle, and
// Hermes' bytecode compiler then fails with "Invalid expression encountered".
// Their .cjs variant uses `require(s)` instead, which is Hermes-safe (a plain call).
// Forcing the "require" condition for non-web platforms picks the CJS variant across
// all such packages at once. Web resolution is left untouched (preview keeps working).
const baseResolveRequest = finalConfig.resolver.resolveRequest;
finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  const ctx =
    platform === "web"
      ? context
      : { ...context, unstable_conditionNames: ["require", "react-native", "default"] };
  return baseResolveRequest
    ? baseResolveRequest(ctx, moduleName, platform)
    : ctx.resolveRequest(ctx, moduleName, platform);
};

module.exports = finalConfig;
