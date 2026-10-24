-- Run after numbered migrations through 0215 (or its forward contract) in a disposable local DB.
-- email-v4~v9 and service-v1/v2/v4 clients continue after service-v5 is added.
-- 공지형·재동의 없음. The numbered CI step runs the regression against 0262 after the
-- full numbered replay without this forward replay.
BEGIN;
\ir ../../migrations/0262_consent_email_v10_20261018.sql
COMMIT;

\ir ../../tests/consent_email_v10_20261018_regression.sql
