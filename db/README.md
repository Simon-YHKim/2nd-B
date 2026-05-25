# Database Migrations

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
