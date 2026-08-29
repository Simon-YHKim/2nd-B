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

### Signer identities (measured 2026-08-29 — do not re-measure, read this)

The two paths above sign with **different keys**. Measured from the binaries with
`apksigner verify --print-certs` (build-tools 37.0.0), not inferred:

| Build | Signer DN | Certificate SHA-256 |
| --- | --- | --- |
| EAS release (GitHub Release `v0.6.0`, versionCode 35) | `CN=, OU=, O=, L=, ST=, C=US` — Expo-generated | `0fb37bc076c46bc45a637c04bacfce7613bb0db91eda21b74bce595ad00ce570` |
| Diagnostic Gradle (`android-release.yml`, `ANDROID_KEYSTORE_*`) | `CN=2nd-B, OU=SimonK, O=SimonK, L=Seoul, C=KR` — secrets registered 2026-07-03 KST | `03bcf8faa96a1c1e47188fb032716a7939d4f27042b30f1433eb74b2826fe89a` |

Certificate digests are public (anyone holding the APK can compute them); the
keystores themselves are not. Only the APK was measured; the release AAB was
not on the GitHub Release. The release contract signs APK and AAB with the one
EAS-managed keystore, so the AAB digest is *expected* to equal the APK's — that
is an assertion the preflight below checks, not a second measurement.

Two things the paragraphs above this table can mislead you about: the
`ANDROID_KEYSTORE_*` secrets are **not** the Play upload key — EAS holds that
one (row 1). And "separate" is the measured state, not a plan.

**Standing state: keys stay separate — "(가) 지우고 설치".** Recorded on
2026-08-29 by the CLI session that measured the table, after an order that
listed both "(가)" and "(나-1)"; a confirmation from Simon is still pending.
Consequences that follow from the table, so nobody has to rediscover them:

- **The diagnostic APK is uninstall-first over an EAS install.** Android refuses
  an update whose signer differs (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), so on a
  phone that has build 35 (or any EAS build) you `adb uninstall
  com.simonk.secondbrain` before `adb install` of a diagnostic APK — and the
  other way round. Account data lives in Supabase and survives; anything still
  in the device-only outbox (audit rows not yet delivered, unsynced drafts)
  goes with the uninstall.
- `ANDROID_APK_SIGNER_SHA256` / `ANDROID_AAB_SIGNER_SHA256` (the release signer
  gate in `github-release.yml`, #1465, hardened in #1472) must hold the **EAS**
  digest, `0fb37bc0…ce570`. A secret holding the diagnostic digest fails the
  gate with `apk-signer-mismatch`. `android-signer-preflight.yml` checks both
  secrets against the latest release APK without spending an EAS build.
- `android.versionCode` in `app.json` (40) only feeds the diagnostic path; the
  EAS remote counter was 36 on 2026-08-29. Because the diagnostic APK never
  installs *over* an EAS build under this state, the gap does not matter.

The alternative that was **not** taken, kept so the trade-off is on record:
"(나-1) diagnostic workflow uses the EAS key" — download the EAS keystore
(`eas credentials`), replace the four diagnostic signing secrets
(`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`), rebuild once and confirm `0fb37bc0…` with `apksigner`. It makes install-over work, but
a diagnostic APK at versionCode 40 on the phone would then make EAS builds
37–39 downgrades (an equal versionCode still installs; `eas build:version:set`
to ≥ 40 first), and it copies the Play upload key into a second secret store.
Revisit only if a diagnostic build must land on a tester's phone before the
next EAS build.

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
