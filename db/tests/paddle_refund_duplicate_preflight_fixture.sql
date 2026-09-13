\set ON_ERROR_STOP on

-- Loaded before UNNUMBERED_paddle_refund_consequence_integrity.sql inside an
-- outer transaction. This reproduces the old Edge contract: two distinct
-- provider events for one adjustment each committed their event-scoped claim,
-- while billing_self_service_log retained only the newest lifecycle event id.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('7add0000-0000-4000-8000-000000000099', 'paddle-preflight-ci@example.invalid');
SET LOCAL session_replication_role = origin;

INSERT INTO public.users (
  id, email, birth_date, locale,
  subscription_tier, subscription_provider, subscription_event_at
) VALUES (
  '7add0000-0000-4000-8000-000000000099',
  'paddle-preflight-ci@example.invalid',
  DATE '1990-01-01',
  'en',
  'cortex',
  'paddle',
  TIMESTAMPTZ '2026-09-10 00:00:00+00'
);

INSERT INTO public.paddle_webhook_events (
  event_id, event_type, user_id, paddle_transaction_id, occurred_at, provider
) VALUES
  (
    'evt_ci_preflight_created', 'adjustment.created',
    '7add0000-0000-4000-8000-000000000099', 'txn_ci_preflight',
    TIMESTAMPTZ '2026-09-10 01:00:00+00', 'paddle'
  ),
  (
    'evt_ci_preflight_created:consequence', 'adjustment.created',
    '7add0000-0000-4000-8000-000000000099', 'txn_ci_preflight',
    TIMESTAMPTZ '2026-09-10 01:00:00+00', 'paddle'
  ),
  (
    'evt_ci_preflight_updated', 'adjustment.updated',
    '7add0000-0000-4000-8000-000000000099', 'txn_ci_preflight',
    TIMESTAMPTZ '2026-09-10 02:00:00+00', 'paddle'
  ),
  (
    'evt_ci_preflight_updated:consequence', 'adjustment.updated',
    '7add0000-0000-4000-8000-000000000099', 'txn_ci_preflight',
    TIMESTAMPTZ '2026-09-10 02:00:00+00', 'paddle'
  );

INSERT INTO public.billing_self_service_log (
  user_id, action, outcome, paddle_transaction_id,
  paddle_adjustment_id, paddle_adjustment_status,
  paddle_adjustment_event_id, paddle_adjustment_event_at,
  eligibility, eligibility_detail, provider_ref
) VALUES (
  '7add0000-0000-4000-8000-000000000099',
  'refund_request', 'accepted', 'txn_ci_preflight',
  'adj_ci_preflight', 'approved',
  'evt_ci_preflight_updated', TIMESTAMPTZ '2026-09-10 02:00:00+00',
  'refund_already_requested',
  '{"source":"paddle_adjustment","status":"approved"}'::jsonb,
  'adj_ci_preflight'
);
