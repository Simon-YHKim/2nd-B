# T5 Peer-Review Pipeline — Scoping / Design Spec (F)

> **Status: DRAFT FOR RATIFICATION — not an approved build.** This is the scoping
> deliverable for handoff item **F** ("T5 peer-review 파이프라인 — informant = 타인 PII,
> large, 법무 게이트"). It exists so Simon + legal can decide the open questions in
> §7 BEFORE any schema or code lands. Nothing here is wired.
>
> **Axis**: 1 (알아가기 / self-understanding). **Blueprint**: extends the SOKA "Seen"
> lens with real observer data.

## 1. What T5 is

Today the **Seen** lens (`src/lib/persona/observable-self.ts`) is grounded in the
user's OWN Big Five: SOKA (Self–Other Knowledge Asymmetry, Vazire 2010) says
others read a person's *observable* traits (extraversion → conscientiousness →
agreeableness) more accurately than internal ones, so we surface "the part of you
most readable from outside." The code comment is explicit that this is **not** a
claim about what any specific other person thinks — *"that requires peer data,
which the Seen view collects separately."*

**T5 is that separate collection.** A user invites a few people who know them
("informants"); each gives a short, structured observer-rating; the app shows the
user the **aggregate** gap between how they see themselves and how they come
across. This is the classic informant-report design (e.g. BFI observer form) and
is the strongest evidence tier the Seen lens can reach.

## 2. Why it is gated (the hard part)

An informant's rating **is the informant's own personal data**, and the pairing
"informant X thinks Y about user Z" is doubly sensitive. This is NOT the user's
data to consent away. Under Korean **PIPA** (see `docs/research/batches/data-ethics-consent.md`):
- The informant is a **data subject**: they need their own separate, informed,
  opt-in consent (Art. 15/17/22) BEFORE any rating is stored — not the user's.
- Trait observations about a third party may touch **§23 sensitive** territory
  and **§17 provision-to-others** rules.
- Cross-border transfer notice applies if a rating ever reaches Gemini (§4 rule).
- Minors as informants → guardian-consent problem (C10) — likely **excluded** v1.

So T5 cannot reuse the user's consent flow. It needs an **informant-facing
consent surface** and its own ledger. This is the "법무 게이트" the handoff flags.

## 3. Design principles (non-negotiable)

1. **Informant consent is first-class.** No rating row exists without the
   informant's own recorded opt-in (mirror `consent_records` / `consent_changes`
   pattern; the informant may be pre-account — see §6 token flow).
2. **Aggregate-only to the user.** The user sees a *combined* Seen picture, never
   "what did Jane specifically say." Enforce a **minimum N (≥3 recommended)**
   before ANY aggregate renders — below threshold shows an empty/"pending" state.
   This protects informant candor AND blocks re-identification.
3. **Data minimization.** Store the structured rating (trait scores + optional
   short free-text), the minimum informant identity needed to dedupe/consent, and
   hashed request metadata only. No informant contact list is retained beyond the
   pending invite.
4. **Bilateral revocation.** The user can end an informant relationship; the
   informant can withdraw their rating at any time (→ writes a revoke row, mirrors
   D-3). Withdrawn ratings drop out of the aggregate immediately.
5. **Safety + boundary.** Informant free-text runs through `classifyInput()` (C9)
   before any LLM touches it; any synthesis call is C1/C3-logged. Never infer
   protected categories from informant text (research §Kosinski). This is
   self-understanding, not a reputation score — no ranking, no "who rated you
   lowest," no gamified pressure to collect more.
6. **No coercion / anti-abuse.** Rate-limit invites; no repeated nagging; an
   informant declining is silent to the user (no "Jane refused"). Not usable to
   pressure or surveil another person.

## 4. Proposed data model (sketch — for review, not final)

Two new append-only-ish tables, RLS-scoped, mirroring the 0031/0044/0062 idiom:

```
peer_invitations
  id, user_id (owner/subject), invite_token_hash, invited_label (nickname only),
  relation_kind (friend|family|coworker|partner|other), status
    (pending|accepted|declined|withdrawn|expired), created_at, responded_at,
  expires_at
  -- No raw email/phone stored long-term; the token is delivered out-of-band and
  -- only its hash is kept.

peer_observations
  id, invitation_id (FK), user_id (subject, denormalized for RLS),
  informant_consent_at (NOT NULL — no row without informant opt-in, cf. C5 pattern),
  ratings jsonb (structured trait scores; validated server-side),
  note text (optional, classifyInput-screened), ip_hash, ua_hash, created_at,
  withdrawn_at (nullable → revocation)
```

RLS: the **subject user** may read only the *aggregate* (via a SECURITY DEFINER
function that enforces min-N and never returns single rows); the informant may
read/withdraw only their own observation via their token session. No client path
returns a single attributed observation to the subject.

## 5. Consent + audit reuse

- Informant opt-in → its own consent record (extend the `consent_records`
  purposes vocabulary with an `informant_observation` purpose, or a dedicated
  `informant_consents` table — **decision in §7**).
- Withdrawal → a `consent_changes`-style revoke row (D-3 already ships that
  ledger pattern; T5 can reuse or parallel it).
- Retention: informant PII is a prime candidate for the E purge family
  (`0063`) — pending invites and withdrawn observations should age out; add a
  `purge_expired_peer_invitations()` when T5 lands.

## 6. Informant flow (no account required, v1 candidate)

1. User creates an invite → app produces a one-time link (token; only its hash
   stored). User shares it out-of-band (their own messenger).
2. Informant opens link → sees a plain-language notice (what this is, that it's
   the informant's data, aggregate-only, withdraw anytime, cross-border notice if
   applicable) → **explicit opt-in checkbox** → short rating form.
3. On submit: record informant consent + observation. Show the informant a
   "you can withdraw anytime via this link" confirmation.
4. User side: once N≥threshold accepted, the Seen lens unlocks the aggregate gap
   view. Below threshold: "still gathering perspectives."

## 7. Open decisions for Simon + legal (BLOCKING)

1. **Scope for v1**: Big-Five observer form only (cleanest, matches SOKA), or
   broader? Recommend: **observable traits only** (extraversion/conscientiousness/
   agreeableness) to match the existing Seen lens and minimize sensitivity.
2. **Informant account model**: tokenized no-account (this doc's assumption) vs
   require informant login. No-account is lower friction but needs careful token
   security + a no-account consent record.
3. **Consent storage**: extend `consent_records` purposes vs new
   `informant_consents` table. (Recommend a dedicated table — the informant is a
   different data subject than the account holder; do not co-mingle.)
4. **Minimum N** before display (recommend 3) and **max informants** per user.
5. **Minor handling**: exclude under-18 informants entirely in v1? (Recommend
   yes — avoids the guardian-consent chain, C10.)
6. **Free-text**: allow an optional note, or ratings-only for v1? (Ratings-only
   is the safest launch; notes add classifier + moderation surface.)
7. **Cross-border**: does any informant data reach Gemini (synthesis), or is the
   aggregate computed purely in-DB/client (no LLM)? Pure computation avoids the
   §17/cross-border escalation — **recommended for v1**.
8. **EU/GDPR**: PIPA ≠ GDPR; if EU informants are possible, needs separate
   analysis (out of scope here).

## 8. Phasing (proposed once §7 is settled)

- **F0** (this doc) — scope ratified.
- **F1** — schema + RLS + consent ledger (migration), off any UI. Structural
  tests + supabase-dry-run, mirroring the D-3/E landings.
- **F2** — informant token flow + consent surface + rating form.
- **F3** — subject-side aggregate Seen gap view (min-N gated), no LLM.
- **F4** (optional, separate legal pass) — LLM synthesis of the self/other gap,
  only if §7.7 permits, fully C1/C3/C9-gated.

## 9. Explicitly out of scope / never

- No reputation, ranking, or social-comparison surface.
- No per-informant attribution shown to the user.
- No inference of protected categories from informant input.
- No retention of the user's contact list.
- Stays within self-understanding per blueprint §3 — not a clinical, medical, or
  assessment-substitute tool.
