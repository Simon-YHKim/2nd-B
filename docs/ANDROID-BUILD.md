# Android build (APK + AAB) via GitHub Actions

This repo builds Android **locally inside GitHub Actions** (`expo prebuild` ->
local gradle), so you can produce installable artifacts **without an Expo
account / `EXPO_TOKEN`** and without any paid service ($0/mo). EAS cloud build
is kept as a documented secondary path in `eas.json`.

Workflow: `.github/workflows/android-release.yml`. (This is separate from the
web `gh-pages` deploy in `web-deploy.yml`, which is untouched.)

## How to trigger

Two ways:

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

| Secret | Meaning |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of your upload keystore (`.jks`/`.keystore`). Generate locally with `keytool -genkeypair`, then `base64 -w0 my-upload-key.keystore`. |
| `ANDROID_KEYSTORE_PASSWORD` | keystore (store) password |
| `ANDROID_KEY_ALIAS` | key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | key password for that alias |

Keep the real keystore file out of git (`*.jks` / `*.keystore` / `*.key` are
already gitignored). Back it up safely — losing your Play upload key is painful
to recover.

## App identity

- `android.package` = `com.simonk.secondbrain` (from `app.json`, unchanged).
- `android.versionCode` = `1` in `app.json`. Bump this manually for each Play
  upload (Play rejects a re-used versionCode). The EAS `production` profile uses
  `autoIncrement` for the cloud path, but the local gradle path reads the value
  from `app.json`.

## EAS cloud path (secondary, optional)

`eas.json` documents three profiles for when/if an Expo account is set up:
`development` (dev client, internal), `preview` (internal, `android.buildType:
apk`), `production` (`android.buildType: app-bundle`). Run e.g.
`eas build -p android --profile preview`. This requires an Expo login and is not
needed for the GitHub Actions gradle path above.
