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

## Dormant T39 concurrency tests

The dormant T39 lane in `supabase-dry-run.yml` also runs
`bash scripts/test-chat-turn-admission-races.sh` after the draft's sequential
tests and rollback/reapply. It needs a disposable, fully migrated local
`t39_admission_test_ci` database with the draft installed, `psql`, Bash and Node.
`PGPORT` can select a private local cluster; the host is fixed to `127.0.0.1`.
The runner commits synthetic fixtures only in that clone and a second
`t39_admission_mutant_test_ci` clone. Start with fresh databases for each run.

Nine schedules check attempts=0 first/first, reask/reask and both mixed orders,
attempts=1 reask/reask, both orders of last-slot purpose quota contention
(including T3901 rollback), and both orders of bump/reask.
Before releasing the leader, `pg_stat_activity` must show the follower waiting
on that leader's advisory or transaction lock. Each of the four attempts=0
schedules must fail with SQLSTATE 55000 after removing the user lock from a
draft copy in the mutant clone. Connection errors, timeouts and surviving mutants fail the
lane. Logs include the observed backend IDs, schedule totals and mutation result.
Failure logs print before teardown. Cleanup closes both coprocess pipe writers
(the original immediately after duplication, the duplicate on exit), terminates
only this run's named backends and allows each client two seconds before TERM,
then two more before KILL. The CI step has a ten-minute timeout as a final bound.
Refund/claim races, account-deletion lock ordering and the sequential suite's
KST midnight boundary remain outside this race runner.

## Dormant T40 S evidence tests

`UNNUMBERED_chat_turn_refund_evidence.sql` is an inactive S-only draft. Relay
applies the reviewed E1-S first, then S, each in one transaction. It keeps the
four RPC signatures, argument names, ACL and return types, including
`refund_chat_turn_after_output_swap(p_audit_id uuid)` and integer zero vs NULL.
No app/proxy activation, purpose restoration, `quota_day` or daily restoration
cap is included. F awaits Simon's answer. The commit is not rollout approval.

Simon 2026-10-14 14:12:02: 「앞선 답 없는 예약을 닫아 가장 최근 하나만 묶이게」.
S changes deletion into closing binding while retaining evidence. A closed
reservation cannot register an attempt or bind/replace an answer. A response
from an attempt registered before closure can still record server-return
evidence and refund that reservation once. Delivery is not device receipt.

The CI lane invokes `python3 scripts/test-chat-turn-refund-evidence.py` with
`psql` on PATH after the full numbered replay. It creates only fixed loopback
`t40_evidence_test_ci` and `t40_evidence_mutant_test_ci` clones of the scratch
`postgres` database. `PGPORT` selects a private cluster. It never reads dotenv,
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
E1-S remains unchanged, including its own account-deletion lock behavior.

The S-specific down restores the exact 0255 function bodies/ACL and reservation
columns/constraint, while retaining E1-S and settled counters/ledger rows.
Closed rows without a representative have no 0255 representation and are
removed; no audit ID is invented. This is schema/behavior rollback, not recovery
of all S evidence. Stop S traffic before rollback. Do not use `0255_down.sql`,
which drops E1-S's begin dependency. Source digests refuse to overwrite newer
definitions; inspect/re-review drift instead of bypassing the guard. The runner
compares installed catalog snapshots before S and after its down, runs E1-S
again, reapplies S and reruns the sequential assertions.

The three booleans need a retention-description update, but no class/owner or
retention-period change. The candidate is
`migration-drafts/chat-turn-refund-evidence-erasure-revision.json`; the runner
checks it against the real registry and schema. Promote it as a separate
reason-only `forwardRevisions` migration with S (including the rollback list),
without rewriting 0258. DPIA records this draft boundary. No same-day retention
exception from F is included.

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
