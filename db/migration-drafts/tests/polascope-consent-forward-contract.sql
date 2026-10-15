-- Run after numbered migrations through 0208 in a disposable local DB.
-- The service-v1 and email-v4/email-v5/email-v6 clients continue after v2 is added.
-- The assertions live in db/tests/polascope_consent_20261005_regression.sql, which
-- the numbered CI step runs against the promoted 0210 without this draft replay.
BEGIN;
\ir ../../migrations/0210_polascope_consent_20260928.sql
COMMIT;

\ir ../../tests/polascope_consent_20261005_regression.sql
