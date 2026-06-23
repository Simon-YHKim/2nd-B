// Restrict the Android build to a single ABI to shrink the universal preview
// APK. The 148 MB preview APK was bundling all four ABIs (arm64-v8a,
// armeabi-v7a, x86, x86_64) - native libs x4. Building only arm64-v8a (every
// modern phone since ~2015) roughly halves the APK.
//
// This is GATED on the ANDROID_ABI_FILTER env var, which is set ONLY in the
// eas.json `preview` profile. The `production` app-bundle build does not set it,
// so it still compiles every ABI and Play delivers per-device splits (full
// device reach, no size penalty). Local/dev builds are also unaffected.
//
// It edits the `reactNativeArchitectures` gradle property - the documented RN
// lever for which ABIs the build compiles - via withGradleProperties so it
// survives EAS prebuild.
const { withGradleProperties } = require("expo/config-plugins");

const KEY = "reactNativeArchitectures";

module.exports = function withAndroidAbiFilter(config) {
  const abis = process.env.ANDROID_ABI_FILTER;
  if (!abis || abis.trim().length === 0) {
    // No filter requested (production / dev) - leave all ABIs in place.
    return config;
  }
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const existing = props.find((p) => p.type === "property" && p.key === KEY);
    if (existing) {
      existing.value = abis.trim();
    } else {
      props.push({ type: "property", key: KEY, value: abis.trim() });
    }
    return cfg;
  });
};
