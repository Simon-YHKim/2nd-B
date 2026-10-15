# T16 S1: dormant server content authority

S1 adds an **unapplied SQL draft** for an interview work identity, content generation
barrier, and immutable save reservation. It has no client, Edge endpoint, finalizer,
wipe executor, model call, protocol activation or production migration number.
`ready` describes an observed S1 work contract; it is not a v2 finalization grant.
The production provider remains `contentLease: () => null`.

This follows the independently reviewed S0 R2 contracts:

- authority/wipe SHA-256 `2e873039cf25576116139a1bb429cd05f4677336368608b4a76cdf6f9b9e49ad`;
- finalization/rollout SHA-256 `7a794d259d9f005e97dfc1bfe7f80a90d30a59ded0920ace4df57803a2fbf314`;
- S0 R2 PASS H0/M0/L0, new medium findings 0; historical S0 BLOCK 1 remains.

The S1 implementation needs its own independent review. A design PASS is not an
implementation or activation PASS. Existing numbered migrations are unchanged.

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

Full repository verification, independent implementation PASS, numbered rollout,
S2 atomic finalization/erasure/cutover, legal retention and native/phone validation
are separate gates. This draft completes none of those activation conditions.

References checked: [Supabase database functions](https://supabase.com/docs/guides/database/functions),
[Supabase changelog](https://supabase.com/changelog),
[PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).
