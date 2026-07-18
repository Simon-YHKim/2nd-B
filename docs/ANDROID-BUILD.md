# Android build and release (APK + AAB)

This repo has two Android build paths:

- **Public release APK + AAB**: EAS-managed signing through
  `.github/workflows/eas-preview-build.yml`.
- **Diagnostic APK**: local Gradle through
  `.github/workflows/android-release.yml`. It remains an Actions artifact and is
  never attached to a public GitHub Release.

Both paths are separate from the web `gh-pages` deploy in `web-deploy.yml`.

## How to trigger

### EAS public release build

Run **EAS Android Build (APK / AAB)** from the Actions tab and select:

- `preview`: install-facing APK, EAS preview channel.
- `production`: Google Play AAB, EAS production channel.

The workflow:

1. restores and validates `google-services.json` from the
   `GOOGLE_SERVICES_JSON_BASE64` repository secret;
2. verifies the OTA/native runtime policy;
3. submits the selected build profile using `EXPO_TOKEN`;
4. prints a stable EAS build ID and build page URL.

EAS uses remote version management, profile-specific channels, and managed
signing. Download the finished APK or AAB from the EAS build page.

For a public version `vX.Y.Z`, attach exactly these two canonical assets to the
matching GitHub Release:

- `2ndB-vX.Y.Z.apk`
- `2ndB-vX.Y.Z.aab`

The APK is the only user-installable file. The AAB is retained beside it for
Google Play Console upload.

### Local Gradle diagnostic build

Run **Android Diagnostic Build (APK)** manually, or let its path-filtered
`main` trigger run after native-relevant changes. It never creates or modifies a
GitHub Release.

## Where the artifacts land

- **EAS release builds**: EAS build page linked in the workflow summary.
- **Local Gradle diagnostics**: workflow artifact
  `2ndb-android-<sha>` with 30-day retention.
- **Public release**: one canonical APK plus one canonical AAB, both from EAS.

## APK (sideload) vs AAB (store)

- **`2ndB-vX.Y.Z.apk`** - sideload / internal testing. Install directly:
  `adb install -r 2ndB-vX.Y.Z.apk`, or copy to the phone and open it (enable
  "install from unknown sources"). This is what you use to test on your own
  Android device right now.
- **`2ndB-vX.Y.Z.aab`** - the Android App Bundle for **Google Play**
  upload. You cannot install an `.aab` directly on a device; Play (or
  `bundletool`) turns it into device-specific APKs.

## Signing & secrets

Canonical APK/AAB release artifacts use EAS-managed signing and require:

| Secret                        | Meaning                                        |
| ----------------------------- | ---------------------------------------------- |
| `EXPO_TOKEN`                  | Non-interactive EAS authentication             |
| `GOOGLE_SERVICES_JSON_BASE64` | Current Android Firebase configuration, base64 |

The diagnostic Gradle workflow can optionally use a stable, separate keystore:

| Secret                      | Meaning                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | base64 of your upload keystore (`.jks`/`.keystore`). Generate locally with `keytool -genkeypair`, then `base64 -w0 my-upload-key.keystore`. |
| `ANDROID_KEYSTORE_PASSWORD` | keystore (store) password                                                                                                                   |
| `ANDROID_KEY_ALIAS`         | key alias inside the keystore                                                                                                               |
| `ANDROID_KEY_PASSWORD`      | key password for that alias                                                                                                                 |

Keep the real keystore file out of git (`*.jks` / `*.keystore` / `*.key` are
already gitignored). Back it up safely — losing your Play upload key is painful
to recover.

## App identity

- `android.package` = `com.simonk.secondbrain` (from `app.json`, unchanged).
- The local Gradle path reads `android.versionCode` from `app.json`. Bump it
  only for diagnostic parity.
- EAS uses `appVersionSource: remote` plus `autoIncrement`; the actual EAS
  version code can differ from `app.json`. Confirm it on the EAS build page
  before publishing or uploading to Play.

## EAS profiles

`eas.json` documents three profiles:
`development` (dev client, internal), `preview` (internal, `android.buildType:
apk`), and `production` (`android.buildType: app-bundle`). Use the secret-backed
GitHub workflow instead of running a release build from a dirty local checkout.
