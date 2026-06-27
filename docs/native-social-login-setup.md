# Native (phone) social login + analytics — setup & implementation plan

> Decision (2026-06-28, Simon): go **native-SDK** for phone social login (not browser-brokered),
> and do **Sentry native crash capture** (Path B). This doc is the operator runbook + the staged
> code plan. Companion: `docs/AUTH_PROVIDERS.md` (browser-brokered baseline), `docs/sentry-setup.md`
> (Path B detail), `docs/EXTERNAL-API-INTEGRATION.md` (provisioning state).

## Why native-SDK (vs the browser-brokered path already in code)

The shipped flow (`signInWithProvider` in `src/lib/supabase/auth.ts`) is browser-brokered: it opens
the Supabase provider URL in an in-app browser and returns via the `secondbrain://` deep link. That
works on the phone with no client ids, but the UX is a browser bounce. Native-SDK instead gets an
**id_token** on-device and calls `supabase.auth.signInWithIdToken(...)`, which gives the native
account sheet and, for Kakao, **KakaoTalk-app one-tap login** (the expected KR experience).

Both Google and Kakao support this: Supabase `signInWithIdToken` accepts `provider: 'google'` and
`provider: 'kakao'` (Kakao via OIDC). So both use one clean path; no edge-function bridge (unlike
Naver, which stays edge-function based).

## Architecture (target)

```
Google:  GoogleSignin.signIn() -> { idToken }  ->  supabase.auth.signInWithIdToken({ provider:'google', token: idToken, nonce })
Kakao:   @react-native-kakao login() -> { idToken } ->  supabase.auth.signInWithIdToken({ provider:'kakao', token: idToken })
fallback (web, or native build without the SDK): existing browser-brokered signInWithOAuth path
```

Libraries (both free, $0/mo — blueprint §5):
- `@react-native-google-signin/google-signin` (Expo config plugin; `webClientId` = the existing web
  OAuth client as `serverClientId`; `iosUrlScheme` for iOS).
- `@react-native-kakao/core` + `@react-native-kakao/user` (Expo config plugin; takes the Kakao
  **Native App Key**).

---

## PART 1 — Simon console runbook (the critical path; do these first)

Native-SDK needs real console values that only you can mint. None of this is a secret that goes in
git/chat except where noted (Supabase dashboard only).

### 1.1 Get the signing SHA-1 fingerprints

The Android OAuth client and the Kakao key hash are both tied to the app's signing certificate.

- **EAS-managed release keystore** (the real one for preview/production APKs):
  ```bash
  npx eas-cli credentials -p android
  # pick the project -> "Keystore: Manage everything ..." -> shows SHA-1 / SHA-256
  ```
- **Debug keystore** (only if you also run a local dev build):
  ```bash
  keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
  # on Windows: -keystore %USERPROFILE%\.android\debug.keystore
  ```
Record the **SHA-1** (for Google) and you will also derive the **Kakao key hash** (below) from the
same cert.

- **Kakao key hash** from a SHA-1 (Kakao wants the base64 of the SHA-1 bytes):
  ```bash
  # quickest: Kakao console accepts the value produced by
  keytool -exportcert -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android | openssl sha1 -binary | openssl base64
  # for the EAS release cert, export it from `eas credentials` first, then the same openssl pipe.
  ```

### 1.2 Google Cloud — Android OAuth client (project `ornate-hour-217619`, num `699860089424`)

1. APIs & Services -> Credentials -> Create credentials -> OAuth client ID -> **Android**.
2. Package name: `com.simonk.secondbrain`. SHA-1: the **release** SHA-1 from 1.1 (add the debug SHA-1
   too if you do dev builds).
3. Keep the existing **Web** client (`699860089424-4a3q2qgoclj605mj9480vaiqj0116i73...`) — native code
   uses it as `webClientId`/`serverClientId` so the id_token audience matches what Supabase expects.
   (The Android client is matched by package+SHA-1; you do NOT paste its id into the app.)
4. (iOS only, later) Create an **iOS** OAuth client (bundle id `com.simonk.secondbrain`); note its
   `iosUrlScheme` (reversed client id).
5. The Supabase Google provider must list the Web client id under "Authorized Client IDs" (Supabase
   dashboard -> Auth -> Providers -> Google) so it accepts the native id_token. Verify it's there.

### 1.3 Kakao — OIDC + native key + key hash (app `1496341`)

1. Kakao Developers -> your app -> **카카오 로그인 -> OpenID Connect: 활성화 ON** (required — Supabase
   `signInWithIdToken` needs the OIDC id_token).
2. **플랫폼 -> Android**: register package `com.simonk.secondbrain` + the **key hash** from 1.1.
3. **앱 키 -> 네이티브 앱 키** — copy it (this is the value the app's config plugin needs; it is a
   public client key, ok in eas.json/config, NOT a secret).
4. Redirect/scheme: the native SDK uses `kakao{NATIVE_APP_KEY}://oauth` automatically; no manual
   redirect needed for the SDK path. (The browser-brokered fallback still uses the Supabase callback.)
5. Supabase -> Auth -> Providers -> **Kakao**: confirm enabled. If the email scope is not consented,
   turn ON **"Allow users without email"** (otherwise user creation fails). Email scope itself needs
   your Kakao business/identity verification — independent of this native work.

### 1.4 Hand me the values

Public (ok in chat / eas.json): **Kakao Native App Key**, **iOS client id / iosUrlScheme** (if iOS).
Confirm done (no value needed): Google Android client created, Kakao OIDC ON + key hash registered,
Supabase Google "Authorized Client IDs" includes the web client.

---

## PART 2 — Code plan (me; staged PRs, each gated by `npm run verify` + an EAS build before merge)

> Native modules cannot reach the phone via OTA — every stage that adds/changes a native module needs
> an **EAS rebuild**, and per `ANDROID_QA_GUIDELINES.md` these are "native build risk" PRs: each lands
> as its own PR and is **not merged until its EAS build is green**.

### Stage A — native env parity (DONE)

PR #617 mirrored the public web env into `eas.json` (LLM live, `ENABLE_KAKAO`, Sentry DSN, OAuth ids).
This already fixes the phone build running the AI in mock mode and the hidden Kakao button.

### Stage B — Sentry native crash capture (Path B) — UNBLOCKED (no console value needed; DSN exists)

Per `docs/sentry-setup.md` Path B:
1. `npx expo install @sentry/react-native`.
2. `metro.config.js`: wrap with `getSentryExpoConfig` **preserving** the existing
   `unstable_enablePackageExports=false` (Hermes fix), the svg transformer, NativeWind, and the
   `.worktrees` blockList.
3. `app.json` plugins: add `@sentry/react-native/expo` (org/project).
4. Move `Sentry.init` out of the web-only gate in `src/lib/analytics/index.ts` to the app entry
   (`src/app/_layout.tsx`), fired when `EXPO_PUBLIC_SENTRY_DSN` is set; wrap the root export with
   `Sentry.wrap()`. Keep web behavior intact.
5. Verify, open PR, **EAS build must be green before merge**.

### Stage C — native-SDK social login — gated on PART 1 values

1. `npx expo install @react-native-google-signin/google-signin @react-native-kakao/core @react-native-kakao/user`.
2. `app.json` plugins: google-signin (`webClientId` = web client, `iosUrlScheme` if iOS) +
   `@react-native-kakao/core` (Kakao native app key) + `expo-build-properties` (Kakao Android Maven).
3. `src/lib/supabase/auth.ts`: add `signInWithGoogleIdToken(idToken, nonce)` /
   `signInWithKakaoIdToken(idToken)` (thin `signInWithIdToken` wrappers).
4. New `src/lib/auth/native-social.ts`: `nativeSocialSignIn(provider)` — generates the nonce
   (Google: hashed to the SDK, raw to Supabase), calls the SDK, then the wrapper. Lazy `require()` of
   the native modules (so web/jest never load them), returns a sentinel when unavailable so the caller
   falls back to the existing browser path. Gate with `EXPO_PUBLIC_NATIVE_SOCIAL_SDK` (default false).
5. `src/lib/auth/auth-providers.ts`: `startOAuthProvider` tries native first (flag on + module
   present), else browser-brokered. Pure dispatch unit-tested.
6. `eas.json`: add `EXPO_PUBLIC_NATIVE_SOCIAL_SDK=true` + the Kakao native key + (iOS) client to the
   build profiles. The Kakao native key is public; keep it in eas.json. No client **secret** goes
   anywhere but the Supabase dashboard.
7. Verify, PR, **EAS build green + device test (Google + KakaoTalk login)** before merge.

### Stage D — build + verify (Simon)

`eas build -p android --profile preview` (arm64 APK), install on device, confirm: Google native sheet
login, Kakao(Talk) login, the analytics/Sentry events. iOS is a later profile (needs the iOS client +
Sign in with Apple per guideline 4.8).

---

## Guardrails honored

- $0/mo: both auth libs + `@sentry/react-native` are free.
- C1–C12: no LLM/safety path changes; `classifyInput` and the edge-function LLM route are untouched.
- Secrets: only the Supabase dashboard holds provider **secrets**; eas.json carries public client
  ids/keys only (same class as the already-public web bundle values).
- Worktrees under `.worktrees/`, PR-only to main, Conventional Commits, `npm run verify` before push,
  and native PRs hold for a green EAS build.
