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

All LLM calls route through `src/lib/llm/gemini.ts::callGemini()`.
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

## C6 — Judge mode

Emails matching `@xprize.org`, `@devpost.com`, `@hacker.fund` get
unlimited free access. Enforced client-side
(`src/lib/judge/domains.ts`) AND server-side (`auto_judge_mode` BEFORE
INSERT trigger). DB trigger is authoritative on disagreement.

## C7 — i18n parity

EN is canonical; KO must match key set. Empty values fail CI.
`scripts/check-i18n-keys.ts` runs in CI.

## C8 — Curator provenance

`knowledge_sources` requires `doi OR url`. `verified_by` and
`verified_at` must be set together (both null or both non-null) —
enforced by `ks_verification_pair` CHECK.

## C9 — Safety bypass impossible

`classifyInput()` runs at the top of `callGemini()`. Red-zone input
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

README contains a "Pre-existing assets used" section per XPRIZE rulebook
§04. `docs/ASSETS.md` carries the detailed registry.
