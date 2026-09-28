// Stop Firebase Cloud Messaging from registering the install on first launch.
//
// expo-notifications brings in com.google.firebase:firebase-messaging, and FCM
// auto-init is on by default: at process start it asks Firebase Installations
// for an install id (FID) and requests an FCM token, both of which go to Google
// before the user has agreed to anything. The app only schedules LOCAL
// notifications and never asks for a push token (no getExpoPushTokenAsync /
// getDevicePushTokenAsync anywhere in src), so that registration buys nothing.
// Finding: .bots/analytics/outbox/vb-fcm-autoinit-vc56.result.md (vc56 AAB).
//
// `firebase_messaging_auto_init_enabled=false` is the documented switch. If
// remote push is ever added, turn it back on in code with
// setAutoInitEnabled(true) after consent, not by deleting this plugin.
//
// Android only. The iOS build has no FCM (expo-notifications uses APNs there).
const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

const FCM_AUTO_INIT = "firebase_messaging_auto_init_enabled";

function setFcmAutoInitOff(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, FCM_AUTO_INIT, "false");
  return manifest;
}

module.exports = function withFcmAutoInitOff(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = setFcmAutoInitOff(cfg.modResults);
    return cfg;
  });
};
module.exports.setFcmAutoInitOff = setFcmAutoInitOff;
module.exports.FCM_AUTO_INIT = FCM_AUTO_INIT;
