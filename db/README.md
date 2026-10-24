# Database Migrations

For the inactive service-contract drafts and erasure registry promotion, follow
[the forward-migration runbook](../docs/qa/ERASURE-FORWARD-260926.md). New registry
rows use a separate additions-only migration and `forwardAdditions` metadata;
a changed reason for an existing row uses a separate revision-only migration and
`forwardRevisions` metadata that records the reason it replaces (reason only:
owner, class, order and cascade stay pinned to 0189). Either kind of registry
migration also goes into `c_names` in `migrations/rollback/0189_down.sql`.
Preserve the historical 0189 seed. Reserve real numbers through the console owner.

SQL files in `migrations/` apply in numeric order. They are designed to be
idempotent (`IF NOT EXISTS` where possible) and to dry-run against a vanilla
Postgres 16 container without Supabase running.

## Apply locally (dry-run)

```bash
docker run -d --name 2ndb-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
sleep 2
for f in db/migrations/*.sql; do
  PGPASSWORD=postgres psql -h localhost -U postgres -f "$f" || exit 1
done
docker stop 2ndb-pg && docker rm 2ndb-pg
```

## T28 numbered AI hold (0270)

`migrations/0270_crisis_ai_hold.sql` is the byte-identical promotion of the
reviewed #2535 draft at `90384ca4`. Its LF SHA-256 (including the final newline)
is `a14c2b01e2e2eed933581fe0dab735ec031f32a7e25ad7e939e9f6c1a728fc61`.
The old draft is removed; tests, inventory replay and DPIA now read the numbered file.

Apply after 0225 and 0263, on the current 0001–0269 schema (including 0262/0264).
The D4 server half takes effect immediately: known RED/interview-held records
lose vectors, and new writes inherit the hold. Originals and account export
remain available. No dormant switch, new table, model call or app reader/writer
wiring is added. Existing table erasure/export classifications stay unchanged.

CI keeps `t39_t40_before_0270` for `tests/crisis_ai_hold_regression.sql`, including
real backfill, immutable 0263 contracts and the actual 0218 down/reapply suite.
`tests/crisis_ai_hold_installed.sql` runs on the final numbered schema.
`rollback/0270_down.sql` removes only the three AI read views, in one transaction.
It keeps all hold bits, row guards and cleared vectors; it cannot release a hold.
Readers must fail closed without the views. Reapplying the numbered SQL restores
them; the Relay installer intentionally refuses an existing ledger row, so
incident reapply is a separate reviewed operation. No ledger row is removed.

Relay uses one whole `execute_sql` call with LF body MD5, measured prerequisite
ledger pairs, item-level prestate pins, runtime preservation checks and exact
new-object expectations. Backfill and cleared-vector row counts are returned.
Production function comments and historical ledger names may differ from local
replay: the coordinator measures and pins them before application. See the
[D4 contract](../docs/design/crisis-ai-hold-261015.md) for remaining app work.

## T39/T40 numbered promotion (0265 through 0269)

Relay order is **0265 E1-S → 0266 S → 0267 F → 0268 S reason → 0269 F reason**, one complete file per
transaction. Numbering is not production application or app activation. The
three migration files and their `rollback/0265_down.sql` through
`rollback/0267_down.sql` are byte-for-byte copies of the reviewed drafts.
Historical `INACTIVE DRAFT`, numbering and rollback-path comments inside those
files are preserved for that proof; use the numbered paths in this README.
No executable self-path or function-source MD5 needs changing.

CI pushes numbered migrations in five batches (including the 0270 boundary) and preserves
`t39_t40_before_0265`, `t39_t40_before_0266`, and `t39_t40_before_0267` at the
three boundaries. The final `postgres` database has all five migrations once, including both registry revisions.
CLI 2.116 rejects a top-level `LOCK TABLE` outside an explicit transaction.
Only its temporary copies of 0266/0267 wrap the unchanged whole SQL in one
`DO ... EXECUTE` statement, as Relay does; repository files stay byte-identical.
Historical 0255 tests use the first snapshot, E1-S and S tests use the second,
and F uses the third. This avoids overwriting final F functions with an earlier
installer. Deliberate idempotence and rollback/reapply probes remain in clones.
SQL fixtures now live in `db/tests/`; the three runners keep their existing
assertions, real lock waits and mutation checks.

After Relay applies 0265, the coordinator must merge #2688 and deploy
`openai-proxy` that day, then own the legacy check and enforce transition.
Relay executes SQL only. Apply 0266 while S app settlement is off, then 0267.
0267 down retains the daily-cap extension; **0267 down → 0266 down stops with
55000**. Do not continue to 0265 down or bypass the guard. A pre-F installation
can run 0266 down → 0265 down after the five-minute S rebind window closes.
Full retirement after F needs a separately reviewed migration.
Run every down file as one transaction (`psql --single-transaction -v ON_ERROR_STOP=1 -f`
or one execute_sql call): a plain `psql -f` keeps going after the 55000 refusal and
leaves a mixed S/F state.

The S/F registry revisions are numbered separately: **0268** records S's refund
evidence and **0269** records F's server-day retention exception. Each file holds
one generated reason-only block, as required by the registry guard. The
`forwardRevisions` chain is 0258 reason → S reason → F reason; 0258 and the
reviewed 0265–0267 installers remain unchanged. The sidecars in
`migration-drafts/chat-turn-*-erasure-revision.json` now point to those numbered
files. Apply the table extensions first (0266 before 0268, 0267 before 0269),
and the S reason before the F reason. `rollback/0189_down.sql` clears both
registry ledger rows so the forward replay restores F's current reason without
replaying table changes. The registry SQL is replayable at its recorded state;
Relay wrappers reject a second application by ledger. Registration does not
claim production application or app activation.

## Dormant T39 concurrency tests

The dormant T39 lane in `supabase-dry-run.yml` also runs
`bash scripts/test-chat-turn-admission-races.sh` after 0265's sequential
tests and rollback/reapply. It needs a disposable, historical local
`t39_admission_test_ci` database cloned before 0266 with 0265 installed, `psql`, Bash and Node.
`PGPORT` can select a private local cluster; the host is fixed to `127.0.0.1`.
The runner commits synthetic fixtures only in that clone and a second
`t39_admission_mutant_test_ci` clone. Start with fresh databases for each run.

Nine schedules check attempts=0 first/first, reask/reask and both mixed orders,
attempts=1 reask/reask, both orders of last-slot purpose quota contention
(including T3901 rollback), and both orders of bump/reask.
Before releasing the leader, `pg_stat_activity` must show the follower waiting
on that leader's advisory or transaction lock. Each of the four attempts=0
schedules must fail with SQLSTATE 55000 after removing the user lock from a
numbered-file copy in the mutant clone. Connection errors, timeouts and surviving mutants fail the
lane. Logs include the observed backend IDs, schedule totals and mutation result.
Failure logs print before teardown. Cleanup closes both coprocess pipe writers
(the original immediately after duplication, the duplicate on exit), terminates
only this run's named backends and allows each client two seconds before TERM,
then two more before KILL. The CI step has a ten-minute timeout as a final bound.
Refund/claim races, account-deletion lock ordering and the sequential suite's
KST midnight boundary remain outside this race runner.

## Dormant T40 S evidence tests

`migrations/0266_chat_turn_refund_evidence.sql` is the S-only migration. Relay
applies the reviewed E1-S first, then S, each in one transaction. It keeps the
four RPC signatures, argument names, ACL and return types, including
`refund_chat_turn_after_output_swap(p_audit_id uuid)` and integer zero vs NULL.
No app/proxy activation, purpose restoration, `quota_day` or daily restoration
cap is included in S. F is migration 0267 below. The commit is not rollout approval.
Apply while app settlement is still off; an in-flight 0255 refund can deadlock
with the apply-time table locks (40P01), so retry the failed transaction.

Simon 2026-10-14 14:12:02: 「앞선 답 없는 예약을 닫아 가장 최근 하나만 묶이게」.
S changes deletion into closing binding while retaining evidence. A closed
reservation cannot register an attempt or bind/replace an answer. A response
from an attempt registered before closure can still record server-return
evidence and refund that reservation once. Delivery is not device receipt.

The CI lane invokes `python3 scripts/test-chat-turn-refund-evidence.py` with
`psql` on PATH after the full numbered replay. It creates only fixed loopback
`t40_evidence_test_ci` and `t40_evidence_mutant_test_ci` clones of the scratch
`t39_t40_before_0266` database. `PGPORT` selects a private cluster. It never reads dotenv,
accepts a remote URL, or drops databases. Start with fresh clones each run.
Python standard library only; no package installation. SQL/client waits are
bounded and the CI step has a ten-minute limit. Assertion failures alone kill
mutants; connection failures, timeouts and SQL syntax errors fail the lane.

| Historical expectation (kept in the numbered/T39 lanes) | Separate S assertion |
|---|---|
| T1 late first false, refund `null,1,null,null` | false and second representative preserved; refund `1,null,null,null`, first evidence in ledger |
| T2 replaced first refund `null,1,null` | `1,null,null`, first evidence in ledger, second representative preserved |
| bump deletes all unanswered rows | attempt zero deleted; attempted old row closed; one new open row |
| admission n=5/6 has one reservation | S schedules 208/209 retain old attempts 1/2 and IDs, plus one open attempts=0; both counters checked |
| two answers one turn: a=true b=false | same returns/representative, both delivery flags true |
| one answer two turns, two retries | collision adds no delivery; duplicate attribution refunds NULL; third attempt refused |
| direct answered fixtures imply refund eligibility | explicit delivery fixture or actual claim required; absent flag must refuse |
| counted rows disappear at a new day | old attempted rows cannot bind; stored counted day alone selects refund day |

The nine admission schedules are rerun under S in addition to claim/refund/bump
and account-deletion races. The observer must see the follower blocked by the
leader in `pg_stat_activity` before releasing it. Begin/claim are also held open
while another connection takes `users FOR UPDATE NOWAIT`; neither adds the
parent KEY SHARE lock. Bump/refund take that lock before their child rows.
Refund first rejects missing/foreign audit, spent ledger and missing/foreign/
refunded reservation evidence using reads without row locks. Eligible refunds
still lock users, usage, then reservation, and recheck eligibility/time after
waiting; the deletion lock order is unchanged. Global slot counting uses two
partial audit-ID indexes and UNION ALL (including both slots in one row).
The user advisory lock cannot justify ignoring another owner's corrupt slot.
The runner checks the actual count query with EXPLAIN ANALYZE on 30,000 other
reservations, plus refusal-path users FOR UPDATE NOWAIT compatibility.
E1-S remains unchanged, including its own account-deletion lock behavior.

The S-specific down restores the exact 0255 function bodies/ACL and reservation
columns/constraint, while retaining E1-S and settled counters/ledger rows.
Closed rows without a representative have no 0255 representation and are
removed; no audit ID is invented. This is schema/behavior rollback, not recovery
of all S evidence. Stop S traffic before rollback. Down refuses with SQLSTATE
55000 while any closed attempts=2 row has attempted_at within the last five
minutes: discarding closure then could reopen 0255's answer replacement path.
Wait for that window to expire and retry; the guard runs under table locks
before any destructive change. The runner removes the guard in a mutant and
requires the refusal assertion to fail, then ages synthetic attempts and checks
successful down, including removal of both S indexes. Do not use `0255_down.sql`,
which drops E1-S's begin dependency. Source digests refuse to overwrite newer
definitions; inspect/re-review drift instead of bypassing the guard. The runner
compares installed catalog snapshots before S and after its down, reruns the
E1-S test file (`tests/chat-turn-attempt-with-quota.sql`), reapplies S and reruns
the sequential assertions. It does not reapply E1-S in this rollback step.

The three booleans need a retention-description update, but no class/owner or
cleanup-threshold change. Previously, attempted unanswered rows disappeared at
the next bump; S retains them as closed refund evidence until a later bump
finds them older than two days, or account deletion if no further bump occurs.
The reason-only revision is promoted as
`migrations/0268_chat_turn_refund_evidence_erasure_registry_reason.sql` and is
included in `forwardRevisions` and the registry rollback list without rewriting
0258. Its sidecar, `migration-drafts/chat-turn-refund-evidence-erasure-revision.json`,
is checked against the real registry and schema by the runner. DPIA records this
numbered revision. No same-day retention exception from F is included in 0268.

## Dormant T40 F purpose restoration tests

Decision Q-261022-02 (2026-10-22): 「하루 1회 상한으로 복원 (추천)」.
Relay applies the reviewed **E1-S → S → F**, each complete migration in one
transaction. `migrations/0267_chat_turn_purpose_restore.sql` has no active caller.
The reviewed E1-S/S sources, 0185/0259 and the shared
consume function stay unchanged. No proxy/app/production activation is included.

F adds nullable `quota_day` and `purpose_restored_day`. Its E1-S replacement
takes the parent KEY SHARE before child writes only for an own attempt-zero reservation,
and brackets the unchanged consume
with `pg_catalog.clock_timestamp()` KST dates. A successful first debit records
its day; an admitted debit spanning midnight raises 55000 and rolls back. Second
attempts keep their receipt, unbound first attempts have none, and existing or
legacy reservations are never backfilled. Ordinary quota rejection stays T3901.
The midnight refusal intentionally includes unbound first admissions: the whole
charge rolls back, without a receipt, and the caller can retry.

Unbound first calls, duplicate first calls and second/rejected reasks do not take
this parent lock. Registered first debits (including attempt-zero reasks) hold it even with an existing
purpose row: account deletion can lock purpose before reservation while admission
writes reservation before purpose. Restricting it to new purpose rows leaves that
deadlock. This accepts 0242 withdrawal's 55P03/retry on these first debits, beyond
original E1-S's new-purpose-row conflict. Unbound first only writes purpose, so
it does not create that two-child cycle. It can still deadlock (40P01) with account
deletion when the unchanged consume first deletes a purpose row older than 45 days
and then inserts today's row; E1-S and the standalone 0259 consume behave the same
way, so this is an accepted residual of consume, not something F adds. One side
aborts with no data loss (the turn is not charged, or the deletion is retried). With
an existing purpose row, it leaves 0242 withdrawal available, as E1-S does. The runner
measures both definitions against the actual `withdraw_profile_import_internal(..., false)` routine.
F apply/down lock only **refunds, then reservations**, matching warm refund reads
and keeping usage tables out of the in-flight E1-S lock cycle. Four admission and
four warm-refund apply/down schedules exercise this boundary. Refund sessions run
the real function once and roll back before reusing the same backend during DDL;
fresh connections would hide the inversion while compiling the reservation row type.
Both 1s and 200ms deadlock timeouts run in both directions. Four old-order SQL
mutants must reproduce 40P01 and fail the same named assertion; SQLSTATEs and the
final refund state, chat count and ledger are checked, not just migration success.

S chat settlement and the `{ p_audit_id }` integer/NULL RPC contract are retained.
Purpose restoration requires a successful chat refund, today's recorded debit,
every registered attempt delivered with valid server red evidence, an
existing purpose row and an unused user-wide processing-day cap. Pending,
missing, foreign, client-written or future evidence refuses purpose restoration.
A delivered green or yellow in either slot refuses it too. Count 1 is deleted; higher
counts decrease by one. Missing purpose rows still permit chat refund. Completed
chat refunds cannot later be settled again for purpose alone.

Only `quota_day = server KST today` is restored. The design-r3 low finding showed
that restoring an expired day cannot add usable budget but would consume today's
one restoration. Such refunds therefore leave the old purpose row and today's
cap untouched. `counted_day` still selects the chat row. The unique partial index
on `(user_id, purpose_restored_day)` and the shared user lock enforce the cap.
Only a collision on that index cancels the purpose subtransaction; all other
errors undo the whole refund. Locks are user advisory → parent KEY SHARE → chat
usage → purpose usage → reservation, with eligibility clocks after row waits.

Bump retains today's restoration marker even on an old reservation. It compares
against the **server clock, never app-supplied `p_day`**. Next-day cleanup resumes
the existing two-day threshold. Audit/ledger deletion and content erasure do not
remove the marker; account deletion still cascades. The reason-only revision is
promoted as `migrations/0269_chat_turn_purpose_restore_erasure_registry_reason.sql`,
after S's 0268 revision, without changing the owner/class/export classification.
Its sidecar is `migration-drafts/chat-turn-purpose-restore-erasure-revision.json`.

Rollback restores the exact reviewed E1-S and S refund definitions and ACL, with
S begin/claim unchanged. It deliberately keeps both dates, the cap index and F's
bump retention exception. This is S settlement behavior with dormant F cap
bookkeeping, **not an identical pre-F catalog**: removing that bookkeeping would
reopen the same day's cap on reapply. The runner compares the remaining fields in
its catalog snapshot and the settled rollback fixture (user 5101). Do not run the historical S down while this extension
remains; its definition guard refuses F's bump. Apply/down refuse unknown source
digests rather than overwrite newer E1-S/S/0259 changes. Source pins also strip
the explicit additive F blocks and compare the remaining E1-S/S bytes exactly.
There is currently no F-down → S-down artifact: full retirement needs a separately
reviewed migration that preserves the current day's cap before removing this extension.

CI runs `python3 scripts/test-chat-turn-purpose-restore.py` after numbered replay.
It uses fresh fixed loopback `t40_purpose_test_ci` and `t40_purpose_mutant_test_ci`
clones of `t39_t40_before_0267`, standard-library Python and S's bounded psql transport/lock observer.
No dotenv, remote URLs, database drops or new packages. The step has a ten-minute
timeout; each SQL client has statement, transaction-idle and process limits.
Every race requires a real observed lock wait before releasing its leader.
SQL mutations count only their named P0040 assertion failure, never syntax, connection
or timeout errors. Tests include the F eligibility table, both directions of
last-slot/count-one consume contention, same-user dual refunds, bump/late refund,
green claim/registration and account deletion. S and E1-S behavioral tests also
run against the installed F definitions, and after F rollback.
The sequential assertion count is exactly 53. F function writers, dynamic SQL and
public function calls have separate allowlists. The down-cap mutant changes a copy
of the down file and uses the same snapshot/cleanup checks as the real down.
Parent-lock races use three measured FK DELETE-trigger orders across registered
first, attempt-zero reask, unbound first and rejected reask (12 schedules). M34 removes
KEY SHARE and must reproduce the existing-purpose-row deadlock and fail the same assertion.
The broad-parent-lock mutant must fail the unbound-first 0242 success assertion
with a measured 55P03. Source pins separately reject old up/down lock order and
the broad parent-lock condition.

Midnight coverage consists of actual server-today receipt tests, previous/next-day
fixtures, source-order/clock pins and **injected wrapper date samples** causing a
real PostgreSQL transaction rollback. It is not an observation of wall-clock
midnight. No production/test clock hook is installed in the draft.

Cost boundary: for first debits on one day, `2C → 2(C+1)` including the free second
attempt. Free `C=5` is **10 → 12 attempts (2.4 × the base quota)**. This is not a
bound on all calendar-day calls including legacy traffic and carried-over turns.
Merge requires independent Codex daybreak PASS, no new medium findings and green
CI. Numbering, Relay application and app activation remain separate steps.

## Apply to Supabase (Sprint 1+)

After linking the project via `supabase link`, run `supabase db push`.
The `db/config.toml` file is not yet generated — `supabase init` will
create it when remote sync begins.

## Schema purpose

- `0001_extensions.sql` — pgcrypto, citext, pg_trgm
- `0002_users.sql` — C6 (judge_mode), C10 (birth_date >= 18 CHECK)
- `0003_records.sql` — journal/note/audit_response unified table
- `0004_ai_audit_log.sql` — C3 (every AI call logged)
- `0005_revenue_events.sql` — C4 (month_bucket + related-party flag)
- `0006_testimonials.sql` — C5 (consent_given_at NOT NULL)
- `0007_knowledge_sources.sql` — C8 (DOI/URL + verification pair CHECK)
- `0008_personas.sql` — Inference Engine output
- `0009_rls_policies.sql` — RLS enabled on all user-scoped tables
- `0010_triggers.sql` — updated_at + C6 auto_judge_mode backup
