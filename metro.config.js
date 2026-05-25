// Metro config. Created for NativeWind v4 (withNativeWind wraps Expo's
// default config and wires the global.css entry).
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
