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

module.exports = withNativeWind(config, { input: "./global.css" });
