// Babel config. Created for NativeWind v4 — the project previously relied on
// Expo's implicit default preset. babel-preset-expo still auto-includes the
// reanimated/worklets plugin, so existing behavior is preserved.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
