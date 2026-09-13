# Auth session mutation boundary

The app pins `@supabase/supabase-js` and the directly imported
`@supabase/auth-js` to `2.106.1`. Both packages are MIT licensed, add no paid
service, and keep the existing $0/month dependency cost.

## Two-lock contract

- **M (app mutation lock):** every app path that can create, replace, or remove
  an auth session or PKCE verifier runs here. Web uses a strict standard
  `navigator.locks.request(..., { mode: "exclusive" })` with no timeout or
  steal; native and browsers without working Web Locks use
  `processLock(..., -1)` for ordinary auth. Destructive expected-owner
  operations fail closed on web when a real exclusive Lock object is not
  obtained. This intentionally rejects auth-js 2.106.1's compatibility behavior
  that runs a callback unlocked when a non-compliant manager returns `null`.
- **S (SDK storage lock):** auth-js receives a lock function that always uses
  the same no-timeout policy. The SDK lock waits for the one-time migration
  barrier before acquiring S. App operations therefore follow M -> S; SDK
  initialization and background refresh use S alone.
- Background initialize/refresh may rotate a token for the current
  `user_id`/`session_id`, or remove an invalid session. With
  `detectSessionInUrl: false`, it cannot introduce a callback identity. Web and
  native callback exchange is explicit and runs under M.
- Recovery proof/pending writes also enter M. Every new pending marker carries
  a cryptographically random owner nonce; legacy `issuedAt`-only markers remain
  locked and can be removed only by exact compare-and-swap. Cleanup that
  originated from recovery A therefore cannot remove a newer B pending marker
  or proof. A newly published proof records the same nonce, so restart cleanup
  may remove a pending marker only when both came from one transaction.
  Callback cleanup carries its expected session owner in a private
  in-memory `WeakMap`, so access/refresh tokens never enter marker storage.
- Recovery `verifyOtp`, native reset callback consumption, durable proof write,
  and removal of that operation's own pending marker form one M-serialized
  critical section. If proof persistence fails, the facade signs out only the
  returned session. If auth-js cannot complete that local sign-out, the pending
  marker deliberately survives so restart remains recovery-locked.

Auth-js 2.106.1 does not acquire S inside `signUp`, `signInAnonymously`,
`signInWithPassword`, `signInWithOtp`, `signInWithOAuth`,
`signInWithIdToken`, `signInWithSSO`, `signInWithWeb3`, `verifyOtp`,
`linkIdentity`, `unlinkIdentity`, or `resetPasswordForEmail`; those methods can
save a session/verifier or read a session while writing identity state. The
facade therefore takes S explicitly around only that reviewed set while M is
held. Methods such as `exchangeCodeForSession`, `setSession`, `updateUser`,
`refreshSession`, `reauthenticate`, and `signOut` already take S and must not be
wrapped again. The source-boundary test pins this classification so an SDK
upgrade cannot silently reopen the background-refresh race or introduce a
non-reentrant double-S deadlock.

## Storage revision and migration

The SDK default `sb-<project>-auth-token` namespace is v1. The main client uses
the separate `...-v2` primary, code-verifier, user, SDK-lock, and broadcast
namespace. Before S can run, M copies missing v1 bundle members, removes the v1
bundle, and migrates the app's recovery-proof/pending markers to their v2 keys,
then writes a durable migration tombstone last. Public sign-out removes the
auth bundle but not that tombstone, so a late auth or recovery-marker write by
an already-open v1 tab is never imported or observed after restart.

`Storage` and `AsyncStorage` expose no multi-key transaction, and a live v1 tab
does not know M. Consequently, the migration instant cannot be an atomic
three-key snapshot against that old tab. The supported guarantee begins when
the tombstone is committed; this limit is covered by a regression test.

## Pinned auth-js behavior

The owner-bound clear depends on the reviewed `2.106.1` public `signOut` order:
`_signOut` uses the session loaded under S, performs the logout request, then
calls `_removeSession`; `_removeSession` removes primary, code-verifier, and
user storage before awaiting the `SIGNED_OUT` notification. An SDK upgrade must
re-run the real-GoTrue contract tests before either exact pin changes.

No raw access/refresh token is persisted outside auth-js, included in errors,
or logged. The short-lived expected-owner value remains in memory only.
The pending owner nonce is not a credential and is safe to persist; it exists
only to make marker removal an exact operation-level compare-and-swap.
