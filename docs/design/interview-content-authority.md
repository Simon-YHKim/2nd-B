# T16: dormant server content authority and finalization input

S1 adds an **unapplied SQL draft** for an interview work identity, content generation
barrier, and immutable save reservation. It has no client, Edge endpoint, finalizer,
wipe executor, model call, protocol activation or production migration number.
`ready` describes an observed S1 work contract; it is not a v2 finalization grant.
The production provider remains `contentLease: () => null`.

This follows the independently reviewed S0 R2 contracts:

- authority/wipe SHA-256 `2e873039cf25576116139a1bb429cd05f4677336368608b4a76cdf6f9b9e49ad`;
- finalization/rollout SHA-256 `7a794d259d9f005e97dfc1bfe7f80a90d30a59ded0920ace4df57803a2fbf314`;
- S0 R2 PASS H0/M0/L0, new medium findings 0; historical S0 BLOCK 1 remains.

The S1 implementation at `d9838953` passed independent R1 review H0/M0/L0,
new medium 0 (S1 BLOCK0; historical S0 BLOCK1 retained). S2a needs its own
implementation review. Neither verdict is an activation PASS. Existing numbered
migrations are unchanged.

## Contract and retained state

The three public tables have FORCE RLS, no direct privileges for anon,
authenticated or service_role, and `owner_id -> auth.users ON DELETE CASCADE`.
They store no body, JWT, email, IP, raw error or model output.

| Table | S1 purpose |
|---|---|
| `interview_content_authority` | Server UUID generation, ready/wipe_pending phase, immutable current barrier ID, revision and legacy write protocol. S1 cannot promote or downgrade protocol. |
| `interview_content_wipes` | Owner/request identity, old/new generation, scope label and committed barrier. The only observation is `not_executed`. There is no completed/deleting setter. |
| `interview_work_contracts` | Server session ID, explicit owner/new-work key, fixed draft/period/languages/growth origin/r0 rule, creation time, terminal state and none/reserved save slot. No session FK: deletion/folding must not erase replay keys. |

The candidate erasure JSON classifies these tables as retained for content deletion
and cascading for account deletion. Its test checks actual owner UUID columns,
FORCE RLS and FK action against the exact JSON, without modifying the installed
registry. A future numbered rollout must include reviewed registry additions.
Retention policy and the final deletion scope are not approved by this draft.

S1 reserves a 32-byte snapshot digest only after an explicit save intent. It does
not calculate or certify the S2 canonical snapshot serialization. The digest is not
returned, logged or a receipt of record creation. Existing close/fold/discard/record
erasure hooks do not yet update this new work table. **S2 must wire terminal states
and digest erasure before activation.** S1 detects missing/stale/old-generation
sessions on reads and refuses new reservation; it does not claim that content
erasure already clears this metadata. Commit receipts and record FK/erasure are
deliberately absent until S2 can add their full atomic contract.

## Trusted service boundary

Six typed public functions are SECURITY INVOKER: open, inspect authority, begin
barrier, inspect barrier, reserve and lookup save. They call one private SECURITY
DEFINER request helper with an empty search path. Both facade and request helper
grant EXECUTE to service_role, which also needs private schema USAGE. Private
schema CREATE and the two internal access helpers remain ungranted. Keep the
private schema outside the Data API exposed schemas.

The request helper performs the same validation when called directly: service
claim, exact input keys/types, current verified owner/Auth-session/expiry, profile,
live Auth owner and account-deletion fence. Malformed or conflicting role claims
are rejected. Real role ACLs, not a role string alone, prevent anonymous or signed-in
users from invoking it. SECURITY DEFINER's `current_user` is not treated as the
caller. No JWT subject or session GUC is fabricated to call the old r0 commit RPC.

The future Edge caller must verify the user's JWT and supply those verified
arguments. These SQL functions do not cryptographically verify a JWT and do not
make client-supplied owner/expiry fields authoritative. Ordinary same-owner
reauthentication can inspect the original work with a new live Auth session.

## Work issuance and rate limit

An explicit new-work key creates the work and the existing `interview_sessions`
row in one transaction. The existing AFTER INSERT `interview_session_count_start`
trigger is the **only** counter increment. A failed insertion, trigger or final
Auth check rolls back authority/work/session/count together.

Same-key lookup occurs before the cap and current generation check. Identical
identity returns the original work without changing its creation time, session
last-seen time, starts counter or six-hour window. Different identity conflicts.
Missing, folded, erased, expired or old-generation work never creates a replacement
session in this API, even after legacy session tombstone pruning.

The cap is the existing 30 starts with its exact ten-minute bucket expression:

```sql
bucket_start >= date_bin('10 minutes', final_clock - interval '1 hour',
                        timestamptz '2000-01-01 00:00:00+00')
```

It is not reinterpreted as rolling event timestamps. Work `created_at` and session
`started_at`/`last_seen_at` share the admission time taken after all relevant waits.
Discard/fold/content deletion do not rewind starts. The existing sweep's removal
of buckets older than two hours is separate from admission and account deletion.
S1 issues server-pinned r0; r1-q5 and all v2 rule/proxy transitions remain S2.
KO UI retains KO conversation locale; EN/ES/PT/ID UI retains EN conversation locale.

## Lock and time proof

Open/barrier use owner advisory EXCLUSIVE with the existing seed 260913. Reserve
and reads use SHARED. The order is owner -> profile -> Auth user FK KEY SHARE ->
live Auth-session KEY SHARE -> metadata/work -> interview session key/row.
Reserve can wait on work/session rows and rechecks Auth/expiry afterward. Generated
session keys are acquired with try-lock before admission. Every existing owner
starts bucket is locked in bucket order using NOWAIT; a conflict becomes SQLSTATE
40001 and the entire attempt rolls back.

The absence of an invisible same-owner starts INSERT after admission is a concrete
privilege/path property, not a global table lock:

- In the actual installed schema, anon/authenticated/service_role lack direct
  session INSERT and starts INSERT/UPDATE privileges.
- All three shipped session INSERT callers take the owner SHARED lock first:
  proxy verdict uses `interview_account_writable`; close/commit use
  `assert_polaris_account_active`. Open's EXCLUSIVE lock excludes those callers.
- The existing trigger's FK target Auth row is already locked. Counter sweep can
  delete existing rows, so those rows need NOWAIT pre-locking. Direct profile and
  session deletion hooks use try-locks in their inverse order and retry with 40001.
- Other owners continue while one owner holds open's EXCLUSIVE key. No runtime
  relation lock or cluster-wide admission lock was added.

Arbitrary database-owner DML, custom triggers and DDL are outside this concurrency
protocol. Administrator INSERTs can bypass privilege and owner-key rules; the draft
does not promise a no-wait admission timestamp for that unsupported traffic. A new
shipped INSERT path must preserve the same graph. The runner checks the installed
caller graph and actual direct privileges, then observes real pg_stat_activity
lock waits and invokes the shipped close, deletion hooks and sweep.

The final access check uses `clock_timestamp()` after each possible metadata/row
wait and immediately after writes. Transaction-start `now()` is not reused for
Auth expiry. No grace window is added.

## Barrier, reserve and unknown

Begin-barrier requires a stable request key, expected prior generation and bounded
scope label. It checks an existing key's original binding before current generation
CAS, so a lost ACK can return the original operation. Different binding conflicts.
A new barrier changes generation and phase exactly once. Its scope label is an
identity binding; it does not authorize an unfrozen deletion manifest.

Old work is closed for reservation and a new work key is blocked while wipe_pending.
There is no S1 API to mark the wipe completed or ready. No content/Storage/usage
deletion runs. S1's barrier protects these T16 primitives; existing r0 and other
app writers do not yet consume it. Cross-device full content wipe, native display
invalidation and all old-writer cutover remain separate work. A local T38 numeric
content generation is not this server UUID authority.

Reserve binds one immutable save request, intent revision and digest to the original
work identity. It returns `reserved`, never `committed`; ended and folded states
remain distinct. Reserve/lookup never INSERT another session or increment starts.
Lookup does not write, refresh expiry, recreate a missing slot or grant execution.
An unavailable response is still unknown: callers must retain the same key and
pending intent. No TTL, automatic retry, expiry cleanup or success inference is
provided by this draft.

## Rehearsal and rollback

Run the existing CI full schema/role-floor replay into a **fresh disposable local
Docker PostgreSQL database**, then:

```sh
node scripts/test-interview-content-authority-sql.mjs polascope_local t16_authority_test_s1
```

The runner accepts only an explicit local Docker socket/container and disposable
database name; it ignores inherited PG/Docker endpoint selectors and accepts no
DB URL. It checks the complete staged migration version set and installed lock
helpers. It applies the exact candidate, executes the SQL regressions, and runs
real two-connection scenarios. No mock Supabase client is evidence for these tests.

The down draft is for an empty rehearsal only. It takes locks on the three new
tables and refuses **before DDL** if any authority/work/barrier row exists. Used
state needs a forward repair or read-only recovery; dropping old keys would reopen
replay. The tests execute both empty roundtrip and used-state refusal, reapply the
exact up draft, and compare all immutable rows.

Local evidence at authoring baseline `5f9bcc085b01e9a72a1a5b4683e96bd1407f1207`:
148 baseline files and 88 staged files replayed from the current tree with the
repository's Auth/Storage/default-grant floor; staged files use Supabase CLI
2.116.0 against localhost only. A stale local template initially exposed an old
blocking erasure helper. That failed run is retained; the final run uses a fresh
full replay and the runner now rejects that stale function before testing.

The author-run SQL runner passed **21 executed groups** on the fresh database;
exact logs and file hashes accompany the frozen implementation review evidence.
Executed coverage includes real role/helper ACL, 30/31 starts and bucket boundary,
same/different-key races, same-owner legacy writer exclusion and other-owner
progress, Auth/work/session row waits and expiry, actual sweep/NOWAIT, inverse
deletion lock retries, barrier/reserve race, atomic forced failure, erasure candidate,
account cascade and both rollback modes. Existing r0 close's starts +0 test is
only a counter check; it does not claim S2 proxy/finalize/work-state integration.

## S2a packet and verified Auth leaf

S2a adds only pure packet helpers and an injected Auth adapter, with regression
tests. No endpoint, RPC caller, DB finalizer, snapshot writer, UI, deployment or
protocol activation imports these helpers. S1 remains unapplied and inactive.
The existing v1 draft codec, key/namespace and seven-day retention are unchanged.

The packet is **not** a new interpretation of an old snapshot. Current snapshots
do not retain `origin`, `askKind` and `openerUnedited` provenance. A future capture
route must retain them at turn creation. Missing provenance is rejected; no
model/fixed/user inference, new work issuance or intent reallocation is allowed.
The service must compare the packet with the exact S1 work contract. Passing this
parser does not certify a client claim, a server safety verdict or permission to
save. A client `state: judged` cannot create server judgment or coverage credit.

The exact v1 wire object has these own data fields, with no extra fields:

| Object | Fields |
|---|---|
| Root | `v: 1`, `intent`, `ruleSet`, `period`, `conversationLocale`, `uiLanguage`, `growthOrigin`, `turns` |
| Intent | `requestId`, `sessionId`, `draftId`, `revision`, `contentGeneration` |
| Turn | `n`, `scene`, `role`, `text`, `layer`, `origin`, `askKind`, `openerUnedited`, `state` |

The five UUID identities (including the separately verified owner) are normalized
to lowercase. `intent.revision` is the original positive safe integer, never a
later outer draft CAS revision. `ruleSet` is r0 or r1-q5; S1 currently issues only
r0, so accepting r1-q5 syntax does not make that work executable. Period is one of
infancy/school/twenties/later/work/now. UI ko requires conversation ko; all other
supported UI languages en/es/pt/id require conversation en. `growthOrigin` is a
required boolean. There is no owner, title, summary, marker, answered, coverage,
hold, safe flag or generic record key in the client packet.

Turns use the existing 1..4000 ordinal and 1..10000 scene bounds. Ordinals must be
contiguous; scene identity cannot go backward. No alternation requirement is
invented. Role is interviewer/user; origin is model/fixed/user with user iff user
role. Layer is fact/feeling/meaning/belief/echo or explicit null. Ask kind is
seed/drill/scaffold/confirm/loop_check/switch_offer/fallback or explicit null, and
must be null on user turns. Interviewer state and openerUnedited must be null;
user state is judged/unsettled/local_block/control, with boolean/null openerUnedited.
Missing fields are rejected separately from valid false/null values.

Each nonempty text is at most 8000 Unicode code points. NUL and unpaired surrogates
are rejected before a PostgreSQL parser could replace or refuse them. Raw body
whitespace, CRLF and Unicode composition are preserved. The raw JSON, full
projected input (including trailing questions) and canonical UTF-8 encoding each
have a 256 KiB cap; the first applicable bound wins. Duplicate JSON keys, excess
depth, extra properties, sparse arrays, exotic prototypes and own getters are
rejected. The HTTP adapter must still bound the incoming stream before reading
the whole string. Programmatic inputs are validated and copied to deeply frozen
objects, without retaining caller objects or invoking their data getters.

The real `storedTurns` helper selects everything through the last user turn after
validating the entire input. The selected projection is what the canonical bytes,
saved body and title describe. Only trailing interviewer turns are omitted; user
control/closing utterances stay. All-question packets are rejected. The real
`storyTitle` helper supplies the approved first-answer title behavior, including
its NFC/grapheme boundary rules; that title normalization never changes body bytes.
The service must derive the star label from the approved period/UI catalog, not
from a client string. S2a has no catalog/caller binding yet.

### Versioned canonical bytes

The prefix is the literal ASCII `T16-FINALIZE-PACKET/1` followed by LF. After it,
values are framed in the order below, without separators beyond each frame:

1. Verified owner UUID; intent requestId, sessionId, draftId, revision and
   contentGeneration; ruleSet, period, conversationLocale, uiLanguage,
   growthOrigin; selected turn count.
2. For each selected turn: n, scene, role, layer, origin, askKind, openerUnedited,
   state, text.

A string is `S<UTF-8 byte length>:<raw bytes>;`, an integer is `I<base-10 digits>;`,
null is `N;`, and booleans are `T;`/`F;`. Length counts bytes, not UTF-16 units or
code points. JSON order/formatting has no effect; composed and decomposed raw text
remain different. SHA-256 is lower-case hex over these UTF-8 bytes. The digest
captures bytes synchronously before awaiting Web Crypto. It binds an immutable
intent and selected projection; it is never a commit receipt or a safe verdict.
Changes to selection, framing or renderer semantics need a versioned contract
change and renewed golden approval, not a silent change to packet version 1.

The explicit two-turn test vector hashes to
`06ae245e7f9a56a8b8f5494adfcef49cd5be600cbd2ad81ce1749aa7e36c2ce1`.
Author validation compares 15 actual PostgreSQL READ ONLY results with TypeScript:
KO/EN body rendering including ES/PT/ID UI, raw NFD/CRLF/emoji/delimiter strings,
and PostgreSQL SHA-256 over the exact canonical bytes. This proves the existing
SQL transcript renderer/byte hash agree; **a PostgreSQL packet canonicalizer is
not implemented in S2a**. S2b must recompute these frames from validated DB input
and pass the same golden vectors before it can finalize anything.

### Auth observation and execution authority

`verifyInterviewFinalizeAuth` accepts only a bounded (16 KiB) strict bearer token
and calls the injected real `auth.getUser(token)` before decoding claims. Only
success with a valid returned UUID permits inspection of `sub`, `role`,
`session_id` and `exp`. Subject must exactly match the returned user; role must
be authenticated, session a UUID, and expiry a positive safe integer with a safe
millisecond conversion. Duplicate/malformed claims and invalid UTF-8 fail closed.
The fresh clock is read **after** the await; expiration at the current time is
expired. No `iat` grace or reauthentication age policy is invented.

The helper returns only frozen owner/session/expiry observation or a stable error
code. It neither logs nor stores the bearer or SDK exception contents. A five
second deadline limits its wait; underlying SDK fetch cancellation remains the
caller's responsibility. Late completion cannot change a returned failure.
The caller must supply the real verified Auth implementation and bound its fetch.
Injected unit tests do not prove a production Auth request. DB live-session,
expiry, account fence and generation checks after DB waits remain mandatory even
after this helper succeeds; no execution lease or DB retry is issued here.

S2a author tests cover the actual leaf exports, immutable mutation races, source
metadata, Unicode/size/order boundaries, getters, title corpus, claim mismatch,
Auth error/timeout and expiry across a deferred Auth response. Actual Auth/Edge
requests, the SQL finalizer/erasure hooks, both model proxy ledger adapters and
snapshot/caller provenance are still separate implementation and review gates.

Full repository verification, independent implementation PASS, numbered rollout,
S2 atomic finalization/erasure/cutover, legal retention and native/phone validation
are separate gates. This draft completes none of those activation conditions.

References checked: [Supabase database functions](https://supabase.com/docs/guides/database/functions),
[Supabase changelog](https://supabase.com/changelog),
[PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).
