-- seed.sql
-- Development-only seed data. Do NOT run against production Supabase.
-- Creates a synthetic judge demo user and one persona row.

INSERT INTO users (id, email, birth_date, judge_mode, locale)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'demo@xprize.org',
  date '1990-01-01',
  true,
  'en'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO personas (user_id, version, traits, values, patterns)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  1,
  '{"openness": 0.72, "conscientiousness": 0.68, "extraversion": 0.41, "agreeableness": 0.55, "neuroticism": 0.38}'::jsonb,
  '["self-direction", "achievement", "benevolence"]'::jsonb,
  '{"decision_style": "deliberative", "energy_source": "solitary"}'::jsonb
)
ON CONFLICT (user_id, version) DO NOTHING;
