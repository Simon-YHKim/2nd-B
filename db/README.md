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
