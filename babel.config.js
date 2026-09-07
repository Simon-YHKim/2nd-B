// Babel config. Originally created for NativeWind v4 (jsxImportSource +
// nativewind/babel preset); NativeWind was removed 2026-09-05 (audit D4-05)
// because nothing in src used className while its jsx-runtime wrapped every
// jsx() call. The project now relies on babel-preset-expo alone, which still
// auto-includes the reanimated/worklets plugin, so existing behavior is
// preserved.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
