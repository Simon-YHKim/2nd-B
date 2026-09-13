# Auth providers — setup guide

> What the app supports and the **operator setup** required to make each provider live.
> Code lives in `src/lib/supabase/auth.ts` (`signInWithProvider` + `signInWithGoogle/Apple/Kakao`)
> and the buttons in `src/app/(auth)/sign-in.tsx` / `sign-up.tsx`. **No client secrets ever go in
> the app bundle** — they live in the Supabase dashboard (built-in providers) or as edge-function
> secrets (Naver).

## Methods at a glance

| Method | Status in code | Supabase-native? | Operator setup needed |
|---|---|---|---|
| Email + password ("ID 가입") | ✅ live | yes | none (auto-confirm trigger 0018) |
| Google | ✅ wired | yes | enable in Supabase + Google Cloud OAuth client |
| **Apple** | ✅ wired (native) | yes | enable in Supabase + Apple Service ID/key |
| **Kakao** | ✅ wired (native) | yes | enable in Supabase + Kakao app keys (legacy `oauth-kakao` edge fn retired) |
| **Naver** | ✅ wired (web-only, edge fn, flag-gated) | **no** | Naver app + migration + secrets + deploy (see below) |

All provider sign-ups route a brand-new user through **`/complete-profile`**, which collects date of
birth (C10 age gate, ≥14) **and** records consent (`recordConsentBestEffort`). So the age floor +
consent ledger apply to social sign-ups too — at the post-redirect step instead of the form.

## Built-in providers (Google / Apple / Kakao)

These providers share one code path (`signInWithOAuth({ provider })`). To enable each:

1. **Supabase dashboard → Authentication → Providers →** toggle the provider on and paste its
   client id + secret.
2. **Authentication → URL Configuration → Redirect URLs:** keep the exact production HTTPS URLs
   declared in `supabase/config.toml`. Native destinations are the two exact
   `auth-bridge.html?to=...` entries; custom schemes, localhost, and production wildcards do not
   belong in this allowlist. Supabase recommends exact production paths rather than wildcards in
   its [redirect URL guidance](https://supabase.com/docs/guides/auth/redirect-urls).
3. Provider-console specifics:
   - **Google:** Google Cloud → OAuth 2.0 Client. Authorized redirect URI =
     `https://<project-ref>.supabase.co/auth/v1/callback`.
   - **Apple:** Apple Developer → Identifiers → Services ID (for web/OAuth) + a Sign in with Apple
     key (.p8). Return URL = the same Supabase callback. Note the App Store guideline (4.8): a native
     iOS build that offers other social logins **must** also offer Sign in with Apple, via
     `expo-apple-authentication` + `supabase.auth.signInWithIdToken` (native path, deferred — see below).
   - **Kakao:** Kakao Developers → app → REST API key = client id; create a client secret; set the
     redirect URI to the Supabase callback. Enable "Kakao Login" + the email scope if you want email.

After enabling, the existing buttons work on **both web and native** with no provider-specific code
change. Native runs the same providers through an in-app browser and the HTTPS bridge described
below, so there are **no Android/iOS-specific OAuth client ids** and no custom-scheme URL is ever
given to Supabase.

## Naver (custom — not a Supabase provider)

Naver is not a Supabase-native provider, so it uses the **`oauth-naver` edge function** (Deno,
service_role). The function exchanges the code, fetches the profile, binds the stable Naver subject
through the private `oauth_naver_identities` mapping, and returns only a Supabase magic-link
`token_hash`. Naver access/refresh tokens and the raw provider subject never leave the function.
For a newly claimed subject, Auth uses a deterministic `@naver.invalid` HMAC alias; an unproved
provider profile email is never promoted to a confirmed Auth identifier or recovery path.
The client side is wired in `src/lib/supabase/auth.ts`:

- `signInWithNaver()` asks the server to rate-limit the request and issue a 256-bit `state`.
  SQL stores only an HMAC fingerprint with a fixed ten-minute TTL; the client stores the opaque
  state plus its exact redirect URI in `sessionStorage`.
- Naver returns to **`/oauth-callback`** (`src/app/(auth)/oauth-callback.tsx`), which calls
  `completeNaverOAuth()`. The client consumes its transaction once; the server then atomically
  consumes the matching live state before any Naver request and claims the provider subject before
  any Auth user creation. The client accepts only the bounded magic-link token and calls
  `verifyOtp({ token_hash, type: 'magiclink' })` inside the Auth v2 mutation/quarantine boundary.
  New users land on `/complete-profile` (DOB + consent) like every provider.

**Off by default** behind two layers, so nothing shows or runs until the operator opts in:

1. **Database:** apply migration `0183_oauth_naver_rate_limit.sql`, then reserve a real migration
   number for `db/migration-drafts/UNNUMBERED_oauth_naver_rate_limit_completion.sql`, review/apply
   that forward migration, and verify both postconditions. The completion migration removes the
   attacker-cardinality state ledger, adds global/peer/subject quotas, bounds request-path cleanup,
   and narrows the durable state redirect to the one production HTTPS callback. The function fails
   closed while any service-only limiter, state, or identity RPC is absent.
2. **Edge function, still disabled:** set `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, and a stable random
   `NAVER_OAUTH_HMAC_PEPPER` of at least 32 bytes as `oauth-naver` secrets. Register an exact
   `https://simon-yhkim.github.io/2nd-B/oauth-callback` redirect in the Naver console; localhost and
   custom-scheme callbacks are not accepted. Deploy with `verify_jwt=false` (this is a rate-limited
   pre-auth endpoint) and validate only disabled/error behavior while `ENABLE_NAVER_OAUTH=false`.
3. **Server gate:** after the DB postflight, exact console callback, secret-name inventory, and Edge
   disabled smoke all pass, set `ENABLE_NAVER_OAUTH=true` and run a bounded web canary.
4. **Client flags last:** only after the server canary, set `EXPO_PUBLIC_NAVER_CLIENT_ID` (the public
   REST client id) and `EXPO_PUBLIC_ENABLE_NAVER=true`; only then does the Naver button render.

The Naver API contract used here has no documented PKCE parameters. Therefore Naver stays
**web-only**: native start/completion and the former custom-scheme bridge fail before Edge exchange.
Do not enable the button in a native release unless Naver supplies a standards-compatible
code-binding mechanism and that flow receives a separate security review.

Before activation, inventory any historical Naver-created Auth users separately. Existing real-email
users and pre-0183 metadata identities need an explicit reconciliation/backfill decision; the stable
HMAC pepper must not rotate without migrating the private subject mapping.

> The legacy **`oauth-kakao` edge function was retired** — Kakao is now a Supabase-native provider
> (`signInWithOAuth({ provider: 'kakao' })`), so it follows the built-in path above, no edge function.

## Native Supabase providers (Expo iOS/Android) — implemented

> The earlier "deferred" note is obsolete: the native path is **already implemented and shipped**.
> `signInWithProvider` (`src/lib/supabase/auth.ts`) detects the runtime and, on native, opens the
> Supabase provider URL with `expo-web-browser`. Supabase first returns to a fixed production HTTPS
> bridge; that page forwards only a bounded one-time PKCE code to the app. The app exchanges it with
> `exchangeCodeForSession`. URL bearer tokens are rejected and never passed to `setSession`.

Because OAuth is **brokered by Supabase** (not the native Google/Kakao SDKs), native reuses the same
provider config as web. There is **no separate Android/iOS OAuth client id** to register, and
**nothing provider-secret is ever bundled**. The pieces already in place:

- `app.json` → `scheme: "secondbrain"` + the Android `intentFilter` (VIEW / BROWSABLE / DEFAULT) for
  the `secondbrain` scheme. This is the final browser-to-app hop only; it is not a Supabase redirect.
- `authRedirectTo()` gives Supabase one of the two exact production HTTPS bridge URLs under
  `https://simon-yhkim.github.io/2nd-B/`.
- `openAuthSessionAsync(authUrl, Linking.createURL("/"))` separately waits for the app deep link, as
  required by Expo's
  [`openAuthSessionAsync` contract](https://docs.expo.dev/versions/latest/sdk/webbrowser/).
- `public/auth-bridge.html` immediately removes callback parameters from browser history, rejects
  access/refresh/provider/id tokens, and forwards only a bounded `code` (or safe `error_code`) to
  the ordinary or password-reset app route. It has no external resources and uses a hash-pinned
  strict CSP.
- `src/lib/supabase/client.ts` pins `flowType: "pkce"`; the intercepted code alone cannot create a
  session without the verifier retained by the requesting app. See Supabase's
  [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
- `expo-web-browser` + `expo-linking` are already native dependencies, so the JS flow ships over
  **OTA** (`eas update`) — no rebuild needed to change or fix the OAuth *code*.

### Make phone login go live (per provider)

1. Enable the provider in Supabase + (for Kakao) its console — the **same** built-in steps above.
2. Deploy `public/auth-bridge.html` to the existing GitHub Pages origin, then confirm the exact two
   bridge URLs in `supabase/config.toml` are the only native entries in Supabase Redirect URLs.
   Do not add the app scheme or localhost as a fallback: another app can claim the same private-use
   scheme, whereas an intercepted PKCE code is not useful without the requesting app's verifier.
3. Make sure the button renders in the native build. Visibility is the build-time flag in
   `src/lib/env.ts`: `EXPO_PUBLIC_ENABLE_GOOGLE` defaults **true** (Google shows by default);
   `EXPO_PUBLIC_ENABLE_KAKAO`/`_APPLE`/`_FACEBOOK`/`_GITHUB` default **false**. To show a default-off
   provider on the phone, set its flag to `"true"` in the relevant `eas.json` build profile `env`
   (native reads `eas.json`, **not** the web-deploy GitHub Variables), then rebuild — or inject it in
   `eas-update.yml` and OTA. Only flip a flag **after** that provider is live in Supabase, or the
   phone shows a dead button.
4. Ship: OTA the JS (`[ota]`/`[release]` marker or the manual "EAS Update" workflow) if only code/JS
   changed; rebuild the APK only if a native flag/config (`app.json`, a new native dep, an `eas.json`
   env baked at build time) changed.

For local web development, use an isolated local/non-production Supabase project with its own exact
development callback, or exercise the deployed production bridge. Never temporarily add localhost,
custom schemes, or wildcards to the production allowlist and never push a partial `[auth]` config.

### Email confirmation and recovery

- Sign-up and recovery mail templates are code-only. They do not contain classic implicit links.
- Sign-up verifies the entered OTP with `type: "signup"`; recovery verifies with
  `type: "recovery"`. A PKCE `code` callback remains supported for social OAuth and any separately
  reviewed HTTPS link flow.
- Any callback containing `access_token`, `refresh_token`, or provider bearer tokens fails closed.
  Do not restore an implicit-token fallback for older clients.

### iOS Sign in with Apple (still deferred)

App Store guideline 4.8: a native iOS build offering other social logins **must** also offer Sign in
with Apple, via `expo-apple-authentication` (native sheet) + `signInWithIdToken({ provider: 'apple' })`.
That native-sheet path is the one remaining unimplemented piece; the browser-brokered Apple button
works the same as the others once enabled in Supabase.

## Security notes

- Client secrets: **only** in the Supabase dashboard (built-in) or edge-function secrets (Naver).
  Nothing provider-secret belongs in `EXPO_PUBLIC_*` (those are inlined into the public bundle).
- The age gate (≥14) is enforced server-side by the `0030` trigger regardless of provider, and the
  client `/complete-profile` step is the second line.
