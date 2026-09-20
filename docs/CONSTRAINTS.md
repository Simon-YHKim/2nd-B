# Hard Constraints

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
- **Adult (≥18)** and **self-consent minors** register directly. ⚠ **[RE-READ 2026-09-21]** the floor is **per country** (63-country table, statutory 13–20, clamped up to 14; **18** when the country cannot be placed) - it is *not* a flat 14–17 band any more. Under PIPA, legal-representative consent is mandated only *below 14* (Article 22-2); users at or above the applied floor self-consent under the general provisions (Articles 15/17/22) with age-appropriate notice.
- **Under-14** require **verifiable guardian consent** (PIPA Article 22-2; the US COPPA
  threshold is separately *under-13* — global rollout branches **per country** via the
  63-country table in `src/lib/auth/consent-age-table.ts`, applied by
  `src/lib/auth/consent-age.ts`): the account starts in
  `account_status = 'pending_guardian_consent'`, held until a guardian verifies via the
  `guardian_consents` ledger.

Enforcement (phased rollout):
- **DB — done (`db/migrations/0028`–`0030`):** `0028` replaces the legacy adult-only
  CHECK with `users_birth_date_sane` and adds `account_status`, `minor_tier`, and the
  `guardian_consents` table (per-user RLS); `0029` locks `guardian_consents`; **`0030`
  adds the authoritative `enforce_user_age_tier()` BEFORE INSERT trigger that rejects
  under-14 server-side — the real gate. `users_birth_date_sane` (0028) is only a sanity backstop.**
- **Client — done:** `auth.ts` gates at `MIN_SELF_CONSENT_AGE`, which is **resolved per
  country** (14 in KR, 16 in DE, 18 when the country is unknown — see the table below).
  Minors at or above that floor and adults register directly; anyone below it still
  throws `AgeGateError` pending the guardian-consent flow.
- **Safety — done (#134):** the minor flag threads from `AuthContext.isMinor`
  through the record/chat/interview/LLM chain. KO minors route to 1388 + 109,
  adults to the unified 109 line (1393 retired 2024-01), EN to 988.

**Jurisdiction — the client reads a 63-country table, the server does not
(measured 2026-09-08; table landed 2026-09-21, r53):**

~~the app does not yet collect a reliable country/jurisdiction signal (locale
`en`/`ko` is not a country). Until country detection lands, **all users are gated
on the KR rule (self-consent floor 14, PIPA Article 22-2)** via
`digitalConsentAge("KR")` … the per-jurisdiction values already exist in
`consent-age.ts` but are not wired to a live signal yet.~~

**Both halves of that were false.** The signal landed 2026-08-16 —
`resolveJurisdiction()` reads the device region (`src/lib/auth/device-region.ts`)
— and the client gate is not pinned to KR: `src/lib/supabase/auth.ts:76`
computes `MIN_SELF_CONSENT_AGE = digitalConsentAge(resolveJurisdiction())`, so
`signUp` / `signUpWithEmail` throw `AgeGateError` at the *resolved* floor
(`src/lib/supabase/auth.ts:296`, `src/lib/supabase/auth.ts:1617`). The three
`auth.ts` line numbers this paragraph used to carry (33, 176, 860) had all drifted.

⚠ **2026-09-21 (r53) — the four buckets are gone, and so is the 16.** This section
said the resolved floor was ~~KR 14 · US 13 · EU 16 · unknown 16~~ and that an
unrecognised or unreadable region stayed on KR 14. Simon closed both on 2026-09-20:
*"나라마다 나라에 맞게 적용해야지. 일관 14세는 안돼."* The client now reads a
**63-country table** generated from the r51 research (`src/lib/auth/consent-age-table.ts`,
which records the source file's sha256), whose values run **13 to 20**. Neither a
flat 14 nor the old four buckets could hold that spread: 12 countries sit at 13,
10 at 14, 6 at 15, 12 at 16, 22 at 18 and one (Thailand) at 20.

**The unknown-country fallback is 18, not 16.** With 16 there are 23 rows above it;
with 18 there is one (Thailand 20), named with its reason in `FALLBACK_SHORTFALL`.
20 would refuse most countries' 18-19 year old adults over a signal failure.

What is actually true is the opposite asymmetry, and it is the thing worth
knowing:

| layer | branches by country? | floor it enforces |
|---|---|---|
| client (`src/lib/supabase/auth.ts:296`, `src/lib/supabase/auth.ts:1617`) | **yes, per country** | the table value clamped up to the server floor: KR 14 · US 14 (statute 13) · FR 15 · DE 16 · TH 20 · **unknown 18** |
| server (`0086`, `0148`, `0149` — 5 call sites) | **no** | `< 14`, hard-coded |

**No migration reads a jurisdiction or country at all** — `jurisdiction` 0 files,
`country` 0 files (measured 2026-09-08; `birth_date` matches 18 files, so the
grep works). The one `region` hit is `0132`'s profile-suggestion comment
("occupation, region at province"), a user profile field, not a gate.
So the server floor is 14 everywhere, and this section itself calls
the server trigger "the real gate" — correctly, because the client check is
skippable by calling the RPC directly.

**Consequence:** a 14-15 year old in a 16-country, or anyone 14-17 whose country is
unknown, is refused by our own client table but accepted by the authoritative server
gate. Every floor above 14 is therefore advisory, not enforced. The reverse also
holds and is why the table stores the statutory value separately from the effective
one: the 12 rows at 13 (US, GB, SG and nine more) are inert today because the server
rejects under-14 regardless, and they come back the day that floor moves.

**The hole this leaves, stated plainly.** A fallback cannot fix an unreadable region:
that user could be from any country in the table. Today they get 18, which means
**a 14-17 year old on the web whose region the platform does not report cannot sign
up** — Korean users included. Nobody is actually blocked right now (the app has never
shipped to a store and web usage is effectively nil), but this must close before
launch, and it closes by *learning the country*, not by lowering the number: ask for
residence **only when the region is unreadable**, apply that country's row, and send
"not listed" to the fallback. `FloorSource` already separates the three cases
(`country-row` / `country-no-row` / `region-unreadable`) so that round can tell which
users to ask.

**Rows have an expiry.** 14 of the 63 carry `watch: true` — legislation is moving
(Portugal 13→16 passed a first-reading vote, Spain and Italy 14→16, Norway 13→15,
a UK delegated power to move 13-16, Chile's new law on 2026-12-01, and downward
bills in Ukraine, Colombia, Turkey, Israel and Nigeria). `CONSENT_AGE_TABLE_RECHECK_BY`
is 2026-12-01, the earliest dated change. Do **not** lower a row on a bill that has
not passed: a wrong low row admits someone who cannot legally consent, while a wrong
high row only turns away someone who could.

**It is getting more entrenched, not less.** Of the five hard-coded `< 14` sites,
**four are from the September consent stack** — `0148` (1) and `0149` (3: the
trigger at L163, and the profile RPC at L395 and L441) — and those were applied
to production on 2026-09-08. `0086` holds the fifth and oldest. So the newest
code on this path repeated the same jurisdiction-blind literal three more times
rather than reading the table the client already resolves. Anyone adding a sixth
should know they are widening this gap, not just following local style.

⚠ **Do not "fix" this by raising the server floor.** Root `CLAUDE.md` lists
**EU 최소 가입연령 상향** among the decisions Simon has explicitly left open
("확정 전까지 해당 게이트를 임의로 풀지 말 것"), and moving a registration floor
is a policy change with legal sign-off attached (`TODO(legal)` in
`consent-age.ts`), not a docs cleanup. This paragraph records the gap so nobody
has to rediscover it; closing it is Simon's call.

CI: `check:constraints` asserts the guardian-consent schema + client age logic;
`supabase-dry-run` asserts `users_birth_date_sane` + `guardian_consents`.

## C11 — 2-business-day response

README declares the SLA. `.github/workflows/issue-sla.yml` labels new
issues. Auto-responder (Gmail filter + support@ + Devpost mobile push)
is Sprint 1 OPS work.

## ~~C12~~ — retired 2026-09-06, now the AssetLicenseDisclosure check

Retired as a numbered constraint (Simon decision Q-260905-02): it came from the
contest rulebook and the contest ended 2026-08-15. The check itself survives
under the name `AssetLicenseDisclosure`, because the SIL OFL fonts we ship
require their copyright and Reserved Font Name notice to travel with them and
`docs/ASSETS.md` is the only record of it.

README contains a "Bundled assets and licenses" section; `docs/ASSETS.md` carries
the registry. The pack and image counts are deliberately not written here: the
check computes them from disk on every run and prints them in its PASS note, so
a number copied into prose is only ever a snapshot that rots silently. It did —
this line said "currently 9 packs" while the check reported 10 (2026-09-08).
Run `npm run check:constraints` for the live figure.

**Changed 2026-08-21 (REQ-260820-04): the reason, not the rule.** This was
written as "per XPRIZE rulebook §04", and the rulebook no longer applies. The
constraint is kept on its own merits: the app ships third-party art and fonts
under licences with attribution terms, the store listings restate those claims,
and a disclosure list that nobody maintains is worse than none. The check is
also not a formality - a grep for the README heading alone reported PASS on
2026-08-06 while 226 committed images went entirely unlisted, so
`check:constraints` now compares the registry against the packs on disk.

## Known platform limitations (2026-08-10)

These findings do not relax the remaining hard constraints. They remain tracked for a
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
