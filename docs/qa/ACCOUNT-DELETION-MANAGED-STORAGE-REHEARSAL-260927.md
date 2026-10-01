# 0192 account-deletion fence: managed Storage rehearsal

**State: prepared, not executed on managed Storage.** The numbered migration is
`db/migrations/0192_account_deletion_completion_fence.sql`. Scratch CI has a
Storage *stub* and its `db/tests/account_deletion_completion_fence_regression.sql`
replays the retained `UNNUMBERED_` draft inside one transaction. That test proves
basic policy, trigger and ACL behavior in the stub; it cannot prove the deployed
Storage schema, the Storage API path, or cross-connection lock ordering.

This procedure belongs to the console owner under `docs/SESSION-OWNERSHIP.md`.
Run it only on an **isolated managed Supabase project** restored from the approved
backup, with two disposable Auth accounts and their own Storage objects. The
production ref `zoacryukmdeivmolvyhj` is forbidden here. The old restore-drill
project `qwvpbmkgwwrhnzcgceav` was deleted and is not a target. This document
does not authorize creating a new project, applying production migrations, or
deleting an existing project. Never paste DB URLs, anon keys, passwords, JWTs,
or service-role keys into a report or terminal transcript.

## Preconditions and evidence to keep

1. Record isolated project ref, region, snapshot/backup ID, migration source
   commit, and the reviewed `0192` file SHA-256. Verify the URL and dashboard
   project ref match. Use a direct DB connection or **Session pooler**; keep each
   `psql -X` process in its own session. Avoid Transaction pooler for this
   multi-statement test. Use a password prompt or private environment variable,
   never a password-bearing command line.
2. Apply prerequisites through `0192` **in the clone only**, following the
   reconciled timestamp ledger plan. Do not replay the `UNNUMBERED_` draft on top
   of `0192`. Its historical `INACTIVE DRAFT` header does not undo its numbered
   source status. Run this read-only check against the resulting **managed** DB:

   ```powershell
   psql -X -h $env:REHEARSAL_DB_HOST -p $env:REHEARSAL_DB_PORT `
     -U $env:REHEARSAL_DB_USER -d postgres -v ON_ERROR_STOP=1 `
     -f db/tests/account_deletion_managed_storage_preflight.sql
   ```

   The script accepts exactly one nonempty 0192 ledger row in either documented
   form: CLI scratch `(0192, account_deletion_completion_fence)` or the managed
   clone's timestamped `(<14-digit version>, 0192_account_deletion_completion_fence)`.
   The latter is the expected result for this managed rehearsal. Duplicate,
   empty, or differently versioned/name rows are **NO-GO** until reconciled;
   do not edit the ledger merely to satisfy the preflight. The script also
   refuses missing bucket policy, RLS, trigger, tombstone, or service-only RPC
   grants. Save the output showing actual
   `storage.objects` columns and all four policy expressions. Compare those
   expressions and the ledger SQL with the pinned numbered source; a catalog
   presence check alone does not prove semantic equality. In particular, the
   `additional_required_insert_column` result must be empty before using the
   three-column direct INSERT in race 2. A row there means the managed schema
   requires other values and the SQL below will fail **before** it exercises
   the deletion trigger; do not count that failure as a pass.
3. `0194_llm_service_consent_management.sql` is **after `0192`**. Its first `DO`
   block requires `public.account_deletion_tombstones`; its status and writer
   RPCs take the same owner-keyed shared advisory lock before profile/receipt
   work. Run `0194` only after the 0192 preflight passes; repeat the preflight
   afterward to record the two management RPCs. Their presence alone is not a
   complete service-consent canary.
4. Create **two new disposable Auth test accounts** in the isolated project
   through its normal Auth API. Complete confirmation/profile creation so each
   has one live `auth.sessions` row and a matching `public.users` row. Use the
   accounts only here. Set these variables privately in the operator's shell:
   `REHEARSAL_PROJECT_REF`, `REHEARSAL_SUPABASE_URL`, `REHEARSAL_ANON_KEY`,
   `REHEARSAL_EMAIL`, `REHEARSAL_PASSWORD`, `REHEARSAL_TAG` (same tag for both
   accounts; for example `fence-qa-260927`). The probe requires an exact
   `https://<ref>.supabase.co` URL and rejects the production project ref. It
   uses the anon key and test-account password only in memory; it prints user
   and session UUIDs, never credentials or JWTs.

## Seed and managed Storage API contract

Run for **each** disposable account, changing only its email/password. Save the
printed `userId`/`sessionId` as A or B for the SQL below. Do not use the shared
production QA account.

```powershell
node scripts/rehearse-account-deletion-storage.mjs seed
node scripts/rehearse-account-deletion-storage.mjs assert-listed
```

`seed` performs a real authenticated Storage upload under
`raw-clippings/<userId>/<tag>-probe.md`. `assert-listed` requires the pinned
experimental `listV2({prefix, limit:1000, with_delimiter:false})` to return
exactly that full path, no folders, and no next page. If either fails, stop:
the managed Storage contract is not established. The probe is one object per
fresh account, so an existing object is an error rather than silently ignored.

## Two-connection race 1: writer holds lock before deletion

Open two separate `psql -X` processes against the isolated project's **same
database**. Use different connections and the saved A UUIDs. `\set` below is
a local `psql` variable, not SQL. The session-role simulation requires a DB
operator account allowed to `SET ROLE authenticated/service_role`; if that is
unavailable, stop and record the rehearsal as unverified.
Run `SELECT pg_backend_pid();` in each connection first and record its writer
and deleter PID. Both `psql` processes must remain open for both races.

**Connection W (authenticated writer):** enter the following, then leave the
transaction open. The UPDATE is metadata-only and keeps the real Storage blob
path unchanged; it fires the managed `storage.objects` UPDATE trigger.

```sql
\set u1 'A_USER_UUID'
\set tag 'fence-qa-260927'
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('request.jwt.claims',
  jsonb_build_object('role','authenticated','sub',:'u1')::text, true);
SELECT set_config('request.jwt.claim.sub', :'u1', true);
SET LOCAL ROLE authenticated;
UPDATE storage.objects SET name = name
 WHERE bucket_id = 'raw-clippings'
   AND name = :'u1' || '/' || :'tag' || '-probe.md'
 RETURNING id;
-- Require exactly one row. Keep this transaction open.
```

**Connection D (service-role deletion):** enter the following. Its SELECT
must wait while W keeps the owner-keyed shared lock.

```sql
\set u1 'A_USER_UUID'
\set s1 'A_SESSION_UUID'
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
SELECT public.begin_account_deletion(:'u1'::uuid, :'s1'::uuid, now());
-- Wait for W. Do not COMMIT until the call returns true.
```

From a third **read-only** observer connection, capture that D is waiting on a
lock and has W in `pg_blocking_pids`. Fill in the two PIDs; the result must be
`Lock | true`. Do not copy SQL text or credentials into evidence.

```sql
\set writer_pid WRITER_PID
\set deleter_pid DELETER_PID
SELECT wait_event_type,
       :writer_pid::integer = ANY(pg_blocking_pids(:deleter_pid::integer)) AS blocked_by_writer
FROM pg_stat_activity WHERE pid = :deleter_pid::integer;
```

Then `COMMIT;` on W. D must return `true`; `COMMIT;` on D. In W, confirm
the A tombstone exists and the original Storage row is still listed:

```sql
SELECT EXISTS(SELECT 1 FROM public.account_deletion_tombstones
              WHERE user_id = :'u1'::uuid) AS tombstone_committed,
       EXISTS(SELECT 1 FROM storage.objects
              WHERE bucket_id = 'raw-clippings'
                AND name = :'u1' || '/' || :'tag' || '-probe.md') AS probe_present;
-- Both values must be true.
```

The
deletion sweep must remove that committed object before Auth deletion.

## Two-connection race 2: deletion holds lock before writer

Use the *different* disposable account B. In D, open a new transaction and
call `begin_account_deletion` with B's live session ID. Require `true`, then
**leave D uncommitted**. The tombstone is not visible to W yet, so the shared
advisory lock must make W wait.

```sql
\set u2 'B_USER_UUID'
\set s2 'B_SESSION_UUID'
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
SELECT public.begin_account_deletion(:'u2'::uuid, :'s2'::uuid, now());
-- Require true. Keep the transaction open.
```

In W, start an authenticated insert of a *new* B path. This directly exercises
the managed Storage DB trigger, but it is not a substitute for the API smoke
check below. Run it only if `additional_required_insert_column` was empty. A
successful INSERT is a failure of this rehearsal; immediately
`ROLLBACK` W if that happens.

```sql
\set u2 'B_USER_UUID'
\set tag 'fence-qa-260927'
BEGIN;
SET LOCAL statement_timeout = '60s';
SELECT set_config('request.jwt.claims',
  jsonb_build_object('role','authenticated','sub',:'u2')::text, true);
SELECT set_config('request.jwt.claim.sub', :'u2', true);
SET LOCAL ROLE authenticated;
INSERT INTO storage.objects (id, bucket_id, name)
VALUES (gen_random_uuid(), 'raw-clippings',
  :'u2' || '/' || :'tag' || '-racing.md');
-- This statement must wait. After D commits it must fail with SQLSTATE 42501
-- and message account_deletion_in_progress. Then ROLLBACK W.
```

Capture W's lock wait in the read-only observer using the same recorded PIDs:

```sql
SELECT wait_event_type,
       :deleter_pid::integer = ANY(pg_blocking_pids(:writer_pid::integer)) AS blocked_by_deleter
FROM pg_stat_activity WHERE pid = :writer_pid::integer;
```

Require `Lock | true`. `COMMIT;` on D. W must now
fail with the **specific** `account_deletion_in_progress` error; then run
`ROLLBACK;` on W. In W, confirm no `-racing.md` row exists:

```sql
SELECT NOT EXISTS(SELECT 1 FROM storage.objects
  WHERE bucket_id = 'raw-clippings'
    AND name = :'u2' || '/' || :'tag' || '-racing.md') AS racing_path_absent;
-- Must be true.
```

Another 42501 error,
timeout, or a zero-row policy outcome is **not** a pass; investigate the actual
managed schema and RLS/trigger path. If the managed schema needs other
non-default columns, stop this SQL race as **unverified** and revise the fixture
for that exact schema in the isolated project. An API upload while D holds the
fence can additionally show the end-to-end wait/rejection, but its result alone
does not identify the DB backend lock holder and does not replace the
`pg_blocking_pids` evidence required here.

## API rejection, cleanup and release evidence

For each account after its tombstone committed:

```powershell
node scripts/rehearse-account-deletion-storage.mjs assert-listed
node scripts/rehearse-account-deletion-storage.mjs assert-after-fence
node scripts/rehearse-account-deletion-storage.mjs cleanup
node scripts/rehearse-account-deletion-storage.mjs assert-empty
```

`assert-after-fence` makes an authenticated **Storage API** upload and requires
the exact `account_deletion_in_progress` error. `cleanup` deletes the real
pre-fence probe through the Storage API; `assert-empty` checks the flat list
again. Confirm the SQL tombstone remains and no post-fence object row was
created. Remove the disposable Auth accounts through the isolated project's
normal administrator flow, then verify their Storage prefixes are empty. No
direct metadata delete is part of the cleanup.

Record project ref, source commit/hash, post-0192 and post-0194 catalog output,
both lock waits/blocking PIDs, W/D results and SQLSTATE, Storage API result
codes, final empty listings, and fixture cleanup. Keep any credentials out of
the evidence. **No-GO** if the trigger is absent/disabled, the actual policies
differ, either lock ordering is unproven, an upload gets through after the
tombstone, `listV2` differs from the pinned flat shape, or cleanup is incomplete.
This rehearsal does not itself deploy `delete-account`, exercise the full
account-erasure Edge flow, or authorize production promotion.
