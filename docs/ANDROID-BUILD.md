# Android build (APK + AAB) via GitHub Actions

This repo has two Android build paths:

- **Install-facing preview APK**: EAS-managed signing through
  `.github/workflows/eas-preview-build.yml`. Use this to upgrade an existing
  EAS preview install in place.
- **Diagnostic APK + store AAB**: local Gradle inside GitHub Actions through
  `.github/workflows/android-release.yml`.

Both paths are separate from the web `gh-pages` deploy in `web-deploy.yml`.

## How to trigger

### EAS preview APK

Run **EAS Preview Build (APK)** from the Actions tab. The workflow:

1. restores and validates `google-services.json` from the
   `GOOGLE_SERVICES_JSON_BASE64` repository secret;
2. verifies the OTA/native runtime policy;
3. submits an EAS `preview` build using `EXPO_TOKEN`.

The EAS build uses remote version management and EAS-managed signing. Download
the finished APK from the EAS build URL. This is the preferred artifact for
`adb install -r` over an existing EAS preview app.

### Local Gradle APK + AAB

Two trigger options:

1. **Push a tag** matching `v*` (e.g. `v0.0.1`):

   ```bash
   git tag v0.0.1
   git push origin v0.0.1
   ```

   This builds the APK + AAB **and creates a GitHub Release** with both files
   attached.

2. **Manual run** (`workflow_dispatch`): Actions tab -> "Android Release
   (APK + AAB)" -> Run workflow. Leave the `release_tag` input blank to just
   produce downloadable workflow artifacts, or set it (e.g. `v0.0.1`) to also
   cut a GitHub Release.

## Where the artifacts land

- **EAS preview build**: on the EAS build page linked from the workflow log.
  Release-worthy APKs may also be attached to the matching GitHub Release with
  an explicit `eas-vc<versionCode>-preview` filename.
- **Always**: as **workflow artifacts** named `2ndb-android-<sha>` (Actions run
  page -> Artifacts; 30-day retention). Contains `2ndb-<sha>.apk` and
  `2ndb-<sha>.aab`.
- **On a tag (or with a `release_tag` input)**: also attached to a **GitHub
  Release** under the same names.

Download the `.apk` from there to test on a device.

## APK (sideload) vs AAB (store)

- **`2ndb-<sha>.apk`** - sideload / internal testing. Install directly:
  `adb install 2ndb-<sha>.apk`, or copy to the phone and open it (enable
  "install from unknown sources"). This is what you use to test on your own
  Android device right now.
- **`2ndb-<sha>.aab`** - the Android App Bundle for **Google Play store**
  upload. You cannot install an `.aab` directly on a device; Play (or
  `bundletool`) turns it into device-specific APKs.

## Signing & secrets

By default (no secrets set) the workflow generates a **throwaway test
keystore** in CI. That is fine for sideloading the APK and for smoke-testing,
but the resulting **AAB is NOT valid for a real Play store submission** — each
CI run signs with a different ephemeral key, and Play requires a stable upload
key.

For a **real, store-submittable signed build**, add these repository secrets
(Settings -> Secrets and variables -> Actions). When `ANDROID_KEYSTORE_BASE64`
is present, the workflow uses your real keystore automatically:

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
  monotonically before each Play upload because Play rejects a reused or lower
  version code.
- EAS uses `appVersionSource: remote` plus `autoIncrement`; the actual EAS
  version code can therefore differ from `app.json`. Confirm it on the EAS
  build page before publishing or installing.

## EAS profiles

`eas.json` documents three profiles:
`development` (dev client, internal), `preview` (internal, `android.buildType:
apk`), and `production` (`android.buildType: app-bundle`). Prefer the
secret-backed GitHub workflow for preview builds instead of running from a
dirty local checkout.
