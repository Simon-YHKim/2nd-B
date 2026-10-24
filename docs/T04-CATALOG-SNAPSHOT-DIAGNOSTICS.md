# T04 catalog snapshot diagnostics

## Confirmed defect and historical evidence

The psql reader in `scripts/test-deletion-receipt-arbitration.mjs` appended each
stdout Buffer directly to a string. Each append independently decoded UTF-8.
A Korean character in a function body (`pg_proc.prosrc`) split between pipe
chunks became replacement characters, even though PostgreSQL had not changed
the catalog. stderr used the same reader pattern.

An isolated PostgreSQL 18.3 cluster on loopback port 55874 reproduced this with
an unchanged SQL function containing a long Korean comment. Ten reads of the
same 3,600,642-byte catalog output were captured both as Buffers and through a
streaming UTF-8 decoder. The old reader corrupted 10/10 reads; consecutive old
snapshots differed 6/9 times. All ten decoded snapshots matched the concatenated
raw bytes and each other. This is a transport defect, not a changing SQL column.
[Node documents that `setEncoding` handles multibyte characters across chunks](https://nodejs.org/docs/latest-v24.x/api/stream.html#readablesetencodingencoding).
The updated runner's actual connection body was then used for another ten real
psql reads: 10/10 matched the raw baseline. Separate rolled-back function body,
ACL and security-definer changes were all rejected with the correct column.

The two historical failed attempts are consistent with this defect, but their
complete snapshots are unavailable:

- [40099116947 attempt 1](https://github.com/Simon-YHKim/2nd-B/actions/runs/40099116947/attempts/1):
  arbitration line 98. The printed first 10,000 characters match; the omitted
  actual/expected suffix lengths are 1,068,484 / 1,068,486.
- [40099230157 attempt 1](https://github.com/Simon-YHKim/2nd-B/actions/runs/40099230157/attempts/1):
  terminal line 248. The printed first 10,000 characters match; the omitted
  suffix lengths are 1,067,461 / 1,067,459.

Those logs establish truncation and a two-character length difference. They do
not prove which historical OID or column differed. No claim of recovering the
missing historical diff is made.

## Comparison stays strict

`setEncoding('utf8')` is installed on stdout and stderr before the data listeners.
The SQL still includes every selected `to_jsonb(pg_proc)` and `to_jsonb(pg_trigger)`
column, with the original object filters. No retry, column exclusion, replacement
character stripping, ACL sorting, or FK-trigger exclusion was added.

| Candidate | Evidence and handling |
| --- | --- |
| Runtime statistics or timestamps | Neither catalog has runtime counters or timestamps. `procost` and `prorows` are declared planner estimates, not usage statistics. Keep both. [pg_proc columns](https://www.postgresql.org/docs/16/catalog-pg-proc.html) |
| Internal FK triggers | `tgisinternal`, `tgconstraint`, `tgfoid`, and `tgenabled` describe real enforcement. DML does not justify ignoring them. Keep the complete trigger rows. [pg_trigger columns](https://www.postgresql.org/docs/16/catalog-pg-trigger.html) |
| Session-dependent output | `prosupport` is `regproc`; its symbolic output can depend on `search_path`. The reader uses `psql -X` with a fixed connection and filters inherited PG settings. This was not reproduced as the failure; no normalization. [OID alias output](https://www.postgresql.org/docs/16/datatype-oid.html) |
| Another connection or an earlier lane | Actual DDL, grants, role renames, or trigger removal must still fail. The CI lane clones `postgres` into a disposable database and reads that clone. Prior full-schema state remains in the baseline; it is not filtered away. |
| Pipe chunk boundaries | Reproduced with unchanged raw PG output. Fix only decoding; the new diagnostic identifies future genuine catalog changes. |

The shared `scripts/lib/catalog-snapshot.cjs` compares parsed catalog rows by OID
and every column (including unknown future columns). Object-key/row presentation
order is immaterial; nested array order and column values remain significant.
Added/removed OIDs also fail. Failure reports contain only changed objects, their
names, changed columns, and short values or length/hash summaries. No complete
snapshot is attached to the Error. The report has a 12,000-character detail
budget and explicitly counts additional omitted objects while still failing.

Example:

```text
repeat apply: 1 changed catalog object(s)
routines oid=17 name="existing_function" changed columns=[prosrc]
  prosrc: <string chars=1200002 sha256=...> -> <string chars=1200003 sha256=...>
```

## Applying the same change to #2736

This branch does not contain the terminal runner. Do not copy its implementation
or SQL migrations into this PR. After this PR is merged, incorporate it into
`feat/t04-receipt-terminal-261024` through the coordinator's normal integration:

1. Import `assertCatalogSnapshotUnchanged` from `./lib/catalog-snapshot.cjs` in
   `scripts/test-deletion-receipt-terminal.mjs`.
2. Immediately after spawning psql, set both `child.stdout.setEncoding('utf8')`
   and `child.stderr.setEncoding('utf8')`, before either data listener.
3. Replace its **three** `assert.equal(await ok(existingSnapshot), existing, ...)`
   calls with `assertCatalogSnapshotUnchanged(await ok(existingSnapshot), existing, stage)`.
   Keep `existingSnapshot` SQL and all of its original filters unchanged.
4. Extend the runner connection/checkpoint tests to terminal. Run its `--fixture`
   lane and CI's full-schema SQL lane. `installSnapshot` also contains columns,
   indexes and ledger output; do not pass that different shape to this helper.

Compatibility was tested on a disposable copy of terminal commit
`0f3ed0c90f9e329e8567cfac0f87a042f0508a91` with only steps 1-3 applied.
The original branch/PR was not modified. The terminal fixture passed 7 groups,
9 observed blocking schedules and 28/28 existing SQL mutants (including 13
installation-order refusals). This is fixture compatibility, not proof of a
hosted Auth/Storage implementation or of the terminal full-schema CI lane.

## Regression checks

```text
npx jest scripts/__tests__/catalog-snapshot.test.ts scripts/__tests__/deletion-receipt-arbitration.test.ts scripts/__tests__/supabase-security-drafts.test.ts --maxWorkers=2
node scripts/test-deletion-receipt-arbitration.mjs <isolated-port> t04_arbitration_test_<unique-name> --fixture
```

The new tests exercise the actual runner connection body with split 2/3/4-byte
characters and a large pipe-sized stream. They also verify function body/ACL/
security changes, internal trigger changes, added/removed OIDs, malformed input,
bounded uncaught-error output and all three preservation checkpoints.
Six temporary implementation mutants were killed: removing stdout decoding,
removing stderr decoding, ignoring `prosrc`, ignoring triggers, skipping the
failure, and restoring the full-JSON assertions. Original bytes were restored.
The arbitration SQL fixture also passed 10 groups, 8 blocking schedules and
13/13 existing SQL mutants. No operational DB or external Auth/Storage calls
were made. CI uses PG16; the local reproduction and fixtures used PG18.3.
