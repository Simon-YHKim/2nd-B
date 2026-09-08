# Data Protection Impact Assessment (DPIA) — DRAFT
## 2nd-B · Minors / AI-Literacy Enablement

---

## Section 1 — Document Control

| Field | Value |
|---|---|
| **Document title** | DPIA — 2nd-B (Minors / AI-Literacy Enablement) |
| **Product** | 2nd-B — "second brain" reflective-journaling + AI-literacy app for minors (14–17 self-consent in KR; under-14 blocked) |
| **Version** | 0.1 — DRAFT |
| **Date** | `[YYYY-MM-DD — to be set on counsel handoff]` |
| **Owner** | Simon Kim (김양환) |
| **Status** | **DRAFT — awaiting legal counsel review and completion** |
| **Code baseline** | `E:/2ndB` @ 2026-06-14 (original pass). **Re-baselining in progress against `origin/main` @ 2026-09-07** (1,792 commits later): the citations below that pointed at files which no longer exist have been repaired and re-read; the remainder are being re-read file by file. Drift inventory: `docs/legal/dpia-citation-drift-260907.json` (dated record, committed alongside this document so the claim above can be checked). **No legal characterisation has been changed** - those remain [COUNSEL TO CONFIRM]. |
| **Source debates / inputs** | DECISIONS.md D-18 / D-19 / D-20; `Output/minor-ai-literacy-enablement-20260614.html` (K1–K12 rails); the §11-5 legal gate |
| **Counsel reviewer** | `[TBD — see Section 8]` |
| **Classification** | Internal · privileged working draft prepared for counsel |

> **THIS IS A WORKING DRAFT, NOT LEGAL ADVICE.** It was assembled by the engineering/orchestration layer to give legal counsel a complete, fact-grounded, pre-structured basis for completing a DPIA. It asserts **system behaviour** (cited to source code at `file:line`), **not law**. Every legal characterisation — special-category classification, lawful basis, profiling / automated-decision thresholds, cross-border transfer adequacy, validity of 14–17 self-consent, retention / erasure scope, portability sufficiency, and jurisdictional applicability — is flagged **[COUNSEL TO CONFIRM]** and is reserved to counsel. Nothing here should be relied upon as a legal determination until counsel completes Sections 4–7 and signs the Section 8 block.

### 1.1 Reading conventions (apply throughout)

- **[IMPLEMENTED]** — present and reachable in the live build on `main` as of the code baseline.
- **[PLANNED — DPIA-gated]** — designed and debated (D-18 / D-19 / D-20) but **not built**; the build itself is blocked behind this DPIA + the §11-5 counsel gate.
- **[COUNSEL TO CONFIRM]** — a legal determination reserved to counsel. These flags are intentionally preserved verbatim in every section.

### 1.2 Established system facts (verified in code; the shared premise of every section)

To avoid repetition, the four load-bearing facts below are stated once here and relied on throughout. Where a later section restates one, it adds section-specific citations rather than re-deriving it.

1. **AI capability is age-invariant.** `isMinor` (derived as `birth_date → age < 18`: the ceiling at `src/lib/auth/AuthContext.tsx:42`, the comparison at `src/lib/auth/AuthContext.tsx:132`) touches the LLM pipeline at exactly **one** point — selecting the youth crisis hotline 1388 over the adult line (`src/lib/safety/classifier.ts:70-90`; `src/lib/llm/safety.ts:408-438`). Model, prompt, RAG depth and persona are **byte-identical** for a 14-year-old and a 40-year-old. **All minor protections are data/egress rails, not capability limits.** **[COUNSEL TO CONFIRM]** whether identical AI capability for 14–17s is defensible given the mental-health context.
2. **Crisis handoff is deterministic and human-authored**, never LLM-generated: red-zone short-circuits before any network call and is re-checked on output, then replaced verbatim by a fixed human-written template (`fixedCrisisResponse`, `src/lib/llm/safety.ts:408-438`; `src/lib/llm/boundary.ts:560-576`, `src/lib/llm/boundary.ts:478-538`).
3. **Minor data rails (server-enforced):** high-privacy seed at sign-up (`db/migrations/0032`), clamp keyed off the row's *real* unforgeable tier (`db/migrations/0033`, `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:77-95`), `minor_tier` server-only (`db/migrations/0038`), plus a UI lock; only `long_term_memory`, `ops_push` and `chat_autosave` are minor-promotable (`src/lib/privacy/prefs.ts:95-99`).
4. **Sensitive data + consent ledger.** Journaling = mental-health data. The immutable consent ledger captures `sensitive_data_ack` / `overseas_transfer_ack` / `llm_processing_ack` (`db/migrations/0031_consent_records.sql:26-28`), and ⚠ **[RE-READ 2026-09-08]** the notice/ack collection UI **is wired**: `src/lib/auth/consent-selections.ts:16-21`; both entry screens render `<ConsentNotice>`; `recordConsentBestEffort(` at `src/lib/auth/useSignUpForm.ts:318` and `src/app/(auth)/complete-profile.tsx:169`; the three acks are written to the ledger at `src/lib/supabase/consent.ts:124-126`. The migration header still reads "NOT YET WIRED at sign-up" because a migration is immutable - it records the state at authoring time and cannot be corrected in place.

### 1.3 Contents

- **Section 2** — Summary of the Processing (description, scope, purposes, data categories, recipients)
- **Section 3** — Data Flows (capture → classify → store → AI → egress; retention touchpoints; flow-level gaps)
- **Section 4** — Necessity, Proportionality & Lawful Basis
- **Section 5** — Risks to Minors (register) + Mitigations (mapped) + Residual Risk
- **Section 6** — Data Subject Rights + Retention + Remediation Backlog
- **Section 7** — Open Questions for Counsel + Consultation Record
- **Section 8** — Counsel Sign-Off

---

## Section 2 — Summary of the Processing (Description)

> **Scope of Sections 2–3:** systematic description only (Art. 35(7)(a) GDPR / PIPA DPIA equivalent). Necessity / proportionality and lawful basis are in Section 4; risk assessment in Section 5.

### 2.1 Nature of the processing
2nd-B captures free-text self-reflection (journal, notes, life-audit answers), runs it and a derived personal knowledge graph through a hosted LLM (Google Gemini) to return reflective prompts, persona inferences, and routine suggestions, and stores the results per-user in Supabase Postgres. A deterministic safety classifier inspects text on the way in and on the way out; crisis-zone text is intercepted and replaced with a fixed human-written hotline template rather than an AI reply (`src/lib/llm/boundary.ts:560-576`, `src/lib/llm/safety.ts:408-438`).

Operations performed: collection, structuring/inference, storage, cross-border transfer to a sub-processor for inference, automated classification (crisis triage), and erasure on request. No automated decision with legal/similarly-significant effect is made about the user **[COUNSEL TO CONFIRM** whether crisis routing or persona inference reaches Art. 22 / profiling thresholds — see 2.6 #3 and #6**]**.

### 2.2 Scope
- **Volume of data per subject:** potentially high-frequency, long-horizon free text (journaling is the core loop) plus an accreting inferred self-model. This is *intensive* rather than *extensive* — few subjects, deep profiles.
- **Geographic scope:** live age/consent logic is **hard-coded to KR (self-consent floor 14)**; non-KR jurisdictions are resolved but not yet legally reviewed (`src/lib/auth/consent-age.ts:28-33`, with the `TODO(legal)` at `src/lib/auth/consent-age.ts:14-19`). ⚠ **[RE-READ 2026-09-08]** The signal LANDED on 2026-08-16 (Simon, J1): `resolveJurisdiction()` reads the device region via `src/lib/auth/device-region.ts` and maps it to a bucket, and the result is consumed at `src/app/_layout.tsx:595`. What remains is narrower and is the thing to assess: an **unreadable or unrecognised region deliberately stays on KR** rather than raising the floor on a failed signal, so a user in an EU country whose region cannot be read is still governed by KR=14. The same comment also said `LEXICON_LAST_LEGAL_REVIEW` was null; it is `"2026-06-10"` (`src/lib/safety/lexicon.ts:460`). **The comment was the stale thing**, and this document quoted it five times - which is exactly how a stale comment does damage. EU/UK exposure is therefore a *planned* scope, explicitly fenced behind this DPIA in D-20's minority fallback (`DECISIONS.md` D-20).
- **Special-category scope:** mental-health-adjacent free text is in scope for **every** account from first use (no "sensitive mode" toggle gates capture).

### 2.3 Context
- **Relationship:** direct-to-consumer; the data subject is the author and primary reader of their own data (RLS scopes all owned tables to `auth.uid()`, e.g. `db/migrations/0021_self_contexts.sql`, `0023_chat_usage.sql`).
- **Vulnerable subjects:** the app is **designed for minors** (14-17 KR self-consent) learning to use AI well; under-14 self-registration is hard-blocked server-side (`db/migrations/0030_server_age_gate.sql`, `0033_…enforcement.sql`). Children are an ICO Children's Code / GDPR Recital 38 heightened-risk population — material context for the risk section.
- **State of the art / prior expectations:** capability is **identical for minors and adults** (see §1.2 fact 1); `isMinor` touches the LLM path at exactly one point — selecting the youth crisis hotline (1388) over the adult line (`src/lib/safety/classifier.ts:73-75`; `src/lib/llm/safety.ts:408-438`). Minor protections are **data-egress rails**, not capability limits (see 2.7, 3.3).

### 2.4 Purposes of the processing
| # | Purpose | Lawful-basis candidate (counsel) | Status |
|---|---|---|---|
| P1 | Store & surface the user's own journal/notes/audit (the "second brain") | Contract | [IMPLEMENTED] |
| P2 | AI-generated reflective follow-ups & chat over the user's knowledge graph | Contract / consent | [IMPLEMENTED] |
| P3 | Infer a versioned persona/self-model (traits, values, patterns) | **[COUNSEL TO CONFIRM** — profiling, Art. 4(4)**]** | [IMPLEMENTED] |
| P4 | Crisis detection → human-written hotline handoff (safety) | Vital interests / legal obligation **[COUNSEL]** | [IMPLEMENTED] |
| P5 | AI-literacy / scaffolded-autonomy enablement ("learner licence" L0-L3) | Contract | [PLANNED — DPIA-gated] (D-18) |
| P6 | Account-internal routine *recommendations* from the user's own material | Consent (understanding-gated) | [PLANNED — DPIA-gated] (D-20); runtime gate predicate landed `src/lib/ops/recommend.ts:127-134` |
| P7 | Product analytics / UX measurement | Consent | [IMPLEMENTED], **off for minors** - `canLoadProductAnalytics` requires a server-confirmed adult, not sub-consent-age, and `isMinor === false` (`src/lib/analytics/index.ts:245-252`) |
| P8 | Service ops: usage caps, tier/billing, abuse/cost control | Contract / legitimate interest | [IMPLEMENTED] (`db/migrations/0023_chat_usage.sql`) |
| P9 | Audit/accountability evidence (AI decision log) | Legal obligation / legit. interest **[COUNSEL]** | [IMPLEMENTED] (`db/migrations/0004_ai_audit_log.sql`) |

Explicitly **excluded** purposes for all users (privacy-by-design defaults OFF): advertising and third-party sharing, which are keys in the pref set and default `false` (`src/lib/privacy/prefs.ts:17-51`, `src/lib/privacy/prefs.ts:55-62`).

⚠ **[RE-READ 2026-09-07]** This sentence also listed **LLM training on user data** and **persona export/share** as prefs held OFF. They are no longer prefs. On 2026-07-01 the module **pruned** `llm_training`, `persona_export` and `persona_share`, and states why in its own words: "None was enforced or shown ... each was a false privacy promise: a pref the app persisted but never honored. Removing them from the contract makes the set honest" (`src/lib/privacy/prefs.ts:9-16`). The honest position is **weaker than the old sentence and must be read as such**: there is no user-facing switch for LLM training, because there was never an enforcer behind the one that existed. The server triggers still seed and clamp those columns (`db/migrations/0032`, `0033`, `0038`), and the app now discards them as unknown keys, so the stored booleans are inert. **[COUNSEL TO CONFIRM]** whether "no such processing occurs" can be asserted from the absence of an enforcer plus the absence of a caller, or whether a positive control is required. For minors these are additionally **server-clamped** (2.7, 3.3).

### 2.5 Data subjects
- **14-17 self-consent minors (KR)** — primary target population. `isMinor` is derived as `birth_date → age < 18` (`src/lib/auth/AuthContext.tsx:132`); server `minor_tier='minor_self'` for 14-17 (`db/migrations/0030_server_age_gate.sql`).
- **Adults 18+.**
- **Under-13 / under-14:** **blocked** from self-registration (age-gate trigger raises on `age < 14`; no guardian flow built — `0030`, `0032`, `0033`). **[COUNSEL TO CONFIRM** COPPA <13 / PIPA <14 / GDPR Art. 8 alignment given the KR-only floor.**]**
- **Age assurance:** **self-reported DOB only** (`users.birth_date` collected at sign-up, `db/migrations/0002_users.sql`). No verification → weakest assurance tier under ICO Children's Code Std 3. **Carry to risk section.**

### 2.6 Categories of personal data (inventory)
| # | Category | Concrete fields / store | Sensitivity | Cite |
|---|---|---|---|---|
| 1 | **Journal / reflective free text = health-adjacent** | `records.body`, `prompt`, `ai_followup`, `kind∈{journal,note,audit_response}`, `audit_period` | **Special category (mental-health) — GDPR Art. 9 / PIPA §23 sensitive** **[COUNSEL TO CONFIRM]** | `db/migrations/0003_records.sql:7-19` |
| 2 | **Account / identity** | `users.id`, `email` (unique), `birth_date` (NOT NULL), `locale`, `judge_mode`, `subscription_tier`, `privacy_prefs` (jsonb), `minor_tier`, `account_status` | PII incl. **age** (special handling for minors) | `db/migrations/0002_users.sql`; `0030/0032` |
| 3 | **Inferred persona / psychometric self-profile** | `personas.traits/values/patterns` (jsonb), `markdown_export`, versioned; `memorized_patterns` (0017); `self_contexts` "multiple selves" (0021) | **Profiling of a minor** **[COUNSEL]** | `db/migrations/0008_personas.sql:5`; `0021` |
| 4 | **Experience-sampling signals (ESM)** | `esm_responses.scale_value` (Likert mood/energy), `context_tags` (who/where/activity) | Behavioural/affective trace | `db/migrations/0042_esm_responses.sql` |
| 5 | **Knowledge graph / web clippings** | `wiki_pages`, `wiki_links` (0022), user `sources`; clip frontmatter may carry geo / tracking-token URLs | PII; egress-filtered by allowlist | `0022`; export allowlist `src/lib/wiki/export.ts:88-91` |
| 6 | **Crisis signals** | `crisis_events`: `zone='red'`, `classifier_confidence`, `trigger_categories` (categorical), `routing_template_version`, `locale`, **`user_id_hash`**. **A C-SSRS severity grade (`cssrs_level`, 1-6) was collected until 2026-08-17 and has been REMOVED** — see the note below the table | **Highest-sensitivity inference; never raw text** | `db/migrations/0012_crisis_events.sql`; removed by `0129_drop_cssrs_level.sql` |
| 7 | **AI-decision audit telemetry** | `ai_audit_log`: `prompt_hash`, `output_hash` (hashes, **not** raw text), `model_used`, `vertex_backend`, `safety_zone`, `latency_ms` | Pseudonymised metadata | `db/migrations/0004_ai_audit_log.sql` |
| 8 | **Usage / cost telemetry** | `chat_usage` (per-user/day count), `gemini_spend_daily` (0035) | Low-sensitivity ops | `db/migrations/0023_chat_usage.sql` |
| 9 | **Consent ledger** | `consent_records`: `age_band`, `minor_tier`, `consent_version`, `policy/terms_version`, `purposes`, `llm_processing_ack`, `overseas_transfer_ack`, `sensitive_data_ack`, **`ip_hash`/`ua_hash`** (hashed) | Accountability record; IP/UA minimised by hashing | `db/migrations/0031_consent_records.sql`; `src/lib/auth/consent-selections.ts:16-24` |
| 10 | **Product analytics events** (consented adults only) | `page_view`, `capture`, `secondb_session{mode,turn_count}` → GA4 / Clarity | Behavioural; **suppressed for minors & sub-consent-age** | event union `src/lib/analytics/index.ts:74`; the suppression itself is `canLoadProductAnalytics` (`src/lib/analytics/index.ts:245-252`) |

> **2026-08-17 · row 6 minimisation.** `crisis_events.cssrs_level` held a C-SSRS
> grade, i.e. a clinical suicide-severity score per account. Counsel review took
> the position that storing it is PIPA art.23 sensitive (health) processing, and
> that art.15(1)5 (urgent vital interests) cannot be relied on for sensitive data
> — leaving art.23(1)1 separate consent as the only basis, which was not being
> collected. A repository-wide check also found **no code reading the value**;
> routing runs off `zone`. The column was dropped in `0129_drop_cssrs_level.sql`
> (existing values went with it; 0 rows held a value at drop time). The
> `log_crisis_event` RPC still ACCEPTS a `p_cssrs_level` argument and discards it,
> because installed app versions still send it and changing the signature would
> fail their crisis writes.
>
> The remaining row-6 fields are still treated as art.23 processing, so a separate
> "safety notice" consent was added at sign-up in `0130_safety_notice_ack.sql`
> (`consent_records.safety_notice_ack`). Accounts created before that date hold
> NULL, not false: they did not decline, they were never asked.
>
> **RESOLVED 2026-08-17 — the grade is no longer generated either.** The storage
> change above left the *processing* intact: the classifier still asked the model
> for a C-SSRS grade, sanitised it, and threaded it through `src/lib/llm/boundary.ts`
> on 11 paths, reaching no store. Generating a clinical severity grade is itself
> art.23 processing on the same reasoning that removed the column, so the derivation
> was removed too (code-only; no schema change):
>
> - `cssrsLevel` is gone from the classifier's **prompt contract** and from both
>   `responseSchema` blocks, so the model is no longer asked for it.
> - It is gone from `SafetyResult` (`src/lib/llm/safety.ts`), from `AdvisorResult`
>   (`src/lib/llm/types.ts`), and from `CrisisEventInsert`
>   (`src/lib/supabase/crisis-events.ts`). `sanitizeCssrsLevel` is deleted.
> - Routing is unaffected: it runs off `zone`, and nothing ever branched on the
>   grade — verified across the repo before removal.
> - Tests were inverted rather than deleted, so the removal is now guarded: the
>   response schema must not contain the key, and a grade volunteered by the model
>   must not appear on the result.
>
> `p_cssrs_level` is still passed to the RPC as `null`. Installed apps call
> `log_crisis_event` with that named-argument set; dropping the argument client-side
> would change the signature and fail their crisis writes. The server discards it.
>
> Row 6 is therefore accurate as written: **no clinical score is collected, stored,
> or derived.** What remains is the zone verdict and its categories.

Note on #1: journal text is **not** sent to the chat/recommendation LLM by default — see 3.2. The crisis classifier, however, *does* read raw record text locally to triage it (`src/lib/llm/boundary.ts:405-422` `classifyRecordTextForCrisis`).

### 2.7 Recipients / third parties (sub-processors)

⚠ **[RE-BASELINED 2026-09-07]** This table previously listed **one** LLM sub-processor
(Google) and described it as receiving "every AI turn". The repository routes to **four**
vendor proxies, all four are deployed, and **the vendor serving today is not the one that
was named**: the operational audit ledger's last Gemini call is 2026-08-23 and every call
since has been OpenAI. Three rows below are new; the Google row is retained because an
operator can still reach it with one variable. **Two states are kept apart on purpose** -
*a recipient the build routes to* and *a recipient that has actually received data* - and
the "has served" column says which is which.

| Recipient | Role | Data exposed | Trigger / gate | Has served? (audit ledger) | Cite |
|---|---|---|---|---|---|
| **OpenAI** (`api.openai.com`) | LLM inference **and embeddings** (processor) | System prompt + the user's **turn** + wiki-snapshot RAG context (pages/sources, body truncated 600 chars). **Journal records excluded by default.** Image bytes for OCR, audio for transcription, and text submitted for embedding. | The **default for every switch** since 2026-08-31. Under the deployed posture: chat, all non-seat purposes, OCR, voice, embeddings, and 11 of the 14 reasoning seats | **Yes** — 34 calls, most recent 2026-09-07 | `supabase/functions/openai-proxy/index.ts`; `src/lib/llm/routing.ts:472-494` |
| **Anthropic** (`api.anthropic.com`) | LLM inference (processor) | Same categories as the OpenAI row, for its three seats only | Three reasoning seats — `persona_narrative`, `persona_synthesis`, `crosscheck_defend` — while `EXPO_PUBLIC_LLM_VENDOR=perPurpose`, which is the value deployed on both tracks. The cross-check feature **refuses to run** when both of its sides resolve to one vendor, so it structurally requires a second one | **No** — 0 calls to date | `supabase/functions/claude-proxy/index.ts`; `src/lib/llm/routing.ts:310-354`; `src/lib/llm/crosscheck.ts:82-90` |
| **Google — Gemini API** (`generativelanguage.googleapis.com`) **or Vertex AI** (GCP) | LLM inference (processor) | Same categories as the OpenAI row | **Retired as the default 2026-08-31.** No unset switch reaches it any more; an operator value of `gemini` still does, and `gemini-proxy` is still deployed | **Yes, historically** — 109 calls, most recent 2026-08-23 | `supabase/functions/gemini-proxy/index.ts:391`; `src/lib/llm/routing.ts:52-66` |
| **xAI** (`api.x.ai`) | LLM inference (processor) | Reasoning seats and chat only — the proxy answers `purpose_not_seated` for anything else | **Nothing routes here by default.** Only an explicit `xai` (or `grok`) on a switch | **No** — 0 calls to date | `supabase/functions/xai-proxy/index.ts`; `src/lib/llm/routing.ts:22-29` |
| **Supabase** (Postgres, Auth, Edge Functions) | Hosting / DB processor | All stored categories (2.6) | Always (system of record) | n/a | RLS migrations throughout |
| **GA4** (`googletagmanager.com`) **/ Microsoft Clarity** | Product analytics | Category #10 only | **Only if** `external_analytics` consented **AND** not minor **AND** not sub-consent-age. Clarity additionally requires a server-confirmed adult and a route on its allow-list | n/a | `src/lib/analytics/index.ts:245-252`; `src/lib/analytics/clarity-native.ts:38-47` |
| **Paddle** (`cdn.paddle.com`, webhook) | Payments — merchant of record | Checkout identifiers + subscription state. **[COUNSEL TO CONFIRM** whether an MoR is a processor or an independent controller here — the answer changes the disclosure**]** | Only on a paid-tier checkout. Live credentials are configured | n/a | `src/lib/billing/paddle-checkout.ts:41-47`; `supabase/functions/paddle-webhook/index.ts` |
| **Social IdPs** — Google, Apple, Kakao, Facebook, GitHub (Supabase-native) and **Naver** (custom handler) | OAuth sign-in | Auth identity | If user picks social login | n/a | `src/lib/auth/auth-providers.ts:18-32`; `supabase/functions/oauth-naver/index.ts` |
| **Google AdMob** | Rewarded video ads + server-side reward verification | Device ad identifiers. **Minors never** — fail-closed at `src/lib/ads/policy.ts:58` | **Not launched**: `HAS_LIVE_AD_UNIT = false`, so no live unit serves. The SDK ships in the native build and the AdMob app ids are in `app.json` | n/a | `src/lib/ads/rewarded.native.ts:51`; `supabase/functions/rewarded-ssv/index.ts` |
| **GitHub Pages / web host** | Static web delivery | Client bundle (no server secrets) | Web build | n/a | (deploy config) |

**Named in the deployment config but reached by no code path** — recorded because an auditor
reading the environment would otherwise infer a flow that does not exist. `EXPO_PUBLIC_POSTHOG_KEY`
/ `_HOST` are set as repository variables and **PostHog appears nowhere in the source**;
`EXPO_PUBLIC_SENTRY_DSN` is set and `@sentry/react-native` is still a dependency, but no runtime module imports it or calls `Sentry.init`. That is **a deliberate fail-closed state, not an oversight**: PR #1586 hard-disabled both the web and native initialisation paths precisely because "개인정보 고지 · DPA · 기존 사용자 재동의 · Native redaction 계약이 준비되지 않았습니다", and it kept the package and the inert env wiring only so the OTA runtime fingerprint stayed compatible. Three tests hold the fence shut: the runtime source and the native build config contain **no Sentry SDK entry point**, and with analytics consent both true and false the configured credentials **remain inert** (`src/lib/analytics/__tests__/analytics.test.ts:96-131`). **Re-enabling is gated, by that PR's own terms, on five preconditions being met FIRST**: a privacy notice, a DPA with the processor, re-consent from existing users, a native-redaction contract, and a source-map handling standard. A plain revert is explicitly ruled out. The consequence is stated there too and is worth repeating here: **third-party JS crash visibility is deliberately zero.**
An earlier version of this table listed both as recipients. **Configured is not the same as
connected**, and a privacy document should not report a credential as a data flow.

**Cross-border transfer:** inference routes **overseas in every configuration** — to OpenAI (US) today, to Anthropic (US) for the three seats above, and to Google or xAI only on an explicit operator value. Which vendor receives a given call is decided by **seven build-time variables**, not by anything the user does: `EXPO_PUBLIC_LLM_VENDOR` · `_CHAT_VENDOR` · `_BACKBONE_VENDOR` · `_MULTIMODAL_VENDOR` · `_EMBED_VENDOR` · `_SAFETY_VENDOR` · `_FAILOVER_VENDOR` (`src/lib/llm/routing.ts:75-276`). **No processing region is pinned anywhere in app code** for any of the four vendors, and neither is the Supabase project region — **operator must confirm.** ⚠ The previous text named only Google and only `EXPO_PUBLIC_USE_VERTEX` / `GOOGLE_CLOUD_LOCATION`; that is the residue of a single-vendor era and understated the surface. The consent flow collects an explicit **overseas-transfer acknowledgement** (`overseas_transfer_ack`) and PIPA §23 **sensitive-data acknowledgement** (`sensitive_data_ack`) (`src/lib/auth/consent-selections.ts:16-24,65-83`). **[COUNSEL TO CONFIRM** adequacy/SCC basis, retention by Google, and that an ack ≠ valid Art. 9(2)/PIPA §23 explicit consent.**]**

---

## Section 3 — Data Flows

### 3.1 Data-flow map (capture → classify → store → AI → outputs → egress)

```
                         ┌──────────────────────────────────────────────────────────┐
                         │  DATA SUBJECT (14-17 minor  |  18+ adult)                  │
                         │  self-report DOB at sign-up ─► age gate                    │
                         └───────────────┬──────────────────────────────────────────┘
                                         │ (1) CAPTURE
        journal / note / audit ──────────┤  records (0003)        ── special-category text
        web clip / source ───────────────┤  wiki_pages, sources (0022/0007)
        ESM check-in ────────────────────┤  esm_responses (0042)
        sign-up + acks ──────────────────┤  users (0002) + consent_records (0031, immutable)
                                         │
                                         ▼ (2) CLASSIFY  (deterministic, pre-AI)
                         classifyInput / classifySafety  (safety.ts, classifier.ts)
                         green / yellow ──► continue        red ──► SHORT-CIRCUIT
                                                            │  fixed human-written hotline
                                                            │  template (minor→1388);
                                                            │  NO LLM reply generated
                                                            ▼
                                                     crisis_events (0012, categorical,
                                                     user_id_hash, no raw text)
                                                     + ai_audit_log (0004, hashes)
                                         │
                                         ▼ (3) STORE  (Supabase Postgres, RLS per auth.uid())
                         records · personas · esm · wiki · usage · consent · audit
                                         │
                                         ▼ (4) AI  (only green/yellow)
        ┌────────────────────────────────────────────────────────────────────────┐
        │ exportUserWiki()  ──► snapshot = pages + sources (body ≤600 chars).       │
        │   includeRecords DEFAULTS FALSE → journal text NOT in chat/recommend       │
        │   prompts (export.ts:213-215; conversation.ts:148-153; recommend.ts:5-7)   │
        │ snapshot fenced as <UNTRUSTED> (injection guard)                           │
        │   ──► callGemini()  (C9 in-classify ▸ C3 audit ▸ C1 single egress)         │
        │        ├─ live: gemini-proxy edge fn (key server-side, spend-capped) ──┐   │
        │        └─ or direct Vertex client (GCP-billed)                         │   │
        └───────────────────────────────────────────────────────────────────────┼───┘
                                         │ (5) OUTPUT re-classify (lexical+semantic)│
                                         │   red ──► swap to fixed template + log    │
                                         ▼                                          ▼
                              reflective prompt / chat / persona / suggestion   GOOGLE (egress)
                                         │                                       generativelanguage
                                         ▼ (6) optional onward egress                .googleapis.com
                              analytics events ──► GA4/Clarity        / Vertex
                                 (ONLY if consented AND not minor)
```

### 3.2 The LLM proxy flow in detail (the core risk surface)

⚠ **[RE-BASELINED 2026-09-07]** The flow below is written vendor-neutrally and holds for all four proxies; where it names a vendor, read 2.7 for which one actually serves that step today. The step that chooses the vendor is `resolveVendorForPurpose` (`src/lib/llm/routing.ts:472-494`), and it runs **before** step 1 below.
1. **Assembly** (`src/lib/chat/conversation.ts:338` assembles the template; the wiki snapshot is fetched at `src/lib/chat/conversation.ts:249`): builds a system prompt = header + injection-guard + mode line + persona hint + a **wiki snapshot**. The snapshot comes from `exportUserWiki(userId, {bodyCharLimit:600, pageLimit:50, sourceLimit:100})` — i.e. knowledge-graph pages and source titles, **not** journal records. `includeRecords` is an opt-in the chat path deliberately does not set - declared at `src/lib/wiki/export.ts:219` and acted on at `src/lib/wiki/export.ts:240`, where records are fetched only when it is true; the recommendations path is identical - the contract at `src/lib/ops/recommend.ts:5-9`, and the call that keeps it at `src/lib/ops/recommend.ts:235`, where `exportUserWiki` is invoked with only a `bodyCharLimit` and no `includeRecords`.
2. **Untrusted-data fencing**: the snapshot is sanitised and wrapped in `<UNTRUSTED type="wiki_snapshot">` so a clipped "ignore previous instructions" cannot steer the model (`src/lib/chat/conversation.ts:293-296`). Export also applies a **fail-closed frontmatter allowlist** so clip metadata (geo, tracking-token URLs) never egresses (`src/lib/wiki/export.ts:88-91`).
3. **Pre-call safety (C9)**: `callLlm` runs `classifyInputAnyLocale` on the user turn *before* any network call; red-zone short-circuits to `routeCrisis` and never reaches the model vendor (`src/lib/llm/boundary.ts:560-576`). *(Re-read 2026-09-07: the function was renamed from `callGemini` and the classifier is now dual-locale, so a crisis term written in the other language than the UI locale is also caught. The behaviour asserted here is unchanged in kind and stronger in reach.)*
4. **Single egress (C1) + spend cap (C-cost)**: live calls route through the `gemini-proxy` edge function (API key server-side, per-user/day cap, server-side crisis gate, server-authoritative audit) — `src/lib/llm/boundary.ts:689-733`, `supabase/functions/gemini-proxy/index.ts`. Direct `@google/genai` egress is allowed **only** for Vertex (GCP-billed); an uncapped live API-key path throws (`src/lib/llm/boundary.ts:147-156`).
5. **Post-call re-classification + swap (output safety)**: the model reply is re-classified (lexicon ∪ Gemini-Flash semantic); a red result is **not shipped** — it is replaced verbatim by the fixed crisis template and a `crisis_events` row is written (`src/lib/llm/boundary.ts:478-538`).
6. **Audit (C3)**: every call (mock, proxy, direct, crisis-routed, swapped) writes `ai_audit_log` with **hashes only** of prompt/output (`src/lib/llm/boundary.ts:157-177`; `db/migrations/0004`).

### 3.3 Minor-specific routing & rails (data-flow deltas, not capability deltas)
- **Capture:** identical to adults.
- **AI:** identical model, prompt, RAG depth; the **only** minor branch is hotline selection — `crisisHotlines(locale, minor=true) → [KR_1388, KR_109]` and template version `red-ko-minor-v2` (`src/lib/safety/classifier.ts:73-75`; `src/lib/llm/safety.ts:408-438`).
- **Egress rails (server-enforced):** on sign-up the age-gate trigger seeds `privacy_prefs` all-OFF for `minor_self` and a dedicated clamp trigger **forces** `ads, sharing, recommendations, external_analytics, llm_training, persona_export, persona_share = false` on every write — defeating a tampered client (`db/migrations/0032`, `0033`, `0038`). Only `long_term_memory`, `ops_push` and `chat_autosave` are minor-promotable (`src/lib/privacy/prefs.ts:95-99`).
- **`minor_tier` is server-only** — a self-UPDATE to `minor_tier='adult'` is rejected unless `birth_date` also changes (age gate re-derives), closing the high-privacy-escape (`db/migrations/0038` `block_self_tier_change`).
- **Analytics & ads suppressed** for minors / sub-consent-age regardless of consent state (`src/lib/analytics/index.ts:245-252`; ads fail-closed when `isMinor !== false` `src/lib/ads/policy.ts:58`).

### 3.4 Retention touchpoints & erasure
- **Primary user data** (`records`, `personas`, `memorized_patterns`, `self_contexts`, `esm_responses`, `chat_usage`, `wiki_*`, `consent_records`, `gemini_spend_daily`): retained for the life of the account; erased by **`ON DELETE CASCADE` off `public.users`** via the `delete-account` edge function, which deletes `public.users` (cascades children) then the `auth.users` row. IDOR-safe — target is always the JWT caller (`supabase/functions/delete-account/index.ts`).
- **Retention-exception #1 — `ai_audit_log`:** FK is **`ON DELETE SET NULL`** (migration 0011), so audit rows **survive account deletion** with `user_id` nulled (kept as accountability/XPRIZE evidence). **[COUNSEL TO CONFIRM** lawful basis & whether hash-only rows are out of scope for erasure.**]**
- **Retention-exception #2 — `crisis_events`:** keyed by `user_id_hash` (a non-FK `md5(auth.uid())`), so these rows are **not cascade-erased** and persist after account deletion. The schema itself flags the hash as **obfuscation, not anonymisation** (32-bit/`md5`, re-identifiable) (`db/migrations/0012` user_id_hash comment; `0040` `log_crisis_event`). **[COUNSEL TO CONFIRM** retention justification and whether this is "personal data" post-deletion.**]**
- **No time-based retention limit is implemented** — a grep for TTL/purge/cron retention jobs found none. Retention is currently "until user deletes account." **Carry to risk + necessity sections.**

### 3.5 Known flow-level gaps (forward to risk/measures sections)
1. **Data portability (GDPR Art. 20):** `exportUserWiki` produces a markdown bundle ("your second brain travels") of pages/sources (+optionally records) for pasting into another LLM (`src/lib/wiki/export.ts:1-12`), and a **structured, machine-readable, all-category export** is served separately by `export-account` (`supabase/functions/export-account/index.ts:1-9`). **[COUNSEL TO CONFIRM** whether this satisfies Art. 20; prior analysis treats portability as absent.**]**
2. **AI-vs-human disclosure (K11 / EU AI Act Art. 50 / KR AI Framework Act §13):** no in-product surface yet declares the responder is AI — **gap** (planned, Lane 5 of the enablement design).
3. **Age assurance:** self-report DOB only (2.5) — weakest tier; a low-literacy 15-year-old who under/over-states age changes the entire rail set.
4. **Jurisdiction signal:** the floor is resolved per device region, defaulting to KR when the region is unreadable or unrecognised; the non-KR values remain legally unreviewed (`src/lib/auth/consent-age.ts:8-19`; resolver `resolveJurisdiction` at `src/lib/auth/consent-age.ts:108-121`, which calls `deviceRegionCode`). ⚠ **[RE-READ 2026-09-08]** The signal LANDED on 2026-08-16 (Simon, J1): `resolveJurisdiction()` reads the device region via `src/lib/auth/device-region.ts` and maps it to a bucket, and the result is consumed at `src/app/_layout.tsx:595`. What remains is narrower and is the thing to assess: an **unreadable or unrecognised region deliberately stays on KR** rather than raising the floor on a failed signal, so a user in an EU country whose region cannot be read is still governed by KR=14.
5. **Recommendations runtime wiring (D-20):** the gate predicate `recommendationsAllowed()` is now defined (`src/lib/ops/recommend.ts:127-134`); D-20 records that the *screen-level* `runRecommend` path previously ran ungated for everyone (clamp was nominal). Confirm the screen calls the gate before relying on the minor lock for recommendations (`DECISIONS.md` D-20). **[Status: gate predicate IMPLEMENTED; full opt-in UX PLANNED — DPIA-gated.]**

**Drafting note for counsel:** all "[IMPLEMENTED]" claims in Sections 2–3 are cited to live files at the paths above and were read on 2026-06-14. Every legal characterisation is flagged **[COUNSEL TO CONFIRM]** and intentionally left open. These sections assert *system behaviour*, not law.

---

## Section 4 — Necessity, Proportionality & Lawful Basis

> **Scope & method.** This section assembles the *factual* processing map and the system-enforced controls, then proposes a lawful-basis structure for counsel to confirm or correct. "Implemented today" = present in shipped code/migrations; "Planned (DPIA-gated)" = designed in D-18/19/20 and the K1–K12 analysis but **not built**, with the build itself gated on this DPIA + counsel sign-off (`PROTOCOL §11-5`).

### 4.1 Processing-purpose inventory

| # | Purpose | Personal data involved | Special-category? | Where in system |
|---|---------|------------------------|-------------------|-----------------|
| P1 | **Account creation & age-tier gating** | birth_date (DOB), email, derived `minor_tier`/`account_status` | No (DOB is identifying, not special) | `db/migrations/0030_server_age_gate.sql`; `src/lib/auth/consent-age.ts` |
| P2 | **Core service: AI-assisted journaling / "second brain" reflection** | journal & note records, wiki pages, sources | **Yes — mental-health inferences** (GDPR Art.9 / PIPA §23) | `src/lib/chat/conversation.ts:127-161` `SYSTEM_PROMPT_HEADER`; `src/lib/wiki/export.ts` |
| P3 | **LLM processing of user entries via Gemini gateway (incl. overseas transfer)** | clipped wiki/source snapshot (journal **excluded**), prompt/output hashes | Yes (derived from P2) | `src/lib/llm/boundary.ts`; `supabase/functions/gemini-proxy/index.ts`; `src/lib/llm/audit` → `db/migrations/0004_ai_audit_log.sql` |
| P4 | **Crisis detection & human-handoff routing** | message text (transient, classified), categorical crisis event | **Yes — health/safety** | `src/lib/llm/safety.ts:408-438`; `db/migrations/0012_crisis_events.sql` |
| P5 | **Consent record-keeping (accountability ledger)** | consent acks, versions, hashed IP/UA | No | `db/migrations/0031_consent_records.sql` |
| P6 | **AI-decision audit logging (safety/governance)** | prompt_hash, output_hash, model, safety_zone, latency | No (hashes, not content) | `db/migrations/0004_ai_audit_log.sql` |
| P7 | **Ops recommendations** (account-internal routine suggestions, no egress) | wiki snapshot (journal excluded) | Possibly (derived) | `src/lib/ops/recommend.ts` |
| P8 | **External analytics** (GA4/Clarity/PostHog) | usage events | No | `src/lib/privacy/analytics-consent-queue.ts` — **minors: locked OFF** |
| P9 | **Advertising** | ad-eligibility signals | No | `src/lib/ads/policy.ts` — **minors: never (rule 2)** |
| P10 | **Model training on user data** | — | — | **No live flow.** ⚠ **[RE-READ 2026-09-08]** this cell cited `src/lib/privacy/prefs.ts:62-72` for a minor clamp; that range is `resolvePrivacyPrefs`, not a clamp. The key itself was **pruned from the client pref set** along with `persona_export` and `persona_share` as unenforced keys (`src/lib/privacy/prefs.ts:103-105`), so no toggle and no client-side enforcement exists for it. ⚠ **[RE-READ 2026-09-08, correcting the previous re-read]** the server trigger does still write `'llm_training', false` (`db/migrations/0033_minor_privacy_enforcement.sql:52`) - saying the key "no longer exists" overshot. It is written and then dropped on read, because the client key set is authoritative (`src/lib/privacy/prefs.ts:66`). The claim itself survives on stronger ground: there is no training egress at all; minors are confined to `MINOR_PROMOTABLE_KEYS` (`src/lib/privacy/prefs.ts:95-99`), and every privacy key defaults false regardless of age (`src/lib/privacy/prefs.ts:55-62`) |

**Key invariant for the whole table:** AI *capability* (model, prompt, RAG depth, persona) is **byte-identical for minors and adults** (see §1.2 fact 1); the sole `isMinor` use in the LLM path is crisis-hotline selection — `src/lib/llm/types.ts:81-84, 114-117`; `src/lib/llm/safety.ts:408-438`; `src/lib/llm/boundary.ts:560-576`; `src/lib/auth/AuthContext.tsx:12-15,55`. The minor-specific controls are all on **P5/P7/P8/P9/P10 (data)**, not on **P2/P3 (capability)** — the proportionality argument in 4.6.

### 4.2 Lawful-basis mapping (GDPR Art.6 + Art.9; PIPA) — [COUNSEL TO CONFIRM each row]

> Counsel must confirm the *kind* of basis and whether consent-as-Art.6 basis is sound for a service marketed to minors (ICO/EDPB caution that consent from children + necessity-for-service can be in tension; an Art.6(1)(b) "necessary for the contract" framing for P1–P4 core, with Art.9(2)(a) explicit consent layered for special-category, is a candidate but **not yet a determination**).

| # | Candidate GDPR Art.6 | Candidate GDPR Art.9 (if special) | Candidate KR PIPA | Notes for counsel |
|---|----------------------|-----------------------------------|-------------------|-------------------|
| P1 | 6(1)(b) contract / 6(1)(c) legal obligation (age-gating duty) | n/a | §15 collection w/ consent; **§22-2 legal-rep consent <14** | Under-14 self-service is **rejected** server-side (`0030`:30-34), so the §22-2 guardian-consent path is *not relied upon in production* — it is schema-only (`0028`; guardian flow unbuilt). Confirm this satisfies "no under-14 processing" rather than "compliant under-14 processing." |
| P2/P3 | 6(1)(b) contract (the AI reflection IS the service) | **9(2)(a) explicit consent** to process mental-health data | §15/§17/§22 general consent **+ §23 sensitive-info separate consent** + §28-8/§28-2 **overseas-transfer** consent (Gemini/Supabase) | §23 sensitive-data ack + overseas-transfer ack are collected as discrete acks (`src/lib/auth/consent-selections.ts:20-21`; `0031` `sensitive_data_ack`, `overseas_transfer_ack`). Confirm explicit-consent validity for 14-17 self-consenting minors. |
| P4 | 6(1)(d) **vital interests** and/or 6(1)(b) | **9(2)(c) vital interests** / 9(2)(g) substantial public interest | §23 / emergency provisions | Crisis routing is **always-on, tier- and consent-independent** (hard rail #1). Counsel: confirm vital-interests as the basis that does **not** depend on consent (so a withdrawn consent never disables crisis safety). |
| P5 | 6(1)(c) legal obligation (accountability) | n/a | §22 accountability | Immutable ledger (4.4). |
| P6 | 6(1)(f) legitimate interests (safety governance) | n/a — hashes only | — | LIA needed [COUNSEL TO CONFIRM]; data is hashed (`0004`). |
| P7 | 6(1)(b)/6(1)(a) | derived | §15 | **Minors: OFF unless explicitly enabled** and currently un-enable-able while locked (4.3). |
| P8 | **6(1)(a) consent** | n/a | §22 + ISMS/정보통신망법 | **Minors locked OFF** (`0032/0033/0038`); opt-out is immediate (`src/lib/privacy/analytics-consent-queue.ts:4`). |
| P9 | **6(1)(a) consent** | n/a | 정보통신망법 §50 | **Minors never** (`src/lib/ads/policy.ts:11-13`, rule 2; `src/lib/ads/policy.ts:58` null=fail-closed). |
| P10 | — | — | — | No processing occurs; pre-locked. |

**Art.8 GDPR (child's consent for information-society services):** the digital-consent age is **jurisdiction-dependent** and the code encodes the matrix `KR=14 / US=13 / EU=16 / DEFAULT=16` as `DIGITAL_CONSENT_AGE` (`src/lib/auth/consent-age.ts:28-33`). **The live gate resolves the jurisdiction from the device region and falls back to KR=14** when that region is unreadable or unrecognised (`src/lib/auth/consent-age.ts:108-121`; signal at `src/lib/auth/device-region.ts`). ⚠ **[RE-READ 2026-09-08]** This said the gate "hard-assumes KR=14 because no reliable jurisdiction signal is collected" and that `LEXICON_LAST_LEGAL_REVIEW` is null. The signal landed 2026-08-16 and the constant is `"2026-06-10"`. The remaining exposure is the **fallback**, not the absence: an EU user whose region cannot be read is still governed by KR=14. **[COUNSEL TO CONFIRM]** that KR-only operation is the actual launch scope; any EU/UK exposure makes the 14-floor non-conforming (Art.8 default 16) and triggers the D-20 UK/EU OFF-fallback (DECISIONS.md D-20 소수의견).

### 4.3 Special-category data (GDPR Art.9 / PIPA §23 sensitive information)

**Factual basis for the Art.9 trigger:** the product's core artifact is mental-health/self-reflection journaling. Records are explicitly described in-code as "the user's MOST personal data" (`src/lib/wiki/export.ts:18-22`). Processing these to produce AI reflection necessarily *infers* mental/emotional state → **special-category under Art.9(1)** and **sensitive information under PIPA §23** [COUNSEL TO CONFIRM]. The seed corpus (`supabase/seed/ai-mental-health-safety.sql`, `crisis-detection.sql`, etc.) confirms the mental-health domain.

**Controls implemented today that bear on the Art.9/§23 basis:**
- **Separate sensitive-data consent ack** collected at sign-up, distinct from service consent (`src/lib/auth/consent-selections.ts:3-4,20-21`); recorded immutably as `sensitive_data_ack` (`0031`).
- **No pre-consent sensitive egress** (hard rail #2): every outward/profiling/external key defaults OFF for everyone and is **server-clamped** OFF for minors (`0032`, `0033`, `0038`).
- **Crisis path uses deterministic, human-written fixed templates — the LLM is never called in red-zone** (`src/lib/llm/safety.ts:408-438`; test asserts `mockGenerateContent` not called, `src/lib/llm/__tests__/advisor-output-swap.test.ts:230`). This keeps the most sensitive moment off the model entirely.

### 4.4 Child-consent mechanics & age assurance

**Implemented today:**
- **Hard floor <14 enforced server-side**, not just client: trigger `enforce_user_age_tier` rejects `age_years < 14` and *derives* `minor_tier` (14-17 → `minor_self`, ≥18 → `adult`) — client-supplied tier is overwritten (`0030`:25-44). DOB is mandatory (`0030`:22-24).
- **`minor_tier` is server-only** — a self-`UPDATE` to `minor_tier='adult'` is rejected unless `birth_date` also changes (`block_self_tier_change`, `0038`); this closes the "downgrade isMinor to unlock adult data rails" attack (hard rail #4).
- **Immutable consent ledger (K5 / PIPA accountability):** append-only, select/insert-only, **no UPDATE/DELETE policy** (`0031`:36-55). Captures `consent_version`, `policy_version`, `terms_version`, `purposes`, `llm_processing_ack`, `overseas_transfer_ack`, `sensitive_data_ack`, `age_band` (`minor_self`/`adult`). IP/UA stored **hashed only** (`0031` `ip_hash`/`ua_hash`, data minimization).

**Known weakness for counsel (age assurance):** age is **DOB self-report** with no verification — the weakest assurance tier under the ICO Children's Code (Std 3). The §22-2 guardian-consent flow for under-14 is **schema-only and unbuilt** (`0028` comment; guardian rows table exists but the verification route "added in a later PR" — `0028`:67-69), and under-14 are simply rejected rather than onboarded via guardian. **[COUNSEL TO CONFIRM]** whether self-reported DOB + under-14 rejection is sufficient, or whether stronger age assurance is required given the special-category nature of the data.

### 4.5 Necessity — why each processing operation is necessary for the mission

The stated mission is **teaching minors to use AI well (AI literacy / scaffolded autonomy)** — not companionship (D-19), not clinical service. Necessity argument per purpose [COUNSEL TO CONFIRM the necessity test is met]:

- **P2/P3 (AI reflection on the user's own notes)** is the *irreducible core*: without LLM processing of the user's wiki/source material there is no "second brain." It is therefore "necessary for the performance of the contract," not an optional add-on. Critically, the snapshot fed to the model is the **wiki/source layer, with journal records excluded by default** (4.6) — i.e., the necessity is satisfied with *less* than the full sensitive corpus.
- **P4 (crisis handoff)** is necessary to discharge the duty of care toward minors in a mental-health-adjacent product; it is structured to operate **independently of consent** (vital interests) so safety never turns on a toggle.
- **P5/P6 (consent ledger + AI audit)** are necessary for accountability/demonstrability (Art.5(2); PIPA accountability) and are deliberately **content-free** (hashes, categorical flags).
- **P8/P9/P10 (analytics/ads/training)** are **not necessary for the mission** and are correspondingly **OFF/locked for minors** — their absence is the proof that the necessary set is small.

### 4.6 Proportionality — the "bike never slows" design

**Core proportionality claim (for counsel to adopt or temper):** the minor-protection measures are proportionate because they impose **zero cost on the legitimate purpose** (AI-literacy enablement) while materially reducing data risk. The protections are *data rails*, not *capability caps*.

Evidence this is true in code, not just claimed:
1. **Capability is constant across age.** No model/prompt/RAG/persona branch keys on `isMinor`; the sole `isMinor` use in the LLM path is crisis-hotline selection (`src/lib/llm/types.ts:81-84,114-117`; `src/lib/llm/safety.ts:408`; `src/lib/llm/boundary.ts:560-576`). A 14-year-old and a 40-year-old receive identical AI utility. *(This is the "bike" — it never slows.)*
2. **The minor-specific differences are exclusively on the data layer** — egress locks (`0032/0033/0038`), ads suppression (`src/lib/ads/policy.ts` rule 2), analytics lock (`analytics-consent-queue`), training pre-lock (`0033`). *(These are the "training wheels" — added/removed without touching the bike's speed.)*
3. **Least-restrictive-of-utility:** the protections chosen (default-OFF privacy prefs, server clamp, fail-closed null handling at `src/lib/ads/policy.ts:58` and `0038`'s real-tier clamp) restrict *data flows* and not the *service experience*. A capability cap (e.g., disabling AI for minors) was explicitly **rejected** as both unnecessary and contrary to the child's best-interests/learning mission (minor-ai-literacy-enablement HTML, "bike never slows"; D-18 판정).

**Proportionality of the *planned* (DPIA-gated) enablement features:** D-18 adopts an *enablement-default* with **ephemeral/session-local fade** and **persistent behavioral scoring deferred behind counsel (Art.5 profiling) review** (DECISIONS.md D-18 판정) — i.e., the design already chose the less-intrusive option (no durable competence-score profile) precisely to keep proportionality. **[COUNSEL TO CONFIRM]** the Art.5 / automated-decision analysis for any persistent scoring before it is built.

### 4.7 Data minimization (Art.5(1)(c) / PIPA §3(1))

- **Journal text is excluded from all LLM prompts by default.** `exportUserWiki` defaults `includeRecords` off; the chat RAG path and ops path both rely on this and are documented to "never silently start shipping diary text into prompts" (`src/lib/wiki/export.ts:18-29`, `src/lib/wiki/export.ts:240`; `src/lib/ops/recommend.ts:6-8` "wiki snapshot ONLY … no-journal-in-prompts contract").
- **600-character snapshot cap** on each page/record body sent to the model — chat (`src/lib/chat/conversation.ts:254-255`, `bodyCharLimit:600`, `pageLimit:50`, `sourceLimit:100`) and ops (`src/lib/ops/recommend.ts:54` `SNAPSHOT_CHAR_LIMIT=600`). The model receives clipped excerpts, not full documents.
- **Fail-closed egress allowlist** on exported metadata — only an allowlisted set of frontmatter keys may leave; everything else (geolocation, tracking tokens, private notes) is dropped (`src/lib/wiki/export.ts:83-91`). This replaced a denylist that "failed open."
- **Hashing / categorical-only at rest:** AI audit stores `prompt_hash`/`output_hash`, never raw text (`0004`); crisis events store categorical trigger info + a **non-cryptographic obfuscated** `user_id_hash` and "never raw user text" (`0012`); consent ledger stores hashed IP/UA (`0031`). *(Counsel note: the crisis `user_id_hash` is documented as djb2 32-bit obfuscation, **not anonymization** — re-identifiable; flag whether this meets pseudonymization expectations.)*
- **Untrusted-data fencing** of the snapshot (`src/lib/chat/conversation.ts:293-296`; `src/lib/ops/recommend.ts:248-250`) — a minimization-adjacent integrity control preventing injected content from widening the data the model acts on.

### 4.8 Implemented-today vs. planned (DPIA-gated)

| Control / basis element | Status | Cite |
|---|---|---|
| Server age floor <14 + tier derivation | **Implemented** | `0030` |
| Minor high-privacy seed + server clamp (ads/sharing/recs/analytics/training/persona/export off) | **Implemented** | `0032`, `0033`, `0038` |
| `minor_tier` server-only (anti-downgrade) | **Implemented** | `0038` |
| Immutable consent ledger w/ §23 + overseas-transfer acks | **Implemented** | `0031`, `consent-selections.ts` |
| Crisis hard-rail (deterministic, human templates, minor→1388, LLM not called) | **Implemented** | `src/lib/llm/safety.ts:408-438`, `0012` |
| Journal-excluded prompts + 600-char cap + fail-closed allowlist | **Implemented** | `export.ts`, `src/lib/chat/conversation.ts:254-255`, `recommend.ts` |
| Ads never to minors / analytics locked | **Implemented** | `src/lib/ads/policy.ts`, `analytics-consent-queue.ts` |
| D-20 ops-recommend minor gate (closed the ungated-runtime bug) | **Implemented** | `src/lib/ops/recommend.ts:127-134`, `src/screens/deepspace/dds-ops-screen.tsx:588-595` |
| **AI-vs-human disclosure surface (K11 / EU AI Act Art.50 / 韓 AI기본법 §13)** | **Planned — GAP** | minor-ai HTML rail #5; not in build |
| **Data export / portability (GDPR Art.20)** | **Implemented; scope open** | both rights are wired: erasure via `supabase/functions/delete-account/index.ts`, portability via `supabase/functions/export-account/index.ts` (versioned JSON, all user-owned tables + the `raw-clippings` bucket). *(A user-facing wiki/records markdown bundle exists as "your second brain travels" `export.ts`, but [COUNSEL TO CONFIRM] whether it qualifies as Art.20 portability of **all** personal data — it omits consent/persona/audit data.)* |
| **Jurisdiction signal (Art.8 age by country)** | **Signal shipped 2026-08-16; legal sign-off pending** — `resolveJurisdiction()` reads the device region and `DIGITAL_CONSENT_AGE.EU` applies; an unreadable region still answers KR by design | `src/lib/auth/consent-age.ts:8-12`, `src/lib/auth/consent-age.ts:108-121` |
| **Stronger age assurance / under-14 guardian flow** | **Planned — schema only** | `0028` (guardian table, verification route unbuilt) |
| **Enablement-default cognitive-forcing (D-18), non-companion CI invariants (D-19), recs glass-box activation (D-20)** | **Planned — DPIA + §11-5 counsel gate** | DECISIONS.md D-18/19/20 |

### 4.9 Open questions routed to counsel from this section

*(These are folded into the consolidated counsel register in Section 7; listed here for the lawful-basis trail.)*

1. **Primary Art.6 basis for P2/P3** — contract-necessity (6(1)(b)) vs consent (6(1)(a)) for a minor-facing service; and confirmation that **Art.9(2)(a) explicit consent** is the correct special-category gateway for 14-17 self-consenting minors (or whether another Art.9 condition fits).
2. **Art.8 / PIPA §22-2 scope** — is launch genuinely KR-only? If any EU/UK exposure, the hardcoded 14-floor (`consent-age.ts`) is non-conforming and the D-20 EU/UK-OFF fallback must apply before launch.
3. **Age-assurance adequacy** — self-reported DOB + hard under-14 rejection vs a requirement for verifiable assurance given Art.9 data (ICO Children's Code Std 3).
4. **Crisis basis** — confirm a **consent-independent** lawful basis (vital interests) so safety is never disabled by consent withdrawal.
5. **Profiling/automated-decisioning (Art.5/22)** — required before any *persistent* learner-competence scoring (D-18 defers this behind counsel).
6. **Art.20 portability** — whether the existing erasure-only path is a compliance gap and whether the wiki/records export satisfies portability.
7. **Overseas transfer** (Gemini/Supabase) — confirm the §28-8/§28-2 (PIPA) and Chapter V (GDPR) transfer mechanism beyond the recorded user ack.

---

## Section 5 — Risks to Minors, Mitigations & Residual Risk

### 5.0 How to read this section (disambiguation + crosswalk)

This section combines two complementary registers that were drafted through **different lenses** and therefore use **independent risk numbering**. Read the section prefix as part of each identifier:

- **§5A — Risk Register (rights-of-the-child lens):** risks **5A-R1 … 5A-R8**, scored minor-weighted, focused on the rights and freedoms of the data subject.
- **§5B — Measures / Mitigations (hard-rail / control lens):** control-risks **5B-R1 … 5B-R10**, organised around the five hard rails and the implemented controls, each with residual risk.

> **Disambiguation:** "R4" means **5A-R4 (companion dependency)** inside §5A, but **5B-R4 (account take-over / self-downgrade)** inside §5B. Always carry the section prefix. The crosswalk below maps the two registers; **[COUNSEL TO CONFIRM]** items appear in both and are not deduplicated away.

**Crosswalk — §5A risk → §5B measure coverage:**

| §5A risk (rights lens) | Primary §5B measure(s) (control lens) |
|---|---|
| 5A-R1 Cross-tenant exposure of another child's journal | RLS + journal-exclusion controls (referenced under 5B-R2 / C-FP; **no dedicated 5B item — counsel/eng to add a cross-tenant assertion test**) |
| 5A-R2 Pre-consent sensitive egress | **5B-R2** (C-CONSENT / C-SENS / C-EGRESS) |
| 5A-R3 Over-reliance / automation bias | **5B-R6** (D-18/19/20) + 5B-R5 (disclosure) |
| 5A-R4 Parasocial / companion dependency | **5B-R6** + **5B-R5** (AI-vs-human disclosure) |
| 5A-R5 Clinical-sounding advice | **5B-R6**, **5B-R1** (crisis), C-LEX |
| 5A-R6 Weak DOB age assurance | **5B-R7** (+ 5B-R10 jurisdiction) |
| 5A-R7 Crisis mishandling | **5B-R1** (C-CRISIS) |
| 5A-R8 Profiling via recommendations | **5B-R6** (D-20 gate) + **5B-R3** (training/ads) |
| *(additional control-risks only in §5B)* | 5B-R3 ads/training, 5B-R4 account take-over, 5B-R5 K11 disclosure, 5B-R9 cross-border transfer, 5B-R10 jurisdiction hardcode |

---

### 5A — Risk Register (Risks to the Rights and Freedoms of Minors)

#### 5a.0 Scoring method (minor-weighted)

- **Likelihood**: Rare / Possible / Likely / Almost-certain — probability the risk materialises for a real user given today's controls.
- **Severity**: Low / Moderate / High / **Severe** — weighted **up one band** for this cohort because (a) data subjects are 14–17, a class ICO Children's Code and GDPR Recital 38 treat as meriting "specific protection"; (b) the processed content is journaling = **special-category mental-health data** (GDPR Art.9 / PIPA §23) **[COUNSEL TO CONFIRM Art.9 classification]**; (c) age assurance is self-reported DOB, so the cohort boundary itself is porous.
- **Capability-parity caveat** (load-bearing for the whole register): AI capability is **byte-identical for minors and adults** (§1.2 fact 1). `isMinor` touches the LLM pipeline in exactly one place — swapping the crisis hotline to the youth line (1388) (`src/lib/llm/boundary.ts:560-576` forwards `minor` into `routeCrisis` solely for the "crisis output-swap"; hotline selection at `src/app/capture.tsx:778-781,2081`; `src/lib/safety/classifier.ts:70-90`; `src/lib/llm/safety.ts:408-438`). Every minor protection is therefore a **data/egress rail, not a capability limit** — so risks rooted in *what the model says or how the child relates to it* are **age-invariant** and land on the minor cohort at full adult strength.

#### 5a.1 Risk register (summary)

| # | Risk | Likelihood | Severity (minor-weighted) | Primary right(s) affected |
|---|------|-----------|---------------------------|---------------------------|
| 5A-R1 | Cross-tenant exposure of another child's journal | Rare | **Severe** | Confidentiality / Art.5(1)(f) integrity; privacy (ECHR 8) |
| 5A-R2 | Sensitive (mental-health) egress to LLM/sub-processor **before** valid consent | Possible | **Severe** | Lawfulness Art.6/9; PIPA §23; data minimisation |
| 5A-R3 | Over-reliance / automation bias (uncritical acceptance of AI) | Likely | High | Right to develop autonomy; best-interests (UNCRC; ICO Std.1) |
| 5A-R4 | Parasocial / companion dependency | Possible | **Severe** | Mental integrity / best-interests; freedom from exploitative design |
| 5A-R5 | AI emits clinical-sounding advice on a vulnerable child | Possible | **Severe** | Best-interests; protection from harm; non-deception |
| 5A-R6 | Weak DOB age assurance lets under-14 register | Likely | **Severe** | Children's Code Std.3; PIPA §22-2; COPPA/GDPR Art.8 lawful basis |
| 5A-R7 | Crisis mishandling (missed/garbled self-harm signal) | Rare | **Severe** | Life/safety (ECHR 2); best-interests |
| 5A-R8 | Profiling of a minor via recommendations | Possible→Rare* | High | Art.22 / Art.4(4) profiling; Children's Code Std.12 |

\*5A-R8 likelihood was **Likely** until the D-20 gate landed; see 5a.9.

#### 5a.2 5A-R1 — Cross-tenant data exposure

**What / where.** All per-user tables enforce row-level isolation keyed on `auth.uid()` (`db/migrations/0009_rls_policies.sql:16-57` — `users`, records, personas, consent all `USING (user_id = auth.uid())`; consent ledger mirrors this at `0031_consent_records.sql`). The acute surface is the **LLM context-assembly path**: a child's own wiki snapshot is serialised into prompts (`src/lib/wiki/export.ts` → `src/lib/ops/recommend.ts` `exportUserWiki`, `src/app/core-brain.tsx:98` persona build). A tenancy bug in snapshot assembly, or a shared cache, would leak one child's mental-health notes into another child's AI output.

**Mitigations today.** RLS default-deny per tenant; snapshot builder is user-scoped; **journal records are excluded from prompts by contract** ("exportUserWiki default excludes journal records — the cycle-21 no-journal-in-prompts contract", `src/lib/ops/recommend.ts:7-8`), shrinking the blast radius of any assembly bug.

**Likelihood Rare / Severity Severe.** RLS is mature, but cross-tenant leakage of a *named minor's* mental-health text is among the highest-harm outcomes; severity floored at Severe regardless of low likelihood. **[COUNSEL TO CONFIRM]** breach-notification posture if it ever occurs (PIPA §34 / GDPR Art.33-34, minor data).
**Residual / debt:** no automated cross-tenant assertion test on the prompt-assembly path is documented; recommend adding to DPIA action list.

#### 5a.3 5A-R2 — Sensitive disclosure egress before consent

**What / where.** Journaling content is processed by an **overseas LLM sub-processor** (the LLM boundary module, `src/lib/llm/boundary.ts`) and stored in Supabase. PIPA §23 sensitive-data consent + §17 overseas-transfer notice + LLM-processing acknowledgement are modelled as discrete acks in the immutable consent ledger (`db/migrations/0031_consent_records.sql`: `sensitive_data_ack`, `overseas_transfer_ack`, `llm_processing_ack`; append-only, no UPDATE/DELETE policy). **The gap is wiring**: ⚠ **[RE-READ 2026-09-08, measuring what the 2026-09-07 pass left open]** the migration header reads "**NOT YET WIRED at sign-up: the consent NOTICE + ack checkboxes are a UI surface**" (`db/migrations/0031_consent_records.sql:11-13`), and the 09-07 pass correctly said it had not checked whether that was still true. **It is not.** The collecting UI is wired: `src/lib/auth/consent-selections.ts:16-21`; both entry screens render `<ConsentNotice>`; `recordConsentBestEffort(` at `src/lib/auth/useSignUpForm.ts:318` and `src/app/(auth)/complete-profile.tsx:169`; the three acks are written to the ledger at `src/lib/supabase/consent.ts:124-126`. The header cannot say so because a migration is immutable. ⚠ **[RE-READ 2026-09-08, second pass]** this sentence used to read *“so today the ledger schema exists but the collecting UI may be incomplete — meaning egress could precede a recorded granular ack”*, which **contradicts the four measurements immediately above it**: it survived the correction that established the UI is wired. The residual that actually remains is narrower. The ack write is **best-effort by design and never gates entry** (`src/lib/supabase/consent.ts`, `recordConsentBestEffort`), so a user can enter after the UI collected the acks but the ledger row failed to write. The acks are still *given*; what can be missing is the **demonstrable record** of them (GDPR Art.7(1)). The seam carries that outcome out of both flows as three distinct states — `consentRecorded: true | false | null` (`src/lib/auth/sign-up-flow.ts:64`, `src/lib/auth/complete-profile-flow.ts:45`) — and a failure is reported at error level rather than swallowed. Neither screen changes its behaviour on it: that is a **decision** (carry the result, leave the UX as it is), not an oversight. Egress defaults are otherwise OFF: every outward/profiling pref defaults `false` (`src/lib/privacy/prefs.ts:60`) and minors are server-clamped (`db/migrations/0032`, `0033_minor_privacy_enforcement.sql`).

**Tension to resolve.** The *core product function itself* (AI reflection on journal text) is an egress of special-category data to a US processor. "No pre-consent sensitive egress" (hard rail #2) therefore depends entirely on the sign-up consent surface being live and blocking before first AI call. **[COUNSEL TO CONFIRM]**: (a) whether a 14-year-old's self-consent is a valid Art.8/Art.9(2)(a) basis for special-category overseas transfer, or whether guardian involvement is required despite KR self-consent at 14; (b) adequacy basis for the US transfer of minor mental-health data.
**Likelihood Possible / Severity Severe.** Implemented today: defaults-OFF + clamp + ledger schema. Planned (DPIA-gated): the blocking consent UI + `recordConsent()` wiring.

#### 5a.4 5A-R3 — Over-reliance / automation bias

**What / where.** The model gives a 14-year-old the **same** depth, fluency, and authority it gives a 40-year-old (capability parity, 5a.0). There is **no friction, no provenance strip, no "verify this" nudge, and no AI-uncertainty signal implemented today** on the general AI surfaces — the literacy scaffolding (learner-licence L0–L3, "show-your-work" provenance, "내 생각 먼저" pre-commit friction) is **designed but unbuilt** (report §2–3; Lanes 1, 2, 4). Buçinca/Gajos (CSCW 2021) is cited in-report as evidence that absence of pre-commitment friction *increases* overreliance.

**Mitigations today.** Effectively none specific to over-reliance; the recommendation prompt self-labels "not a medical or clinical service" (`src/lib/ops/recommend.ts` SYSTEM_PROMPT) but that is copy, not a behavioural brake.
**Likelihood Likely / Severity High.** A reflective journaling minor is the exact profile prone to treating AI output as authoritative self-knowledge. **[COUNSEL TO CONFIRM]** whether absence of literacy scaffolding for minors is itself a best-interests/ICO Std.1 deficiency. Planned (DPIA-gated, D-18 ratified): default-on L0 scaffolding with ephemeral (non-persistent) fade signals.

#### 5a.5 5A-R4 — Parasocial / companion dependency

**What / where.** The affordances debated under D-19 are **real and age-invariant in the running code**:
- **Mascot presence**: a home-screen companion that "dozes off" when idle and wakes on interaction (`src/lib/companion/fab-state.ts:15,25,51`; sprite roster `src/lib/assets/soulcore-v3.ts:21-25`) — a social-presence cue.
- **First-person voice**: ⚠ **[RE-READ 2026-09-08]** this quoted *"I'm here. What's on your mind? I can pull from everything you've kept."* as the personas' opening. **That string is not in the repository** - `grep` finds it in no source, locale or test file, and the cited range holds `id`/`name`/`role`, not greeting text. **All six persona greetings are second-person questions addressed to the user**, and they are i18n lookups rather than literals (`src/lib/chat/personas.ts:40-43`): SecondB opens "What would you like to find in your records?" / "기록에서 무엇을 찾아볼까요?" (`locales/en/secondb.json`, `locales/ko/secondb.json`). The first-person-plural claim **does** hold, but its evidence is the card body rather than the comment describing it - `요즘 우리가 자주 머문 동네는 …` (`src/lib/persona/center.ts:92`).
- **Long-term memory**: `long_term_memory` is one of **three** keys a minor is *permitted to switch on* (`MINOR_PROMOTABLE_KEYS`, `src/lib/privacy/prefs.ts:95-99`). ⚠ **[RE-READ 2026-09-07]** This said "the **one**" and cited line 60 of that file, which is the defaults loop, not the promotable list. The list is `long_term_memory`, `ops_push` and `chat_autosave`; the last joined on 2026-08-18. The module's stated reason for all three is that **nothing leaves the account** - `chat_autosave` moves the user's own words from an ephemeral chat into their own RLS-isolated wiki, where `/wiki` can delete them (`src/lib/privacy/prefs.ts:86-94`). **[COUNSEL TO CONFIRM]** whether an in-account move of conversation content is a promotion a 14-17 minor may make unaided, given that it changes what the persona is built from. — deepening continuity/attachment.

Together (named character + first-person address + persistent memory + idle/wake presence) these are textbook companion affordances, on a mental-health surface, for minors. APA's 2025 health advisory on parasocial AI dependency is cited in-report.

**Mitigations.** D-19 verdict adopted "non-companion via **design-enforced invariants**" — anti-anthropomorphism promoted from guideline to **CI gate**, plus a dependency-safety audit. **These are planned, not yet built** (DECISIONS D-19 "설계 후속(즉시 가능)"). Lane 6 dependency self-mirror is explicitly **"코칭, not a min/day cap"** — by design it does not throttle a heavily-dependent child.
**Likelihood Possible / Severity Severe.** **[COUNSEL TO CONFIRM]** exposure under CA SB243 companion-bot definition, FTC 6(b), CSM/Stanford "<18 companion" framing, and 韓 AI기본법 §13 — and specifically the **preserved minority view (D-19)**: a low-literacy 15-year-old who falsifies DOB obtains adult routing *and* these affordances with only soft coaching; counsel should rule whether a youngest-cohort interim gate is required.

#### 5a.6 5A-R5 — AI giving clinical-sounding advice

**What / where.** No clinical-content classifier sits on model *output*. ⚠ **[RE-READ 2026-09-08]** this said the lexicon is **the only guard**. Two further gates run on every build inside `npm run verify`: **`check:anti-anthro`** (D-19) scans every string value in `locales/**/*.json` so user-facing copy reads as a scaffolded-reflection tool rather than a companion bot (`scripts/check-anti-anthro.ts:1-3`), and **`check:mascot-voice`** refuses attachment, exclusivity and unsupported personal claims in user-addressed copy (`scripts/check-mascot-voice.ts:1-5`) - its watched-key list names `personas.secondb.greeting` outright (`scripts/check-mascot-voice.ts:13-17`). Neither sits on model *output*, which is the point this row makes and which stands; but "the only guard" understated what exists. The **non-clinical vocabulary lexicon** (K10; `src/lib/safety/lexicon.ts`, referenced `src/lib/chat/personas.ts:13`) steers register away from diagnostic/deficit language, plus prompt instructions ("never promise outcomes", "not a medical or clinical service", `recommend.ts` SYSTEM_PROMPT). Because capability is age-invariant, a minor can elicit advice on mood, self-worth, relationships, or somatic symptoms that *reads* as clinical guidance, with no minor-specific dampening.

**Likelihood Possible / Severity Severe.** Mental-health-adjacent advice to a child carries acute harm potential. **[COUNSEL TO CONFIRM]**: (a) whether the product risks construction as an unregulated health/medical device or counselling service in any target market; (b) whether the non-clinical lexicon guard is a *sufficient* safeguard or merely cosmetic for the minor cohort. Note Raine v. OpenAI (2025) is cited in-report as the salient precedent.

#### 5a.7 5A-R6 — Weak DOB age assurance (under-14 ingress)

**What / where.** Registration age is **self-reported birth_date with no verification**. The server age-gate trigger `enforce_user_age_tier()` **rejects** computed age < 14 and derives `minor_tier` server-side (`db/migrations/0030_server_age_gate.sql`; hardened search_path + minor-privacy seed in `db/migrations/0033_minor_privacy_enforcement.sql:23-62`; `minor_tier` made server-only / unforgeable in `0038_minor_tier_guard_and_audit_lockdown.sql` A1). **But the trigger only sees the DOB the child types** — an under-14 entering a false DOB passes the floor and is mis-tiered as `minor_self` or `adult`. This is the weakest age-assurance class under ICO Children's Code Std.3 (self-declaration).

**Compounding issue — jurisdiction resolves, but fails safe to KR.** The self-consent floor resolves to KR=14 whenever the device region is unreadable or unrecognised (`src/lib/auth/consent-age.ts:32`, `DEFAULT: 16`; resolver at `src/lib/auth/consent-age.ts:108-121`); ⚠ **[RE-READ 2026-09-08]** this passage quoted the module comment as saying "the app does not yet collect a reliable jurisdiction signal (locale en/ko is not a country)" and that "`LEXICON_LAST_LEGAL_REVIEW` is still null". **Neither half is true any more, and the lines cited now say the opposite**: they open "2026-08-16: the country signal landed" (`src/lib/auth/consent-age.ts:8-12`), and the constant reads `"2026-06-10"` (`src/lib/safety/lexicon.ts:460`). The fail-safe below is real and is the actual residual risk; the absence of a signal is not. So a non-KR minor may be governed by the wrong consent age.

**Likelihood Likely / Severity Severe.** Under-13 ingress collapses the entire COPPA/GDPR Art.8/PIPA §22-2 lawful-basis structure (no guardian-consent flow exists — `0030` notes the guardian path "is a later PR"). **[COUNSEL TO CONFIRM]**: required age-assurance tier for a mental-health app processing special-category minor data (likely above self-declaration); and the minimum acceptable jurisdiction-detection signal before relying on any non-KR consent age.

#### 5a.8 5A-R7 — Crisis mishandling

**What / where.** Crisis handling is the **strongest** rail and is deterministic: a CRISIS_TERMS lexicon hit short-circuits the model and returns a **fixed, human-written template** — never LLM-generated text (`src/lib/llm/safety.ts:408-438` `fixedCrisisResponse`, versioned `red-ko-minor-v2` for 14-17). A **server-authoritative backstop** re-checks at the proxy (`src/lib/llm/boundary.ts:370-403` `inspectProxyCrisisRejection` / `proxyCrisisSafetyResult`) so a phrase that slips the client lexicon is still caught. Every crisis routing is written to two ledgers — `ai_audit_log` + restricted `crisis_events` (`src/lib/llm/boundary.ts:478-538`; `src/lib/llm/audit-write-outbox.ts:193-204`). Minors route to 1388 (youth line) + 109. A race guard ensures `isMinor` is resolved **before** any crisis-capable persona build, so a minor never gets adult routing mid-resolve (`src/app/persona.tsx:196-202`).

**Residual.** Detection is still **lexicon/keyword + model-classifier gated** — an obfuscated, metaphorical, or non-Korean/English expression of self-harm intent can evade both layers (false-negative). The handoff is to a phone line, not an in-app warm transfer; efficacy depends on the child calling.
**Likelihood Rare / Severity Severe.** Life-safety; severity floored at Severe. **[COUNSEL TO CONFIRM]** duty-of-care / mandatory-reporting obligations for a minor self-harm signal, and whether passive hotline display discharges them. Planned (D-19 safety-valve): lower the crisis-handoff threshold when cadence-spike + distress co-occur.

#### 5a.9 5A-R8 — Profiling via recommendations

**What / where.** `/ops` recommendations turn the child's own wiki/source material into routine suggestions (egress = 0; output stays in-account). **This was a live defect**: per D-20's pre-decision code finding, `runRecommend` previously **ignored the privacy pref entirely**, so recommendations executed **ungated for everyone including minors**, and the `0038` clamp was *nominal* (no code read the gate). **Fixed now**: `recommendationsAllowed()` gates at the call site — a minor runs **only** if `recommendations === true`, which is server-locked OFF and **non-promotable** for minors, so a minor's wiki snapshot can no longer reach the LLM ungated (`src/lib/ops/recommend.ts:127-134` `recommendationsAllowed`, called at `src/screens/deepspace/dds-ops-screen.tsx:588-595` and `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2786`; clamp `0032/0033`). ⚠ **[RE-READ 2026-09-08]** these call sites were cited as src/app/ops.tsx:104-129 (quoted without backticks: it is a record of a fixed citation, not a citation). **The gate is real and shipped - only the coordinates were dead.** That range sat inside `OpsLegacy`, which `src/app/ops.tsx` rendered only when `UI_MODE` was not deep-space; the code default is deep-space (`src/lib/ui-mode.ts:31`) and all three delivery paths set it explicitly, so no shipped build drew it. **That renderer was moved out of the build on 2026-09-08** and now lives, byte-identical, at `legacy/screens/ops.tsx` (a sha256 pin in `tools-reachable.test.ts` holds it there unchanged). The engine re-checks the gate independently - `recommendationsAllowed(input.minor` (`src/lib/ops/recommend.ts:199-207`), so the control does not rest on any single screen. Default-OFF for all (`src/lib/privacy/prefs.ts:55-62`).

**Why still a risk.** Even with egress=0, deriving "what this user should do" from their mental-health notes is **profiling under GDPR Art.4(4)** — the layer-error called out in D-20 ("egress0 is true, but 'not profiling' does not follow"). The D-20 verdict (alt′ "glass-box OFF + understanding-gated activation") is **planned, not built**; only Step 0 (the gate wiring) shipped.
**Likelihood Possible (was Likely pre-gate) / Severity High.** **[COUNSEL TO CONFIRM]**: Art.22 solely-automated-decision applicability; Children's Code Std.12 (profiling off by default for children); and whether a 14-year-old's "understanding-gated" activation can be a valid Art.8 basis. **Minority view preserved (D-20):** for pure UK/EU launch, hold recommendations hard-OFF for minors until DPIA completion + counsel sign-off.

#### 5a.10 Cross-cutting debt feeding multiple risks

- **K11 AI-vs-human disclosure is a confirmed gap (feeds 5A-R3, 5A-R4, 5A-R5).** A code search for any persistent AI-disclosure / "I am an AI" / "not your therapist" / Art.50 surface returns **nothing** in `src/` (non-test). Worse, the only first-person framing present is the *opposite* signal — the persona greets as a person ("I'm here…", `src/lib/chat/personas.ts:35-39`). Lane 5 (boundary onboarding + EU AI Act Art.50 notice) is designed but unbuilt. **[COUNSEL TO CONFIRM]** EU AI Act Art.50 + 韓 AI기본법 §13 disclosure obligations and minimum surface.
- **Data export/portability (GDPR Art.20).** Both are wired: delete via `delete-account`, export via `export-account` (`supabase/functions/export-account/index.ts:1-9`). ⚠ **[RE-READ 2026-09-08]** This read "export does not [exist]" and cited report flag ③, which predates the function. What is still open is the scope question in 6.1.3, not the path.
- **DOB-tier porosity (5A-R6) silently widens 5A-R4/R5/R8**, since a falsified-age minor inherits adult routing and affordances.

**Overall residual-risk posture for counsel:** the **data rails** (RLS, defaults-OFF, server clamp, immutable consent ledger, deterministic crisis handoff) are largely implemented and strong. The **highest unmitigated residual risks** are behavioural and age-invariant — 5A-R3 over-reliance, 5A-R4 companion dependency, 5A-R5 clinical-tone advice — plus the **age-assurance floor (5A-R6)** and the **un-wired consent surface (5A-R2)**, all of which are gated on this DPIA + the §11-5 legal sign-off before the enablement build proceeds.

---

### 5B — Measures to Address the Risks (Mitigations Mapped to Risks)

> **Scope of this sub-section.** Maps each control-risk to the technical/organisational controls currently in the codebase, cites the implementing code, and states residual risk. **"Implemented today"** = present on `main`. **"Planned (DPIA-gated)"** = designed/decided but not built, blocked on this DPIA + §11-5 counsel sign-off. This sub-section uses its own numbering **5B-R1 … 5B-R10** (see §5.0 disambiguation). The minor protections are **data/egress rails, not AI-capability limits** (§1.2 fact 1); "AI off for minors" does **not** exist in code and is not a control we can claim. **[COUNSEL TO CONFIRM]** whether identical AI capability for 14–17s is defensible given mental-health context.

#### 5b.1 Control inventory (implemented today)

| Ctrl | Control (rail) | Implementing code (file:line) | Status |
|---|---|---|---|
| **C-AGE** | Server age gate, <14 hard-reject, server-derived `minor_tier` | `db/migrations/0030_server_age_gate.sql:18-67`; search_path-hardened `db/migrations/0033_minor_privacy_enforcement.sql:22-61`; client UX fail `src/screens/deepspace/dds-auth-screens.tsx:373`, `src/app/(auth)/complete-profile.tsx:80`; `MIN_SELF_CONSENT_AGE = digitalConsentAge("KR")` `src/lib/supabase/auth.ts:22` | Implemented |
| **C-CRISIS** | Crisis→deterministic human-written hotline handoff (minor→1388) | `crisisHotlines()` `src/lib/safety/classifier.ts:70-79`; `fixedCrisisResponse()` `src/lib/llm/safety.ts:408-438`; gates `src/lib/llm/boundary.ts:560-576` (input), `src/lib/llm/boundary.ts:478-538` (output swap), `callAdvisor` `src/lib/llm/boundary.ts:1335-1631` (its own input gate `src/lib/llm/boundary.ts:1349`, output swap `src/lib/llm/boundary.ts:1559`) | Implemented |
| **C-EGRESS** | Privacy-by-design defaults OFF + server clamp for minors | `defaultPrivacyPrefs()` `src/lib/privacy/prefs.ts:55-62`; seed `db/migrations/0032_minor_privacy_defaults.sql:41-53`; clamp trigger `clamp_minor_privacy_prefs()` `db/migrations/0033_minor_privacy_enforcement.sql:66-88`, real-tier hardened `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:77-95` | Implemented |
| **C-TIER** | No unauthorised `isMinor` downgrade | `block_self_tier_change()` `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:36-74` (minor_tier server-only, change only via age gate) | Implemented |
| **C-CONSENT** | Immutable, append-only consent ledger | `consent_records` `db/migrations/0031_consent_records.sql:15-55` (INSERT/SELECT only, no UPDATE/DELETE); guardian ledger `db/migrations/0028_minor_consent.sql:36-71` | Implemented (schema **and** sign-up wiring - ⚠ **[RE-READ 2026-09-08]** this said "wiring pending" on the strength of the frozen migration header; the acks are collected and written, `src/lib/supabase/consent.ts:124-126`) |
| **C-SENS** | Sensitive-data + LLM + overseas-transfer acknowledgement | `consent_records.sensitive_data_ack / llm_processing_ack / overseas_transfer_ack` `db/migrations/0031_consent_records.sql:26-28` | Implemented (schema); collection UI pending |
| **C-LEX** | Non-clinical lexicon guard (CI-enforced) | `containsForbiddenLexicon/containsAnalysisForbidden` `src/lib/safety/classifier.ts:142-159`; CI `scripts/check-forbidden-lexicon.ts` in `npm run verify` (`package.json:16,39`) | Implemented (universal floor); jurisdiction lists **not CI-wired** `src/lib/safety/lexicon.ts:372-375` |
| **C-AUDIT** | AI audit log (hashes only) + restricted crisis ledger | `ai_audit_log` `0004` (prompt/output **hashes**, never raw text); forge-proof RPC `log_ai_audit` `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:103-136`; `crisis_events` `0012` (no RLS policies → service-role only, categorical only) | Implemented |
| **C-DEL** | Terminal account erasure (Art.17/PIPA) | `requestAccountDeletion()` `src/lib/records/delete-bulk.ts:178-185`; UI `src/screens/deepspace/DeepSpaceDesignScreens.tsx:646-651` | Implemented |
| **C-REC** | D-20 recommendations gate (minor lock honoured at runtime) | `recommendationsAllowed()` `src/lib/ops/recommend.ts:127-134`; call site `src/screens/deepspace/dds-ops-screen.tsx:588-595`; regression test `recommend-gate.test.ts` | Implemented (**#369 just landed**) |
| **C-FP** | First-party / on-device competence signals; no journal in prompts | wiki-snapshot-only, no-journal contract `src/lib/ops/recommend.ts:6-8`; untrusted-data fence `src/lib/ops/recommend.ts:248-250`; minor `external_analytics` locked → 0 external egress (`prefs.ts`, `analytics-consent-queue.ts`) | Implemented |

#### 5b.2 Risk → mitigation mapping (with residual risk)

**5B-R1 — Catastrophic harm: self-harm / suicidal ideation reaches a generative model or goes unrouted**
*(Crosswalk: addresses 5A-R7.)* **Primary controls: C-CRISIS, C-AUDIT.** This is **Hard Rail #1 (crisis→human handoff)** and the strongest control in the system.
- **Defence in depth, three layers**: (1) synchronous lexicon backstop `classifyInput()` `src/lib/safety/classifier.ts:91-116` (KO Suicide CARE 2.0 + EN C-SSRS markers `src/lib/llm/safety.ts:56-68`); (2) semantic Gemini Flash union classifier `classifySafety()` `src/lib/llm/safety.ts:287-390` (conservative RED-wins merge `src/lib/llm/safety.ts:177-199`, fail-closed on unknown zone `src/lib/llm/safety.ts:179-187`); (3) server-authoritative proxy 422 gate caught by `inspectProxyCrisisRejection()` `src/lib/llm/boundary.ts:370-392`.
- **Input never reaches the LLM on RED**: `callLlm` short-circuits before any network call `src/lib/llm/boundary.ts:560-576`; `callAdvisor` the same at `src/lib/llm/boundary.ts:1349`.
- **Output re-classification + verbatim template swap**: model output is re-scanned and, on RED, the generated text is discarded and replaced with the fixed human-written template `src/lib/llm/boundary.ts:478-538`, `callAdvisor` `src/lib/llm/boundary.ts:1559`. Templates are **deterministic, human-authored, never LLM-generated** (`fixedCrisisResponse` `src/lib/llm/safety.ts:408-438`).
- **Minor-specific routing**: `red-ko-minor-v2` surfaces **1388 청소년전화** first, then 109 (`src/lib/safety/classifier.ts:73-75`; `src/lib/llm/safety.ts:412`).
- **Free-tier / non-LLM saves covered**: `classifyRecordTextForCrisis()` runs the same audited routing for plain journal saves `src/lib/llm/boundary.ts:408-422`.
- **Auditable**: every interception writes `ai_audit_log` + categorical `crisis_events` `src/lib/llm/boundary.ts:157-177`.

**Residual risk.** (a) On the **keyless public web build and on live non-Vertex builds**, the Flash semantic layer is deliberately disabled to avoid uncapped egress (`getFlashClient` returns null `src/lib/llm/safety.ts:92`), degrading crisis detection to **lexicon-only** — novel phrasings without a lexicon term are a false-negative exposure. (b) Lexicon coverage is KO/EN only; other languages fall through. (c) Crisis routing is **information/handoff, not active intervention** — no human is actually contacted; the app steps back (`src/lib/llm/safety.ts:412,424`). **[COUNSEL TO CONFIRM]** whether passive hotline display satisfies duty-of-care / Raine v. OpenAI-class expectations for a minor mental-health product.

**5B-R2 — Unlawful processing of minors' sensitive data (mental-health journaling, Art.9 / PIPA §23) without valid consent**
*(Crosswalk: addresses 5A-R2.)* **Primary controls: C-CONSENT, C-SENS, C-EGRESS.** This is **Hard Rail #2 (no pre-consent sensitive egress)**.
- Append-only ledger records the document versions and the specific acks (`sensitive_data_ack`, `llm_processing_ack`, `overseas_transfer_ack/국외이전`) `db/migrations/0031_consent_records.sql:23-32`; immutability enforced by absence of UPDATE/DELETE policies `db/migrations/0031_consent_records.sql:38-55`.
- Privacy-by-design: every outward/profiling/external-processing key defaults OFF `src/lib/privacy/prefs.ts:55-62`; minors are seeded OFF server-side at sign-up `db/migrations/0032_minor_privacy_defaults.sql:41-53`.

**Residual risk.** ⚠ **[RE-READ 2026-09-08]** this was rated **material** on the basis that the notice and ack checkboxes were not wired at sign-up. **They are wired** - `src/lib/auth/consent-selections.ts:16-21`; both entry screens render `<ConsentNotice>`; `recordConsentBestEffort(` at `src/lib/auth/useSignUpForm.ts:318` and `src/app/(auth)/complete-profile.tsx:169`; the three acks are written to the ledger at `src/lib/supabase/consent.ts:124-126`. The invariant the migration states is preserved and is a strength, not a gap: `recordConsent()` writes only after the UI has collected the acks, so the ledger never records a consent the user did not give (`src/lib/supabase/consent.ts:14-21`). ⚠ **[RE-READ 2026-09-08, second pass]** this sentence used to read *“until that UI ships, the app may be collecting Art.9/§23 data before recording valid consent — a launch-blocking gap”*. **That UI has shipped**, as the four citations at the head of this same paragraph measure; the sentence is the pre-correction conclusion left standing. The remaining residual is the **best-effort write**: the ack collection gates the write, but the write does not gate entry, so a failed ledger insert leaves consent given and **not demonstrable** (Art.7(1)). Reported at error level and carried out of the seam as `consentRecorded` (see § above); deliberately not surfaced to the user. **[COUNSEL TO CONFIRM]** the lawful basis and the minimum ack set (esp. overseas transfer to Google/Gemini + Supabase) for 14–17 self-consent in KR, and whether EU/UK require parental involvement at 16/13–16. Secondary residual: `sensitive_data_ack` is a self-report checkbox, not verified comprehension.

**5B-R3 — Minors' data used for advertising or model training**
*(Crosswalk: addresses 5A-R8 (training/ads facet).)* **Primary controls: C-EGRESS, C-TIER.** This is **Hard Rail #3 (no training/ads on minor data)**.
- `ads`, `llm_training`, `sharing`, `recommendations`, `persona_export/share`, `external_analytics` are clamped to `false` for `minor_self` on **every write** to `privacy_prefs` `db/migrations/0033_minor_privacy_enforcement.sql:66-88`; only `long_term_memory` (+ `ops_push` and `chat_autosave`, both in-account only) are promotable `src/lib/privacy/prefs.ts:95-99`.
- **Forgery-hardened**: the clamp keys off `COALESCE(OLD.minor_tier, NEW.minor_tier)` — the row's *real* tier, not a client-supplied value `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:77-95` — and `minor_tier` itself is server-only `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:60-64` (closes the one-statement `minor_tier='adult' + prefs all true` escape documented in `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:1-19`).
- Ads suppressed twice (pref + ad policy) for defense in depth `src/lib/privacy/prefs.ts:64-68`.

**Residual risk.** Low for the clamp itself (server-enforced + regression-tested). The honesty constraint D-12 means only *enforced* keys are shown (`VISIBLE_PRIVACY_KEYS` `src/lib/privacy/prefs.ts:125`); `sharing` is clamped but not yet a user-visible toggle — acceptable as "off and unreachable," (⚠ **[RE-READ 2026-09-07]** this said `llm_training`/`sharing`; `llm_training` was pruned from the pref set on 2026-07-01, see 2.4) but **[COUNSEL TO CONFIRM]** transparency obligations require disclosing these processing categories even when forced off.

**5B-R4 — Account take-over of protections / minor self-downgrade to adult to unlock egress**
*(Crosswalk: additional control-risk; no direct §5A counterpart.)* **Primary control: C-TIER.** This is **Hard Rail #4 (no unauthorised isMinor downgrade)**.
- `block_self_tier_change()` rejects any self-change of `minor_tier` unless `birth_date` is also changing (the only path that re-derives tier via the age gate) `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:60-64`; service_role exempt `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:45-47`.
- Audit rows are unforgeable: blanket client INSERT on `ai_audit_log` dropped, replaced by SECURITY DEFINER RPC stamping `auth.uid()` server-side `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:97-136`.

**Residual risk.** A minor who **lies about DOB at sign-up** is never a minor in the system (see 5B-R7) — this control only stops *post-hoc* downgrade, not initial misstatement.

**5B-R5 — Deception / failure to disclose AI vs. human (Art.50 EU AI Act, 韓 AI기본법 §13)**
*(Crosswalk: addresses 5A-R3/R4/R5 disclosure facet; same K11 gap as 5a.10.)* **Control: K11 — NOT IMPLEMENTED.** This is **Hard Rail #5** and is the one hard rail **currently a gap**: a repository-wide search for any AI-self-disclosure surface returns nothing (`grep` for `i am an ai` / `나는 ai` / `ai_disclosure` empty).
- **Planned (DPIA-gated):** Lane 5 boundary onboarding ("I am an AI, I can be wrong, decisions are yours") doubling as the Art.50 notice (design doc `minor-ai-literacy-enablement-20260614.html` §3 Lane 5).

**Residual risk (high, unmitigated today).** No anti-anthropomorphism disclosure ships. For a minor mental-health product this is both an Art.50/§13 exposure and a dependency-risk vector. **[COUNSEL TO CONFIRM]** the exact disclosure wording/placement and timing obligations.

**5B-R6 — Over-reliance / parasocial dependency; anthropomorphic "companion" framing (CSM/Stanford <18 companion concern)**
*(Crosswalk: addresses 5A-R3, 5A-R4, and 5A-R8 (profiling-gate facet).)* **Controls: D-18, D-19, D-20 adopted defaults — mostly PLANNED.**
- **D-20 (implemented today):** recommendations are now **runtime-gated** — `recommendationsAllowed()` returns `false` for a minor unless `recommendations === true`, which the server clamp makes impossible `src/lib/ops/recommend.ts:127-134`, wired at `src/screens/deepspace/dds-ops-screen.tsx:588-595`. This closed a **real bug** (per D-20 verdict, `DECISIONS.md` line 106): `runRecommend` previously ignored the pref, so minors' wiki snapshots reached the LLM ungated while the `0038` clamp was merely nominal. Regression test `recommend-gate.test.ts`.
- **D-19 (planned, DPIA-gated):** "scaffolded reflection ≠ companion bot" is to be proven not by self-label but by an **anti-anthropomorphism CI gate** (mascot / first-person / `long_term_memory` anthropomorphism audit). **This CI gate is not yet built** (grep for `anthropomorph|companion` across code returns nothing) — D-19 non-companion positioning is **design intent, not yet CI-enforced**.
- **D-18 (planned, DPIA-gated):** learner-licence scaffolding default-on with **ephemeral/session-local fade**; persistent cross-session competence scoring is held **behind an EU AI Act Art.5 counsel gate** and is not built. Competence signals are first-party/on-device with minors' `external_analytics` locked → zero external egress (C-FP).

**Residual risk.** The anti-anthropomorphism invariants and dependency-safety instrumentation that D-19 relies on are **not yet present**, so the "non-companion" conclusion is currently aspirational. Lane 6 over-reliance handling is explicitly *coaching, not a usage cap* — youngest/lowest-literacy users get only a soft nudge. **[COUNSEL TO CONFIRM]** whether CA SB243 / FTC 6(b) / CSM operative definitions classify 2nd-B as a "companion," which would require the minority-view interim gate for the youngest cohort (D-19 preserved dissent).

**5B-R7 — Weak age assurance (DOB self-report)**
*(Crosswalk: addresses 5A-R6.)* **Control: C-AGE (partial).** The server gate is genuinely server-side and forge-resistant for *derivation* (`db/migrations/0030_server_age_gate.sql:18-49`), and an active account cannot exist without a tier - the `users_active_has_tier` constraint (`db/migrations/0030_server_age_gate.sql:62-67`), but its **input is an unverified self-reported date of birth**.

**Residual risk (inherent).** DOB self-report is the weakest age-assurance tier (ICO Children's Code Std 3). A child can enter a false adult DOB and receive zero minor rails. No estimation/verification layer exists. **[COUNSEL TO CONFIRM]** whether self-declaration is acceptable for this risk class or whether age-estimation is required for EU/UK.

**5B-R8 — Data subject rights: portability (GDPR Art.20) and erasure (Art.17)**
*(Crosswalk: see Section 6 for full treatment.)* **Control: C-DEL (erasure only).** Terminal erasure is implemented end-to-end `src/lib/records/delete-bulk.ts:178-185`, `src/screens/deepspace/DeepSpaceDesignScreens.tsx:646-651`, cascading across all user-owned tables + auth row.
**Export/portability: IMPLEMENTED, with stated limits.** `export-account` returns a versioned, machine-readable JSON bundle (`kind: "2nd-b-account-export"`, `schema_version: 1`) gathered service-role from every user-owned table plus the `raw-clippings` bucket (`supabase/functions/export-account/index.ts:1-24`, table list `supabase/functions/export-account/index.ts:97-115`), reachable from the account screen (`src/screens/deepspace/dds-account-screen.tsx:210`). It runs service-role because several owned tables - `personas`, `memorized_patterns`, the append-only `consent_records` ledger, `xp_events` - have no client SELECT path at all, so a client-side gather could never reach them (`supabase/functions/export-account/index.ts:11-14`). IDOR-safe on the same contract as erasure: the data returned is always the caller's own, derived from the gateway-verified JWT, and the body is ignored (`supabase/functions/export-account/index.ts:16-18`). The module that consumes it states its own limits rather than claiming the right is discharged: "A v1 response can contain **partial read failures and intentional exclusions**. It is neither a complete backup nor proof that a statutory access/portability duty is met" (`src/lib/account/export.ts:1-3`). Three stores are deliberately excluded and reported in the response's `excluded` field - `ai_audit_log` (hashes only, retained-after-erasure audit evidence), `gemini_spend_daily` and `revenue_events` (`supabase/functions/export-account/index.ts:20-24`). **[COUNSEL TO CONFIRM]** whether those exclusions and the partial-failure mode leave Art.20 satisfied. ⚠ **[RE-READ 2026-09-08]** This described the state before `export-account` existed. That function's own header says it "**closes the DPIA 'PRIMARY GAP' (Section 6.1.3)**" (`supabase/functions/export-account/index.ts:1-9`), and this section had not been told.

**Residual risk.** Art.20 portability is **implemented**; what remains is the scope question above (three excluded stores and a v1 response that can carry partial read failures), not its absence. Erasure note: `crisis_events.user_id_hash` is a 32-bit djb2 hash, explicitly **obfuscation not anonymisation, re-identifiable** `db/migrations/0012_crisis_events.sql:12` — it is decoupled from `users.id` (no FK) so it survives cascade by design; **[COUNSEL TO CONFIRM]** whether retaining re-identifiable crisis rows post-erasure is lawful (likely defensible as safety/legal-obligation retention, but must be documented).

**5B-R9 — Cross-border transfer to processors (Gemini / Google, Supabase)**
*(Crosswalk: additional control-risk; supports 5A-R2.)* **Controls: C-SENS (overseas_transfer_ack `db/migrations/0031_consent_records.sql:27`), C-AUDIT (vertex_backend evidence `db/migrations/0004_ai_audit_log.sql:13`), spend/egress capping.** Live LLM calls route through the spend-capped `gemini-proxy` edge function or Vertex; the uncapped direct API-key path is refused on live builds (`assertDirectEgressAllowed` `src/lib/llm/boundary.ts:147-156`). Audit log records `vertex_backend` per call.

**Residual risk.** Transfer mechanism (SCCs / adequacy) is a legal/contractual matter outside code. **[COUNSEL TO CONFIRM]** the lawful transfer basis for minors' Art.9 data to Google/Supabase and whether the overseas-transfer ack is sufficient under PIPA §28-8 / GDPR Ch.V.

**5B-R10 — Jurisdiction assumptions hardcoded to Korea**
*(Crosswalk: compounds 5A-R6.)* **Control: partial.** `MIN_SELF_CONSENT_AGE = digitalConsentAge("KR")` = 14 `src/lib/supabase/auth.ts:22`; `MINOR_AGE_CEILING = 18` hardcoded `src/lib/auth/AuthContext.tsx:42`, applied at `src/lib/auth/AuthContext.tsx:132`. The analysis-lexicon now carries `LEXICON_LAST_LEGAL_REVIEW = "2026-06-10"` `src/lib/safety/lexicon.ts:460` (note: this **updates** the prior analysis which recorded `null`), but the **jurisdiction-specific** forbidden lists are **not CI-wired** `src/lib/safety/lexicon.ts:372-375` and the legal-review guard is non-blocking (`scripts/check-legal-review.ts`, warns only).

**Residual risk.** ⚠ **[RE-READ 2026-09-08]** this said non-KR ages "are not modelled" and that "a single KR=14 floor is applied globally". Both are out of date: the matrix is modelled as `DIGITAL_CONSENT_AGE` (`src/lib/auth/consent-age.ts:28-33`) and the live gate resolves the jurisdiction from the device region (`src/lib/auth/consent-age.ts:108-121`). What remains is narrower and is the real residual risk: **per-EU-member values are still flat 16**, and an unreadable or unrecognised region deliberately falls back to KR=14 rather than raising the floor, so a minor in an EU-16 country whose region cannot be read is still governed by 14. Per D-20 preserved minority view, **UK/EU minor `recommendations` should fall back to forced-OFF until this DPIA + counsel approve**. **[COUNSEL TO CONFIRM]** per-jurisdiction consent age and lexicon mapping before any non-KR launch.

#### 5b.3 Net residual-risk summary for counsel

| Theme | After controls | Blocking? |
|---|---|---|
| Crisis routing (5B-R1 / 5A-R7) | **Low** where Flash live; **Medium** on lexicon-only builds + non-KO/EN | Document the lexicon-only degradation |
| Pre-consent sensitive processing (5B-R2 / 5A-R2) | **High until sign-up consent UI ships** | **Launch-blocking** |
| Training/ads on minor data (5B-R3) | **Low** (server-clamped, hardened, tested) | No |
| isMinor downgrade (5B-R4) | **Low** | No |
| AI-vs-human disclosure / K11 (5B-R5) | **High (unmitigated)** | **Launch-blocking** for EU/Art.50, 韓 §13 |
| Over-reliance / companion (5B-R6 / 5A-R3/R4) | **Medium** — D-20 gate landed; D-18/D-19 invariants + anti-anthro CI **not built** | DPIA-gated |
| Age assurance (5B-R7 / 5A-R6) | **Medium-High (inherent to DOB self-report)** | Counsel risk-accept decision |
| Portability Art.20 (5B-R8) | **Implemented**; exclusion scope open (6.1.3) | Pre-EU/UK launch |
| Cross-border transfer (5B-R9) | Code-side capped/audited; **legal basis open** | Counsel |
| Jurisdiction KR-hardcode (5B-R10) | KR-only safe; **non-KR unvalidated** | Pre-non-KR launch |

**Three controls are launch-blocking gaps, not residual-risk-acceptable**: 5B-R2 (consent UI not wired), 5B-R5 (K11 disclosure absent), and the **D-19 anti-anthropomorphism CI gate** that the entire "non-companion" defence rests on. The D-18 learner-scaffold, D-19 invariants, D-20 understanding-gated *activation* UX (beyond the gate already landed), portability, and age-estimation are all **planned and explicitly gated on completion of this DPIA + §11-5 counsel sign-off** — none should be built ahead of counsel approval per the adopted debate verdicts.

---

## Section 6 — Data Subject Rights, Retention & Remediation Backlog

### 6.1 Data subject rights

#### 6.1.1 Right of access (GDPR Art.15 / PIPA §35)
- **Implemented today (partial):** Each subject can read their own primary content through RLS-scoped client queries (e.g. `consent_records_select_own ... USING (user_id = auth.uid())`, `db/migrations/0031_consent_records.sql:47-49`; per-user RLS is the pattern across user-owned tables). Journal/notes, wiki pages, sources, personas, privacy prefs are all visible in-app to their owner.
- **Gap — no consolidated subject-access surface:** there is no single "download everything we hold on you" view. Two stores are deliberately **inaccessible to the subject**:
  - `crisis_events` is **RLS deny-all** to `authenticated`/`anon` — "Intentionally NO policies for authenticated or anon. Service role bypasses RLS." (`db/migrations/0012_crisis_events.sql:30-32`). The subject cannot see their own crisis-routing rows.
  - `ai_audit_log` writes go through a `SECURITY DEFINER` RPC and the prior owner-INSERT policy was dropped (`db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:97-101`); the reviewed migrations establish **no subject SELECT policy**, and the rows hold only hashes (see 6.2).
- **[COUNSEL TO CONFIRM]** whether (a) hashed audit rows and (b) de-identified categorical crisis rows fall within the Art.15/§35 access scope at all, and if so whether a mediated (operator-fulfilled) access route is required given they are intentionally walled off from the client.

#### 6.1.2 Right to erasure / deletion (GDPR Art.17 / PIPA §36)
- **Implemented today:** terminal self-service erasure via the `delete-account` Edge Function (`supabase/functions/delete-account/index.ts`).
  - **IDOR-safe:** the erased account is "ALWAYS the caller's own, derived from the gateway-verified JWT ... The body is ignored" (`supabase/functions/delete-account/index.ts:21-23` for the contract, `supabase/functions/delete-account/index.ts:66-78` and `supabase/functions/delete-account/index.ts:92` for the enforcement).
  - **Cascade scope:** deletes `public.users`, which `ON DELETE CASCADE` erases records (journal), testimonials, personas, memorized_patterns, xp_events, self_contexts, chat_usage, clipper_templates, consent_records, wiki_pages/links, sources, guardian rows (`supabase/functions/delete-account/index.ts:5-19`; e.g. `records ... ON DELETE CASCADE`, `db/migrations/0003_records.sql:9`). It also deletes the `auth.users` row (`supabase/functions/delete-account/index.ts:113-121`) and paginates the PII-rich `raw-clippings` Storage bucket (`supabase/functions/delete-account/index.ts:150-164`), reporting whether that wipe actually completed rather than assuming it did (`supabase/functions/delete-account/index.ts:165-177`).
- **Residual data that deliberately survives erasure (flag):**
  - `ai_audit_log` rows are **retained with `user_id` set to NULL** — "its `user_id` FK is `ON DELETE SET NULL` (0011), so its rows are RETAINED (user_id nulled) as ... audit evidence rather than cascade-erased" (`supabase/functions/delete-account/index.ts:8-10`; `db/migrations/0011_security_fixes.sql:20-27`). Content is hashes only (6.2).
  - `crisis_events` survives because it has **no `user_id` FK** — only a non-cryptographic djb2 `user_id_hash` (`db/migrations/0012_crisis_events.sql:12`), so the cascade never reaches it. The schema comment itself warns the hash is "32-bit, collision-prone, re-identifiable" (`db/migrations/0012_crisis_events.sql:12`).
- **[COUNSEL TO CONFIRM]:** (1) whether nulled-`user_id` audit hashes and djb2-hashed crisis rows are sufficiently anonymised to lawfully survive an Art.17/§36 erasure request, or whether they remain "personal data" requiring deletion / a documented Art.17(3) exemption (legal obligation / public-interest safety); (2) whether the djb2 hash must be upgraded (see 6.3-#7) before it can be relied on as the basis for retention.

#### 6.1.3 Right to data portability (GDPR Art.20) — **IMPLEMENTED 2026-06-21; scope open**
- **Implemented today (partial, not rights-grade):** a user-facing export exists — src/app/wiki.tsx:359 calls **`exportContextPack`**`(userId, { locale, bodyCharLimit: 4000, includeRecords: true })` - ⚠ **[RE-READ 2026-09-08]** this said `exportUserWiki`, which is the *chat* path and excludes journal records by default. This path deliberately does the opposite: the code comment above it says the export "must carry the journal/note records too" while the chat RAG snapshot stays pages+sources (src/app/wiki.tsx:357-359, quoted not cited - see below: that renderer does not ship), producing an Obsidian-flavoured **markdown** bundle of wiki pages + sources + journal records (`src/lib/wiki/export.ts`).
- **Why it does not yet satisfy Art.20:**
  - **Format:** Art.20 requires a "structured, commonly used and machine-readable format." The `export-account` response is versioned JSON (`supabase/functions/export-account/index.ts:4-6`). The markdown bundle (`src/lib/wiki/export.ts:1-3, 21-22`) still exists beside it as an *LLM-context bundle / pre-delete backup* and was never the portability path; it is no longer the only export.
  - **Coverage:** the eight categories once listed here as omitted - `consent_records`, `privacy_prefs`, `personas`, `memorized_patterns`, `xp_events`, `esm_responses`, `chat_usage`, `self_contexts` - are exactly what `EXPORT_TABLES` now gathers (`supabase/functions/export-account/index.ts:97-115`; `privacy_prefs` travels with the `users` profile row, `supabase/functions/export-account/index.ts:171-178`). ⚠ **[RE-READ 2026-09-08]** That list was the specification the function was written against, not a standing gap. The module that consumes it states its own limits rather than claiming the right is discharged: "A v1 response can contain **partial read failures and intentional exclusions**. It is neither a complete backup nor proof that a statutory access/portability duty is met" (`src/lib/account/export.ts:1-3`). Three stores are deliberately excluded and reported in the response's `excluded` field - `ai_audit_log` (hashes only, retained-after-erasure audit evidence), `gemini_spend_daily` and `revenue_events` (`supabase/functions/export-account/index.ts:20-24`). **[COUNSEL TO CONFIRM]** whether those exclusions and the partial-failure mode leave Art.20 satisfied.
- Consistent with the prior analysis flag ("export 경로 부재 (delete만), GDPR Art.20 갭", minor-ai-literacy HTML §honest-flag ③).

#### 6.1.4 Right to rectification (GDPR Art.16 / PIPA §36)
- **Implemented today (partial):** subjects can edit `records` bodies, profile fields, and `privacy_prefs` toggles in-app. A `birth_date` correction re-fires the age gate, which re-derives `minor_tier` and re-clamps minor privacy (`db/migrations/0030_server_age_gate.sql:46-49`; `db/migrations/0033_minor_privacy_enforcement.sql:40-57`) — so a mistaken-age correction self-heals the protection state.
- **Gap:** no rectification surface for derived/immutable data (audit hashes, append-only consent ledger) — by design, but **[COUNSEL TO CONFIRM]** this is acceptable for derived records.

#### 6.1.5 Right to object / restrict + withdraw consent (GDPR Art.21/18, Art.7(3) / PIPA §37)
- **Implemented today:** the `privacy_prefs` contract is the objection surface for profiling/ads/analytics/sharing (`src/lib/privacy/prefs.ts`). Privacy-by-design default = every key OFF (`src/lib/privacy/prefs.ts:55-62`). Recommendations objection is now **enforced** post D-20: `recommendationsAllowed(isMinor, prefs?.recommendations)` gates the screen (`src/lib/ops/recommend.ts:127-134`; called at `src/screens/deepspace/dds-ops-screen.tsx:588-595`).
- **Constraints to note for counsel:**
  - Only **three** keys are actually rendered as toggles — `VISIBLE_PRIVACY_KEYS = ["external_analytics", "ads", "ops_push"]` (`src/lib/privacy/prefs.ts:125`) — deliberately, to avoid "false privacy promise" toggles that control nothing (D-12, `src/lib/privacy/prefs.ts:9-16`). The remaining keys are server-enforced but not user-visible objection controls yet.
  - **Minors:** locked to high privacy; only `long_term_memory`, `ops_push` and `chat_autosave` are promotable (`MINOR_PROMOTABLE_KEYS`, `src/lib/privacy/prefs.ts:95-99`), enforced server-side by `clamp_minor_privacy_prefs` (`db/migrations/0033_minor_privacy_enforcement.sql:66-81`) and the tier-forge fix (`db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:76-95`). This is a **lawful-objection ceiling for minors**, not a gap — but **[COUNSEL TO CONFIRM]** that locking a minor's outward-sharing objections OFF-by-default (rather than offering the choice) is the intended Children's-Code posture.
  - **Withdraw-consent flow not wired:** ⚠ **[RE-READ 2026-09-08]** the *collection* half of this bullet is out of date - sign-up collection **is** wired (`src/lib/auth/consent-selections.ts:16-21`; both entry screens render `<ConsentNotice>`; `recordConsentBestEffort(` at `src/lib/auth/useSignUpForm.ts:318` and `src/app/(auth)/complete-profile.tsx:169`; the three acks are written to the ledger at `src/lib/supabase/consent.ts:124-126`). What remains open is the withdrawal half, which is the actual subject of this bullet: No standing "withdraw / re-consent" UI is wired. **Planned (gated).**

### 6.2 Retention

> No automated TTL / purge / cron was found anywhere in `db/migrations/`, `supabase/`, or `src/lib/` (grep for retention|ttl|purge|expire|cron|pg_cron|auto-delete returned no data-lifecycle job). **Default retention = indefinite, terminated only by account deletion.** This is itself a storage-limitation finding (Art.5(1)(e) / PIPA §21).

| Store | What is kept | Retention today | Erased on account delete? | Notes |
|---|---|---|---|---|
| `records` (journal/note/audit) — **Art.9 / PIPA-sensitive** mental-health data | Full raw user text (`body text NOT NULL`, `db/migrations/0003_records.sql:13`) | **Indefinite**, no TTL | **Yes** — `ON DELETE CASCADE` (`db/migrations/0003_records.sql:9`) | The most sensitive store. **[COUNSEL TO CONFIRM]** a defined retention period vs "until user deletes." |
| `ai_audit_log` | **Hashes only** — `prompt_hash`, `output_hash` (`db/migrations/0004_ai_audit_log.sql:10-11`), model, vertex_backend, zone, latency. **No raw text.** | **Indefinite** (audit/XPRIZE evidence) | **No** — `user_id` set NULL, row retained (`db/migrations/0011_security_fixes.sql:20-27`) | Survives erasure de-identified. **[COUNSEL TO CONFIRM]** retention basis + that hash-only = non-personal post-nulling. |
| `crisis_events` | **Categorical only**, "never raw user text" (`src/lib/supabase/crisis-events.ts:2-3`; `db/migrations/0012_crisis_events.sql:4-8`): confidence, trigger categories, C-SSRS level, template version, locale, `resolved`, staff `notes` ("never user content"). Subject keyed by djb2 `user_id_hash`. | **Indefinite** | **No** — no FK, survives deletion (`db/migrations/0012_crisis_events.sql:12`) | Retained safety record. **[COUNSEL TO CONFIRM]** lawful basis to retain post-erasure; hash strength (6.3-#7). |
| `consent_records` | What/when/which-versions consented; `ip_hash`/`ua_hash` (hashed, never raw — `db/migrations/0031_consent_records.sql:30-31`) | **Indefinite**, append-only immutable (no UPDATE/DELETE policy, `db/migrations/0031_consent_records.sql:8-9, 37-55`) | **Yes** — cascade | Accountability ledger. **[COUNSEL TO CONFIRM]** that erasing the consent proof on account deletion is acceptable (vs retaining as Art.17(3)(b) compliance evidence) — possible tension with the row-immutability design. |
| `raw-clippings` Storage | Raw clipped markdown — "most PII-rich content" (`supabase/functions/delete-account/index.ts:135-136`) | Indefinite | **Best-effort, with a receipt** — a paginated bucket wipe (`supabase/functions/delete-account/index.ts:150-164`) whose result is returned as `raw_clippings_erased` and shown to the user on the deletion screen. `remove()` can succeed **partially**: it returns the objects it actually removed, and a short list with no error means some survived, so the function reports the shortfall rather than confirming an erasure it did not observe (`supabase/functions/delete-account/index.ts:165-177`). | ⚠ **[RE-READ 2026-09-08]** This column said a flat **Yes**. The code deliberately refuses to promise that, and the receipt is the control: it makes an incomplete wipe **observable and re-runnable** instead of silent. **[COUNSEL TO CONFIRM]** whether a best-effort erasure with a user-visible receipt discharges Art.17 for this store, or whether a retry-until-empty job is required. |

### 6.3 Remediation backlog (identified gaps)

Priority: **P0** = blocks EU/UK exposure or a hard-rail; **P1** = blocks non-KR launch / material rights gap; **P2** = hardening. "Owner" = suggested, not assigned.

| # | Gap | Legal hook | Status today | Suggested owner | Priority |
|---|---|---|---|---|---|
| 1 | **K12 child DPIA** (this document) | GDPR Art.35 / PIPA PIA; ICO Children's Code | Drafting (this doc) | Simon + external counsel | **P0** |
| 2 | **K11 AI-vs-human disclosure surface** | EU AI Act Art.50; 韓 AI기본법 §13 | **Absent** — grep for AI-disclosure strings in `src/lib`+`src/components` returned **0**. Planned home = Lane 5 onboarding 1-screen | Codex (UI) + Claude (legal copy) + counsel | **P0/P1** |
| 3 | **Full portability export (Art.20)** | GDPR Art.20 / PIPA §35-2 | **Shipped**: structured all-tables JSON via `export-account`; the markdown bundle remains as an LLM-context/pre-delete artifact, ⚠ **[RE-READ 2026-09-08] in the legacy shell only** - it lives in `WikiLegacy`, and the shipped wiki screen (`src/screens/deepspace/dds-wiki-records-screens.tsx`) has no markdown export path at all. So the structured `export-account` is not one of two offerings; on every shipped build it is the only one. Remaining: whether the three excluded stores and the partial-failure mode are acceptable | counsel (scope of categories) | **P2** |
| 4 | **Jurisdiction signal — not hardcoded KR=14** | GDPR Art.8 (13-16 by member state); PIPA §22-2; COPPA | Matrix exists (`src/lib/auth/consent-age.ts:28-33`, KR14/US13/EU16/DEFAULT16) and the **country signal shipped 2026-08-16** (`src/lib/auth/consent-age.ts:8-12`; resolver `src/lib/auth/consent-age.ts:108-121`). What is still open is **legal sign-off**, not the signal: the module's own TODO holds per-EU-member values and the signal itself as needing sign-off before non-KR reliance (`src/lib/auth/consent-age.ts:14-16`), and an unreadable or unrecognised region deliberately answers KR rather than raising the floor | counsel (per-EU-member values + sign-off) | **P1** (still blocks non-KR launch, for the sign-off rather than the signal) |
| 5 | **Stronger age assurance than DOB self-report** | ICO Children's Code Std 3; GDPR Art.8(2) "reasonable efforts"; FTC COPPA | DOB self-report only (`db/migrations/0030_server_age_gate.sql:22-34`). Weakest assurance tier; a 15-yo who lies → `isMinor=false` → minor data rails + youth-crisis routing all release together (per D-19 minority view) | Eng + counsel (proportionate AA method) | **P1/P2** |
| 6 | **`LEXICON_LAST_LEGAL_REVIEW` review cadence** | Accountability (Art.5(2)); review of consent copy + jurisdiction age values | Partial: constant set to `"2026-06-10"` for the safety lexicon (`src/lib/safety/lexicon.ts:460`) with the 365-day cadence living in the checker rather than the lexicon - `REVIEW_CADENCE_DAYS = 365` (`scripts/check-legal-review.ts:14`) - and a **non-blocking CI warn** there, wired into `npm run verify` as `check:legal-review`. ⚠ **[RE-READ 2026-09-07]** This row previously said "no automated staleness warn"; that gate now exists and runs on every build - it warns and never fails, by design, because a review cadence is a process signal rather than a code defect. The same row said the `src/lib/auth/consent-age.ts:17-19` and `src/lib/supabase/consent.ts:14-21` comments "still read null (stale)"; neither does any more - the consent module now records that the acks are WIRED at sign-up. The genuinely-pending item is counsel's review of consent/policy/terms versions (placeholder `2026-06-02`) + overseas-transfer + per-EU age (`docs/HANDOFF.md:331,486`) | Eng (wire the warn + de-stale the comments) + counsel (perform & date the review) | **P2** |
| 7 | **Crisis-event subject identifier strength** | Art.17/Art.32; bears on whether retained crisis rows are "anonymised" | djb2 32-bit hash, schema-flagged "collision-prone, re-identifiable" (`db/migrations/0012_crisis_events.sql:12`); "Upgrade to salted SHA-256 if it must resist re-identification" | Eng + counsel (does retention-post-erasure require true anonymisation?) | **P2** |
| 8 | **Consent capture not wired at sign-up / no withdraw-consent flow** | GDPR Art.7 (demonstrable consent + Art.7(3) withdrawal); PIPA §22 | ⚠ **[RE-READ 2026-09-08]** immutable ledger built **and wired at sign-up** (`src/lib/supabase/consent.ts:124-126`); the remaining gap is the standing withdraw/re-consent UI | Eng + counsel (consent copy sign-off, D-03 external dependency) | **P1** |
| 9 | **Storage-limitation / defined retention periods** | Art.5(1)(e) / PIPA §21 | No TTL on `records` (sensitive), `ai_audit_log`, `crisis_events` — all indefinite | Counsel (set periods) → Eng (implement) | **P2** |

#### Cross-references for counsel
- **D-20** ledger note flags that, until just before this draft, `recommendations` ran **ungated for everyone including minors** (clamp was "명목적"/nominal); the gate at `src/lib/ops/recommend.ts:127` + `src/screens/deepspace/dds-ops-screen.tsx:588-595` closed it. Counsel should confirm the closed gate is the relied-upon control and that the prior ungated window needs no breach/notification treatment. **[COUNSEL TO CONFIRM]**
- **D-20 minority view:** pure UK/EU minor launch should fall back to recommendations **OFF** until this DPIA + counsel approval (DECISIONS.md D-20 소수의견). The current gate allows adults through unconditionally and minors only on an (server-locked) explicit opt-in — i.e. minors are effectively OFF in the EU/UK posture, but this should be **[COUNSEL TO CONFIRM]**ed against the Std-12 "best interests" reading.
- All rights/retention behaviours above are **age-invariant except** crisis-hotline routing (`src/lib/llm/safety.ts:408-438`; `src/lib/safety/classifier.ts:73-75`, minor → 1388 youth line first). The minor-specific protections are **data rails** (egress clamp `0032/0033/0038`, age floor `0030`), not capability limits — consistent with §1.2.

---

## Section 7 — Open Questions for Counsel + Consultation Record

> **Status of this section.** A DRAFT register assembled by the engineering/orchestration layer to hand counsel a complete, pre-framed list of the legal determinations that gate the minor-enablement build. **Every numbered question is a legal determination reserved to counsel — all flagged `[COUNSEL TO CONFIRM]`.** Each pairs a precise yes/no or which-applies question with the concrete system fact it turns on (cited `file:line`) and the build work it blocks or unblocks. Engineering has made *no* legal conclusions; where the code or a debate adopted a default, it is recorded as an internal working assumption pending counsel sign-off.

### 7.1 How to read this register

Each question carries four fields:
- **Q** — the precise question for counsel (answerable yes/no or which-of-N).
- **Hinges on** — the system fact that makes the question live, cited to code/migration.
- **Gates** — what is blocked until answered (`implemented today` vs `planned, gated on this DPIA`).
- **Provenance** — the debate verdict (D-18/19/20) or report flag that surfaced it.

**Cross-cutting prerequisite (answer first):** Q-S1 (scope). Most questions below are *conditional* on whether EU/UK/CA/KR law applies to a given user. Today the product resolves jurisdiction from the device region and **falls back to KR** when it cannot (`src/lib/auth/consent-age.ts:108-121`); the non-KR values still lack legal sign-off (`src/lib/auth/consent-age.ts:14-19`). ⚠ **[RE-READ 2026-09-08]** The signal LANDED on 2026-08-16 (Simon, J1): `resolveJurisdiction()` reads the device region via `src/lib/auth/device-region.ts` and maps it to a bucket, and the result is consumed at `src/app/_layout.tsx:595`. What remains is narrower and is the thing to assess: an **unreadable or unrecognised region deliberately stays on KR** rather than raising the floor on a failed signal, so a user in an EU country whose region cannot be read is still governed by KR=14. Counsel's scope answer determines which of the framework blocks (A–F) are even reached.

### 7.2 Consultation record — internal decisions pending counsel

| Ref | Internal working position (NOT a legal conclusion) | Adopted via | Counsel dependency |
|---|---|---|---|
| **D-18** | Minor cognitive-scaffolding **default-ON**, but with **ephemeral/session-local fade** — *no* persistent cross-session competence score is stored. The persistent-scoring variant was deliberately pushed behind counsel. | §35 debate `w1qg0xa22`, ratified by Simon 2026-06-14 | Q-A1, Q-A2 (Art.5) must clear before any persistent learner scoring |
| **D-19** | 2nd-B positioned as **scaffolded-reflection tool, not a companion bot**, to be proven by **CI-binding design invariants + this DPIA + dependency-safety audit**, not by self-labeling. | §35 debate `w1qg0xa22` | Q-D1, Q-D2 (SB243), Q-F1 (AI기본법 §13) |
| **D-20** | `recommendations` = **glass-box default OFF + understanding-gated activation**; minor lock retained. Runtime gate now wired (`src/lib/ops/recommend.ts:127-134`, called at `src/screens/deepspace/dds-ops-screen.tsx:588-595`). | §35 debate `w1qg0xa22`, bugfix GO 2026-06-14 | Q-E2, Q-G2, Q-S1 (UK/EU OFF fallback until DPIA done) |
| **K12** | This DPIA itself — flagged top-priority debt, **EU/UK exposure blocked until complete**. | report flag ① | The whole document |
| **Minority views preserved** | D-18 (8–13 simple-OFF), D-19 (companion-risk as live constraint), D-20 (forced-OFF for pure UK/EU). | DECISIONS.md | Counsel may revive any of these |

**Established system facts counsel should rely on (verified in code — see also §1.2):**
1. **AI capability is age-invariant.** `isMinor` (`<18`, `MINOR_AGE_CEILING` at `src/lib/auth/AuthContext.tsx:42`, applied at `src/lib/auth/AuthContext.tsx:132`) touches the LLM pipeline at exactly one place: **crisis-hotline routing** to the youth line 1388 (`src/lib/safety/classifier.ts:70-79`; minor template `red-ko-minor-v2` at `src/lib/llm/safety.ts:408`; UI routing `src/app/capture.tsx:657,783,912`). Model, prompt, RAG, persona depth are byte-identical for a 14-year-old and a 40-year-old. The minor protections are **data rails, not capability limits.**
2. **Crisis handoff is deterministic + human-authored**, never LLM-generated (`fixedCrisisResponse`, `src/lib/llm/safety.ts:408`).
3. **Minor data rails:** high-privacy seed on signup (`db/migrations/0032`), server clamp keyed off the *real* unforgeable tier (`db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:77-95`), UI lock (`src/lib/privacy/prefs.ts:137-140`). Only `long_term_memory`, `ops_push` and `chat_autosave` are minor-promotable (`src/lib/privacy/prefs.ts:95-99`).
4. **Sensitive data:** journaling = mental-health data; consent ledger captures `sensitive_data_ack`, `overseas_transfer_ack`, `llm_processing_ack` (`db/migrations/0031_consent_records.sql:26-28`) and ⚠ **[RE-READ 2026-09-08]** the notice/ack UI **is wired** (`src/lib/supabase/consent.ts:124-126`; collection at `src/lib/auth/consent-selections.ts:16-21`).

### 7.3 Question bank

#### A. EU AI Act Art.5(1) — Prohibited practices (social scoring + age-vulnerability)

- **Q-A1 [COUNSEL TO CONFIRM]** — Does the **learner-stage tiering** (L0→L3, `users.learner_stage`, planned per report §2) constitute a prohibited **"social scoring"** system under **Art.5(1)(c)** when applied to minors?
  - *Hinges on:* the design intends a competence signal that fades scaffolding; D-18 already removed *persistent cross-session* scoring and made fade **ephemeral/session-local** specifically to reduce this exposure (DECISIONS.md D-18 verdict). No `learner_stage` column is in production yet.
  - *Gates:* **planned (gated on this DPIA)** — any persistent learner scoring is blocked behind this answer.
  - *Provenance:* D-18 judge note ("persistent cross-session scoring = max Art.5 new-exposure"); report flag.

- **Q-A2 [COUNSEL TO CONFIRM]** — Even if not "social scoring," does default-ON scaffolding that adapts to an inferred competence level **exploit the age-based vulnerability** of minors under **Art.5(1)(b)** ("exploitation of vulnerabilities of … age")? Is *enablement-default* (thicker guidance on regression) legally distinguishable from *exploitation*, given the design frames it as harm-reduction, not behavior-shaping for the provider's benefit?
  - *Hinges on:* D-18 adopted `value-first · content-triggered · 1-tap-skippable` cognitive forcing to stay on the harm-reduction side of this line.
  - *Gates:* **planned** — default-ON cognitive forcing for minors.
  - *Provenance:* D-18; report flag ② ("Art.5(1)(c)/(b) counsel sign-off = up-front block/unblock").

- **Q-A3 [COUNSEL TO CONFIRM]** — Which-applies: are the on-device, **first-party-only** competence signals (`evidence_open_rate`, `ai_override_rate` — no external egress for minors, `external_analytics` clamped OFF at `db/migrations/0032`, `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:87`) **out of scope** of Art.5 because no profiling output is produced or acted on beyond UI thickness? Or does in-account adaptation alone suffice to engage Art.5?

#### B. EU AI Act Annex III(3) — Education high-risk

- **Q-B1 [COUNSEL TO CONFIRM]** — Does `learner_stage` + an AI-literacy curriculum (report Lane 1) cause 2nd-B to be classified as a **high-risk education/vocational-training AI system under Annex III(3)** (systems determining access to education or evaluating learning outcomes)? Is a self-reflection literacy scaffold that produces *no* grade, credential, or access decision **excluded** from Annex III(3)?
  - *Hinges on:* the system assigns no external educational outcome; scaffolding only changes UI guidance density. D-19 explicitly rejected an EdTech/tutor re-label precisely because it would **self-invite Annex III(3)** exposure.
  - *Gates:* **planned** — the `learner_stage` build and any "AI-literacy curriculum" framing.
  - *Provenance:* D-19 judge note ("alt re-label = EU AI Act Annex III(3) education high-risk self-inflicted → exposure *increases*").

#### C. EU AI Act Art.50 + 韓 AI기본법 §13 — AI-vs-human disclosure (K11)

- **Q-C1 [COUNSEL TO CONFIRM]** — Does **Art.50(1)** (transparency: users must be informed they are interacting with an AI) require a **standing, persistent AI-disclosure surface** in 2nd-B, or is a one-time onboarding disclosure sufficient given the persona/mascot framing?
  - *Hinges on:* **no AI-disclosure surface exists in code today** — a grep across `src/` for "I am an AI / not a therapist / ai_disclosure / Art.50" returns **zero hits**. This is the **K11 gap**.
  - *Gates:* **implemented today = gap**; disclosure surface is **planned**, and per D-19 it is a **hard rail** that "enablement" cannot weaken.
  - *Provenance:* report hard-rail #5; K11; Lane 5.

- **Q-C2 [COUNSEL TO CONFIRM]** — Given a **first-person persona + named mascot + `long_term_memory`** (`src/lib/privacy/prefs.ts:22`), does Art.50 (and AI기본법 §13) require *anti-anthropomorphism* disclosure language specifically for minors, or is age-invariant disclosure adequate? (D-19 already promoted anti-anthropomorphism from guideline to a **CI gate** as a working measure.)

#### D. CA SB243 — Companion-chatbot definition

- **Q-D1 [COUNSEL TO CONFIRM]** — Does 2nd-B meet the **statutory definition of a "companion chatbot" under CA SB243**, given the presence of (a) `long_term_memory` (`src/lib/privacy/prefs.ts:22`, promotable at `src/lib/privacy/prefs.ts:95-99`), (b) a first-person persona (`src/lib/persona/build.ts`), and (c) a named mascot — *notwithstanding* the D-19 positioning as a scaffolded-reflection tool? Is the SB243 test **function-based** (these affordances trigger it regardless of self-label) or **purpose-based** (reflection-tool purpose excludes it)?
  - *Hinges on:* the affordances are real and **age-invariant**; D-19 minority view warns counsel may read SB243/CSM as "function-based, irrebuttable."
  - *Gates:* **implemented today** (affordances exist); determines whether a **minors-only interim gate** on those affordances is required.
  - *Provenance:* D-19 verdict + preserved minority view.

- **Q-D2 [COUNSEL TO CONFIRM]** — If SB243 *does* apply, do the design-enforced non-companion invariants (CI-binding anti-anthropomorphism + crisis-handoff threshold lowering on cadence-spike, D-19) satisfy SB243's safeguards for minors, or does SB243 mandate specific controls (e.g., break reminders, suicidal-ideation protocols, disclosure cadence) not yet implemented?
  - *Hinges on:* crisis handoff is implemented and deterministic (`src/lib/llm/safety.ts:408`); cadence-spike threshold-lowering is **planned**.

#### E. ICO Children's Code — Std 7 / 12 (high-privacy default) + Std 3 (age assurance)

- **Q-E1 [COUNSEL TO CONFIRM]** — Does **Standard 7 (high-privacy by default)** require that **in-account LLM personalization** (i.e., `long_term_memory`, `recommendations` — features with **zero external egress** but that profile the child) be **OFF by default for minors**, the same as outward-sharing features? I.e., does Std 7 reach *internal* profiling, or only *outward* data flows?
  - *Hinges on:* today `recommendations` is **OFF by default for everyone** and **non-promotable for minors** (`db/migrations/0032`, `db/migrations/0038_minor_tier_guard_and_audit_lockdown.sql:86`; gate `src/lib/ops/recommend.ts:127-134`); `long_term_memory` is OFF-default but **minor-promotable** (`src/lib/privacy/prefs.ts:95-99`). So a minor *can* turn on in-account memory.
  - *Gates:* **implemented today**; answer determines whether `long_term_memory` must be **removed from `MINOR_PROMOTABLE_KEYS`.**
  - *Provenance:* D-20; report K3/F3 (retention vs personalization split).

- **Q-E2 [COUNSEL TO CONFIRM]** — Does **Standard 12 (profiling off by default, with meaningful explanation)** apply to `recommendations`, given counsel's D-20 finding that **egress=0 does not mean it is not profiling under GDPR Art.4(4)**? If Std 12 applies, is the planned **understanding-gated, in-context activation + immutable consent-ledger record + "why this?" permanent transparency** (D-20 verdict) a *sufficient* Std 12 mechanism, or is parental involvement required?
  - *Gates:* **planned** (understanding-gated activation UX is the §11-5 build); the runtime OFF-gate is **implemented today**.
  - *Provenance:* D-20 verdict ("silent-A = Std12 weakest").

- **Q-E3 [COUNSEL TO CONFIRM] (Std 3 — age-assurance proportionality)** — Is **DOB self-report** a **proportionate** age-assurance measure under Standard 3 for a service processing **minors' mental-health data**, or does the sensitivity require a stronger method (e.g., third-party age estimation/verification)?
  - *Hinges on:* age is derived solely from a self-reported `birth_date` (`src/lib/auth/AuthContext.tsx:132`; server trigger `db/migrations/0030_server_age_gate.sql:18-49`), with a hard reject under 14 (`db/migrations/0030_server_age_gate.sql:31-34`) but **no verification**. This is the weakest age-assurance tier.
  - *Gates:* **implemented today**; answer may force an age-assurance build before EU/UK launch.
  - *Provenance:* report flag ④.

- **Q-E4 [COUNSEL TO CONFIRM]** — Related to E3: D-19's minority view flags a **low-literacy 15-year-old who lies about age → `isMinor=false` → all minor hard rails (1388 routing, privacy clamp) drop simultaneously.** Does Std 3 require a verification or detection compensating control specifically because the *consequence* of a false DOB is loss of the crisis/youth safeguard, not just loss of a privacy default?

#### F. 韓 AI기본법 §13 — High-impact classification

- **Q-F1 [COUNSEL TO CONFIRM]** — Does the combination of **(minor user) + (mental-health domain)** classify 2nd-B as a **"high-impact AI" (고영향 인공지능) under 韓 AI기본법 §13**, triggering the Act's risk-management, human-oversight, and disclosure obligations? Which §13 obligations, if any, exceed what is already implemented (deterministic crisis handoff, consent ledger, audit log `db/migrations/0004`)?
  - *Hinges on:* journaling = mental-health content; users include 14–17 self-consent minors.
  - *Gates:* **implemented today** (KR is the live-assumed jurisdiction); this is the **primary KR determination**.
  - *Provenance:* D-19 follow-up ("counsel 필수: 韓 AI기본법 §13"); report K11.

- **Q-F2 [COUNSEL TO CONFIRM]** — Does AI기본법 §13/§31 (or the related disclosure duty) impose an **AI-generation labeling** requirement that overlaps with the Art.50 K11 disclosure (Q-C1), such that a single disclosure surface can satisfy both KR and EU? (Lane 5 is designed as "one surface, two duties" — confirm that is legally adequate, not just convenient.)

#### G. GDPR Art.8 / Art.9 / Art.4(4) — Lawful basis for the 14-year-old

- **Q-G1 [COUNSEL TO CONFIRM]** — Is a **14-year-old's self-consent valid** as the lawful basis for processing under **GDPR Art.8**, given that Art.8 defaults to **16** (member states may lower to 13)? For which EU member states is the live KR-derived floor (`digitalConsentAge("KR") = 14`, `src/lib/auth/consent-age.ts:22`) **invalid**, requiring parental consent?
  - *Hinges on:* the live gate hardcodes KR=14 and the matrix encodes `EU:16, DEFAULT:16` and **is reached** for a device whose region resolves to the EU bucket (`src/lib/auth/consent-age.ts:28-33`, resolver `src/lib/auth/consent-age.ts:108-121`); it is not reached when the region is unreadable, which lands on KR.
  - *Gates:* **implemented today** for KR; **EU launch blocked** until the jurisdiction signal + correct floor are wired.
  - *Provenance:* D-20 follow-up ("14세 이해-활성화 유효성(GDPR Art.8)"); report flag ②.

- **Q-G2 [COUNSEL TO CONFIRM]** — Is a **14-year-old's "understanding-gated" in-app activation** of `recommendations` (the D-20 activation mechanism) a **valid Art.8 + Art.9 consent** to *profiling of sensitive (mental-health) data*, or does Art.9 special-category processing of a minor require an additional/parental basis regardless of the Art.8 digital-services consent?
  - *Hinges on:* `recommendations` profiles the wiki snapshot (`src/lib/ops/recommend.ts:199-273` `recommendForDomain`; the snapshot is fenced as untrusted at `src/lib/ops/recommend.ts:248-250`); journaling is Art.9 data; activation is designed as a child-comprehensible in-context gate, not a parental flow.
  - *Gates:* **planned** (activation UX, §11-5 build).
  - *Provenance:* D-20.

- **Q-G3 [COUNSEL TO CONFIRM]** — Confirm the working assumption that **`recommendations` IS profiling under Art.4(4)** despite **zero external egress** (egress=0). The D-20 record treats "egress0 ≠ not-profiling" as a layer error; counsel to ratify so the Std 12 / Art.22 analysis proceeds on the correct premise.

- **Q-G4 [COUNSEL TO CONFIRM]** — Does the **wiki snapshot sent to the LLM** for recommendations/persona (`src/lib/wiki/export.ts`, journal records **excluded by default / opt-in only**) and the **overseas transfer** of that content to Gemini/Vertex constitute an Art.9 + Art.44 transfer requiring **explicit, separate minor consent**? The ledger captures `overseas_transfer_ack` and `llm_processing_ack` (`db/migrations/0031_consent_records.sql:26-27`), and ⚠ **[RE-READ 2026-09-08]** the collection UI **is** wired: both acks are discrete fields on the sign-up consent selection (`src/lib/auth/consent-selections.ts:16-21`), the notice is rendered on both entry screens, and `recordConsentBestEffort()` writes the ledger row only after the UI has collected them (`src/lib/supabase/consent.ts:14-21`). This question previously said the UI was **not yet wired**, citing `db/migrations/0031_consent_records.sql:11-13` - a **migration comment, frozen at the migration's authoring date by design**. Migrations are immutable, so a comment inside one can only ever evidence what was true when it was written; it is not a reading of the current system.

#### H. GDPR Art.20 — Data portability / export

- **Q-H1 [COUNSEL TO CONFIRM]** — ⚠ **[RE-READ 2026-09-08] this question's premise was two-ways stale and has been re-framed; the legal determination is untouched.** It asked whether the wiki markdown export satisfies Art.20 "or is it insufficient … does Art.20 require a structured, machine-readable export of *all* personal data". Both halves had moved:
  1. **The structured all-category export exists** and this document says so in four other places (2.3, 5B-R8, 6.1.3) - `export-account` returns versioned JSON gathered from every user-owned table (`supabase/functions/export-account/index.ts:97-115`). Round 52 corrected eleven statements that called it absent; this question kept the old premise because it is phrased as a question.
  2. **The cited entry point is not on any shipped surface.** src/app/data.tsx:62-71 (quoted, not cited) sits inside `DataManagementLegacy`, which renders only when `UI_MODE` is `legacy`; the code default is `deep-space` (`src/lib/ui-mode.ts:31`) and all three delivery paths set it explicitly (`eas.json`, `.github/workflows/android-release.yml`, `.github/workflows/web-deploy.yml`). The screen users actually get routes its export item to `/account?tool=export` - the **structured** export - not to `/wiki` (`src/screens/deepspace/dds-data-content.ts:63-69`).
  **The question that is actually open** is the one section 6.1.3 already states: whether the three deliberately-excluded stores and a v1 response that can carry partial read failures are acceptable for Art.20. The markdown bundle is a convenience artifact alongside it, not the offering.
  - *Hinges on:* both are implemented - erasure (`src/lib/records/delete-bulk.ts:172-180`, `delete-account`) and a comprehensive structured export (`export-account`, `supabase/functions/export-account/index.ts:1-9`). The question is now whether the deliberately excluded stores leave it sufficient.
  - *Gates:* **implemented today**; the open item is the exclusion scope, not the path.
  - *Provenance:* report flag ③ ("export 경로 부재, GDPR Art.20 갭" — *nuance as recorded then: a wiki export exists; a complete Art.20 export does not*). ⚠ **[RE-READ 2026-09-08]** The quoted flag is kept as provenance, but its nuance is spent: `export-account` shipped after it was written.

#### H2. Paddle — processor or independent controller?

- **Q-H2 [COUNSEL TO CONFIRM]** — Paddle is the **merchant of record** for paid tiers, not merely a payment gateway: it is the seller of record and holds the customer relationship for the transaction. Does that make it a **processor** acting on our instructions, or an **independent controller** for the payment data it receives?
  - *Hinges on:* the answer changes the disclosure. A processor belongs in the sub-processor table under our controllership with a DPA; an independent controller has to be disclosed as a separate recipient with its own lawful basis, and the transfer to it described accordingly.
  - *Implemented today:* live credentials are configured and checkout is wired (`src/lib/billing/paddle-checkout.ts:41-47`; `supabase/functions/paddle-webhook/index.ts`); the sub-processor table (2.7) currently lists it with this question attached rather than asserting either status.
  - *Gates:* the 2.7 row's wording, and whether a DPA is the right instrument or the wrong one.

#### I. Scope determination (answer first — gates A–H)

- **Q-S1 [COUNSEL TO CONFIRM]** — **Which legal regimes does the product hold itself out to today?** The build reads a country/region signal from the device (`src/lib/auth/device-region.ts`) and applies the matrix, falling back to KR when the region is unreadable (`src/lib/auth/consent-age.ts:108-121`); the non-KR values still lack legal sign-off. Counsel to determine: (a) is the **launch scope KR-only** (in which case EU/UK Std 7/12/Art.8/Art.20 questions are deferred), or (b) does targeting/availability bring **EU/UK/CA users into scope** now?
  - *Gates:* **everything.** Per D-20 minority view, until K12 (this DPIA) + counsel sign-off, UK/EU minors **fall back to `recommendations` OFF**. Per report flag ②, **non-KR values must not be relied on before counsel.**

- **Q-S2 [COUNSEL TO CONFIRM]** — Is a **jurisdiction signal** (and which method: IP geolocation, store-region, declared country) **legally required** as a precondition to per-region floors, and does collecting it for minors itself raise a data-minimization concern?

#### J. PIPA cross-cutting (KR)

- **Q-J1 [COUNSEL TO CONFIRM]** — Does **PIPA §22-2** require **verifiable legal-representative consent** for the **14–17 self-consent** band for *sensitive (§23) mental-health* processing — i.e., is the under-14 hard floor (`db/migrations/0030_server_age_gate.sql:31-34`) the correct line, or does §23 sensitivity pull the guardian-consent requirement up above 14 for this data category?
- **Q-J2 [COUNSEL TO CONFIRM]** — Is the **immutable consent ledger** schema (`db/migrations/0031`: general §15/17/22 + §23 sensitive ack + overseas-transfer ack) **sufficient for PIPA accountability**? ⚠ **[RE-READ 2026-09-08]** this was asked "conditional on the ack-collection UI being wired", citing the frozen migration header. **That condition is met** - the acks are collected and written (`src/lib/supabase/consent.ts:124-126`), so the question is now unconditional. Confirm the required ack set is complete (nothing missing for minors).

### 7.4 Counsel response template (to be completed)

For each Q above, counsel to return: **(1)** determination (yes/no/which-applies); **(2)** jurisdictions in which it holds; **(3)** whether it **blocks** or **conditions** the gated build; **(4)** required compensating control, if any; **(5)** residual-risk acceptance. Engineering will then convert blocking answers into hard rails and conditioning answers into the §11-5 build backlog.

**Build items currently held at the §11-5 legal gate pending the above:** persistent learner-stage scoring (Q-A1/A2/B1), default-ON minor cognitive forcing (Q-A2), `recommendations` understanding-gated activation UX (Q-E2/G2), AI-disclosure surface / K11 (Q-C1/C2/F1), age-assurance upgrade (Q-E3/E4), jurisdiction signal + EU floors (Q-S1/S2/G1), full Art.20 export (Q-H1), consent-ack UI wiring (Q-G4/J2). **Shipped without legal dependency (data-safety hardening only):** the D-20 `recommendations` runtime OFF-gate (`src/lib/ops/recommend.ts:127-134`).

*All determinations above remain `[COUNSEL TO CONFIRM]`. This register is the engineering hand-off, not a legal position.*

---

## Section 8 — Counsel Sign-Off

This DPIA draft is **not effective** until completed and signed by qualified legal counsel. By signing, counsel records the determinations made against the open questions in Section 7, the residual-risk position in Section 5, and the overall decision below.

### 8.1 Decision

| | Decision | Meaning |
|---|---|---|
| ☐ | **PROCEED** | Processing may proceed as described; residual risks accepted; no blocking conditions. |
| ☐ | **PROCEED WITH CONDITIONS** | Processing may proceed only after the listed conditions/compensating controls are implemented (e.g., consent-ack UI wiring, K11 disclosure surface, anti-anthropomorphism CI gate, jurisdiction signal, age-assurance upgrade, Art.20 export). |
| ☐ | **DO NOT PROCEED** | Processing (or the gated enablement build) must not proceed in its current form; rationale and required changes below. |

### 8.2 Conditions / required compensating controls (if "Proceed with conditions")

1. `____________________________________________`
2. `____________________________________________`
3. `____________________________________________`

### 8.3 Scope of the determination

- **Jurisdictions covered by this sign-off:** `[e.g., KR-only / KR + EU/UK / …]` (ties to Q-S1).
- **Items explicitly deferred / not covered:** `____________________`
- **Re-review trigger / expiry:** `[date or event — e.g., before any non-KR launch, or on material change to LLM sub-processor]`

### 8.4 Signatures

| Role | Name | Organisation | Signature | Date |
|---|---|---|---|---|
| **Legal counsel (reviewer)** | `____________` | `____________` | `____________` | `[YYYY-MM-DD]` |
| **Data Protection Officer / privacy lead** (if applicable) | `____________` | `____________` | `____________` | `[YYYY-MM-DD]` |
| **Product owner** | Simon Kim (김양환) | 2nd-B | `____________` | `[YYYY-MM-DD]` |

---

*End of DPIA DRAFT. Prepared by the engineering/orchestration layer as a fact-grounded working draft for counsel completion. All `[COUNSEL TO CONFIRM]` flags remain open legal determinations. System-behaviour claims are cited to `E:/2ndB` source at `file:line`, read 2026-06-14. This document is not legal advice and is not effective until the Section 8 block is signed.*