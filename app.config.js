// Dynamic wrapper over the static app.json, which stays the single source of
// truth for every other field. Single override: the Android google-services
// file may come from an EAS file-type env var (GOOGLE_SERVICES_JSON) so the
// real Firebase config never enters git. Local dev keeps the gitignored
// ./google-services.json fallback path; without either, Android prebuild
// fails loudly instead of shipping a half-configured Firebase.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
