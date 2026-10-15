# Optional device authentication native checks

Run from the repository root (Python 3, Git and Java required; checked with OpenJDK 21):

```sh
python3 scripts/native-device-auth/run.py
# Or one check:
bash scripts/native-device-auth/compile-api.sh
bash scripts/native-device-auth/run-runtime.sh
```

The runner downloads **pinned public artifacts**, verifies every SHA256 in
[`artifacts.json`](./artifacts.json), copies the original Expo 56.0.5 package to a
fresh system temporary directory and applies the checked-in native patch there.
It never installs packages or modifies the repository/shared `node_modules`.
All jars, SDK files, patched copies, build outputs and logs stay in that temporary
directory, which is deleted on exit. Add `--keep-temp` to inspect them afterwards.
Do not commit these binary/cache/output files.

To reuse existing downloads without network access, supply read-only artifact
directories (repeatable). Filenames must match `artifacts.json`; hashes are still
checked. A bad cached hash fails instead of silently downloading a replacement.

```sh
python3 scripts/native-device-auth/run.py --offline \
  --artifact-dir /path/to/compiler-artifacts \
  --artifact-dir /path/to/android-and-expo-artifacts
```

Pins: Kotlin compiler 2.1.20 and its declared dependencies (Maven Central),
Android SDK Platform 36 revision 2 (Google), AndroidX biometric 1.2.0-alpha04 and
annotation-jvm 1.9.1 (Google Maven), Expo local authentication 56.0.5 (npm registry).
The exact URLs and SHA256 values are in the manifest. The SDK archive also matches
Google repository metadata SHA1 `2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576`.
The runner makes public artifact downloads only; it calls no app/backend/model.
A full fresh run downloads about 130 MB. `--mode runtime` skips SDK/biometric downloads.

- **API compile:** all patched Kotlin sources compile against the real Android
  API 36 jar and real AndroidX biometric binary. `module-api-stubs/` supplies only
  Expo Module DSL/Promise/record bindings; this does not compile Expo's bridge,
  Gradle build, manifest merge, DEX/R8 output, or an APK.
- **Runtime:** the actual patched request registry and Activity run against the
  controlled Android adapters in `runtime/`. The 19 cases cover late/duplicate
  results, cancellation before creation, owner changes, destruction/recreation,
  PIN-only devices, launch exceptions, API 26 background cancellation and allowed
  authenticator policy. API 29 exercises crypto **setup failure** and PIN fallback
  without a weak downgrade; it has no real AndroidKeyStore provider.
- These checks do **not** validate sensors, successful hardware crypto, vendor
  Keyguard cancellation, actual crisis UI visibility, Activity/AppState ordering,
  phone accessibility/presentation, or iOS/Xcode. Independent review and native
  build/device testing remain necessary before activation.

This is an optional reproduction command. It is not added to `npm run verify` or
CI; passing the normal repository gate therefore does not imply these native
checks ran. The runner prints the exact patch SHA256 under test.
