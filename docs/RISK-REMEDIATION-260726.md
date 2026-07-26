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
| R9 | anon-callable DEFINER RPCs | **[verified]** `award_xp` + `bump_chat_usage` were anon-EXECUTE (both self-guard on `auth.uid()`; 27 others correct) | `0096` REVOKEs anon on both; `check:definer-grants` lint (in `verify`) blocks the next unrevoked DEFINER RPC | Apply `0096` to prod |
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

1. **[R9] Apply migration 0096 to prod** (`REVOKE EXECUTE ... FROM anon` on `award_xp`,
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

## Verification

`npm run verify` passes on this branch (lint + type-check + i18n + lexicon +
crisis-parity + legal + LLM-boundary + constraints + **check:definer-grants** +
**check:supabase-auth-config** + emdash + anti-anthro + mascot-voice + cycles + jest).
New tests: `usage-bucket-format`, `payment-tier-authority`, `phase2-vendor-stopgap`,
`resolve-jurisdiction`; new lints wired into `verify`.
