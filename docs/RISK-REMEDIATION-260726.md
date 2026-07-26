# Risk remediation — 2026-07-26

Branch `claude/risk-hardening-260726`. Addresses the 12 top risks surfaced by the
codebase-atlas review. Each item was **verified against prod** (Supabase MCP) before
acting, so several "risks" shrank to doc/test reconciliation rather than live bugs.
Claims are labelled **[verified]** (checked against prod/code) vs **[inferred]**.

Nothing here was applied to prod. DB migrations are files only; the owner applies via
Supabase MCP. No merge to main — this ships as a draft PR for review.

## Summary table

| # | Risk | Prod finding | What changed (this branch) | Owner action remaining |
|---|------|--------------|----------------------------|------------------------|
| R9 | anon-callable DEFINER RPCs | **[verified]** `award_xp` + `bump_chat_usage` were anon-EXECUTE (both self-guard on `auth.uid()`; 27 others correct) | `0098` REVOKEs anon on both; `check:definer-grants` lint (in `verify`) blocks the next unrevoked DEFINER RPC | Apply `0098` to prod |
| R4 | crisis-lexicon 4-copy drift | **[verified]** already covered | none — `crisis-terms-proxy-parity.test.ts` (3 copies) + `check:crisis-parity` (safety.ts markers) already in `verify` | none |
| R12 | cap-table / bucket-format divergence | **[verified]** already pinned SQL↔TS; TS bucket fns untested | `usage-bucket-format.test.ts` pins `weekBucket()/monthBucket()` incl. ISO week-year boundary | none |
| R7 | retention purge repo≠prod | **[verified]** all 6 purge jobs ACTIVE on pg_cron (nightly 04:00 UTC); `0067` activates them | corrected the misread: pointer note on the 0056 test; broadened lint regex | none |
| R8 | LLM live in prod? | **[verified]** `runtime_flags`: `llm_enabled/analytics_enabled/clarity_enabled` all true | memory updated (server kill-switches ON) | — see R6 ① below (client routing) |
| R3 | payment rail reconciliation | **[verified]** gating reads DB tier only; RevenueCat `isPro` was optimistic plans-screen display | `refreshTier()` after purchase/restore; `payment-tier-authority.test.ts` pins DB-as-authority | Wire RevenueCat→revenue_events webhook BEFORE setting RevenueCat keys (`TODO(IAP-webhook)`) |
| R5 | Layer-2 classifier dark | **[verified]** warns once/session; restore path flag-gated | now also writes a queryable degraded health row (`model_used='lexicon-only'`) | Enable server-side `safety_classify` (needs crisis eval set + safety-owner sign-off) |
| R6 | Phase-2 OpenAI stopgap | **[verified]** revert switch exists; vendor audited | `phase2-vendor-stopgap.test.ts` pins the stopgap + verifies the revert; routing.ts note | ① flip repo Variable `EXPO_PUBLIC_REASONING_PROVIDER=gemini` (web); KO-prose eval before any Claude return |
| R2 | jurisdiction hardcoded KR | **[verified]** matrix seam existed; callers passed literal "KR" | `resolveJurisdiction()` seam (default KR, unchanged); both callers updated | Thread a real country signal + legal sign-off before non-KR launch |
| R1 | overseas-transfer withdrawal | **[verified]** D6 gate OFF; grant-only read misses withdrawal | parity NOTE at all 3 proxies + recommended effective-consent formula | **Legal/data-model decision** (which prefs = overseas consent) + make the read withdrawal-aware BEFORE enabling `LLM_REQUIRE_CONSENT` |
| R11 | config.toml partial-push reset | **[verified]** file well-documented; no guard | `check:supabase-auth-config` (in `verify`) pins prod site_url / Confirm-Email on / vector off | Re-enable Apple provider in the dashboard, then declare it in config.toml |
| R10 | stale/unwired sprawl | **[verified]** graph.tsx doc/comment wrong; types.gen stale | fixed graph.tsx drift (doc ×2 + index.tsx); flagged types.gen with regen command | Regen types.gen.ts in its own PR; `/core-brain` 소울 코어→북극성 canon rename |

## Owner action checklist (nothing below was done automatically)

1. **[R9] Apply migration 0098 to prod** (`REVOKE EXECUTE ... FROM anon` on `award_xp`,
   `bump_chat_usage`). Safe: both self-guard on `auth.uid()`, `authenticated` retains
   EXECUTE, clients call as authenticated.
2. **[R1] Legal + data-model decision** on overseas-transfer withdrawal, THEN make the
   D6 proxy gate withdrawal-aware, THEN (only then) enable `LLM_REQUIRE_CONSENT`.
   Formula proposed in the proxy NOTEs: `effective = latest consent_records grant AND
   the driving external-processing pref still ON (no later consent_changes revoke)`.
3. **[R3] Wire the RevenueCat→revenue_events webhook** (`TODO(IAP-webhook)` in
   `src/lib/payments/purchases.ts`) before setting `EXPO_PUBLIC_REVENUECAT_*` keys, or
   a store purchase leaves the DB tier (and every gate) at free.
4. **[R2] Country signal + legal sign-off** before serving any non-KR market on its own
   age floor (`EXPO_PUBLIC_JURISDICTION` is a QA override, not a geo rollout).
5. **[R6] Flip repo Variable** `EXPO_PUBLIC_REASONING_PROVIDER=gemini` (web); run a
   KO-prose eval on the OpenAI seat before any return to Claude (post-deadline per prior
   handoff).
6. **[R5] Crisis eval set + safety-owner sign-off** to enable server-side
   `safety_classify` (`EXPO_PUBLIC_SERVER_SAFETY`), restoring the Layer-2 semantic
   classifier on keyless/web builds.
7. **[R11] Re-enable the Apple OAuth provider** in the Supabase dashboard, then declare
   `[auth.external.apple]` in config.toml (secret via `env()`) so a push can't kill it.
8. **[R10] Regenerate types.gen.ts** in a standalone PR; do the `/core-brain` canon
   rename (소울 코어 → 북극성) across the screen + i18n, not just the back chip.

## Deep-hunt findings (wave 2, 2026-07-26)

A deeper adversarial code hunt (8 slices, each finding verified by a skeptic set to
default-refute) surfaced 11 CONFIRMED defects the breadth review missed (2 false
positives were correctly refuted). All fixed on this branch except where noted.

| # | Sev | Risk | Fix (this branch) | Owner action |
|---|-----|------|-------------------|--------------|
| F11 | high | NFC (not NFKC) let full-width Latin crisis terms bypass RED on the lexicon-only path | NFKC in all 3 crisis matchers + test | none |
| F2 | high | es/pt/id shipped machine-translated crisis (safety) + consent (PIPA) copy despite the EN-only gate | overwrote the 6 files with EN + `check:safety-consent-locale` CI gate | (optional) human-reviewed translations later |
| F9 | med | edge-path crisis output-swap wrote no ai_audit_log row (C3 gap) | swap row always written at all 3 sites | none |
| F3 | med | audit outbox evicted crisis evidence first on overflow (C3) | crisis/RED entries preserved past the bound + test | none |
| F4 | med | transient profile-probe failure ejected a registered user to /complete-profile (DOB + consent re-entry) | probeFailed hold in IntroGate + both home shells + complete-profile | other feature screens keep plain guard (deep-link-during-blip only) — follow-up |
| F5 | med | minor health-data lock had no server backstop (health_samples RLS owner-only) | migration `0100` trigger (mirrors 0094) + test | apply `0100` to prod |
| F6 | med | gemini-proxy gated premium on RAW tier (expired subscriber kept brain LLM; judge 403'd) | both paths use effective_subscription_tier RPC | Deno edge fn — verify on next deploy |
| F7 | med | minor comms/location import lock bypassable via content-sniff through a non-locked tile | runAnalyze re-checks the DETECTED kind vs MINOR_LOCKED_KINDS | server tag+trigger backstop (like 0094) — follow-up |
| F8 | med | a persona rebuild regressed a user-ratified L5 (dropped brightness + phantom "down" nudge) | loadStandingRatifiedTiers + max(deterministic, ratified) in build + read paths + test | none |
| F10 | low | client tier was expiry-blind (lapsed user kept paid personas) | useProgression collapses expired→free | none |
| F1 | high* | import withdrawal left ops_ledger + relation_people rows despite "완전 제거" copy (false PIPA right-to-delete) | INTERIM: corrected the copy (delete removes the source; people/ledger removed in their own screens) | FULL FIX: track CREATED ledger/person ids per import + delete them on withdrawal (created-vs-updated subtlety) — its own reviewed PR |

Refuted (correctly, by the verifier): a claim that useProgression skips latest-wins
(it does not) and a claim that the northstar reasoning cap fails open (it does not).

New owner actions from wave 2 (append to the checklist above):
9. **[F5] Apply migration 0100 to prod** (minor health_samples backstop trigger).
10. **[F6] Redeploy gemini-proxy** and verify the effective-tier gate (Deno fn, not in the app tsc/jest).
11. **[F1] Full withdrawal fix** — track + delete the CREATED ops_ledger / relation_people rows per import (not updated ones); its own PR.
12. **[F7] Server backstop** for import-origin sources (tag on ratify + a minor-reject trigger, analogous to 0094/0100); **[F4]** extend the profileProbeFailed hold to the remaining feature screens.

## Verification

`npm run verify` passes on this branch, origin/main merged in: **400 test suites /
3093 tests**, tsc clean, 0 require cycles, all lints incl. the three new ones
(**check:definer-grants**, **check:supabase-auth-config**, **check:safety-consent-locale**).
New tests: `usage-bucket-format`, `payment-tier-authority`, `phase2-vendor-stopgap`,
`resolve-jurisdiction` (12-risk wave) + `nfkc-normalization`, `audit-outbox-bound`,
`health-minor-backstop-migration`, `star-levels-ratified` (deep-hunt wave).
