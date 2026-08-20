# Hard Constraints (C1~C12)

This document defines the project's non-negotiable rules. The blueprint
calls them "강제 조항." They are enforced at code, schema, and CI layers.

## Vocabulary policy

The blueprint's category positioning requires we avoid certain terms in
product surfaces (UI, docs, code comments, schema comments). The
forbidden lexicon lives in `src/lib/safety/lexicon.ts` (single source of
truth) and is enforced by `scripts/check-forbidden-lexicon.ts`.

The English forbidden list includes (in this document only, for
reference): the words for clinical states, therapy, counseling,
diagnosis, treatment, healing, cure. The Korean list includes the
equivalents commonly used in clinical contexts. User-facing copy uses
"self-understanding," "growth," "self-knowledge," "reflection" instead.

## C1 — Single LLM wrapper

All LLM calls route through `src/lib/llm/boundary.ts::callLlm()`.
ESLint blocks imports of other LLM SDKs (OpenAI, Anthropic, Cohere,
Mistral, Groq, xAI, Bedrock, Replicate). The same file is the only
location allowed to import `@google/genai`.

## C2 — Google Cloud product mandate

`@google/genai` SDK constructed with `vertexai: true` when
`EXPO_PUBLIC_USE_VERTEX=true`. Project + location from env.
`ai_audit_log.vertex_backend` records the path used for each call.

## C3 — AI decision audit log

The wrapper inserts an `ai_audit_log` row for every successful call.
Direct import of `src/lib/supabase/audit.ts` is blocked outside the
wrapper, preventing audit bypass.

## C4 — Revenue tracking

`revenue_events` schema requires `month_bucket` (generated),
`is_related_party`, `customer_relation_type`. Webhooks from RevenueCat /
Toss / Stripe normalize into this table.

## C5 — Testimonial consent

`testimonials.consent_given_at` is NOT NULL.
`share_with_judges_flag` defaults to false. UI consent dialog returns
both fields before insert.

## C6 — Comp access is never derived from an email domain (retired auto-flag)

**Changed 2026-08-21 (REQ-260820-04).** C6 used to REQUIRE the judge auto-flag:
`@xprize.org` / `@devpost.com` / `@hacker.fund` got unlimited free access via
`src/lib/judge/domains.ts` and the `auto_judge_mode` trigger. The contest ended
2026-08-15, so C6 is now the opposite rule: **that mechanism must stay gone.**

- `JUDGE_DOMAINS` is empty and must remain empty.
- `db/migrations/0138_retire_judge_auto_flag.sql` drops `auto_judge_mode()` and
  `enforce_judge_mode()` and their three triggers, and no later migration may
  re-create them.
- The same migration **REVOKEs `INSERT`/`UPDATE` on `users.judge_mode` from
  `anon` and `authenticated`**, which is the part that is not mere cleanup.
  `effective_subscription_tier()` reads `judge_mode` as a comp to the **brain**
  tier, and 0011's claim of a "column-level revoke" was false: measured on
  production 2026-08-21, both client roles held `UPDATE` on that column. The
  `enforce_judge_mode` trigger was the only thing overwriting a self-set value,
  so dropping it without the revoke would have opened a self-escalation to the
  top paid tier.
- The column and the comp branch stay. Their replacement is a role-based grant
  in the RBAC work (REQ-260821-02); until then `judge_mode` is false for
  everyone and writable only by `service_role`.

Why comp by email domain does not come back: it granted a paid entitlement from
a string the user chooses at sign-up.

Safe to retire when it was: production had **0 of 15** users with
`judge_mode = true`.

## C7 — i18n parity

EN is canonical; KO must match key set. Empty values fail CI.
`scripts/check-i18n-keys.ts` runs in CI.

## C8 — Curator provenance

`knowledge_sources` requires `doi OR url`. `verified_by` and
`verified_at` must be set together (both null or both non-null) —
enforced by `ks_verification_pair` CHECK.

## C9 — Safety bypass impossible

`classifyInput()` runs at the top of `callLlm()`. Red-zone input
short-circuits and returns hotline guidance without invoking the LLM.
The jest suite asserts the call order via mock spy.

## C10 — Age-tiered registration + guardian consent (phased)

Sign-up requires `birth_date`, which sets an **age tier**:
- **Adult (≥18)** and **self-consent minor (14–17)** register directly. Under PIPA, legal-representative consent is mandated only *below 14* (Article 22-2); users 14+ self-consent under the general provisions (Articles 15/17/22) with age-appropriate notice.
- **Under-14** require **verifiable guardian consent** (PIPA Article 22-2; the US COPPA
  threshold is separately *under-13* — global rollout branches by jurisdiction via the
  matrix in `src/lib/auth/consent-age.ts`): the account starts in
  `account_status = 'pending_guardian_consent'`, held until a guardian verifies via the
  `guardian_consents` ledger.

Enforcement (phased rollout):
- **DB — done (`db/migrations/0028`–`0030`):** `0028` replaces the legacy adult-only
  CHECK with `users_birth_date_sane` and adds `account_status`, `minor_tier`, and the
  `guardian_consents` table (per-user RLS); `0029` locks `guardian_consents`; **`0030`
  adds the authoritative `enforce_user_age_tier()` BEFORE INSERT trigger that rejects
  under-14 server-side — the real gate. `users_birth_date_sane` (0028) is only a sanity backstop.**
- **Client — done:** `auth.ts` gates at `MIN_SELF_CONSENT_AGE` (14). 14-17
  self-consent minors and adults register directly; under-14 still throw `AgeGateError`
  pending the guardian-consent flow.
- **Safety — done (#134):** the minor flag threads from `AuthContext.isMinor`
  through the record/chat/interview/LLM chain. KO minors route to 1388 + 109,
  adults to the unified 109 line (1393 retired 2024-01), EN to 988.

**Jurisdiction (current limitation):** the app does not yet collect a reliable
country/jurisdiction signal (locale `en`/`ko` is not a country). Until country
detection lands, **all users are gated on the KR rule (self-consent floor 14,
PIPA Article 22-2)** via `digitalConsentAge("KR")` in
`src/lib/auth/consent-age.ts`. This is valid for the KR-first launch and remains
in effect until a country-detection landing. Accurate non-KR age gates (US COPPA
under-13, EU GDPR Art.8 13-16) require the jurisdiction signal plus legal
sign-off and ship in a follow-up PR; the per-jurisdiction values already exist in
`consent-age.ts` but are not wired to a live signal yet.

CI: `check:constraints` asserts the guardian-consent schema + client age logic;
`supabase-dry-run` asserts `users_birth_date_sane` + `guardian_consents`.

## C11 — 2-business-day response

README declares the SLA. `.github/workflows/issue-sla.yml` labels new
issues. Auto-responder (Gmail filter + support@ + Devpost mobile push)
is Sprint 1 OPS work.

## C12 — Pre-existing assets disclosure

README contains a "Pre-existing assets used" section; `docs/ASSETS.md` carries
the registry (currently 9 packs / 246 image files).

**Changed 2026-08-21 (REQ-260820-04): the reason, not the rule.** This was
written as "per XPRIZE rulebook §04", and the rulebook no longer applies. The
constraint is kept on its own merits: the app ships third-party art and fonts
under licences with attribution terms, the store listings restate those claims,
and a disclosure list that nobody maintains is worse than none. The check is
also not a formality - a grep for the README heading alone reported PASS on
2026-08-06 while 226 committed images went entirely unlisted, so
`check:constraints` now compares the registry against the packs on disk.

## Known platform limitations (2026-08-10)

These findings do not relax C1 through C12. They remain tracked for a
separate, dependency-aware cleanup.

- Legacy Paddle payment rows can have a null `paddle_transaction_id`.
  `subscription-manage` stops with `misconfigured` before calling Paddle, so
  this cannot issue money. Repeated refund attempts can still append duplicate
  `misconfigured` rows to `billing_self_service_log`; ledger deduplication for
  these legacy rows is deferred as a low-priority follow-up.
- `users_orphan_backup_0107` contains two service-role-only rollback rows from
  the 0107 orphan cleanup. Its maximum retention is 30 calendar days from
  `max(backed_up_at)`, through **2026-09-06 02:48:55.689335 KST**. Remove it
  sooner if rollback verification finishes; otherwise permanently delete it
  in a dedicated migration by that deadline and record the result. Thirty days
  is an internal maximum rollback window, not a statutory fixed period;
  [PIPA Article 21](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?ancYnChk=&chrClsCd=010202&lsJoLnkSeq=1020398651)
  still requires prompt destruction once the rollback purpose ends.
- The `citext`, `pg_trgm`, and `vector` extensions currently live in the
  `public` schema. Moving them without first inventorying dependent columns
  and objects can break existing type references. Keep them in place until a
  dedicated migration and rollback plan are reviewed.
