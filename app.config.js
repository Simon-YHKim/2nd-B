// Dynamic wrapper over the static app.json, which stays the single source of
// truth for every other field. Two overrides, one per platform: the Firebase
// config file may come from an EAS file-type env var (GOOGLE_SERVICES_JSON on
// Android, GOOGLE_SERVICE_INFO_PLIST on iOS) so the real Firebase config never
// enters git. Local dev keeps the gitignored ./google-services.json and
// ./GoogleService-Info.plist fallback paths; without either, prebuild fails
// loudly instead of shipping a half-configured Firebase.
//
// One build-time switch: DIAGNOSTIC_APK=1 (Q-261004-36, 2026-10-04).
// .github/workflows/android-release.yml builds the diagnostic APK with expo
// prebuild + gradle, not EAS, so no eas.json profile injects an update channel.
// That APK used to check u.expo.dev on every launch without the
// expo-channel-name header and got HTTP 400 every time (QA 261004 D-13: 14 of 14
// launches). It must not take an update anyway: it is the same software as
// origin/main at that commit (scripts/app-parity.cjs), and an OTA would make it
// something else. So the fix is to remove the check, not to make it succeed:
// with the switch set, updates.checkAutomatically is "NEVER" (manifest
// EXPO_UPDATES_CHECK_ON_LAUNCH=NEVER). updates.enabled stays as it is, because
// enabled:false turns the build-info footer into "dev" (src/lib/build-info.ts).
// The name is deliberately not EXPO_PUBLIC_*: the value is never inlined into
// the JS bundle and stays out of the app-env-digest (only the resulting
// updates.checkAutomatically field shows up in the embedded app config). It is
// a job-level env in that workflow so prebuild and the gradle step that writes
// the runtime fingerprint both see it. EAS builds never set it and keep checking
// their channel; scripts/__tests__/diagnostic-apk-ota.test.ts guards both sides.
//
// The switch is honoured only inside that workflow. A DIAGNOSTIC_APK=1 left in
// an EAS server env, an `eas build --local` shell or another workflow would
// otherwise ship a user build that never checks for an update (fixes included)
// and carries the diagnostic fingerprint. So "1" anywhere else stops config
// generation instead of applying quietly. The GitHub runner sets
// GITHUB_WORKFLOW_REF for every step, e.g.
// "Simon-YHKim/2nd-B/.github/workflows/android-release.yml@refs/heads/main".
// That workflow has no workflow_call trigger; if it gains one, the caller's ref
// shows up here and the build stops, which is the safe side.
const DIAGNOSTIC_WORKFLOW_REF = /^[^/]+\/[^/]+\/\.github\/workflows\/android-release\.yml@/;

function diagnosticApk() {
  if (process.env.DIAGNOSTIC_APK !== "1") return false;
  const ref = process.env.GITHUB_WORKFLOW_REF ?? "";
  if (!DIAGNOSTIC_WORKFLOW_REF.test(ref)) {
    throw new Error(
      "DIAGNOSTIC_APK=1 turns off OTA update checks and is allowed only in " +
        ".github/workflows/android-release.yml, but GITHUB_WORKFLOW_REF is " +
        (ref ? `"${ref}"` : "unset") +
        ". Unset DIAGNOSTIC_APK for EAS, local and other workflow builds.",
    );
  }
  return true;
}

module.exports = ({ config }) => ({
  ...config,
  ...(diagnosticApk() ? { updates: { ...config.updates, checkAutomatically: "NEVER" } } : {}),
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
  ios: {
    ...config.ios,
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? config.ios?.googleServicesFile,
  },
});
