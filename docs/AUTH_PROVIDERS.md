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
| **Apple** | ✅ wired (this PR) | yes | enable in Supabase + Apple Service ID/key |
| **Kakao** | ✅ wired (this PR) | yes | enable in Supabase + Kakao app keys |
| **Naver** | ⛔ not built (custom) | **no** | edge function + Naver app (see below) |

All provider sign-ups route a brand-new user through **`/complete-profile`**, which collects date of
birth (C10 age gate, ≥14) **and** records consent (`recordConsentBestEffort`). So the age floor +
consent ledger apply to social sign-ups too — at the post-redirect step instead of the form.

## Built-in providers (Google / Apple / Kakao)

These three share one code path (`signInWithOAuth({ provider })`, web redirect). To enable each:

1. **Supabase dashboard → Authentication → Providers →** toggle the provider on and paste its
   client id + secret.
2. **Authentication → URL Configuration → Redirect URLs:** add every origin the web app runs on:
   - `https://simon-yhkim.github.io/2nd-B/` (prod web)
   - `http://localhost:8081/` (Expo web dev)
   - native deep link later (see "Native" below).
3. Provider-console specifics:
   - **Google:** Google Cloud → OAuth 2.0 Client. Authorized redirect URI =
     `https://<project-ref>.supabase.co/auth/v1/callback`.
   - **Apple:** Apple Developer → Identifiers → Services ID (for web/OAuth) + a Sign in with Apple
     key (.p8). Return URL = the same Supabase callback. Note the App Store guideline (4.8): a native
     iOS build that offers other social logins **must** also offer Sign in with Apple, via
     `expo-apple-authentication` + `supabase.auth.signInWithIdToken` (native path, deferred — see below).
   - **Kakao:** Kakao Developers → app → REST API key = client id; create a client secret; set the
     redirect URI to the Supabase callback. Enable "Kakao Login" + the email scope if you want email.

After enabling, the existing buttons work on the web build with no code change.

## Naver (custom — not a Supabase provider)

Naver is not in Supabase's built-in provider list and does not issue a Supabase-compatible OIDC
id_token, so it needs a small **edge function** + client OAuth start. Plan (build when the Naver app
credentials exist):

1. **Naver Developers** → register an application → get `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`,
   set the callback URL to the app's redirect.
2. **Client:** start the OAuth with `expo-auth-session` (Naver authorize URL + state); on return,
   send the `code` + `state` to the edge function.
3. **Edge function `naver-oauth`** (Deno, service_role): exchange `code` → Naver access token →
   fetch the Naver profile (id/email) → find-or-create the Supabase user via the **admin API**, then
   return a session (e.g. `admin.generateLink`/`generateLink('magiclink')` or a signed session). Store
   `NAVER_CLIENT_ID/SECRET` as **edge-function secrets**, never in the client.
4. Add a `signInWithNaver()` client helper that drives steps 2–3, plus the button (gated on an
   `EXPO_PUBLIC_ENABLE_NAVER` flag so it only shows once the function is deployed).

This keeps the Naver secret server-side and reuses the same `/complete-profile` age/consent gate.

## Native (Expo) — deferred, same as the original Google path

The current helpers do the **web** redirect only. For native iOS/Android builds:

- Add a deep-link `scheme` in `app.json` and allow it in Supabase Redirect URLs.
- Open `data.url` from `signInWithProvider` via `expo-web-browser`'s `openAuthSessionAsync`, then
  parse the returned URL for the session (or use `signInWithIdToken` for Apple/Google/Kakao where an
  id_token is available natively).
- iOS Apple: use `expo-apple-authentication` (native sheet) + `signInWithIdToken({ provider: 'apple' })`.

## Security notes

- Client secrets: **only** in the Supabase dashboard (built-in) or edge-function secrets (Naver).
  Nothing provider-secret belongs in `EXPO_PUBLIC_*` (those are inlined into the public bundle).
- The age gate (≥14) is enforced server-side by the `0030` trigger regardless of provider, and the
  client `/complete-profile` step is the second line.
