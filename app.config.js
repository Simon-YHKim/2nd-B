// Dynamic wrapper over the static app.json, which stays the single source of
// truth for every other field. Two overrides, one per platform: the Firebase
// config file may come from an EAS file-type env var (GOOGLE_SERVICES_JSON on
// Android, GOOGLE_SERVICE_INFO_PLIST on iOS) so the real Firebase config never
// enters git. Local dev keeps the gitignored ./google-services.json and
// ./GoogleService-Info.plist fallback paths; without either, prebuild fails
// loudly instead of shipping a half-configured Firebase.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
  ios: {
    ...config.ios,
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? config.ios?.googleServicesFile,
  },
});
