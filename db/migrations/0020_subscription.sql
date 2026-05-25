-- 0020_subscription.sql
-- Subscription tier on the user. RevenueCat is the entitlement source of
-- truth (Phase 2); its webhook updates subscription_tier here. Tiers are
-- stepped: brain > cortex > soma > free (see src/lib/progression/entitlements).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'soma', 'cortex', 'brain'));
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_provider text;
