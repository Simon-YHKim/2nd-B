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
| **Code baseline** | `E:/2ndB` @ 2026-06-14 (all `file:line` citations read on this date) |
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

1. **AI capability is age-invariant.** `isMinor` (derived as `birth_date → age < 18`, `src/lib/auth/AuthContext.tsx:15,55`) touches the LLM pipeline at exactly **one** point — selecting the youth crisis hotline 1388 over the adult line (`src/lib/safety/classifier.ts:58-67`; `src/lib/llm/safety.ts:266-298`). Model, prompt, RAG depth and persona are **byte-identical** for a 14-year-old and a 40-year-old. **All minor protections are data/egress rails, not capability limits.** **[COUNSEL TO CONFIRM]** whether identical AI capability for 14–17s is defensible given the mental-health context.
2. **Crisis handoff is deterministic and human-authored**, never LLM-generated: red-zone short-circuits before any network call and is re-checked on output, then replaced verbatim by a fixed human-written template (`fixedCrisisResponse`, `src/lib/llm/safety.ts:266-298`; `src/lib/llm/gemini.ts:344-357`, `:481-539`).
3. **Minor data rails (server-enforced):** high-privacy seed at sign-up (`db/migrations/0032`), clamp keyed off the row's *real* unforgeable tier (`db/migrations/0033`, `0038:77-95`), `minor_tier` server-only (`db/migrations/0038`), plus a UI lock; only `long_term_memory` + `ops_push` are minor-promotable (`src/lib/privacy/prefs.ts:59`).
4. **Sensitive data + consent ledger.** Journaling = mental-health data. The immutable consent ledger captures `sensitive_data_ack` / `overseas_transfer_ack` / `llm_processing_ack` (`db/migrations/0031:26-28`), but the **notice/ack collection UI is "NOT YET WIRED at sign-up"** (`db/migrations/0031:11-13`).

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
2nd-B captures free-text self-reflection (journal, notes, life-audit answers), runs it and a derived personal knowledge graph through a hosted LLM (Google Gemini) to return reflective prompts, persona inferences, and routine suggestions, and stores the results per-user in Supabase Postgres. A deterministic safety classifier inspects text on the way in and on the way out; crisis-zone text is intercepted and replaced with a fixed human-written hotline template rather than an AI reply (`src/lib/llm/gemini.ts:344-357`, `src/lib/llm/safety.ts:266-298`).

Operations performed: collection, structuring/inference, storage, cross-border transfer to a sub-processor for inference, automated classification (crisis triage), and erasure on request. No automated decision with legal/similarly-significant effect is made about the user **[COUNSEL TO CONFIRM** whether crisis routing or persona inference reaches Art. 22 / profiling thresholds — see 2.6 #3 and #6**]**.

### 2.2 Scope
- **Volume of data per subject:** potentially high-frequency, long-horizon free text (journaling is the core loop) plus an accreting inferred self-model. This is *intensive* rather than *extensive* — few subjects, deep profiles.
- **Geographic scope:** live age/consent logic is **hard-coded to KR (self-consent floor 14)**; non-KR jurisdictions are designed-for but not yet safely supported (`src/lib/auth/consent-age.ts:21-26`, with `TODO(legal)` and `LEXICON_LAST_LEGAL_REVIEW = null` at `:12-14`). EU/UK exposure is therefore a *planned* scope, explicitly fenced behind this DPIA in D-20's minority fallback (`DECISIONS.md` D-20).
- **Special-category scope:** mental-health-adjacent free text is in scope for **every** account from first use (no "sensitive mode" toggle gates capture).

### 2.3 Context
- **Relationship:** direct-to-consumer; the data subject is the author and primary reader of their own data (RLS scopes all owned tables to `auth.uid()`, e.g. `db/migrations/0021_self_contexts.sql`, `0023_chat_usage.sql`).
- **Vulnerable subjects:** the app is **designed for minors** (14-17 KR self-consent) learning to use AI well; under-14 self-registration is hard-blocked server-side (`db/migrations/0030_server_age_gate.sql`, `0033_…enforcement.sql`). Children are an ICO Children's Code / GDPR Recital 38 heightened-risk population — material context for the risk section.
- **State of the art / prior expectations:** capability is **identical for minors and adults** (see §1.2 fact 1); `isMinor` touches the LLM path at exactly one point — selecting the youth crisis hotline (1388) over the adult line (`src/lib/safety/classifier.ts:63`; `src/lib/llm/safety.ts:266-298`). Minor protections are **data-egress rails**, not capability limits (see 2.7, 3.3).

### 2.4 Purposes of the processing
| # | Purpose | Lawful-basis candidate (counsel) | Status |
|---|---|---|---|
| P1 | Store & surface the user's own journal/notes/audit (the "second brain") | Contract | [IMPLEMENTED] |
| P2 | AI-generated reflective follow-ups & chat over the user's knowledge graph | Contract / consent | [IMPLEMENTED] |
| P3 | Infer a versioned persona/self-model (traits, values, patterns) | **[COUNSEL TO CONFIRM** — profiling, Art. 4(4)**]** | [IMPLEMENTED] |
| P4 | Crisis detection → human-written hotline handoff (safety) | Vital interests / legal obligation **[COUNSEL]** | [IMPLEMENTED] |
| P5 | AI-literacy / scaffolded-autonomy enablement ("learner licence" L0-L3) | Contract | [PLANNED — DPIA-gated] (D-18) |
| P6 | Account-internal routine *recommendations* from the user's own material | Consent (understanding-gated) | [PLANNED — DPIA-gated] (D-20); runtime gate predicate landed `src/lib/ops/recommend.ts:129-135` |
| P7 | Product analytics / UX measurement | Consent | [IMPLEMENTED], **off for minors** (`src/lib/analytics/index.ts:74`) |
| P8 | Service ops: usage caps, tier/billing, abuse/cost control | Contract / legitimate interest | [IMPLEMENTED] (`db/migrations/0023_chat_usage.sql`) |
| P9 | Audit/accountability evidence (AI decision log) | Legal obligation / legit. interest **[COUNSEL]** | [IMPLEMENTED] (`db/migrations/0004_ai_audit_log.sql`) |

Explicitly **excluded** purposes for all users (privacy-by-design defaults OFF): advertising, third-party sharing, LLM training on user data, persona export/share (`src/lib/privacy/prefs.ts:9-31`). For minors these are additionally **server-clamped** (2.7, 3.3).

### 2.5 Data subjects
- **14-17 self-consent minors (KR)** — primary target population. `isMinor` is derived as `birth_date → age < 18` (`src/lib/auth/AuthContext.tsx:55`); server `minor_tier='minor_self'` for 14-17 (`db/migrations/0030_server_age_gate.sql`).
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
| 6 | **Crisis signals** | `crisis_events`: `zone='red'`, `classifier_confidence`, `trigger_categories` (categorical), `cssrs_level` (C-SSRS 1-6), `routing_template_version`, `locale`, **`user_id_hash`** | **Highest-sensitivity inference; never raw text** | `db/migrations/0012_crisis_events.sql` |
| 7 | **AI-decision audit telemetry** | `ai_audit_log`: `prompt_hash`, `output_hash` (hashes, **not** raw text), `model_used`, `vertex_backend`, `safety_zone`, `latency_ms` | Pseudonymised metadata | `db/migrations/0004_ai_audit_log.sql` |
| 8 | **Usage / cost telemetry** | `chat_usage` (per-user/day count), `gemini_spend_daily` (0035) | Low-sensitivity ops | `db/migrations/0023_chat_usage.sql` |
| 9 | **Consent ledger** | `consent_records`: `age_band`, `minor_tier`, `consent_version`, `policy/terms_version`, `purposes`, `llm_processing_ack`, `overseas_transfer_ack`, `sensitive_data_ack`, **`ip_hash`/`ua_hash`** (hashed) | Accountability record; IP/UA minimised by hashing | `db/migrations/0031_consent_records.sql`; `src/lib/auth/consent-selections.ts:16-24` |
| 10 | **Product analytics events** (consented adults only) | `page_view`, `capture`, `secondb_session{mode,turn_count}` → GA4 / Clarity / PostHog / Sentry | Behavioural; **suppressed for minors & sub-consent-age** | `src/lib/analytics/index.ts:56,74` |

Note on #1: journal text is **not** sent to the chat/recommendation LLM by default — see 3.2. The crisis classifier, however, *does* read raw record text locally to triage it (`src/lib/llm/gemini.ts:273-282` `classifyRecordTextForCrisis`).

### 2.7 Recipients / third parties (sub-processors)
| Recipient | Role | Data exposed | Trigger / gate | Cite |
|---|---|---|---|---|
| **Google — Gemini API** (`generativelanguage.googleapis.com`) **or Vertex AI** (GCP) | LLM inference (processor) | System prompt + the user's **turn** + wiki-snapshot RAG context (pages/sources, body truncated 600 chars). **Journal records excluded by default.** Image bytes for OCR when used. | Every AI turn; egress via `gemini-proxy` edge fn (key server-side) or direct Vertex client | `supabase/functions/gemini-proxy/index.ts:53`; `src/lib/llm/gemini.ts:398-479` |
| **Supabase** (Postgres, Auth, Edge Functions) | Hosting / DB processor | All stored categories (2.6) | Always (system of record) | RLS migrations throughout |
| **GA4 / Microsoft Clarity / PostHog / Sentry** | Product analytics | Category #10 only | **Only if** `external_analytics` consented **AND** not minor **AND** not sub-consent-age | `src/lib/analytics/index.ts:74` |
| **Naver** (and other social IdPs) | OAuth sign-in | Auth identity | If user picks social login | `supabase/functions/oauth-naver/` |
| **GitHub Pages / web host** | Static web delivery | Client bundle (no server secrets) | Web build | (deploy config) |

**Cross-border transfer:** inference routes to Google infrastructure; the exact processing region depends on `EXPO_PUBLIC_USE_VERTEX` / `GOOGLE_CLOUD_LOCATION` and the Supabase project region — **not pinned in app code; operator must confirm.** The consent flow collects an explicit **overseas-transfer acknowledgement** (`overseas_transfer_ack`) and PIPA §23 **sensitive-data acknowledgement** (`sensitive_data_ack`) (`src/lib/auth/consent-selections.ts:16-24,65-83`). **[COUNSEL TO CONFIRM** adequacy/SCC basis, retention by Google, and that an ack ≠ valid Art. 9(2)/PIPA §23 explicit consent.**]**

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
                              analytics events ──► GA4/Clarity/PostHog/Sentry        / Vertex
                                 (ONLY if consented AND not minor)
```

### 3.2 The LLM proxy flow in detail (the core risk surface)
1. **Assembly** (`src/lib/chat/conversation.ts:146-203`): builds a system prompt = header + injection-guard + mode line + persona hint + a **wiki snapshot**. The snapshot comes from `exportUserWiki(userId, {bodyCharLimit:600, pageLimit:50, sourceLimit:100})` — i.e. knowledge-graph pages and source titles, **not** journal records. `includeRecords` is an opt-in the chat path deliberately does not set (`src/lib/wiki/export.ts:213-215`); the recommendations path is identical (`src/lib/ops/recommend.ts:5-9,138`).
2. **Untrusted-data fencing**: the snapshot is sanitised and wrapped in `<UNTRUSTED type="wiki_snapshot">` so a clipped "ignore previous instructions" cannot steer the model (`conversation.ts:185-190`). Export also applies a **fail-closed frontmatter allowlist** so clip metadata (geo, tracking-token URLs) never egresses (`export.ts:88-91`).
3. **Pre-call safety (C9)**: `callGemini` runs `classifyInput` on the user turn *before* any network call; red-zone short-circuits to `routeCrisis` and never reaches Google (`src/lib/llm/gemini.ts:344-357`).
4. **Single egress (C1) + spend cap (C-cost)**: live calls route through the `gemini-proxy` edge function (API key server-side, per-user/day cap, server-side crisis gate, server-authoritative audit) — `gemini.ts:398-445`, `supabase/functions/gemini-proxy/index.ts`. Direct `@google/genai` egress is allowed **only** for Vertex (GCP-billed); an uncapped live API-key path throws (`gemini.ts:71-79`).
5. **Post-call re-classification + swap (output safety)**: the model reply is re-classified (lexicon ∪ Gemini-Flash semantic); a red result is **not shipped** — it is replaced verbatim by the fixed crisis template and a `crisis_events` row is written (`gemini.ts:481-539`).
6. **Audit (C3)**: every call (mock, proxy, direct, crisis-routed, swapped) writes `ai_audit_log` with **hashes only** of prompt/output (`gemini.ts:301-342, 541-556`; `db/migrations/0004`).

### 3.3 Minor-specific routing & rails (data-flow deltas, not capability deltas)
- **Capture:** identical to adults.
- **AI:** identical model, prompt, RAG depth; the **only** minor branch is hotline selection — `crisisHotlines(locale, minor=true) → [KR_1388, KR_109]` and template version `red-ko-minor-v1` (`src/lib/safety/classifier.ts:63`; `src/lib/llm/safety.ts:266-298`).
- **Egress rails (server-enforced):** on sign-up the age-gate trigger seeds `privacy_prefs` all-OFF for `minor_self` and a dedicated clamp trigger **forces** `ads, sharing, recommendations, external_analytics, llm_training, persona_export, persona_share = false` on every write — defeating a tampered client (`db/migrations/0032`, `0033`, `0038`). Only `long_term_memory` and `ops_push` are minor-promotable (`src/lib/privacy/prefs.ts:59`).
- **`minor_tier` is server-only** — a self-UPDATE to `minor_tier='adult'` is rejected unless `birth_date` also changes (age gate re-derives), closing the high-privacy-escape (`db/migrations/0038` `block_self_tier_change`).
- **Analytics & ads suppressed** for minors / sub-consent-age regardless of consent state (`src/lib/analytics/index.ts:74`; ads fail-closed when `isMinor !== false` `src/lib/ads/policy.ts:58`).

### 3.4 Retention touchpoints & erasure
- **Primary user data** (`records`, `personas`, `memorized_patterns`, `self_contexts`, `esm_responses`, `chat_usage`, `wiki_*`, `consent_records`, `gemini_spend_daily`): retained for the life of the account; erased by **`ON DELETE CASCADE` off `public.users`** via the `delete-account` edge function, which deletes `public.users` (cascades children) then the `auth.users` row. IDOR-safe — target is always the JWT caller (`supabase/functions/delete-account/index.ts`).
- **Retention-exception #1 — `ai_audit_log`:** FK is **`ON DELETE SET NULL`** (migration 0011), so audit rows **survive account deletion** with `user_id` nulled (kept as accountability/XPRIZE evidence). **[COUNSEL TO CONFIRM** lawful basis & whether hash-only rows are out of scope for erasure.**]**
- **Retention-exception #2 — `crisis_events`:** keyed by `user_id_hash` (a non-FK `md5(auth.uid())`), so these rows are **not cascade-erased** and persist after account deletion. The schema itself flags the hash as **obfuscation, not anonymisation** (32-bit/`md5`, re-identifiable) (`db/migrations/0012` user_id_hash comment; `0040` `log_crisis_event`). **[COUNSEL TO CONFIRM** retention justification and whether this is "personal data" post-deletion.**]**
- **No time-based retention limit is implemented** — a grep for TTL/purge/cron retention jobs found none. Retention is currently "until user deletes account." **Carry to risk + necessity sections.**

### 3.5 Known flow-level gaps (forward to risk/measures sections)
1. **Data portability (GDPR Art. 20):** `exportUserWiki` produces a markdown bundle ("your second brain travels") of pages/sources (+optionally records) for pasting into another LLM (`src/lib/wiki/export.ts:1-12`), but there is **no structured, machine-readable, all-category export** path. **[COUNSEL TO CONFIRM** whether this satisfies Art. 20; prior analysis treats portability as absent.**]**
2. **AI-vs-human disclosure (K11 / EU AI Act Art. 50 / KR AI Framework Act §13):** no in-product surface yet declares the responder is AI — **gap** (planned, Lane 5 of the enablement design).
3. **Age assurance:** self-report DOB only (2.5) — weakest tier; a low-literacy 15-year-old who under/over-states age changes the entire rail set.
4. **Jurisdiction signal:** consent floor hard-coded KR=14; locale (en/ko) ≠ country; non-KR values are unreviewed (`src/lib/auth/consent-age.ts:9-15`).
5. **Recommendations runtime wiring (D-20):** the gate predicate `recommendationsAllowed()` is now defined (`src/lib/ops/recommend.ts:129-135`); D-20 records that the *screen-level* `runRecommend` path previously ran ungated for everyone (clamp was nominal). Confirm the screen calls the gate before relying on the minor lock for recommendations (`DECISIONS.md` D-20). **[Status: gate predicate IMPLEMENTED; full opt-in UX PLANNED — DPIA-gated.]**

**Drafting note for counsel:** all "[IMPLEMENTED]" claims in Sections 2–3 are cited to live files at the paths above and were read on 2026-06-14. Every legal characterisation is flagged **[COUNSEL TO CONFIRM]** and intentionally left open. These sections assert *system behaviour*, not law.

---

## Section 4 — Necessity, Proportionality & Lawful Basis

> **Scope & method.** This section assembles the *factual* processing map and the system-enforced controls, then proposes a lawful-basis structure for counsel to confirm or correct. "Implemented today" = present in shipped code/migrations; "Planned (DPIA-gated)" = designed in D-18/19/20 and the K1–K12 analysis but **not built**, with the build itself gated on this DPIA + counsel sign-off (`PROTOCOL §11-5`).

### 4.1 Processing-purpose inventory

| # | Purpose | Personal data involved | Special-category? | Where in system |
|---|---------|------------------------|-------------------|-----------------|
| P1 | **Account creation & age-tier gating** | birth_date (DOB), email, derived `minor_tier`/`account_status` | No (DOB is identifying, not special) | `db/migrations/0030_server_age_gate.sql`; `src/lib/auth/consent-age.ts` |
| P2 | **Core service: AI-assisted journaling / "second brain" reflection** | journal & note records, wiki pages, sources | **Yes — mental-health inferences** (GDPR Art.9 / PIPA §23) | `src/lib/chat/conversation.ts:129`; `src/lib/wiki/export.ts` |
| P3 | **LLM processing of user entries via Gemini gateway (incl. overseas transfer)** | clipped wiki/source snapshot (journal **excluded**), prompt/output hashes | Yes (derived from P2) | `src/lib/llm/gemini.ts`; `supabase/functions/gemini-proxy/index.ts`; `src/lib/llm/audit` → `db/migrations/0004_ai_audit_log.sql` |
| P4 | **Crisis detection & human-handoff routing** | message text (transient, classified), categorical crisis event | **Yes — health/safety** | `src/lib/llm/safety.ts:261-298`; `db/migrations/0012_crisis_events.sql` |
| P5 | **Consent record-keeping (accountability ledger)** | consent acks, versions, hashed IP/UA | No | `db/migrations/0031_consent_records.sql` |
| P6 | **AI-decision audit logging (safety/governance)** | prompt_hash, output_hash, model, safety_zone, latency | No (hashes, not content) | `db/migrations/0004_ai_audit_log.sql` |
| P7 | **Ops recommendations** (account-internal routine suggestions, no egress) | wiki snapshot (journal excluded) | Possibly (derived) | `src/lib/ops/recommend.ts` |
| P8 | **External analytics** (GA4/Clarity/PostHog) | usage events | No | `src/lib/privacy/analytics-consent-queue.ts` — **minors: locked OFF** |
| P9 | **Advertising** | ad-eligibility signals | No | `src/lib/ads/policy.ts` — **minors: never (rule 2)** |
| P10 | **Model training on user data** | — | — | **No live flow.** `llm_training` pref hard-clamped false for minors; never wired to any egress (`db/migrations/0033`:52; `prefs.ts:62-72`) |

**Key invariant for the whole table:** AI *capability* (model, prompt, RAG depth, persona) is **byte-identical for minors and adults** (see §1.2 fact 1); the sole `isMinor` use in the LLM path is crisis-hotline selection — `src/lib/llm/types.ts:27-30, 57-60`; `safety.ts:266-298`; `gemini.ts:293-297`; `AuthContext.tsx:12-15,55`. The minor-specific controls are all on **P5/P7/P8/P9/P10 (data)**, not on **P2/P3 (capability)** — the proportionality argument in 4.6.

### 4.2 Lawful-basis mapping (GDPR Art.6 + Art.9; PIPA) — [COUNSEL TO CONFIRM each row]

> Counsel must confirm the *kind* of basis and whether consent-as-Art.6 basis is sound for a service marketed to minors (ICO/EDPB caution that consent from children + necessity-for-service can be in tension; an Art.6(1)(b) "necessary for the contract" framing for P1–P4 core, with Art.9(2)(a) explicit consent layered for special-category, is a candidate but **not yet a determination**).

| # | Candidate GDPR Art.6 | Candidate GDPR Art.9 (if special) | Candidate KR PIPA | Notes for counsel |
|---|----------------------|-----------------------------------|-------------------|-------------------|
| P1 | 6(1)(b) contract / 6(1)(c) legal obligation (age-gating duty) | n/a | §15 collection w/ consent; **§22-2 legal-rep consent <14** | Under-14 self-service is **rejected** server-side (`0030`:30-34), so the §22-2 guardian-consent path is *not relied upon in production* — it is schema-only (`0028`; guardian flow unbuilt). Confirm this satisfies "no under-14 processing" rather than "compliant under-14 processing." |
| P2/P3 | 6(1)(b) contract (the AI reflection IS the service) | **9(2)(a) explicit consent** to process mental-health data | §15/§17/§22 general consent **+ §23 sensitive-info separate consent** + §28-8/§28-2 **overseas-transfer** consent (Gemini/Supabase) | §23 sensitive-data ack + overseas-transfer ack are collected as discrete acks (`consent-selections.ts:20-21`; `0031` `sensitive_data_ack`, `overseas_transfer_ack`). Confirm explicit-consent validity for 14-17 self-consenting minors. |
| P4 | 6(1)(d) **vital interests** and/or 6(1)(b) | **9(2)(c) vital interests** / 9(2)(g) substantial public interest | §23 / emergency provisions | Crisis routing is **always-on, tier- and consent-independent** (hard rail #1). Counsel: confirm vital-interests as the basis that does **not** depend on consent (so a withdrawn consent never disables crisis safety). |
| P5 | 6(1)(c) legal obligation (accountability) | n/a | §22 accountability | Immutable ledger (4.4). |
| P6 | 6(1)(f) legitimate interests (safety governance) | n/a — hashes only | — | LIA needed [COUNSEL TO CONFIRM]; data is hashed (`0004`). |
| P7 | 6(1)(b)/6(1)(a) | derived | §15 | **Minors: OFF unless explicitly enabled** and currently un-enable-able while locked (4.3). |
| P8 | **6(1)(a) consent** | n/a | §22 + ISMS/정보통신망법 | **Minors locked OFF** (`0032/0033/0038`); opt-out is immediate (`analytics-consent-queue.ts:4`). |
| P9 | **6(1)(a) consent** | n/a | 정보통신망법 §50 | **Minors never** (`ads/policy.ts:11-13`, rule 2; `:58` null=fail-closed). |
| P10 | — | — | — | No processing occurs; pre-locked. |

**Art.8 GDPR (child's consent for information-society services):** the digital-consent age is **jurisdiction-dependent** and the code encodes the matrix `KR=14 / US=13 / EU=16 / DEFAULT=16` (`consent-age.ts:21-26`). **Today the live gate hard-assumes KR=14** because no reliable jurisdiction signal is collected (locale en/ko ≠ country) and `LEXICON_LAST_LEGAL_REVIEW` is null (`consent-age.ts:8-14`). **[COUNSEL TO CONFIRM]** that KR-only operation is the actual launch scope; any EU/UK exposure makes the 14-floor non-conforming (Art.8 default 16) and triggers the D-20 UK/EU OFF-fallback (DECISIONS.md D-20 소수의견).

### 4.3 Special-category data (GDPR Art.9 / PIPA §23 sensitive information)

**Factual basis for the Art.9 trigger:** the product's core artifact is mental-health/self-reflection journaling. Records are explicitly described in-code as "the user's MOST personal data" (`src/lib/wiki/export.ts:18-22`). Processing these to produce AI reflection necessarily *infers* mental/emotional state → **special-category under Art.9(1)** and **sensitive information under PIPA §23** [COUNSEL TO CONFIRM]. The seed corpus (`supabase/seed/ai-mental-health-safety.sql`, `crisis-detection.sql`, etc.) confirms the mental-health domain.

**Controls implemented today that bear on the Art.9/§23 basis:**
- **Separate sensitive-data consent ack** collected at sign-up, distinct from service consent (`consent-selections.ts:3-4,20-21`); recorded immutably as `sensitive_data_ack` (`0031`).
- **No pre-consent sensitive egress** (hard rail #2): every outward/profiling/external key defaults OFF for everyone and is **server-clamped** OFF for minors (`0032`, `0033`, `0038`).
- **Crisis path uses deterministic, human-written fixed templates — the LLM is never called in red-zone** (`safety.ts:261-298`; test asserts `mockGenerateContent` not called, `gemini.test.ts:201`). This keeps the most sensitive moment off the model entirely.

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
1. **Capability is constant across age.** No model/prompt/RAG/persona branch keys on `isMinor`; the sole `isMinor` use in the LLM path is crisis-hotline selection (`types.ts:27-30,57-60`; `safety.ts:266`; `gemini.ts:293-297`). A 14-year-old and a 40-year-old receive identical AI utility. *(This is the "bike" — it never slows.)*
2. **The minor-specific differences are exclusively on the data layer** — egress locks (`0032/0033/0038`), ads suppression (`ads/policy.ts` rule 2), analytics lock (`analytics-consent-queue`), training pre-lock (`0033`). *(These are the "training wheels" — added/removed without touching the bike's speed.)*
3. **Least-restrictive-of-utility:** the protections chosen (default-OFF privacy prefs, server clamp, fail-closed null handling at `ads/policy.ts:58` and `0038`'s real-tier clamp) restrict *data flows* and not the *service experience*. A capability cap (e.g., disabling AI for minors) was explicitly **rejected** as both unnecessary and contrary to the child's best-interests/learning mission (minor-ai-literacy-enablement HTML, "bike never slows"; D-18 판정).

**Proportionality of the *planned* (DPIA-gated) enablement features:** D-18 adopts an *enablement-default* with **ephemeral/session-local fade** and **persistent behavioral scoring deferred behind counsel (Art.5 profiling) review** (DECISIONS.md D-18 판정) — i.e., the design already chose the less-intrusive option (no durable competence-score profile) precisely to keep proportionality. **[COUNSEL TO CONFIRM]** the Art.5 / automated-decision analysis for any persistent scoring before it is built.

### 4.7 Data minimization (Art.5(1)(c) / PIPA §3(1))

- **Journal text is excluded from all LLM prompts by default.** `exportUserWiki` defaults `includeRecords` off; the chat RAG path and ops path both rely on this and are documented to "never silently start shipping diary text into prompts" (`export.ts:18-29, 213-216`; `recommend.ts:6-8` "wiki snapshot ONLY … no-journal-in-prompts contract").
- **600-character snapshot cap** on each page/record body sent to the model — chat (`conversation.ts:148-153`, `bodyCharLimit:600`, `pageLimit:50`, `sourceLimit:100`) and ops (`recommend.ts:33` `SNAPSHOT_CHAR_LIMIT=600`). The model receives clipped excerpts, not full documents.
- **Fail-closed egress allowlist** on exported metadata — only an allowlisted set of frontmatter keys may leave; everything else (geolocation, tracking tokens, private notes) is dropped (`export.ts:83-91`). This replaced a denylist that "failed open."
- **Hashing / categorical-only at rest:** AI audit stores `prompt_hash`/`output_hash`, never raw text (`0004`); crisis events store categorical trigger info + a **non-cryptographic obfuscated** `user_id_hash` and "never raw user text" (`0012`); consent ledger stores hashed IP/UA (`0031`). *(Counsel note: the crisis `user_id_hash` is documented as djb2 32-bit obfuscation, **not anonymization** — re-identifiable; flag whether this meets pseudonymization expectations.)*
- **Untrusted-data fencing** of the snapshot (`conversation.ts:185-188`; `recommend.ts:88-90,98-99`) — a minimization-adjacent integrity control preventing injected content from widening the data the model acts on.

### 4.8 Implemented-today vs. planned (DPIA-gated)

| Control / basis element | Status | Cite |
|---|---|---|
| Server age floor <14 + tier derivation | **Implemented** | `0030` |
| Minor high-privacy seed + server clamp (ads/sharing/recs/analytics/training/persona/export off) | **Implemented** | `0032`, `0033`, `0038` |
| `minor_tier` server-only (anti-downgrade) | **Implemented** | `0038` |
| Immutable consent ledger w/ §23 + overseas-transfer acks | **Implemented** | `0031`, `consent-selections.ts` |
| Crisis hard-rail (deterministic, human templates, minor→1388, LLM not called) | **Implemented** | `safety.ts:261-298`, `0012` |
| Journal-excluded prompts + 600-char cap + fail-closed allowlist | **Implemented** | `export.ts`, `conversation.ts:148`, `recommend.ts` |
| Ads never to minors / analytics locked | **Implemented** | `ads/policy.ts`, `analytics-consent-queue.ts` |
| D-20 ops-recommend minor gate (closed the ungated-runtime bug) | **Implemented** | `recommend.ts:129-135`, `ops.tsx:106-110` |
| **AI-vs-human disclosure surface (K11 / EU AI Act Art.50 / 韓 AI기본법 §13)** | **Planned — GAP** | minor-ai HTML rail #5; not in build |
| **Data export / portability (GDPR Art.20)** | **Planned — GAP** | only erasure (Art.17) is wired: `supabase/functions/delete-account/index.ts`; no structured Art.20 export RPC. *(A user-facing wiki/records markdown bundle exists as "your second brain travels" `export.ts`, but [COUNSEL TO CONFIRM] whether it qualifies as Art.20 portability of **all** personal data — it omits consent/persona/audit data.)* |
| **Jurisdiction signal (Art.8 age by country)** | **Planned — GAP** (hard KR=14) | `consent-age.ts:8-14` |
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
- **Capability-parity caveat** (load-bearing for the whole register): AI capability is **byte-identical for minors and adults** (§1.2 fact 1). `isMinor` touches the LLM pipeline in exactly one place — swapping the crisis hotline to the youth line (1388) (`src/lib/llm/persona/build.ts:252-254` forwards `minor` to `callGemini` solely for the "crisis output-swap"; hotline selection at `src/app/capture.tsx:657,783,912`; `src/lib/safety/classifier.ts:24-27,58-63`; `src/lib/llm/safety.ts:266-283`). Every minor protection is therefore a **data/egress rail, not a capability limit** — so risks rooted in *what the model says or how the child relates to it* are **age-invariant** and land on the minor cohort at full adult strength.

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

**Mitigations today.** RLS default-deny per tenant; snapshot builder is user-scoped; **journal records are excluded from prompts by contract** ("exportUserWiki default excludes journal records — the cycle-21 no-journal-in-prompts contract", `src/lib/ops/recommend.ts:6-10`), shrinking the blast radius of any assembly bug.

**Likelihood Rare / Severity Severe.** RLS is mature, but cross-tenant leakage of a *named minor's* mental-health text is among the highest-harm outcomes; severity floored at Severe regardless of low likelihood. **[COUNSEL TO CONFIRM]** breach-notification posture if it ever occurs (PIPA §34 / GDPR Art.33-34, minor data).
**Residual / debt:** no automated cross-tenant assertion test on the prompt-assembly path is documented; recommend adding to DPIA action list.

#### 5a.3 5A-R2 — Sensitive disclosure egress before consent

**What / where.** Journaling content is processed by an **overseas LLM sub-processor** (Gemini gateway, `src/lib/llm/gemini.ts`) and stored in Supabase. PIPA §23 sensitive-data consent + §17 overseas-transfer notice + LLM-processing acknowledgement are modelled as discrete acks in the immutable consent ledger (`db/migrations/0031_consent_records.sql`: `sensitive_data_ack`, `overseas_transfer_ack`, `llm_processing_ack`; append-only, no UPDATE/DELETE policy). **The gap is wiring**: the header states "**NOT YET WIRED at sign-up: the consent NOTICE + ack checkboxes are a UI surface (delegated to the design pass)**" (`0031:13-16`). So today the ledger schema exists but the collecting UI may be incomplete — meaning egress could precede a *recorded* granular ack. Egress defaults are otherwise OFF: every outward/profiling pref defaults `false` (`src/lib/privacy/prefs.ts:27-31`) and minors are server-clamped (`db/migrations/0032`, `0033_minor_privacy_enforcement.sql`).

**Tension to resolve.** The *core product function itself* (AI reflection on journal text) is an egress of special-category data to a US processor. "No pre-consent sensitive egress" (hard rail #2) therefore depends entirely on the sign-up consent surface being live and blocking before first AI call. **[COUNSEL TO CONFIRM]**: (a) whether a 14-year-old's self-consent is a valid Art.8/Art.9(2)(a) basis for special-category overseas transfer, or whether guardian involvement is required despite KR self-consent at 14; (b) adequacy basis for the US transfer of minor mental-health data.
**Likelihood Possible / Severity Severe.** Implemented today: defaults-OFF + clamp + ledger schema. Planned (DPIA-gated): the blocking consent UI + `recordConsent()` wiring.

#### 5a.4 5A-R3 — Over-reliance / automation bias

**What / where.** The model gives a 14-year-old the **same** depth, fluency, and authority it gives a 40-year-old (capability parity, 5a.0). There is **no friction, no provenance strip, no "verify this" nudge, and no AI-uncertainty signal implemented today** on the general AI surfaces — the literacy scaffolding (learner-licence L0–L3, "show-your-work" provenance, "내 생각 먼저" pre-commit friction) is **designed but unbuilt** (report §2–3; Lanes 1, 2, 4). Buçinca/Gajos (CSCW 2021) is cited in-report as evidence that absence of pre-commitment friction *increases* overreliance.

**Mitigations today.** Effectively none specific to over-reliance; the recommendation prompt self-labels "not a medical or clinical service" (`src/lib/ops/recommend.ts` SYSTEM_PROMPT) but that is copy, not a behavioural brake.
**Likelihood Likely / Severity High.** A reflective journaling minor is the exact profile prone to treating AI output as authoritative self-knowledge. **[COUNSEL TO CONFIRM]** whether absence of literacy scaffolding for minors is itself a best-interests/ICO Std.1 deficiency. Planned (DPIA-gated, D-18 ratified): default-on L0 scaffolding with ephemeral (non-persistent) fade signals.

#### 5a.5 5A-R4 — Parasocial / companion dependency

**What / where.** The affordances debated under D-19 are **real and age-invariant in the running code**:
- **Mascot presence**: a home-screen companion that "dozes off" when idle and wakes on interaction (`src/lib/companion/fab-state.ts:15,25,51`; sprite roster `src/lib/assets/soulcore-v3.ts:21-25`) — a social-presence cue.
- **First-person voice**: personas open in the first person — *"I'm here. What's on your mind? I can pull from everything you've kept."* (`src/lib/chat/personas.ts:35-39`), and the persona cards speak in first-person-plural "우리" (`src/lib/persona/center.ts:4,23`).
- **Long-term memory**: `long_term_memory` is the **one** outward/profiling key a minor is *permitted to switch on* (`MINOR_PROMOTABLE_KEYS`, `src/lib/privacy/prefs.ts:60`) — deepening continuity/attachment.

Together (named character + first-person address + persistent memory + idle/wake presence) these are textbook companion affordances, on a mental-health surface, for minors. APA's 2025 health advisory on parasocial AI dependency is cited in-report.

**Mitigations.** D-19 verdict adopted "non-companion via **design-enforced invariants**" — anti-anthropomorphism promoted from guideline to **CI gate**, plus a dependency-safety audit. **These are planned, not yet built** (DECISIONS D-19 "설계 후속(즉시 가능)"). Lane 6 dependency self-mirror is explicitly **"코칭, not a min/day cap"** — by design it does not throttle a heavily-dependent child.
**Likelihood Possible / Severity Severe.** **[COUNSEL TO CONFIRM]** exposure under CA SB243 companion-bot definition, FTC 6(b), CSM/Stanford "<18 companion" framing, and 韓 AI기본법 §13 — and specifically the **preserved minority view (D-19)**: a low-literacy 15-year-old who falsifies DOB obtains adult routing *and* these affordances with only soft coaching; counsel should rule whether a youngest-cohort interim gate is required.

#### 5a.6 5A-R5 — AI giving clinical-sounding advice

**What / where.** No clinical-content classifier sits on model *output*. The only guard is the **non-clinical vocabulary lexicon** (K10; `src/lib/safety/lexicon.ts`, referenced `src/lib/chat/personas.ts:13`) steering register away from diagnostic/deficit language, plus prompt instructions ("never promise outcomes", "not a medical or clinical service", `recommend.ts` SYSTEM_PROMPT). Because capability is age-invariant, a minor can elicit advice on mood, self-worth, relationships, or somatic symptoms that *reads* as clinical guidance, with no minor-specific dampening.

**Likelihood Possible / Severity Severe.** Mental-health-adjacent advice to a child carries acute harm potential. **[COUNSEL TO CONFIRM]**: (a) whether the product risks construction as an unregulated health/medical device or counselling service in any target market; (b) whether the non-clinical lexicon guard is a *sufficient* safeguard or merely cosmetic for the minor cohort. Note Raine v. OpenAI (2025) is cited in-report as the salient precedent.

#### 5a.7 5A-R6 — Weak DOB age assurance (under-14 ingress)

**What / where.** Registration age is **self-reported birth_date with no verification**. The server age-gate trigger `enforce_user_age_tier()` **rejects** computed age < 14 and derives `minor_tier` server-side (`db/migrations/0030_server_age_gate.sql`; hardened search_path + minor-privacy seed in `0033_minor_privacy_enforcement.sql:23-62`; `minor_tier` made server-only / unforgeable in `0038_minor_tier_guard_and_audit_lockdown.sql` A1). **But the trigger only sees the DOB the child types** — an under-14 entering a false DOB passes the floor and is mis-tiered as `minor_self` or `adult`. This is the weakest age-assurance class under ICO Children's Code Std.3 (self-declaration).

**Compounding issue — hardcoded jurisdiction.** The self-consent floor is hardcoded KR=14 (`src/lib/auth/consent-age.ts:22`, `DEFAULT:16`); the comment is explicit that "the app does not yet collect a reliable jurisdiction signal (locale en/ko is not a country)… callers should pass 'KR'" and that **`LEXICON_LAST_LEGAL_REVIEW` is still null** (`consent-age.ts:8-14`). So a non-KR minor may be governed by the wrong consent age.

**Likelihood Likely / Severity Severe.** Under-13 ingress collapses the entire COPPA/GDPR Art.8/PIPA §22-2 lawful-basis structure (no guardian-consent flow exists — `0030` notes the guardian path "is a later PR"). **[COUNSEL TO CONFIRM]**: required age-assurance tier for a mental-health app processing special-category minor data (likely above self-declaration); and the minimum acceptable jurisdiction-detection signal before relying on any non-KR consent age.

#### 5a.8 5A-R7 — Crisis mishandling

**What / where.** Crisis handling is the **strongest** rail and is deterministic: a CRISIS_TERMS lexicon hit short-circuits the model and returns a **fixed, human-written template** — never LLM-generated text (`src/lib/llm/safety.ts:261-300` `fixedCrisisResponse`, versioned `red-ko-minor-v1` for 14-17). A **server-authoritative backstop** re-checks at the proxy (`src/lib/llm/gemini.ts:230-329` `inspectProxyCrisisRejection` / `proxyCrisisSafetyResult`) so a phrase that slips the client lexicon is still caught. Every crisis routing is written to two ledgers — `ai_audit_log` + restricted `crisis_events` (`gemini.ts:90-96,309-329`; `audit-write-outbox.ts:139`). Minors route to 1388 (youth line) + 109. A race guard ensures `isMinor` is resolved **before** any crisis-capable persona build, so a minor never gets adult routing mid-resolve (`src/app/persona.tsx:50-53`).

**Residual.** Detection is still **lexicon/keyword + model-classifier gated** — an obfuscated, metaphorical, or non-Korean/English expression of self-harm intent can evade both layers (false-negative). The handoff is to a phone line, not an in-app warm transfer; efficacy depends on the child calling.
**Likelihood Rare / Severity Severe.** Life-safety; severity floored at Severe. **[COUNSEL TO CONFIRM]** duty-of-care / mandatory-reporting obligations for a minor self-harm signal, and whether passive hotline display discharges them. Planned (D-19 safety-valve): lower the crisis-handoff threshold when cadence-spike + distress co-occur.

#### 5a.9 5A-R8 — Profiling via recommendations

**What / where.** `/ops` recommendations turn the child's own wiki/source material into routine suggestions (egress = 0; output stays in-account). **This was a live defect**: per D-20's pre-decision code finding, `runRecommend` previously **ignored the privacy pref entirely**, so recommendations executed **ungated for everyone including minors**, and the `0038` clamp was *nominal* (no code read the gate). **Fixed now**: `recommendationsAllowed()` gates at the call site — a minor runs **only** if `recommendations === true`, which is server-locked OFF and **non-promotable** for minors, so a minor's wiki snapshot can no longer reach the LLM ungated (`src/lib/ops/recommend.ts` `recommendationsAllowed` + `src/app/ops.tsx:104-129`; clamp `0032/0033`). Default-OFF for all (`prefs.ts:27-31`).

**Why still a risk.** Even with egress=0, deriving "what this user should do" from their mental-health notes is **profiling under GDPR Art.4(4)** — the layer-error called out in D-20 ("egress0 is true, but 'not profiling' does not follow"). The D-20 verdict (alt′ "glass-box OFF + understanding-gated activation") is **planned, not built**; only Step 0 (the gate wiring) shipped.
**Likelihood Possible (was Likely pre-gate) / Severity High.** **[COUNSEL TO CONFIRM]**: Art.22 solely-automated-decision applicability; Children's Code Std.12 (profiling off by default for children); and whether a 14-year-old's "understanding-gated" activation can be a valid Art.8 basis. **Minority view preserved (D-20):** for pure UK/EU launch, hold recommendations hard-OFF for minors until DPIA completion + counsel sign-off.

#### 5a.10 Cross-cutting debt feeding multiple risks

- **K11 AI-vs-human disclosure is a confirmed gap (feeds 5A-R3, 5A-R4, 5A-R5).** A code search for any persistent AI-disclosure / "I am an AI" / "not your therapist" / Art.50 surface returns **nothing** in `src/` (non-test). Worse, the only first-person framing present is the *opposite* signal — the persona greets as a person ("I'm here…", `personas.ts:35-39`). Lane 5 (boundary onboarding + EU AI Act Art.50 notice) is designed but unbuilt. **[COUNSEL TO CONFIRM]** EU AI Act Art.50 + 韓 AI기본법 §13 disclosure obligations and minimum surface.
- **No data export/portability path (GDPR Art.20).** Delete exists; export does not (report flag ③). Affects the minor's data-subject rights directly.
- **DOB-tier porosity (5A-R6) silently widens 5A-R4/R5/R8**, since a falsified-age minor inherits adult routing and affordances.

**Overall residual-risk posture for counsel:** the **data rails** (RLS, defaults-OFF, server clamp, immutable consent ledger, deterministic crisis handoff) are largely implemented and strong. The **highest unmitigated residual risks** are behavioural and age-invariant — 5A-R3 over-reliance, 5A-R4 companion dependency, 5A-R5 clinical-tone advice — plus the **age-assurance floor (5A-R6)** and the **un-wired consent surface (5A-R2)**, all of which are gated on this DPIA + the §11-5 legal sign-off before the enablement build proceeds.

---

### 5B — Measures to Address the Risks (Mitigations Mapped to Risks)

> **Scope of this sub-section.** Maps each control-risk to the technical/organisational controls currently in the codebase, cites the implementing code, and states residual risk. **"Implemented today"** = present on `main`. **"Planned (DPIA-gated)"** = designed/decided but not built, blocked on this DPIA + §11-5 counsel sign-off. This sub-section uses its own numbering **5B-R1 … 5B-R10** (see §5.0 disambiguation). The minor protections are **data/egress rails, not AI-capability limits** (§1.2 fact 1); "AI off for minors" does **not** exist in code and is not a control we can claim. **[COUNSEL TO CONFIRM]** whether identical AI capability for 14–17s is defensible given mental-health context.

#### 5b.1 Control inventory (implemented today)

| Ctrl | Control (rail) | Implementing code (file:line) | Status |
|---|---|---|---|
| **C-AGE** | Server age gate, <14 hard-reject, server-derived `minor_tier` | `db/migrations/0030_server_age_gate.sql:18-67`; search_path-hardened `0033:22-61`; client UX fail `src/app/(auth)/sign-up.tsx:81`, `complete-profile.tsx:52`; `MIN_SELF_CONSENT_AGE = digitalConsentAge("KR")` `src/lib/supabase/auth.ts:22` | Implemented |
| **C-CRISIS** | Crisis→deterministic human-written hotline handoff (minor→1388) | `crisisHotlines()` `classifier.ts:58-67`; `fixedCrisisResponse()` `safety.ts:266-298`; gates `gemini.ts:347-357` (input), `:489-539` & `:785-824` (output swap), `callAdvisor` `:635-669` | Implemented |
| **C-EGRESS** | Privacy-by-design defaults OFF + server clamp for minors | `defaultPrivacyPrefs()` `src/lib/privacy/prefs.ts:27-31`; seed `0032:41-53`; clamp trigger `clamp_minor_privacy_prefs()` `0033:66-88`, real-tier hardened `0038:77-95` | Implemented |
| **C-TIER** | No unauthorised `isMinor` downgrade | `block_self_tier_change()` `0038:36-74` (minor_tier server-only, change only via age gate) | Implemented |
| **C-CONSENT** | Immutable, append-only consent ledger | `consent_records` `0031:15-55` (INSERT/SELECT only, no UPDATE/DELETE); guardian ledger `0028:36-71` | Implemented (schema); **sign-up wiring pending** `0031:11-13` |
| **C-SENS** | Sensitive-data + LLM + overseas-transfer acknowledgement | `consent_records.sensitive_data_ack / llm_processing_ack / overseas_transfer_ack` `0031:26-28` | Implemented (schema); collection UI pending |
| **C-LEX** | Non-clinical lexicon guard (CI-enforced) | `containsForbiddenLexicon/containsAnalysisForbidden` `classifier.ts:108-125`; CI `scripts/check-forbidden-lexicon.ts` in `npm run verify` (`package.json:16,21`) | Implemented (universal floor); jurisdiction lists **not CI-wired** `lexicon.ts:173` |
| **C-AUDIT** | AI audit log (hashes only) + restricted crisis ledger | `ai_audit_log` `0004` (prompt/output **hashes**, never raw text); forge-proof RPC `log_ai_audit` `0038:103-136`; `crisis_events` `0012` (no RLS policies → service-role only, categorical only) | Implemented |
| **C-DEL** | Terminal account erasure (Art.17/PIPA) | `requestAccountDeletion()` `src/lib/records/delete-bulk.ts:178-185`; UI `src/app/account.tsx:96-169` | Implemented |
| **C-REC** | D-20 recommendations gate (minor lock honoured at runtime) | `recommendationsAllowed()` `src/lib/ops/recommend.ts:129-135`; call site `src/app/ops.tsx:104-112`; regression test `recommend-gate.test.ts` | Implemented (**#369 just landed**) |
| **C-FP** | First-party / on-device competence signals; no journal in prompts | wiki-snapshot-only, no-journal contract `recommend.ts:6-8`; untrusted-data fence `recommend.ts:9-11,143-145`; minor `external_analytics` locked → 0 external egress (`prefs.ts`, `analytics-consent-queue.ts`) | Implemented |

#### 5b.2 Risk → mitigation mapping (with residual risk)

**5B-R1 — Catastrophic harm: self-harm / suicidal ideation reaches a generative model or goes unrouted**
*(Crosswalk: addresses 5A-R7.)* **Primary controls: C-CRISIS, C-AUDIT.** This is **Hard Rail #1 (crisis→human handoff)** and the strongest control in the system.
- **Defence in depth, three layers**: (1) synchronous lexicon backstop `classifyInput()` `classifier.ts:79-104` (KO Suicide CARE 2.0 + EN C-SSRS markers `safety.ts:54-66`); (2) semantic Gemini Flash union classifier `classifySafety()` `safety.ts:166-259` (conservative RED-wins merge `:120-144`, fail-closed on unknown zone `:128-131`); (3) server-authoritative proxy 422 gate caught by `inspectProxyCrisisRejection()` `gemini.ts:235-253`.
- **Input never reaches the LLM on RED**: `callGemini` short-circuits before any network call `gemini.ts:347-357`; `callAdvisor` same `:635-669`.
- **Output re-classification + verbatim template swap**: model output is re-scanned and, on RED, the generated text is discarded and replaced with the fixed human-written template `gemini.ts:507-539`, `callAdvisor :785-824`. Templates are **deterministic, human-authored, never LLM-generated** (`fixedCrisisResponse` `safety.ts:266-298`).
- **Minor-specific routing**: `red-ko-minor-v1` surfaces **1388 청소년전화** first, then 109 `classifier.ts:63`, `safety.ts:283`.
- **Free-tier / non-LLM saves covered**: `classifyRecordTextForCrisis()` runs the same audited routing for plain journal saves `gemini.ts:273-282`.
- **Auditable**: every interception writes `ai_audit_log` + categorical `crisis_events` `gemini.ts:311-340,520-533`.

**Residual risk.** (a) On the **keyless public web build and on live non-Vertex builds**, the Flash semantic layer is deliberately disabled to avoid uncapped egress (`getFlashClient` returns null `safety.ts:91`), degrading crisis detection to **lexicon-only** — novel phrasings without a lexicon term are a false-negative exposure. (b) Lexicon coverage is KO/EN only; other languages fall through. (c) Crisis routing is **information/handoff, not active intervention** — no human is actually contacted; the app steps back (`safety.ts:282,295`). **[COUNSEL TO CONFIRM]** whether passive hotline display satisfies duty-of-care / Raine v. OpenAI-class expectations for a minor mental-health product.

**5B-R2 — Unlawful processing of minors' sensitive data (mental-health journaling, Art.9 / PIPA §23) without valid consent**
*(Crosswalk: addresses 5A-R2.)* **Primary controls: C-CONSENT, C-SENS, C-EGRESS.** This is **Hard Rail #2 (no pre-consent sensitive egress)**.
- Append-only ledger records the document versions and the specific acks (`sensitive_data_ack`, `llm_processing_ack`, `overseas_transfer_ack/국외이전`) `0031:23-32`; immutability enforced by absence of UPDATE/DELETE policies `0031:38-55`.
- Privacy-by-design: every outward/profiling/external-processing key defaults OFF `prefs.ts:27-31`; minors are seeded OFF server-side at sign-up `0032:41-53`.

**Residual risk (material).** The consent **notice + ack checkboxes are not yet wired at sign-up** — the ledger exists but `recordConsent()` only writes "after the UI collects the acks" `0031:11-13`. **Until that UI ships, the app may be collecting Art.9/§23 data before recording valid consent.** This is a launch-blocking gap. **[COUNSEL TO CONFIRM]** the lawful basis and the minimum ack set (esp. overseas transfer to Google/Gemini + Supabase) for 14–17 self-consent in KR, and whether EU/UK require parental involvement at 16/13–16. Secondary residual: `sensitive_data_ack` is a self-report checkbox, not verified comprehension.

**5B-R3 — Minors' data used for advertising or model training**
*(Crosswalk: addresses 5A-R8 (training/ads facet).)* **Primary controls: C-EGRESS, C-TIER.** This is **Hard Rail #3 (no training/ads on minor data)**.
- `ads`, `llm_training`, `sharing`, `recommendations`, `persona_export/share`, `external_analytics` are clamped to `false` for `minor_self` on **every write** to `privacy_prefs` `0033:66-88`; only `long_term_memory` (+ `ops_push`, device-local) are promotable `prefs.ts:59`.
- **Forgery-hardened**: the clamp keys off `COALESCE(OLD.minor_tier, NEW.minor_tier)` — the row's *real* tier, not a client-supplied value `0038:77-95` — and `minor_tier` itself is server-only `0038:60-64` (closes the one-statement `minor_tier='adult' + prefs all true` escape documented in `0038:1-19`).
- Ads suppressed twice (pref + ad policy) for defense in depth `prefs.ts:64-68`.

**Residual risk.** Low for the clamp itself (server-enforced + regression-tested). The honesty constraint D-12 means only *enforced* keys are shown (`VISIBLE_PRIVACY_KEYS` `prefs.ts:73`); `llm_training`/`sharing` are clamped but not yet user-visible toggles — acceptable as "off and unreachable," but **[COUNSEL TO CONFIRM]** transparency obligations require disclosing these processing categories even when forced off.

**5B-R4 — Account take-over of protections / minor self-downgrade to adult to unlock egress**
*(Crosswalk: additional control-risk; no direct §5A counterpart.)* **Primary control: C-TIER.** This is **Hard Rail #4 (no unauthorised isMinor downgrade)**.
- `block_self_tier_change()` rejects any self-change of `minor_tier` unless `birth_date` is also changing (the only path that re-derives tier via the age gate) `0038:60-64`; service_role exempt `0038:45-47`.
- Audit rows are unforgeable: blanket client INSERT on `ai_audit_log` dropped, replaced by SECURITY DEFINER RPC stamping `auth.uid()` server-side `0038:97-136`.

**Residual risk.** A minor who **lies about DOB at sign-up** is never a minor in the system (see 5B-R7) — this control only stops *post-hoc* downgrade, not initial misstatement.

**5B-R5 — Deception / failure to disclose AI vs. human (Art.50 EU AI Act, 韓 AI기본법 §13)**
*(Crosswalk: addresses 5A-R3/R4/R5 disclosure facet; same K11 gap as 5a.10.)* **Control: K11 — NOT IMPLEMENTED.** This is **Hard Rail #5** and is the one hard rail **currently a gap**: a repository-wide search for any AI-self-disclosure surface returns nothing (`grep` for `i am an ai` / `나는 ai` / `ai_disclosure` empty).
- **Planned (DPIA-gated):** Lane 5 boundary onboarding ("I am an AI, I can be wrong, decisions are yours") doubling as the Art.50 notice (design doc `minor-ai-literacy-enablement-20260614.html` §3 Lane 5).

**Residual risk (high, unmitigated today).** No anti-anthropomorphism disclosure ships. For a minor mental-health product this is both an Art.50/§13 exposure and a dependency-risk vector. **[COUNSEL TO CONFIRM]** the exact disclosure wording/placement and timing obligations.

**5B-R6 — Over-reliance / parasocial dependency; anthropomorphic "companion" framing (CSM/Stanford <18 companion concern)**
*(Crosswalk: addresses 5A-R3, 5A-R4, and 5A-R8 (profiling-gate facet).)* **Controls: D-18, D-19, D-20 adopted defaults — mostly PLANNED.**
- **D-20 (implemented today):** recommendations are now **runtime-gated** — `recommendationsAllowed()` returns `false` for a minor unless `recommendations === true`, which the server clamp makes impossible `recommend.ts:129-135`, wired at `ops.tsx:109`. This closed a **real bug** (per D-20 verdict, `DECISIONS.md` line 106): `runRecommend` previously ignored the pref, so minors' wiki snapshots reached the LLM ungated while the `0038` clamp was merely nominal. Regression test `recommend-gate.test.ts`.
- **D-19 (planned, DPIA-gated):** "scaffolded reflection ≠ companion bot" is to be proven not by self-label but by an **anti-anthropomorphism CI gate** (mascot / first-person / `long_term_memory` anthropomorphism audit). **This CI gate is not yet built** (grep for `anthropomorph|companion` across code returns nothing) — D-19 non-companion positioning is **design intent, not yet CI-enforced**.
- **D-18 (planned, DPIA-gated):** learner-licence scaffolding default-on with **ephemeral/session-local fade**; persistent cross-session competence scoring is held **behind an EU AI Act Art.5 counsel gate** and is not built. Competence signals are first-party/on-device with minors' `external_analytics` locked → zero external egress (C-FP).

**Residual risk.** The anti-anthropomorphism invariants and dependency-safety instrumentation that D-19 relies on are **not yet present**, so the "non-companion" conclusion is currently aspirational. Lane 6 over-reliance handling is explicitly *coaching, not a usage cap* — youngest/lowest-literacy users get only a soft nudge. **[COUNSEL TO CONFIRM]** whether CA SB243 / FTC 6(b) / CSM operative definitions classify 2nd-B as a "companion," which would require the minority-view interim gate for the youngest cohort (D-19 preserved dissent).

**5B-R7 — Weak age assurance (DOB self-report)**
*(Crosswalk: addresses 5A-R6.)* **Control: C-AGE (partial).** The server gate is genuinely server-side and forge-resistant for *derivation* (`0030:18-49`, `users_active_has_tier` constraint `:62-67`), but its **input is an unverified self-reported date of birth**.

**Residual risk (inherent).** DOB self-report is the weakest age-assurance tier (ICO Children's Code Std 3). A child can enter a false adult DOB and receive zero minor rails. No estimation/verification layer exists. **[COUNSEL TO CONFIRM]** whether self-declaration is acceptable for this risk class or whether age-estimation is required for EU/UK.

**5B-R8 — Data subject rights: portability (GDPR Art.20) and erasure (Art.17)**
*(Crosswalk: see Section 6 for full treatment.)* **Control: C-DEL (erasure only).** Terminal erasure is implemented end-to-end `delete-bulk.ts:178-185`, `account.tsx:96-169`, cascading across all user-owned tables + auth row.
**Export/portability: NOT IMPLEMENTED** — only a UI label "Privacy + portability" exists (`src/app/manual.tsx:97`); no machine-readable export path.

**Residual risk.** Art.20 portability is absent. Erasure note: `crisis_events.user_id_hash` is a 32-bit djb2 hash, explicitly **obfuscation not anonymisation, re-identifiable** `0012:12` — it is decoupled from `users.id` (no FK) so it survives cascade by design; **[COUNSEL TO CONFIRM]** whether retaining re-identifiable crisis rows post-erasure is lawful (likely defensible as safety/legal-obligation retention, but must be documented).

**5B-R9 — Cross-border transfer to processors (Gemini / Google, Supabase)**
*(Crosswalk: additional control-risk; supports 5A-R2.)* **Controls: C-SENS (overseas_transfer_ack `0031:27`), C-AUDIT (vertex_backend evidence `0004:13`), spend/egress capping.** Live LLM calls route through the spend-capped `gemini-proxy` edge function or Vertex; the uncapped direct API-key path is refused on live builds (`assertDirectEgressAllowed` `gemini.ts:71-79`). Audit log records `vertex_backend` per call.

**Residual risk.** Transfer mechanism (SCCs / adequacy) is a legal/contractual matter outside code. **[COUNSEL TO CONFIRM]** the lawful transfer basis for minors' Art.9 data to Google/Supabase and whether the overseas-transfer ack is sufficient under PIPA §28-8 / GDPR Ch.V.

**5B-R10 — Jurisdiction assumptions hardcoded to Korea**
*(Crosswalk: compounds 5A-R6.)* **Control: partial.** `MIN_SELF_CONSENT_AGE = digitalConsentAge("KR")` = 14 `auth.ts:22`; `MINOR_AGE_CEILING = 18` hardcoded `AuthContext.tsx:15`. The analysis-lexicon now carries `LEXICON_LAST_LEGAL_REVIEW = "2026-06-10"` `lexicon.ts:331` (note: this **updates** the prior analysis which recorded `null`), but the **jurisdiction-specific** forbidden lists are **not CI-wired** `lexicon.ts:173` and the legal-review guard is non-blocking (`scripts/check-legal-review.ts`, warns only).

**Residual risk.** Non-KR digital-consent ages (e.g. EU 13–16, varying by member state) are not modelled; a single KR=14 floor is applied globally. Per D-20 preserved minority view, **UK/EU minor `recommendations` should fall back to forced-OFF until this DPIA + counsel approve**. **[COUNSEL TO CONFIRM]** per-jurisdiction consent age and lexicon mapping before any non-KR launch.

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
| Portability Art.20 (5B-R8) | **Open gap** (erasure done) | Pre-EU/UK launch |
| Cross-border transfer (5B-R9) | Code-side capped/audited; **legal basis open** | Counsel |
| Jurisdiction KR-hardcode (5B-R10) | KR-only safe; **non-KR unvalidated** | Pre-non-KR launch |

**Three controls are launch-blocking gaps, not residual-risk-acceptable**: 5B-R2 (consent UI not wired), 5B-R5 (K11 disclosure absent), and the **D-19 anti-anthropomorphism CI gate** that the entire "non-companion" defence rests on. The D-18 learner-scaffold, D-19 invariants, D-20 understanding-gated *activation* UX (beyond the gate already landed), portability, and age-estimation are all **planned and explicitly gated on completion of this DPIA + §11-5 counsel sign-off** — none should be built ahead of counsel approval per the adopted debate verdicts.

---

## Section 6 — Data Subject Rights, Retention & Remediation Backlog

### 6.1 Data subject rights

#### 6.1.1 Right of access (GDPR Art.15 / PIPA §35)
- **Implemented today (partial):** Each subject can read their own primary content through RLS-scoped client queries (e.g. `consent_records_select_own ... USING (user_id = auth.uid())`, `0031_consent_records.sql:47-49`; per-user RLS is the pattern across user-owned tables). Journal/notes, wiki pages, sources, personas, privacy prefs are all visible in-app to their owner.
- **Gap — no consolidated subject-access surface:** there is no single "download everything we hold on you" view. Two stores are deliberately **inaccessible to the subject**:
  - `crisis_events` is **RLS deny-all** to `authenticated`/`anon` — "Intentionally NO policies for authenticated or anon. Service role bypasses RLS." (`0012_crisis_events.sql:30-32`). The subject cannot see their own crisis-routing rows.
  - `ai_audit_log` writes go through a `SECURITY DEFINER` RPC and the prior owner-INSERT policy was dropped (`0038_...audit_lockdown.sql:97-101`); the reviewed migrations establish **no subject SELECT policy**, and the rows hold only hashes (see 6.2).
- **[COUNSEL TO CONFIRM]** whether (a) hashed audit rows and (b) de-identified categorical crisis rows fall within the Art.15/§35 access scope at all, and if so whether a mediated (operator-fulfilled) access route is required given they are intentionally walled off from the client.

#### 6.1.2 Right to erasure / deletion (GDPR Art.17 / PIPA §36)
- **Implemented today:** terminal self-service erasure via the `delete-account` Edge Function (`supabase/functions/delete-account/index.ts`).
  - **IDOR-safe:** the erased account is "ALWAYS the caller's own, derived from the gateway-verified JWT ... The body is ignored" (`delete-account/index.ts:19-21`, `84-85`).
  - **Cascade scope:** deletes `public.users`, which `ON DELETE CASCADE` erases records (journal), testimonials, personas, memorized_patterns, xp_events, self_contexts, chat_usage, clipper_templates, consent_records, wiki_pages/links, sources, guardian rows (`index.ts:4-16`; e.g. `records ... ON DELETE CASCADE`, `0003_records.sql:9`). It also deletes the `auth.users` row (`index.ts:110-116`) and paginates the PII-rich `raw-clippings` Storage bucket (`index.ts:118-141`).
- **Residual data that deliberately survives erasure (flag):**
  - `ai_audit_log` rows are **retained with `user_id` set to NULL** — "its `user_id` FK is `ON DELETE SET NULL` (0011), so its rows are RETAINED (user_id nulled) as ... audit evidence rather than cascade-erased" (`index.ts:8-10`; `0011_security_fixes.sql:20-27`). Content is hashes only (6.2).
  - `crisis_events` survives because it has **no `user_id` FK** — only a non-cryptographic djb2 `user_id_hash` (`0012_crisis_events.sql:12`), so the cascade never reaches it. The schema comment itself warns the hash is "32-bit, collision-prone, re-identifiable" (`0012:12`).
- **[COUNSEL TO CONFIRM]:** (1) whether nulled-`user_id` audit hashes and djb2-hashed crisis rows are sufficiently anonymised to lawfully survive an Art.17/§36 erasure request, or whether they remain "personal data" requiring deletion / a documented Art.17(3) exemption (legal obligation / public-interest safety); (2) whether the djb2 hash must be upgraded (see 6.3-#7) before it can be relied on as the basis for retention.

#### 6.1.3 Right to data portability (GDPR Art.20) — **PRIMARY GAP**
- **Implemented today (partial, not rights-grade):** a user-facing export exists — `wiki.tsx:359` calls `exportUserWiki(userId, { locale, bodyCharLimit: 4000, includeRecords: true })`, producing an Obsidian-flavoured **markdown** bundle of wiki pages + sources + journal records (`src/lib/wiki/export.ts`).
- **Why it does not yet satisfy Art.20:**
  - **Format:** Art.20 requires a "structured, commonly used and machine-readable format." The output is prose markdown built as an *LLM-context bundle / pre-delete backup* (`export.ts:1-3, 21-22`), not a structured export. **[COUNSEL TO CONFIRM]** whether markdown qualifies.
  - **Coverage:** it omits large categories of the subject's personal data — `consent_records`, `privacy_prefs`, `personas`, `memorized_patterns`, `xp_events`, `esm_responses`, `chat_usage`, `self_contexts`. A complete, machine-readable, all-tables export path is **absent**.
- Consistent with the prior analysis flag ("export 경로 부재 (delete만), GDPR Art.20 갭", minor-ai-literacy HTML §honest-flag ③).

#### 6.1.4 Right to rectification (GDPR Art.16 / PIPA §36)
- **Implemented today (partial):** subjects can edit `records` bodies, profile fields, and `privacy_prefs` toggles in-app. A `birth_date` correction re-fires the age gate, which re-derives `minor_tier` and re-clamps minor privacy (`0030_server_age_gate.sql:46-49`; `0033_minor_privacy_enforcement.sql:40-57`) — so a mistaken-age correction self-heals the protection state.
- **Gap:** no rectification surface for derived/immutable data (audit hashes, append-only consent ledger) — by design, but **[COUNSEL TO CONFIRM]** this is acceptable for derived records.

#### 6.1.5 Right to object / restrict + withdraw consent (GDPR Art.21/18, Art.7(3) / PIPA §37)
- **Implemented today:** the `privacy_prefs` contract is the objection surface for profiling/ads/analytics/sharing (`src/lib/privacy/prefs.ts`). Privacy-by-design default = every key OFF (`prefs.ts:27-31`). Recommendations objection is now **enforced** post D-20: `recommendationsAllowed(isMinor, prefs?.recommendations)` gates the screen (`src/lib/ops/recommend.ts:129-135`; called at `src/app/ops.tsx:109`).
- **Constraints to note for counsel:**
  - Only **three** keys are actually rendered as toggles — `VISIBLE_PRIVACY_KEYS = ["external_analytics", "ads", "ops_push"]` (`prefs.ts:73`) — deliberately, to avoid "false privacy promise" toggles that control nothing (D-12, `prefs.ts:61-72`). The remaining keys are server-enforced but not user-visible objection controls yet.
  - **Minors:** locked to high privacy; only `long_term_memory` + `ops_push` are promotable (`MINOR_PROMOTABLE_KEYS`, `prefs.ts:59`), enforced server-side by `clamp_minor_privacy_prefs` (`0033:66-81`) and the tier-forge fix (`0038:76-95`). This is a **lawful-objection ceiling for minors**, not a gap — but **[COUNSEL TO CONFIRM]** that locking a minor's outward-sharing objections OFF-by-default (rather than offering the choice) is the intended Children's-Code posture.
  - **Withdraw-consent flow not wired:** the immutable consent ledger exists but "NOT YET WIRED at sign-up ... `recordConsent()` writes here only after the UI collects the acks" (`0031_consent_records.sql:11-13`). No standing "withdraw / re-consent" UI is wired. **Planned (gated).**

### 6.2 Retention

> No automated TTL / purge / cron was found anywhere in `db/migrations/`, `supabase/`, or `src/lib/` (grep for retention|ttl|purge|expire|cron|pg_cron|auto-delete returned no data-lifecycle job). **Default retention = indefinite, terminated only by account deletion.** This is itself a storage-limitation finding (Art.5(1)(e) / PIPA §21).

| Store | What is kept | Retention today | Erased on account delete? | Notes |
|---|---|---|---|---|
| `records` (journal/note/audit) — **Art.9 / PIPA-sensitive** mental-health data | Full raw user text (`body text NOT NULL`, `0003_records.sql:13`) | **Indefinite**, no TTL | **Yes** — `ON DELETE CASCADE` (`0003:9`) | The most sensitive store. **[COUNSEL TO CONFIRM]** a defined retention period vs "until user deletes." |
| `ai_audit_log` | **Hashes only** — `prompt_hash`, `output_hash` (`0004_ai_audit_log.sql:10-11`), model, vertex_backend, zone, latency. **No raw text.** | **Indefinite** (audit/XPRIZE evidence) | **No** — `user_id` set NULL, row retained (`0011:20-27`) | Survives erasure de-identified. **[COUNSEL TO CONFIRM]** retention basis + that hash-only = non-personal post-nulling. |
| `crisis_events` | **Categorical only**, "never raw user text" (`crisis-events.ts:2-3`; `0012:4-8`): confidence, trigger categories, C-SSRS level, template version, locale, `resolved`, staff `notes` ("never user content"). Subject keyed by djb2 `user_id_hash`. | **Indefinite** | **No** — no FK, survives deletion (`0012:12`) | Retained safety record. **[COUNSEL TO CONFIRM]** lawful basis to retain post-erasure; hash strength (6.3-#7). |
| `consent_records` | What/when/which-versions consented; `ip_hash`/`ua_hash` (hashed, never raw — `0031:30-31`) | **Indefinite**, append-only immutable (no UPDATE/DELETE policy, `0031:8-9, 37-55`) | **Yes** — cascade | Accountability ledger. **[COUNSEL TO CONFIRM]** that erasing the consent proof on account deletion is acceptable (vs retaining as Art.17(3)(b) compliance evidence) — possible tension with the row-immutability design. |
| `raw-clippings` Storage | Raw clipped markdown — "most PII-rich content" (`delete-account/index.ts:118-121`) | Indefinite | **Yes** — paginated bucket wipe (`index.ts:126-141`) | |

### 6.3 Remediation backlog (identified gaps)

Priority: **P0** = blocks EU/UK exposure or a hard-rail; **P1** = blocks non-KR launch / material rights gap; **P2** = hardening. "Owner" = suggested, not assigned.

| # | Gap | Legal hook | Status today | Suggested owner | Priority |
|---|---|---|---|---|---|
| 1 | **K12 child DPIA** (this document) | GDPR Art.35 / PIPA PIA; ICO Children's Code | Drafting (this doc) | Simon + external counsel | **P0** |
| 2 | **K11 AI-vs-human disclosure surface** | EU AI Act Art.50; 韓 AI기본법 §13 | **Absent** — grep for AI-disclosure strings in `src/lib`+`src/components` returned **0**. Planned home = Lane 5 onboarding 1-screen | Codex (UI) + Claude (legal copy) + counsel | **P0/P1** |
| 3 | **Full portability export (Art.20)** | GDPR Art.20 / PIPA §35-2 | Partial: markdown wiki+sources+records only (`wiki.tsx:359`); structured all-tables JSON export absent | Eng (Codex) + counsel (scope of categories) | **P1** |
| 4 | **Jurisdiction signal — not hardcoded KR=14** | GDPR Art.8 (13-16 by member state); PIPA §22-2; COPPA | Matrix exists (`consent-age.ts:21-26`, KR14/US13/EU16/DEFAULT16) but **no live country signal**; "the live gate assumes KR" (`consent-age.ts:8-14`). Locale en/ko ≠ country | Eng + counsel (per-EU-member values) | **P1** (blocks non-KR launch) |
| 5 | **Stronger age assurance than DOB self-report** | ICO Children's Code Std 3; GDPR Art.8(2) "reasonable efforts"; FTC COPPA | DOB self-report only (`0030:22-34`). Weakest assurance tier; a 15-yo who lies → `isMinor=false` → minor data rails + youth-crisis routing all release together (per D-19 minority view) | Eng + counsel (proportionate AA method) | **P1/P2** |
| 6 | **`LEXICON_LAST_LEGAL_REVIEW` review cadence** | Accountability (Art.5(2)); review of consent copy + jurisdiction age values | Partial: constant set to `"2026-06-10"` for the safety lexicon (`src/lib/safety/lexicon.ts:331`) with a documented "warn when older than 365d" intent (`lexicon.ts:326`) but **no automated staleness warn**; and `consent-age.ts:13` + `consent.ts:18` comments still read "null" (stale). The genuinely-pending item is counsel's review of consent/policy/terms versions (placeholder `2026-06-02`) + overseas-transfer + per-EU age (`docs/HANDOFF.md:331,486`) | Eng (wire the warn + de-stale the comments) + counsel (perform & date the review) | **P2** |
| 7 | **Crisis-event subject identifier strength** | Art.17/Art.32; bears on whether retained crisis rows are "anonymised" | djb2 32-bit hash, schema-flagged "collision-prone, re-identifiable" (`0012:12`); "Upgrade to salted SHA-256 if it must resist re-identification" | Eng + counsel (does retention-post-erasure require true anonymisation?) | **P2** |
| 8 | **Consent capture not wired at sign-up / no withdraw-consent flow** | GDPR Art.7 (demonstrable consent + Art.7(3) withdrawal); PIPA §22 | Immutable ledger built but "NOT YET WIRED at sign-up" (`0031:11-13`); no standing withdraw/re-consent UI | Eng + counsel (consent copy sign-off, D-03 external dependency) | **P1** |
| 9 | **Storage-limitation / defined retention periods** | Art.5(1)(e) / PIPA §21 | No TTL on `records` (sensitive), `ai_audit_log`, `crisis_events` — all indefinite | Counsel (set periods) → Eng (implement) | **P2** |

#### Cross-references for counsel
- **D-20** ledger note flags that, until just before this draft, `recommendations` ran **ungated for everyone including minors** (clamp was "명목적"/nominal); the gate at `recommend.ts:129` + `ops.tsx:109` closed it. Counsel should confirm the closed gate is the relied-upon control and that the prior ungated window needs no breach/notification treatment. **[COUNSEL TO CONFIRM]**
- **D-20 minority view:** pure UK/EU minor launch should fall back to recommendations **OFF** until this DPIA + counsel approval (DECISIONS.md D-20 소수의견). The current gate allows adults through unconditionally and minors only on an (server-locked) explicit opt-in — i.e. minors are effectively OFF in the EU/UK posture, but this should be **[COUNSEL TO CONFIRM]**ed against the Std-12 "best interests" reading.
- All rights/retention behaviours above are **age-invariant except** crisis-hotline routing (`safety.ts:263-283`; `classifier.ts:60-63`, minor → 1388 youth line first). The minor-specific protections are **data rails** (egress clamp `0032/0033/0038`, age floor `0030`), not capability limits — consistent with §1.2.

---

## Section 7 — Open Questions for Counsel + Consultation Record

> **Status of this section.** A DRAFT register assembled by the engineering/orchestration layer to hand counsel a complete, pre-framed list of the legal determinations that gate the minor-enablement build. **Every numbered question is a legal determination reserved to counsel — all flagged `[COUNSEL TO CONFIRM]`.** Each pairs a precise yes/no or which-applies question with the concrete system fact it turns on (cited `file:line`) and the build work it blocks or unblocks. Engineering has made *no* legal conclusions; where the code or a debate adopted a default, it is recorded as an internal working assumption pending counsel sign-off.

### 7.1 How to read this register

Each question carries four fields:
- **Q** — the precise question for counsel (answerable yes/no or which-of-N).
- **Hinges on** — the system fact that makes the question live, cited to code/migration.
- **Gates** — what is blocked until answered (`implemented today` vs `planned, gated on this DPIA`).
- **Provenance** — the debate verdict (D-18/19/20) or report flag that surfaced it.

**Cross-cutting prerequisite (answer first):** Q-S1 (scope). Most questions below are *conditional* on whether EU/UK/CA/KR law applies to a given user. Today the product has **no reliable jurisdiction signal** — the live gate hardcodes KR and `LEXICON_LAST_LEGAL_REVIEW` is `null` (`src/lib/auth/consent-age.ts:8-14`). Counsel's scope answer determines which of the framework blocks (A–F) are even reached.

### 7.2 Consultation record — internal decisions pending counsel

| Ref | Internal working position (NOT a legal conclusion) | Adopted via | Counsel dependency |
|---|---|---|---|
| **D-18** | Minor cognitive-scaffolding **default-ON**, but with **ephemeral/session-local fade** — *no* persistent cross-session competence score is stored. The persistent-scoring variant was deliberately pushed behind counsel. | §35 debate `w1qg0xa22`, ratified by Simon 2026-06-14 | Q-A1, Q-A2 (Art.5) must clear before any persistent learner scoring |
| **D-19** | 2nd-B positioned as **scaffolded-reflection tool, not a companion bot**, to be proven by **CI-binding design invariants + this DPIA + dependency-safety audit**, not by self-labeling. | §35 debate `w1qg0xa22` | Q-D1, Q-D2 (SB243), Q-F1 (AI기본법 §13) |
| **D-20** | `recommendations` = **glass-box default OFF + understanding-gated activation**; minor lock retained. Runtime gate now wired (`src/lib/ops/recommend.ts:129-135`, called at `src/app/ops.tsx:109`). | §35 debate `w1qg0xa22`, bugfix GO 2026-06-14 | Q-E2, Q-G2, Q-S1 (UK/EU OFF fallback until DPIA done) |
| **K12** | This DPIA itself — flagged top-priority debt, **EU/UK exposure blocked until complete**. | report flag ① | The whole document |
| **Minority views preserved** | D-18 (8–13 simple-OFF), D-19 (companion-risk as live constraint), D-20 (forced-OFF for pure UK/EU). | DECISIONS.md | Counsel may revive any of these |

**Established system facts counsel should rely on (verified in code — see also §1.2):**
1. **AI capability is age-invariant.** `isMinor` (`<18`, `MINOR_AGE_CEILING` at `src/lib/auth/AuthContext.tsx:15,55`) touches the LLM pipeline at exactly one place: **crisis-hotline routing** to the youth line 1388 (`src/lib/safety/classifier.ts:55-67`; minor template `red-ko-minor-v1` at `src/lib/llm/safety.ts:266`; UI routing `src/app/capture.tsx:657,783,912`). Model, prompt, RAG, persona depth are byte-identical for a 14-year-old and a 40-year-old. The minor protections are **data rails, not capability limits.**
2. **Crisis handoff is deterministic + human-authored**, never LLM-generated (`fixedCrisisResponse`, `src/lib/llm/safety.ts:266`).
3. **Minor data rails:** high-privacy seed on signup (`db/migrations/0032`), server clamp keyed off the *real* unforgeable tier (`db/migrations/0038:77-95`), UI lock (`src/lib/privacy/prefs.ts:75-78`). Only `long_term_memory` and `ops_push` are minor-promotable (`src/lib/privacy/prefs.ts:59`).
4. **Sensitive data:** journaling = mental-health data; consent ledger captures `sensitive_data_ack`, `overseas_transfer_ack`, `llm_processing_ack` (`db/migrations/0031:26-28`) but the **notice/ack UI is "NOT YET WIRED"** (`db/migrations/0031:11-13`).

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

- **Q-A3 [COUNSEL TO CONFIRM]** — Which-applies: are the on-device, **first-party-only** competence signals (`evidence_open_rate`, `ai_override_rate` — no external egress for minors, `external_analytics` clamped OFF at `db/migrations/0032`, `0038:88`) **out of scope** of Art.5 because no profiling output is produced or acted on beyond UI thickness? Or does in-account adaptation alone suffice to engage Art.5?

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

- **Q-C2 [COUNSEL TO CONFIRM]** — Given a **first-person persona + named mascot + `long_term_memory`** (`src/lib/privacy/prefs.ts:17`), does Art.50 (and AI기본법 §13) require *anti-anthropomorphism* disclosure language specifically for minors, or is age-invariant disclosure adequate? (D-19 already promoted anti-anthropomorphism from guideline to a **CI gate** as a working measure.)

#### D. CA SB243 — Companion-chatbot definition

- **Q-D1 [COUNSEL TO CONFIRM]** — Does 2nd-B meet the **statutory definition of a "companion chatbot" under CA SB243**, given the presence of (a) `long_term_memory` (`src/lib/privacy/prefs.ts:17,59`), (b) a first-person persona (`src/lib/persona/build.ts`), and (c) a named mascot — *notwithstanding* the D-19 positioning as a scaffolded-reflection tool? Is the SB243 test **function-based** (these affordances trigger it regardless of self-label) or **purpose-based** (reflection-tool purpose excludes it)?
  - *Hinges on:* the affordances are real and **age-invariant**; D-19 minority view warns counsel may read SB243/CSM as "function-based, irrebuttable."
  - *Gates:* **implemented today** (affordances exist); determines whether a **minors-only interim gate** on those affordances is required.
  - *Provenance:* D-19 verdict + preserved minority view.

- **Q-D2 [COUNSEL TO CONFIRM]** — If SB243 *does* apply, do the design-enforced non-companion invariants (CI-binding anti-anthropomorphism + crisis-handoff threshold lowering on cadence-spike, D-19) satisfy SB243's safeguards for minors, or does SB243 mandate specific controls (e.g., break reminders, suicidal-ideation protocols, disclosure cadence) not yet implemented?
  - *Hinges on:* crisis handoff is implemented and deterministic (`src/lib/llm/safety.ts:266`); cadence-spike threshold-lowering is **planned**.

#### E. ICO Children's Code — Std 7 / 12 (high-privacy default) + Std 3 (age assurance)

- **Q-E1 [COUNSEL TO CONFIRM]** — Does **Standard 7 (high-privacy by default)** require that **in-account LLM personalization** (i.e., `long_term_memory`, `recommendations` — features with **zero external egress** but that profile the child) be **OFF by default for minors**, the same as outward-sharing features? I.e., does Std 7 reach *internal* profiling, or only *outward* data flows?
  - *Hinges on:* today `recommendations` is **OFF by default for everyone** and **non-promotable for minors** (`db/migrations/0032`, `0038:88`; gate `src/lib/ops/recommend.ts:129-135`); `long_term_memory` is OFF-default but **minor-promotable** (`src/lib/privacy/prefs.ts:59`). So a minor *can* turn on in-account memory.
  - *Gates:* **implemented today**; answer determines whether `long_term_memory` must be **removed from `MINOR_PROMOTABLE_KEYS`.**
  - *Provenance:* D-20; report K3/F3 (retention vs personalization split).

- **Q-E2 [COUNSEL TO CONFIRM]** — Does **Standard 12 (profiling off by default, with meaningful explanation)** apply to `recommendations`, given counsel's D-20 finding that **egress=0 does not mean it is not profiling under GDPR Art.4(4)**? If Std 12 applies, is the planned **understanding-gated, in-context activation + immutable consent-ledger record + "why this?" permanent transparency** (D-20 verdict) a *sufficient* Std 12 mechanism, or is parental involvement required?
  - *Gates:* **planned** (understanding-gated activation UX is the §11-5 build); the runtime OFF-gate is **implemented today**.
  - *Provenance:* D-20 verdict ("silent-A = Std12 weakest").

- **Q-E3 [COUNSEL TO CONFIRM] (Std 3 — age-assurance proportionality)** — Is **DOB self-report** a **proportionate** age-assurance measure under Standard 3 for a service processing **minors' mental-health data**, or does the sensitivity require a stronger method (e.g., third-party age estimation/verification)?
  - *Hinges on:* age is derived solely from a self-reported `birth_date` (`src/lib/auth/AuthContext.tsx:55`; server trigger `db/migrations/0030:18-49`), with a hard reject under 14 (`0030:31-34`) but **no verification**. This is the weakest age-assurance tier.
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
  - *Hinges on:* the live gate hardcodes KR=14 and the matrix already encodes `EU:16, DEFAULT:16` but is **not reached** without a jurisdiction signal (`src/lib/auth/consent-age.ts:8-14,21-26`).
  - *Gates:* **implemented today** for KR; **EU launch blocked** until the jurisdiction signal + correct floor are wired.
  - *Provenance:* D-20 follow-up ("14세 이해-활성화 유효성(GDPR Art.8)"); report flag ②.

- **Q-G2 [COUNSEL TO CONFIRM]** — Is a **14-year-old's "understanding-gated" in-app activation** of `recommendations` (the D-20 activation mechanism) a **valid Art.8 + Art.9 consent** to *profiling of sensitive (mental-health) data*, or does Art.9 special-category processing of a minor require an additional/parental basis regardless of the Art.8 digital-services consent?
  - *Hinges on:* `recommendations` profiles the wiki snapshot (`src/lib/ops/recommend.ts:137-157`); journaling is Art.9 data; activation is designed as a child-comprehensible in-context gate, not a parental flow.
  - *Gates:* **planned** (activation UX, §11-5 build).
  - *Provenance:* D-20.

- **Q-G3 [COUNSEL TO CONFIRM]** — Confirm the working assumption that **`recommendations` IS profiling under Art.4(4)** despite **zero external egress** (egress=0). The D-20 record treats "egress0 ≠ not-profiling" as a layer error; counsel to ratify so the Std 12 / Art.22 analysis proceeds on the correct premise.

- **Q-G4 [COUNSEL TO CONFIRM]** — Does the **wiki snapshot sent to the LLM** for recommendations/persona (`src/lib/wiki/export.ts`, journal records **excluded by default / opt-in only**) and the **overseas transfer** of that content to Gemini/Vertex constitute an Art.9 + Art.44 transfer requiring **explicit, separate minor consent**? The ledger captures `overseas_transfer_ack` and `llm_processing_ack` (`db/migrations/0031:26-27`) but the **collection UI is not yet wired** (`db/migrations/0031:11-13`).

#### H. GDPR Art.20 — Data portability / export

- **Q-H1 [COUNSEL TO CONFIRM]** — Does the existing **wiki markdown export** (`src/app/data.tsx:62-71` → `/wiki`; `src/lib/wiki/export.ts`) satisfy the **Art.20 data-portability** right, or is it insufficient because it is a **user-convenience markdown bundle** (pages + sources; records opt-in) that **omits other personal-data categories** held on the data subject — `consent_records`, `ai_audit_log` (`db/migrations/0004`), profile/`birth_date`, ESM responses, `privacy_prefs`? I.e., does Art.20 require a **structured, machine-readable export of *all* personal data**, not just the wiki?
  - *Hinges on:* deletion is implemented (Art.17 path, `src/lib/records/delete-bulk.ts:172-180`, `delete-account` Edge Function), but there is **no comprehensive structured portability export.**
  - *Gates:* **implemented today = partial**; full Art.20 export is **planned/absent**.
  - *Provenance:* report flag ③ ("export 경로 부재, GDPR Art.20 갭" — *nuance: a wiki export exists; a complete Art.20 export does not*).

#### I. Scope determination (answer first — gates A–H)

- **Q-S1 [COUNSEL TO CONFIRM]** — **Which legal regimes does the product hold itself out to today?** The build has **no country/region signal** (locale `en`/`ko` is not a jurisdiction; `LEXICON_LAST_LEGAL_REVIEW = null`, `src/lib/auth/consent-age.ts:8-14`). Counsel to determine: (a) is the **launch scope KR-only** (in which case EU/UK Std 7/12/Art.8/Art.20 questions are deferred), or (b) does targeting/availability bring **EU/UK/CA users into scope** now?
  - *Gates:* **everything.** Per D-20 minority view, until K12 (this DPIA) + counsel sign-off, UK/EU minors **fall back to `recommendations` OFF**. Per report flag ②, **non-KR values must not be relied on before counsel.**

- **Q-S2 [COUNSEL TO CONFIRM]** — Is a **jurisdiction signal** (and which method: IP geolocation, store-region, declared country) **legally required** as a precondition to per-region floors, and does collecting it for minors itself raise a data-minimization concern?

#### J. PIPA cross-cutting (KR)

- **Q-J1 [COUNSEL TO CONFIRM]** — Does **PIPA §22-2** require **verifiable legal-representative consent** for the **14–17 self-consent** band for *sensitive (§23) mental-health* processing — i.e., is the under-14 hard floor (`db/migrations/0030:31-34`) the correct line, or does §23 sensitivity pull the guardian-consent requirement up above 14 for this data category?
- **Q-J2 [COUNSEL TO CONFIRM]** — Is the **immutable consent ledger** schema (`db/migrations/0031`: general §15/17/22 + §23 sensitive ack + overseas-transfer ack) **sufficient for PIPA accountability**, conditional on the ack-collection UI being wired (`0031:11-13`)? Confirm the required ack set is complete (nothing missing for minors).

### 7.4 Counsel response template (to be completed)

For each Q above, counsel to return: **(1)** determination (yes/no/which-applies); **(2)** jurisdictions in which it holds; **(3)** whether it **blocks** or **conditions** the gated build; **(4)** required compensating control, if any; **(5)** residual-risk acceptance. Engineering will then convert blocking answers into hard rails and conditioning answers into the §11-5 build backlog.

**Build items currently held at the §11-5 legal gate pending the above:** persistent learner-stage scoring (Q-A1/A2/B1), default-ON minor cognitive forcing (Q-A2), `recommendations` understanding-gated activation UX (Q-E2/G2), AI-disclosure surface / K11 (Q-C1/C2/F1), age-assurance upgrade (Q-E3/E4), jurisdiction signal + EU floors (Q-S1/S2/G1), full Art.20 export (Q-H1), consent-ack UI wiring (Q-G4/J2). **Shipped without legal dependency (data-safety hardening only):** the D-20 `recommendations` runtime OFF-gate (`src/lib/ops/recommend.ts:129-135`).

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